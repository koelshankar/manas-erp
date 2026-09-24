import { beforeEach, describe, expect, it } from "vitest";
import { daysAgoDate, daysAheadDate } from "@/lib/clock";
import { approveIndent, createIndent } from "@/lib/services/indent-service";
import {
  createComparative,
  createPurchaseOrders,
  decideComparative,
  markPoSent,
} from "@/lib/services/purchase-service";
import { advanceReturn, issueMaterial, postGrn } from "@/lib/services/stores-service";
import {
  createVendorBill,
  handOverVendorBill,
  verifyVendorBill,
} from "@/lib/services/vendor-bill-service";
import { budgetDrilldown, budgetVsActual } from "@/lib/services/budget-service";
import { supplierLedger } from "@/lib/services/ledger-service";
import { materialPosition, stockOnHand } from "@/lib/services/budget-position";
import {
  boqLineByCode,
  materialByCode,
  PH,
  PO,
  project,
  PURCHASE_HEAD,
  reset,
  repos,
  SITE,
  threeSuppliersFor,
} from "./helpers";

beforeEach(reset);

/**
 * The whole material thread in one pass:
 *
 *   A2 indent -> A2 approval -> B1 comparative -> B2 approval -> B3 PO -> B4 sent
 *   -> B5/B6 GRN with a rejection -> auto Return -> debit note
 *   -> A5 issue -> Budget vs Actual -> B7 vendor bill -> B8 handover
 *
 * Every status and every figure is asserted along the way.
 */
describe("the full material thread, A2 to B8", () => {
  it("cascades correctly from indent to accounts handover", async () => {
    const p = await project();
    const boq = await boqLineByCode(p.id, "BOQ-05");
    const blocks = await materialByCode("MAT-009");

    const ORDER_QTY = 1000;
    const ACCEPTED = 940;
    const REJECTED = 60;
    const ISSUED = 500;

    const openingStock = await stockOnHand(p.id, blocks.id);
    const openingIssued = (await materialPosition(p.id, boq.id, blocks.id)).issued_qty;

    /* -------- A2: raise the indent -------- */
    const { indent, lines: indentLines, approval } = await createIndent(
      {
        project_id: p.id,
        remarks: "Block work, Tower C.",
        lines: [
          {
            boq_line_id: boq.id,
            material_id: blocks.id,
            requested_qty: 1200,
            required_by: daysAheadDate(23),
            remarks: "",
          },
        ],
      },
      await SITE(),
    );
    expect(indent.status).toBe("submitted");
    expect(approval.status).toBe("pending");
    expect(approval.required_role).toBe("project_head");

    /* -------- A2: the Project Head cuts it back -------- */
    const approved = await approveIndent(
      {
        indent_id: indent.id,
        comment: "Reduced to the Tower C requirement.",
        lines: [
          { indent_line_id: indentLines[0].id, decision: "reduce", approved_qty: ORDER_QTY },
        ],
      },
      await PH(),
    );
    expect(approved.indent.status).toBe("partially_approved");
    expect(approved.lines[0].approved_qty).toBe(ORDER_QTY);
    expect(approved.approval.status).toBe("approved");

    /* -------- B1: comparative with three quotes -------- */
    const rateCards = await threeSuppliersFor(blocks.id);
    const quotes = rateCards.map((r, i) => ({
      supplier_id: r.supplier_id,
      rate: 80 + i,
      gst_percent: blocks.gst_percent,
      freight_amount: 1500,
      delivery_days: r.lead_time_days,
      payment_terms: "30 days from GRN",
    }));

    const { comparative, lines: compLines } = await createComparative(
      {
        project_id: p.id,
        submit: true,
        lines: [
          {
            indent_line_id: indentLines[0].id,
            quotes,
            selected_supplier_id: quotes[0].supplier_id,
          },
        ],
      },
      await PO(),
    );
    expect(comparative.status).toBe("pending_approval");
    expect(compLines[0].quantity).toBe(ORDER_QTY);
    expect(compLines[0].is_l1_selected).toBe(true);
    expect((await repos().indents.getById(indent.id))!.status).toBe("in_comparative");

    /* -------- B2: the Purchase Head approves -------- */
    const decided = await decideComparative(
      { comparative_id: comparative.id, decision: "approve", comment: "Rate approved." },
      await PURCHASE_HEAD(),
    );
    expect(decided.comparative.status).toBe("approved");

    /* -------- B3/B4: PO raised and sent -------- */
    const { purchase_orders, lines: poLines } = await createPurchaseOrders(
      { comparative_id: comparative.id },
      await PO(),
    );
    expect(purchase_orders).toHaveLength(1);
    const po = purchase_orders[0];
    const poLine = poLines[0];
    expect(po.status).toBe("draft");
    expect(poLine.ordered_qty).toBe(ORDER_QTY);
    expect(poLine.rate).toBe(80);
    expect((await repos().indents.getById(indent.id))!.status).toBe("po_raised");

    const supplier = (await repos().suppliers.getById(po.supplier_id))!;
    const expectedTax = Math.round(((ORDER_QTY * 80 + 1500) * blocks.gst_percent) / 100 * 100) / 100;
    if (supplier.state === "Goa") {
      expect(po.is_interstate).toBe(false);
      expect(po.cgst_amount + po.sgst_amount).toBeCloseTo(expectedTax, 2);
      expect(po.igst_amount).toBe(0);
    } else {
      expect(po.is_interstate).toBe(true);
      expect(po.igst_amount).toBeCloseTo(expectedTax, 2);
      expect(po.cgst_amount + po.sgst_amount).toBe(0);
    }
    expect(po.total_amount).toBeCloseTo(ORDER_QTY * 80 + 1500 + expectedTax, 2);

    const sentPo = await markPoSent(po.id, await PO());
    expect(sentPo.status).toBe("sent");

    /* -------- B5/B6: GRN with a rejection -------- */
    const grnResult = await postGrn(
      {
        purchase_order_id: po.id,
        challan_number: "CH-2026/551",
        vehicle_number: "GA 06 KL 8812",
        received_on: daysAgoDate(3),
        lines: [
          {
            po_line_id: poLine.id,
            received_qty: ORDER_QTY,
            accepted_qty: ACCEPTED,
            rejected_qty: REJECTED,
            rejection_reason: "60 blocks cracked on arrival",
          },
        ],
      },
      await SITE(),
    );

    expect(grnResult.grn.status).toBe("posted");
    expect(grnResult.purchase_order_status).toBe("received");
    expect(grnResult.returns).toHaveLength(1);
    expect(grnResult.returns[0].quantity).toBe(REJECTED);

    // The indent only got 940 of the 1000 it was approved for.
    expect((await repos().indents.getById(indent.id))!.status).toBe("partially_received");
    expect(await stockOnHand(p.id, blocks.id)).toBe(openingStock + ACCEPTED);

    /* -------- Return: dispatched, then a debit note -------- */
    const ret = grnResult.returns[0];
    const supplierBefore = (await supplierLedger(po.supplier_id)).balance;
    await advanceReturn(ret.id, "dispatched", await PO());
    const noted = await advanceReturn(ret.id, "debit_note_issued", await PO());
    expect(noted.status).toBe("debit_note_issued");
    expect(noted.debit_note_number).toMatch(/^MSP\/DN\/26-27\/\d{4}$/);
    expect(noted.amount).toBe(REJECTED * 80);

    /* -------- A5: issue to the BOQ line -------- */
    const wo = (await repos().workOrders.listByProject(p.id))[0];
    const { issue } = await issueMaterial(
      {
        project_id: p.id,
        material_id: blocks.id,
        quantity: ISSUED,
        work_order_id: wo.id,
        boq_line_id: boq.id,
        issue_date: daysAgoDate(2),
      },
      await SITE(),
    );
    /*
     * Issues are valued at the weighted average of every receipt at PO rate,
     * so the figure includes the project's opening consumption history as well
     * as the PO raised above. Assert the rule, not a hand-computed constant:
     * the seed's history rate is free to move.
     */
    const receipts = (await repos().stock.listByProject(p.id)).filter(
      (e) => e.material_id === blocks.id && e.quantity_in > 0,
    );
    const receivedQty = receipts.reduce((s, e) => s + e.quantity_in, 0);
    const weightedAverage =
      Math.round((receipts.reduce((s, e) => s + e.quantity_in * (e.rate ?? 0), 0) / receivedQty) * 100) /
      100;
    expect(issue.rate).toBeCloseTo(weightedAverage, 2);
    // The new PO's rate is in the average, so it sits between the two.
    expect(issue.rate).toBeLessThanOrEqual(80);
    expect(issue.value).toBeCloseTo(ISSUED * issue.rate, 2);
    expect(await stockOnHand(p.id, blocks.id)).toBe(openingStock + ACCEPTED - ISSUED);

    const position = await materialPosition(p.id, boq.id, blocks.id);
    expect(position.issued_qty).toBe(openingIssued + ISSUED);
    expect(position.stock_qty).toBe(openingStock + ACCEPTED - ISSUED);

    /* -------- Budget vs Actual picks the issue up -------- */
    const rows = await budgetVsActual(p.id);
    const row = rows.find((r) => r.boq_line_id === boq.id)!;
    expect(row.material_issued_value).toBeGreaterThanOrEqual(ISSUED * 80);
    expect(row.material_variance).toBe(
      Math.round((row.material_budget_value - row.material_issued_value) * 100) / 100,
    );
    // Contractor certification comes from the billing thread; the column holds
    // the gross of bills that have cleared the C3-C4 chain.
    expect(row.total_actual).toBeCloseTo(row.material_issued_value + row.certified_amount, 1);
    expect(row.total_budget).toBeCloseTo(row.material_budget_value + row.work_order_value, 1);

    const drill = await budgetDrilldown(p.id, boq.id);
    const drillRow = drill.find((d) => d.issue_id === issue.id)!;
    expect(drillRow.grn_number).toBe(grnResult.grn.grn_number);
    expect(drillRow.po_number).toBe(po.po_number);

    /* -------- B7: vendor bill, three-way matched -------- */
    const grnLine = grnResult.lines[0];
    const { bill, lines: billLines } = await createVendorBill(
      {
        project_id: p.id,
        supplier_id: po.supplier_id,
        bill_number: "MSB/2026/9912",
        bill_date: daysAgoDate(2),
        received_date: daysAgoDate(1),
        lines: [
          {
            grn_line_id: grnLine.id,
            billed_qty: ACCEPTED,
            billed_rate: 80,
            billed_gst_percent: blocks.gst_percent,
          },
        ],
      },
      await PO(),
    );

    expect(bill.status).toBe("matched");
    expect(bill.is_quantity_matched).toBe(true);
    expect(bill.is_rate_matched).toBe(true);
    expect(bill.is_tax_matched).toBe(true);
    expect(bill.amount_variance).toBe(0);
    expect(bill.bill_basic_amount).toBe(ACCEPTED * 80);
    expect(billLines[0].grn_accepted_qty).toBe(ACCEPTED);

    /* -------- B7: verified, supplier ledger credited -------- */
    const verified = await verifyVendorBill({ vendor_bill_id: bill.id }, await PO());
    expect(verified.status).toBe("verified");

    const ledger = await supplierLedger(po.supplier_id);
    expect(ledger.balance).toBe(
      Math.round((supplierBefore - noted.amount + bill.bill_total_amount) * 100) / 100,
    );
    expect(ledger.rows.some((r) => r.entry_type === "debit_note" && r.debit === noted.amount)).toBe(
      true,
    );
    expect(
      ledger.rows.some((r) => r.entry_type === "bill" && r.credit === bill.bill_total_amount),
    ).toBe(true);

    /* -------- B8: handed over to Accounts -------- */
    const handed = await handOverVendorBill(bill.id, await PO());
    expect(handed.status).toBe("handed_over");
    expect(handed.handed_over_at).not.toBeNull();

    /* -------- The audit trail holds both gates -------- */
    const indentApprovals = await repos().approvals.listForEntity("indent", indent.id);
    expect(indentApprovals).toHaveLength(1);
    expect(indentApprovals[0].status).toBe("approved");
    expect(indentApprovals[0].step_code).toBe("A2");

    const compApprovals = await repos().approvals.listForEntity("comparative", comparative.id);
    expect(compApprovals).toHaveLength(1);
    expect(compApprovals[0].status).toBe("approved");
    expect(compApprovals[0].step_code).toBe("B2");

    /* -------- Every link in the chain is navigable -------- */
    expect(compLines[0].indent_line_id).toBe(indentLines[0].id);
    expect(poLine.comparative_line_id).toBe(compLines[0].id);
    expect(poLine.indent_line_id).toBe(indentLines[0].id);
    expect(poLine.boq_line_id).toBe(boq.id);
    expect(grnLine.po_line_id).toBe(poLine.id);
    expect(grnLine.boq_line_id).toBe(boq.id);
    expect(ret.grn_line_id).toBe(grnLine.id);
    expect(billLines[0].grn_line_id).toBe(grnLine.id);
    expect(issue.boq_line_id).toBe(boq.id);
  });
});

describe("the seed is a valid starting point", () => {
  it("leaves every queue in the thread with something in it", async () => {
    const p = await project();
    const indents = await repos().indents.listByProject(p.id);
    const comparatives = await repos().comparatives.listByProject(p.id);
    const pos = await repos().purchaseOrders.listByProject(p.id);
    const bills = await repos().vendorBills.listByProject(p.id);
    const returns = await repos().returns.listByProject(p.id);

    expect(indents.filter((i) => i.status === "submitted").length).toBeGreaterThanOrEqual(2);
    expect(indents.some((i) => i.status === "partially_approved")).toBe(true);
    expect(comparatives.some((c) => c.status === "pending_approval")).toBe(true);
    expect(comparatives.some((c) => c.status === "sent_back")).toBe(true);
    expect(pos.some((o) => o.status === "sent")).toBe(true);
    expect(pos.some((o) => o.status === "partially_received")).toBe(true);
    expect(pos.some((o) => o.status === "received")).toBe(true);
    expect(bills.some((b) => b.status === "mismatch")).toBe(true);
    expect(bills.some((b) => b.status === "handed_over")).toBe(true);
    expect(returns.some((r) => r.status === "debit_note_issued")).toBe(true);
  });

  it("has one indent asking for more than the BOQ material balance", async () => {
    const p = await project();
    const submitted = (await repos().indents.listByProject(p.id)).filter(
      (i) => i.status === "submitted",
    );
    const overruns: boolean[] = [];
    for (const indent of submitted) {
      for (const line of await repos().indents.listLinesByIndent(indent.id)) {
        const pos = await materialPosition(p.id, line.boq_line_id, line.material_id);
        // balance_qty already counts this line, so add it back to get the
        // balance the Site Engineer saw when raising it.
        overruns.push(line.requested_qty > pos.balance_qty + line.requested_qty);
      }
    }
    expect(overruns.some(Boolean)).toBe(true);
  });

  it("has one BOQ line consuming more material than it was budgeted", async () => {
    const p = await project();
    const rows = await budgetVsActual(p.id);
    expect(rows.some((r) => r.material_percent_consumed > 100)).toBe(true);
  });

  it("has one material below its reorder level", async () => {
    const p = await project();
    const materials = await repos().materials.list();
    const low: string[] = [];
    for (const m of materials) {
      const balance = await stockOnHand(p.id, m.id);
      if (balance > 0 && balance < m.reorder_level) low.push(m.code);
    }
    expect(low.length).toBeGreaterThanOrEqual(1);
  });

  it("charges IGST outside Goa and CGST+SGST inside it", async () => {
    const p = await project();
    const pos = await repos().purchaseOrders.listByProject(p.id);
    for (const po of pos) {
      const supplier = (await repos().suppliers.getById(po.supplier_id))!;
      if (supplier.state === "Goa") {
        expect(po.igst_amount).toBe(0);
        expect(po.cgst_amount).toBeGreaterThan(0);
        expect(po.cgst_amount).toBeCloseTo(po.sgst_amount, 2);
      } else {
        expect(po.cgst_amount).toBe(0);
        expect(po.sgst_amount).toBe(0);
        expect(po.igst_amount).toBeGreaterThan(0);
      }
    }
  });
});
