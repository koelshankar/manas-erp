import { beforeEach, describe, expect, it } from "vitest";
import { daysAgoDate, today } from "@/lib/clock";
import { postGrn } from "@/lib/services/stores-service";
import {
  createVendorBill,
  handOverVendorBill,
  verifyVendorBill,
} from "@/lib/services/vendor-bill-service";
import { supplierLedger } from "@/lib/services/ledger-service";
import { PermissionError, ValidationError } from "@/lib/services/types";
import { PO, project, reset, repos, SITE } from "./helpers";

beforeEach(reset);

/** Receives everything on the seeded sent PO, so there is a GRN to bill. */
async function receivedGrn() {
  const p = await project();
  const po = (await repos().purchaseOrders.listByProject(p.id)).find((x) => x.status === "sent")!;
  const poLines = await repos().purchaseOrders.listLinesByPo(po.id);
  const { grn, lines } = await postGrn(
    {
      purchase_order_id: po.id,
      challan_number: "CH-900",
      vehicle_number: "GA 01 AA 1111",
      received_on: daysAgoDate(1),
      lines: poLines.map((l) => ({
        po_line_id: l.id,
        received_qty: l.ordered_qty,
        accepted_qty: l.ordered_qty,
        rejected_qty: 0,
      })),
    },
    await SITE(),
  );
  return { project: p, po, poLines, grn, grnLines: lines };
}

describe("createVendorBill (B7)", () => {
  it("matches a clean bill on quantity, rate and tax", async () => {
    const { project: p, po, grnLines } = await receivedGrn();
    const { bill, lines } = await createVendorBill(
      {
        project_id: p.id,
        supplier_id: po.supplier_id,
        bill_number: "INV-4471",
        bill_date: daysAgoDate(1),
        received_date: today(),
        lines: grnLines.map((l) => ({
          grn_line_id: l.id,
          billed_qty: l.accepted_qty,
          billed_rate: l.rate,
          billed_gst_percent: l.gst_percent,
        })),
      },
      await PO(),
    );

    expect(bill.status).toBe("matched");
    expect(bill.reference_number).toMatch(/^MSP\/VB\/26-27\/\d{4}$/);
    expect(bill.is_quantity_matched).toBe(true);
    expect(bill.is_rate_matched).toBe(true);
    expect(bill.amount_variance).toBe(0);
    expect(lines.every((l) => l.qty_matched && l.rate_matched)).toBe(true);

    // The GRN line now knows how much of it has been billed.
    const refreshed = await repos().grns.listLinesByGrn(grnLines[0].grn_id);
    expect(refreshed[0].billed_qty).toBe(grnLines[0].accepted_qty);
  });

  it("flags a rate mismatch line by line", async () => {
    const { project: p, po, grnLines } = await receivedGrn();
    const { bill, lines } = await createVendorBill(
      {
        project_id: p.id,
        supplier_id: po.supplier_id,
        bill_number: "INV-4472",
        bill_date: daysAgoDate(1),
        received_date: today(),
        lines: grnLines.map((l, i) => ({
          grn_line_id: l.id,
          billed_qty: l.accepted_qty,
          billed_rate: i === 0 ? Math.round(l.rate * 1.1) : l.rate,
          billed_gst_percent: l.gst_percent,
        })),
      },
      await PO(),
    );

    expect(bill.status).toBe("mismatch");
    expect(bill.is_rate_matched).toBe(false);
    expect(bill.is_quantity_matched).toBe(true);
    expect(bill.amount_variance).toBeGreaterThan(0);
    expect(lines[0].rate_matched).toBe(false);
  });

  it("flags a quantity mismatch against the GRN accepted quantity", async () => {
    const { project: p, po, grnLines } = await receivedGrn();
    const { bill } = await createVendorBill(
      {
        project_id: p.id,
        supplier_id: po.supplier_id,
        bill_number: "INV-4473",
        bill_date: daysAgoDate(1),
        received_date: today(),
        lines: [
          {
            grn_line_id: grnLines[0].id,
            billed_qty: grnLines[0].accepted_qty + 5,
            billed_rate: grnLines[0].rate,
            billed_gst_percent: grnLines[0].gst_percent,
          },
        ],
      },
      await PO(),
    );
    expect(bill.status).toBe("mismatch");
    expect(bill.is_quantity_matched).toBe(false);
  });
});

describe("createVendorBill — permission", () => {
  it("refuses the Site Engineer", async () => {
    const { project: p, po, grnLines } = await receivedGrn();
    await expect(
      createVendorBill(
        {
          project_id: p.id,
          supplier_id: po.supplier_id,
          bill_number: "INV-4474",
          bill_date: daysAgoDate(1),
          received_date: today(),
          lines: [
            {
              grn_line_id: grnLines[0].id,
              billed_qty: grnLines[0].accepted_qty,
              billed_rate: grnLines[0].rate,
              billed_gst_percent: grnLines[0].gst_percent,
            },
          ],
        },
        await SITE(),
      ),
    ).rejects.toBeInstanceOf(PermissionError);
  });
});

describe("createVendorBill — validation", () => {
  it("refuses a bill with no invoice number", async () => {
    const { project: p, po, grnLines } = await receivedGrn();
    await expect(
      createVendorBill(
        {
          project_id: p.id,
          supplier_id: po.supplier_id,
          bill_number: "",
          bill_date: daysAgoDate(1),
          received_date: today(),
          lines: [
            {
              grn_line_id: grnLines[0].id,
              billed_qty: grnLines[0].accepted_qty,
              billed_rate: grnLines[0].rate,
              billed_gst_percent: grnLines[0].gst_percent,
            },
          ],
        },
        await PO(),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses GRN lines belonging to a different supplier", async () => {
    const { project: p, grnLines } = await receivedGrn();
    const other = (await repos().suppliers.list()).find((s) => s.code === "SUP-005")!;
    await expect(
      createVendorBill(
        {
          project_id: p.id,
          supplier_id: other.id,
          bill_number: "INV-4475",
          bill_date: daysAgoDate(1),
          received_date: today(),
          lines: [
            {
              grn_line_id: grnLines[0].id,
              billed_qty: grnLines[0].accepted_qty,
              billed_rate: grnLines[0].rate,
              billed_gst_percent: grnLines[0].gst_percent,
            },
          ],
        },
        await PO(),
      ),
    ).rejects.toThrow(/different supplier/);
  });

  it("refuses to bill the same GRN line twice", async () => {
    const { project: p, po, grnLines } = await receivedGrn();
    const line = {
      grn_line_id: grnLines[0].id,
      billed_qty: grnLines[0].accepted_qty,
      billed_rate: grnLines[0].rate,
      billed_gst_percent: grnLines[0].gst_percent,
    };
    const base = {
      project_id: p.id,
      supplier_id: po.supplier_id,
      bill_date: daysAgoDate(1),
      received_date: today(),
      lines: [line],
    };
    await createVendorBill({ ...base, bill_number: "INV-4476" }, await PO());
    await expect(
      createVendorBill({ ...base, bill_number: "INV-4477" }, await PO()),
    ).rejects.toThrow(/already been billed in full/);
  });
});

describe("verifyVendorBill and handOverVendorBill (B7 -> B8)", () => {
  async function matchedBill() {
    const { project: p, po, grnLines } = await receivedGrn();
    const { bill } = await createVendorBill(
      {
        project_id: p.id,
        supplier_id: po.supplier_id,
        bill_number: "INV-5001",
        bill_date: daysAgoDate(1),
        received_date: today(),
        lines: grnLines.map((l) => ({
          grn_line_id: l.id,
          billed_qty: l.accepted_qty,
          billed_rate: l.rate,
          billed_gst_percent: l.gst_percent,
        })),
      },
      await PO(),
    );
    return bill;
  }

  it("verifying a matched bill credits the supplier ledger", async () => {
    const bill = await matchedBill();
    const before = (await supplierLedger(bill.supplier_id)).balance;

    const verified = await verifyVendorBill({ vendor_bill_id: bill.id }, await PO());
    expect(verified.status).toBe("verified");
    expect(verified.verified_by_user_id).not.toBeNull();

    const after = await supplierLedger(bill.supplier_id);
    expect(after.balance).toBe(Math.round((before + bill.bill_total_amount) * 100) / 100);
    expect(after.rows.at(-1)!.reference_number).toBe("INV-5001");
  });

  it("hands a verified bill over to Accounts", async () => {
    const bill = await matchedBill();
    await verifyVendorBill({ vendor_bill_id: bill.id }, await PO());
    const handed = await handOverVendorBill(bill.id, await PO());
    expect(handed.status).toBe("handed_over");
    expect(handed.handed_over_at).not.toBeNull();
  });

  it("refuses to hand over a bill that was never verified", async () => {
    const bill = await matchedBill();
    await expect(handOverVendorBill(bill.id, await PO())).rejects.toThrow(
      /cannot move from "matched"/,
    );
  });

  it("requires an override reason to verify a mismatched bill", async () => {
    const { project: p, po, grnLines } = await receivedGrn();
    const { bill } = await createVendorBill(
      {
        project_id: p.id,
        supplier_id: po.supplier_id,
        bill_number: "INV-5002",
        bill_date: daysAgoDate(1),
        received_date: today(),
        lines: [
          {
            grn_line_id: grnLines[0].id,
            billed_qty: grnLines[0].accepted_qty,
            billed_rate: Math.round(grnLines[0].rate * 1.2),
            billed_gst_percent: grnLines[0].gst_percent,
          },
        ],
      },
      await PO(),
    );
    expect(bill.status).toBe("mismatch");

    await expect(
      verifyVendorBill({ vendor_bill_id: bill.id }, await PO()),
    ).rejects.toBeInstanceOf(ValidationError);

    const verified = await verifyVendorBill(
      { vendor_bill_id: bill.id, override_reason: "Rate revision agreed by email on 18 Sep." },
      await PO(),
    );
    expect(verified.status).toBe("verified");
    expect(verified.override_reason).toContain("Rate revision");
  });

  it("refuses the Site Engineer", async () => {
    const bill = await matchedBill();
    await expect(
      verifyVendorBill({ vendor_bill_id: bill.id }, await SITE()),
    ).rejects.toBeInstanceOf(PermissionError);
  });
});
