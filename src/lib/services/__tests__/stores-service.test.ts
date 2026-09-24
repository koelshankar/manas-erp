import { beforeEach, describe, expect, it } from "vitest";
import { daysAgoDate, today } from "@/lib/clock";
import { advanceReturn, createReturn, issueMaterial, postGrn } from "@/lib/services/stores-service";
import { PermissionError, ValidationError } from "@/lib/services/types";
import { stockOnHand, weightedAverageRate } from "@/lib/services/budget-position";
import { PH, PO, project, reset, repos, SITE, stockOf } from "./helpers";

beforeEach(reset);

/** The seeded PO that is out with the vendor and awaiting delivery. */
async function sentPo() {
  const p = await project();
  const pos = await repos().purchaseOrders.listByProject(p.id);
  const po = pos.find((x) => x.status === "sent");
  if (!po) throw new Error("seed has no sent PO on MNS-SAP");
  return { project: p, po, lines: await repos().purchaseOrders.listLinesByPo(po.id) };
}

describe("postGrn (B5-B6)", () => {
  it("receives material, updates the PO and writes a stock receipt", async () => {
    const { project: p, po, lines } = await sentPo();
    const line = lines[0];
    const half = Math.floor(line.ordered_qty / 2);
    const before = await stockOf(p.id, line.material_id);

    const result = await postGrn(
      {
        purchase_order_id: po.id,
        challan_number: "CH-778",
        vehicle_number: "GA 05 XY 2211",
        received_on: daysAgoDate(1),
        lines: [
          { po_line_id: line.id, received_qty: half, accepted_qty: half, rejected_qty: 0 },
        ],
      },
      await SITE(),
    );

    expect(result.grn.status).toBe("posted");
    expect(result.grn.grn_number).toMatch(/^MSP\/GRN\/26-27\/\d{4}$/);
    expect(result.lines[0].rate).toBe(line.rate);
    expect(result.stock_entries).toHaveLength(1);
    expect(result.returns).toHaveLength(0);
    // Part of one line delivered, so the PO stays open.
    expect(result.purchase_order_status).toBe("partially_received");

    expect(await stockOf(p.id, line.material_id)).toBe(before + half);
    const poLine = (await repos().purchaseOrders.listLinesByPo(po.id)).find((l) => l.id === line.id)!;
    expect(poLine.received_qty).toBe(half);
  });

  it("raises a Return automatically for any rejected quantity", async () => {
    const { po, lines } = await sentPo();
    const line = lines[0];
    const result = await postGrn(
      {
        purchase_order_id: po.id,
        challan_number: "CH-779",
        vehicle_number: "GA 05 XY 2212",
        received_on: daysAgoDate(1),
        lines: [
          {
            po_line_id: line.id,
            received_qty: 50,
            accepted_qty: 45,
            rejected_qty: 5,
            rejection_reason: "Bags torn in transit",
          },
        ],
      },
      await SITE(),
    );

    expect(result.returns).toHaveLength(1);
    expect(result.returns[0].status).toBe("raised");
    expect(result.returns[0].quantity).toBe(5);
    expect(result.returns[0].grn_line_id).toBe(result.lines[0].id);
    expect(result.returns[0].return_number).toMatch(/^MSP\/RTN\/26-27\/\d{4}$/);
  });

  it("closes the PO once every line is fully accounted for", async () => {
    const { po, lines } = await sentPo();
    const result = await postGrn(
      {
        purchase_order_id: po.id,
        challan_number: "CH-780",
        vehicle_number: "GA 05 XY 2213",
        received_on: daysAgoDate(1),
        lines: lines.map((l) => ({
          po_line_id: l.id,
          received_qty: l.ordered_qty,
          accepted_qty: l.ordered_qty,
          rejected_qty: 0,
        })),
      },
      await SITE(),
    );
    expect(result.purchase_order_status).toBe("received");
    expect((await repos().purchaseOrders.getById(po.id))!.status).toBe("received");
  });
});

describe("postGrn — permission", () => {
  it("refuses the Purchase Officer — GRN is owned by the site", async () => {
    const { po, lines } = await sentPo();
    await expect(
      postGrn(
        {
          purchase_order_id: po.id,
          challan_number: "CH-781",
          vehicle_number: "GA 05 XY 2214",
          received_on: daysAgoDate(1),
          lines: [{ po_line_id: lines[0].id, received_qty: 10, accepted_qty: 10, rejected_qty: 0 }],
        },
        await PO(),
      ),
    ).rejects.toBeInstanceOf(PermissionError);
  });
});

describe("postGrn — validation", () => {
  it("refuses accepted plus rejected that does not equal received", async () => {
    const { po, lines } = await sentPo();
    await expect(
      postGrn(
        {
          purchase_order_id: po.id,
          challan_number: "CH-782",
          vehicle_number: "GA 05 XY 2215",
          received_on: daysAgoDate(1),
          lines: [
            { po_line_id: lines[0].id, received_qty: 10, accepted_qty: 4, rejected_qty: 2, rejection_reason: "x" },
          ],
        },
        await SITE(),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses an accepted quantity above the pending PO quantity", async () => {
    const { po, lines } = await sentPo();
    await expect(
      postGrn(
        {
          purchase_order_id: po.id,
          challan_number: "CH-783",
          vehicle_number: "GA 05 XY 2216",
          received_on: daysAgoDate(1),
          lines: [
            {
              po_line_id: lines[0].id,
              received_qty: lines[0].ordered_qty + 10,
              accepted_qty: lines[0].ordered_qty + 10,
              rejected_qty: 0,
            },
          ],
        },
        await SITE(),
      ),
    ).rejects.toThrow(/exceeds the pending/);
  });

  it("refuses a GRN against a PO that has not been sent", async () => {
    const p = await project();
    const pos = await repos().purchaseOrders.listByProject(p.id);
    const received = pos.find((x) => x.status === "received")!;
    const lines = await repos().purchaseOrders.listLinesByPo(received.id);
    await expect(
      postGrn(
        {
          purchase_order_id: received.id,
          challan_number: "CH-784",
          vehicle_number: "GA 05 XY 2217",
          received_on: daysAgoDate(1),
          lines: [{ po_line_id: lines[0].id, received_qty: 1, accepted_qty: 1, rejected_qty: 0 }],
        },
        await SITE(),
      ),
    ).rejects.toThrow(/only be received against a sent PO/);
  });
});

describe("issueMaterial (A5)", () => {
  it("issues at the weighted average of receipts and draws down stock", async () => {
    const p = await project();
    const cement = (await repos().materials.list()).find((m) => m.code === "MAT-001")!;
    const boq = (await repos().boq.listByProject(p.id)).find((b) => b.item_code === "BOQ-07")!;
    const wo = (await repos().workOrders.listByProject(p.id))[0];

    const before = await stockOnHand(p.id, cement.id);
    const wac = await weightedAverageRate(p.id, cement.id);

    const { issue, stock_entry } = await issueMaterial(
      {
        project_id: p.id,
        material_id: cement.id,
        quantity: 50,
        work_order_id: wo.id,
        boq_line_id: boq.id,
        issue_date: today(),
      },
      await SITE(),
    );

    expect(issue.issue_number).toMatch(/^MSP\/ISS\/26-27\/\d{4}$/);
    expect(issue.rate).toBe(wac);
    expect(issue.value).toBe(Math.round(50 * wac * 100) / 100);
    expect(issue.issued_to_contractor_id).toBe(wo.contractor_id);
    expect(stock_entry.movement_type).toBe("issue");
    expect(await stockOnHand(p.id, cement.id)).toBe(before - 50);
  });
});

describe("issueMaterial — permission", () => {
  it("refuses the Project Head", async () => {
    const p = await project();
    const cement = (await repos().materials.list()).find((m) => m.code === "MAT-001")!;
    const boq = (await repos().boq.listByProject(p.id)).find((b) => b.item_code === "BOQ-07")!;
    const wo = (await repos().workOrders.listByProject(p.id))[0];
    await expect(
      issueMaterial(
        {
          project_id: p.id,
          material_id: cement.id,
          quantity: 5,
          work_order_id: wo.id,
          boq_line_id: boq.id,
          issue_date: today(),
        },
        await PH(),
      ),
    ).rejects.toBeInstanceOf(PermissionError);
  });
});

describe("issueMaterial — validation", () => {
  it("refuses to issue more than is on site", async () => {
    const p = await project();
    const cement = (await repos().materials.list()).find((m) => m.code === "MAT-001")!;
    const boq = (await repos().boq.listByProject(p.id)).find((b) => b.item_code === "BOQ-07")!;
    const wo = (await repos().workOrders.listByProject(p.id))[0];
    await expect(
      issueMaterial(
        {
          project_id: p.id,
          material_id: cement.id,
          quantity: 99_999,
          work_order_id: wo.id,
          boq_line_id: boq.id,
          issue_date: today(),
        },
        await SITE(),
      ),
    ).rejects.toThrow(/is on site/);
  });
});

describe("returns", () => {
  it("advances raised -> dispatched -> debit note and posts to the supplier ledger", async () => {
    const p = await project();
    const { po, lines } = await sentPo();
    const { returns } = await postGrn(
      {
        purchase_order_id: po.id,
        challan_number: "CH-790",
        vehicle_number: "GA 05 XY 9001",
        received_on: daysAgoDate(1),
        lines: [
          {
            po_line_id: lines[0].id,
            received_qty: 20,
            accepted_qty: 18,
            rejected_qty: 2,
            rejection_reason: "Damaged",
          },
        ],
      },
      await SITE(),
    );
    const raised = returns[0];

    const dispatched = await advanceReturn(raised.id, "dispatched", await PO());
    expect(dispatched.status).toBe("dispatched");
    expect(dispatched.dispatched_at).not.toBeNull();

    const before = await repos().supplierLedger.balanceFor(raised.supplier_id);
    const noted = await advanceReturn(raised.id, "debit_note_issued", await PO());
    expect(noted.status).toBe("debit_note_issued");
    expect(noted.debit_note_number).toMatch(/^MSP\/DN\/26-27\/\d{4}$/);
    expect(await repos().supplierLedger.balanceFor(raised.supplier_id)).toBe(
      Math.round((before - raised.amount) * 100) / 100,
    );
    void p;
  });

  it("refuses to skip dispatch", async () => {
    const { po, lines } = await sentPo();
    const { returns } = await postGrn(
      {
        purchase_order_id: po.id,
        challan_number: "CH-791",
        vehicle_number: "GA 05 XY 9002",
        received_on: daysAgoDate(1),
        lines: [
          {
            po_line_id: lines[0].id,
            received_qty: 20,
            accepted_qty: 18,
            rejected_qty: 2,
            rejection_reason: "Damaged",
          },
        ],
      },
      await SITE(),
    );
    await expect(
      advanceReturn(returns[0].id, "debit_note_issued", await PO()),
    ).rejects.toThrow(/cannot move from "raised"/);
  });

  it("refuses the Site Engineer on a manual return", async () => {
    const { po, lines } = await sentPo();
    const { lines: grnLines } = await postGrn(
      {
        purchase_order_id: po.id,
        challan_number: "CH-792",
        vehicle_number: "GA 05 XY 9003",
        received_on: daysAgoDate(1),
        lines: [{ po_line_id: lines[0].id, received_qty: 20, accepted_qty: 20, rejected_qty: 0 }],
      },
      await SITE(),
    );
    await expect(
      createReturn(
        {
          grn_line_id: grnLines[0].id,
          quantity: 1,
          reason: "Found defective after receipt",
          return_date: today(),
        },
        await SITE(),
      ),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("refuses to return more than was received", async () => {
    const { po, lines } = await sentPo();
    const { lines: grnLines } = await postGrn(
      {
        purchase_order_id: po.id,
        challan_number: "CH-793",
        vehicle_number: "GA 05 XY 9004",
        received_on: daysAgoDate(1),
        lines: [{ po_line_id: lines[0].id, received_qty: 20, accepted_qty: 20, rejected_qty: 0 }],
      },
      await SITE(),
    );
    await expect(
      createReturn(
        {
          grn_line_id: grnLines[0].id,
          quantity: 500,
          reason: "Found defective after receipt",
          return_date: today(),
        },
        await PO(),
      ),
    ).rejects.toThrow(/remains returnable/);
  });
});
