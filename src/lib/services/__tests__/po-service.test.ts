import { poFileName } from "@/lib/files/po-file-name";
import { beforeEach, describe, expect, it } from "vitest";
import { daysAheadDate } from "@/lib/clock";
import { approveIndent, createIndent } from "@/lib/services/indent-service";
import {
  actOnPurchaseOrder,
  amendPurchaseOrder,
  createPurchaseOrder,
  parsePoSnapshot,
  issuePurchaseOrder,
  reopenPurchaseOrder,
  submitPurchaseOrder,
  updatePurchaseOrder,
} from "@/lib/services/po-service";
import { PermissionError, ValidationError, WorkflowError } from "@/lib/services/types";
import {
  boqLineByCode,
  HOD,
  issueDraftPo,
  materialByCode,
  PH,
  PO,
  project,
  PURCHASE_HEAD,
  reset,
  repos,
  SITE,
  supplierByCode,
} from "./helpers";

beforeEach(reset);

/**
 * B3 — writing an order. Two approved indents on one project, so every test
 * can consolidate them the way one of the orders Manas sent us consolidates
 * thirteen.
 */
async function twoApprovedIndents() {
  const p = await project();
  const cement = await materialByCode("MAT-001");
  const sand = await materialByCode("MAT-005");
  const plaster = await boqLineByCode(p.id, "BOQ-08");

  const first = await createIndent(
    {
      project_id: p.id,
      remarks: "Plaster, upper floors.",
      lines: [
        {
          boq_line_id: plaster.id,
          material_id: cement.id,
          requested_qty: 100,
          required_by: daysAheadDate(7),
        },
      ],
    },
    await SITE(),
  );
  const second = await createIndent(
    {
      project_id: p.id,
      remarks: "Plaster sand.",
      lines: [
        {
          boq_line_id: plaster.id,
          material_id: sand.id,
          requested_qty: 20,
          required_by: daysAheadDate(9),
        },
      ],
    },
    await SITE(),
  );

  for (const r of [first, second]) {
    await approveIndent(
      {
        indent_id: r.indent.id,
        lines: r.lines.map((l) => ({ indent_line_id: l.id, decision: "approve" as const })),
      },
      await PH(),
    );
  }

  return { project: p, first, second };
}

async function orderLines() {
  const { project: p, first, second } = await twoApprovedIndents();
  const supplier = await supplierByCode("SUP-001");
  return {
    project: p,
    supplier,
    first,
    second,
    input: {
      project_id: p.id,
      supplier_id: supplier.id,
      lines: [
        { indent_line_id: first.lines[0].id, ordered_qty: 100, rate: 410, gst_percent: 28 },
        { indent_line_id: second.lines[0].id, ordered_qty: 20, rate: 4200, gst_percent: 5 },
      ],
    },
  };
}

describe("createPurchaseOrder (B3) from approved indents", () => {
  it("consolidates lines from several indents onto one order", async () => {
    const { input, first, second } = await orderLines();
    const { purchase_order, lines } = await createPurchaseOrder(input, await PO());

    expect(purchase_order.status).toBe("draft");
    expect(purchase_order.amend_no).toBe(0);
    expect(purchase_order.po_number).toMatch(/^Pur\/MD\/MSP\/\d\d-\d\d\/\d{4}$/);
    expect(purchase_order.indent_ids).toHaveLength(2);
    expect(purchase_order.indent_ids).toContain(first.indent.id);
    expect(purchase_order.indent_ids).toContain(second.indent.id);
    expect(lines).toHaveLength(2);
  });

  it("inherits the material, unit and BOQ line from the indent line", async () => {
    const { input, first } = await orderLines();
    const cement = await materialByCode("MAT-001");
    const { lines } = await createPurchaseOrder(
      {
        ...input,
        // A material named on the input is ignored where a parent line exists.
        lines: [{ ...input.lines[0], material_id: (await materialByCode("MAT-003")).id }],
      },
      await PO(),
    );
    expect(lines[0].material_id).toBe(cement.id);
    expect(lines[0].unit).toBe(cement.unit);
    expect(lines[0].boq_line_id).toBe(first.lines[0].boq_line_id);
    expect(lines[0].indent_line_id).toBe(first.lines[0].id);
  });

  it("snapshots brand and specification off the material master", async () => {
    const { input } = await orderLines();
    const cement = await materialByCode("MAT-001");
    const { lines } = await createPurchaseOrder(input, await PO());
    expect(lines[0].specification).toBe(cement.specification);
    expect(lines[0].brand).toBe(cement.brand);
  });

  it("rolls ordered_qty back onto the indent line", async () => {
    const { input, first } = await orderLines();
    await createPurchaseOrder(input, await PO());
    const line = (await repos().indents.listLinesByIndent(first.indent.id))[0];
    expect(line.ordered_qty).toBe(100);
  });

  it("refuses more than the approved quantity left to order", async () => {
    const { input } = await orderLines();
    await expect(
      createPurchaseOrder(
        { ...input, lines: [{ ...input.lines[0], ordered_qty: 140 }] },
        await PO(),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses to order the same indent line twice across two orders", async () => {
    const { input } = await orderLines();
    await createPurchaseOrder({ ...input, lines: [input.lines[0]] }, await PO());
    await expect(
      createPurchaseOrder({ ...input, lines: [input.lines[0]] }, await PO()),
    ).rejects.toThrow(/left to order/);
  });

  it("carries the default clause list onto the order", async () => {
    const { input } = await orderLines();
    const { purchase_order, terms } = await createPurchaseOrder(input, await PO());
    const defaults = (await repos().poClauses.listActive()).filter((c) => c.is_default);
    expect(terms).toHaveLength(defaults.length);
    expect(terms.map((t) => t.sequence)).toEqual(terms.map((_, i) => i + 1));
    expect(terms.some((t) => t.text.includes(purchase_order.payment_terms))).toBe(true);
  });

  it("refuses the Site Engineer", async () => {
    const { input } = await orderLines();
    await expect(createPurchaseOrder(input, await SITE())).rejects.toBeInstanceOf(PermissionError);
  });

  it("refuses an order with no lines", async () => {
    const { input } = await orderLines();
    await expect(createPurchaseOrder({ ...input, lines: [] }, await PO())).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

describe("updatePurchaseOrder", () => {
  it("rewrites a draft's lines", async () => {
    const { input } = await orderLines();
    const { purchase_order } = await createPurchaseOrder(input, await PO());
    const { lines } = await updatePurchaseOrder(
      purchase_order.id,
      { ...input, lines: [{ ...input.lines[0], ordered_qty: 60 }] },
      await PO(),
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].ordered_qty).toBe(60);
    const stored = await repos().purchaseOrders.listLinesByPo(purchase_order.id);
    expect(stored).toHaveLength(1);
  });

  it("releases the indent quantity it no longer orders", async () => {
    const { input, first } = await orderLines();
    const { purchase_order } = await createPurchaseOrder(input, await PO());
    await updatePurchaseOrder(
      purchase_order.id,
      { ...input, lines: [{ ...input.lines[0], ordered_qty: 40 }] },
      await PO(),
    );
    const line = (await repos().indents.listLinesByIndent(first.indent.id))[0];
    expect(line.ordered_qty).toBe(40);
  });

  it("refuses to edit anything but a draft", async () => {
    const { input } = await orderLines();
    const { purchase_order } = await createPurchaseOrder(input, await PO());
    await repos().purchaseOrders.update(purchase_order.id, { status: "sent" });
    await expect(updatePurchaseOrder(purchase_order.id, input, await PO())).rejects.toBeInstanceOf(
      WorkflowError,
    );
  });
});

describe("delivery schedules", () => {
  it("carries several schedules, including a balance one with no dates", async () => {
    const { input } = await orderLines();
    const { schedules, schedule_lines } = await createPurchaseOrder(
      {
        ...input,
        schedules: [
          {
            title: "Delivery Schedule 1",
            lines: [{ line_index: 0, quantity: 60, delivery_date: daysAheadDate(7) }],
          },
          {
            is_balance: true,
            lines: [{ line_index: 0, quantity: 40 }],
          },
        ],
      },
      await PO(),
    );

    expect(schedules).toHaveLength(2);
    expect(schedules.map((s) => s.sequence)).toEqual([1, 2]);
    expect(schedules[1].is_balance).toBe(true);
    const balanceLines = schedule_lines.filter(
      (l) => l.po_delivery_schedule_id === schedules[1].id,
    );
    expect(balanceLines).toHaveLength(1);
    expect(balanceLines[0].delivery_date).toBeNull();
  });

  it("refuses a schedule that promises more than the order carries", async () => {
    const { input } = await orderLines();
    await expect(
      createPurchaseOrder(
        {
          ...input,
          schedules: [
            {
              lines: [
                { line_index: 0, quantity: 70, delivery_date: daysAheadDate(7) },
                { line_index: 0, quantity: 50, delivery_date: daysAheadDate(14) },
              ],
            },
          ],
        },
        await PO(),
      ),
    ).rejects.toThrow(/scheduled for 120 against an ordered 100/);
  });

  it("refuses a dated schedule line with no date, and a balance line with one", async () => {
    const { input } = await orderLines();
    await expect(
      createPurchaseOrder(
        { ...input, schedules: [{ lines: [{ line_index: 0, quantity: 10 }] }] },
        await PO(),
      ),
    ).rejects.toThrow(/give a delivery date/);
    await expect(
      createPurchaseOrder(
        {
          ...input,
          schedules: [
            { is_balance: true, lines: [{ line_index: 0, quantity: 10, delivery_date: daysAheadDate(3) }] },
          ],
        },
        await PO(),
      ),
    ).rejects.toThrow(/carries no dates/);
  });

  it("takes the expected delivery date from the last dated instalment", async () => {
    const { input } = await orderLines();
    const last = daysAheadDate(21);
    const { purchase_order } = await createPurchaseOrder(
      {
        ...input,
        schedules: [
          {
            lines: [
              { line_index: 0, quantity: 40, delivery_date: daysAheadDate(7) },
              { line_index: 0, quantity: 60, delivery_date: last },
            ],
          },
        ],
      },
      await PO(),
    );
    expect(purchase_order.expected_delivery_date).toBe(last);
  });
});

describe("additional charges", () => {
  it("adds up to the grand total, with freight taxed at its own rate", async () => {
    const { input, supplier } = await orderLines();
    const { purchase_order } = await createPurchaseOrder(
      { ...input, transportation_charge: 2_000, freight_gst_percent: 18 },
      await PO(),
    );

    const material = 100 * 410 + 20 * 4200;
    const materialTax = 100 * 410 * 0.28 + 20 * 4200 * 0.05;
    const freightTax = 2_000 * 0.18;

    expect(purchase_order.basic_amount).toBe(material);
    expect(purchase_order.transportation_charge).toBe(2_000);
    expect(supplier.state).toBe("Goa");
    expect(purchase_order.is_interstate).toBe(false);
    expect(purchase_order.cgst_amount + purchase_order.sgst_amount).toBeCloseTo(
      materialTax + freightTax,
      2,
    );
    expect(purchase_order.igst_amount).toBe(0);
    expect(purchase_order.total_amount).toBeCloseTo(
      material + 2_000 + materialTax + freightTax,
      2,
    );
  });

  it("charges IGST on a supplier outside Goa", async () => {
    const { input } = await orderLines();
    const outside = (await repos().suppliers.list()).find((s) => s.state !== "Goa");
    const { purchase_order } = await createPurchaseOrder(
      { ...input, supplier_id: outside!.id, transportation_charge: 1_000 },
      await PO(),
    );
    expect(purchase_order.is_interstate).toBe(true);
    expect(purchase_order.cgst_amount + purchase_order.sgst_amount).toBe(0);
    expect(purchase_order.igst_amount).toBeGreaterThan(0);
  });
});

describe("the two-level sign-off (B3) and the issue (B4)", () => {
  async function draft() {
    const { input } = await orderLines();
    const { purchase_order } = await createPurchaseOrder(input, await PO());
    return purchase_order;
  }

  it("opens both chain rows at once and makes only the lowest actionable", async () => {
    const po = await draft();
    const { purchase_order, approvals } = await submitPurchaseOrder(po.id, await PO());

    expect(purchase_order.status).toBe("pending_approval");
    expect(purchase_order.current_sequence).toBe(1);
    expect(purchase_order.current_step_code).toBe("B3");
    expect(approvals).toHaveLength(2);
    expect(approvals.every((a) => a.status === "pending")).toBe(true);

    // The HoD holds sequence 2, so cannot act while sequence 1 is open.
    await expect(
      actOnPurchaseOrder({ purchase_order_id: po.id, action: "approve" }, await HOD()),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("runs recommend, authorise, issue", async () => {
    const po = await draft();
    await submitPurchaseOrder(po.id, await PO());

    const recommended = await actOnPurchaseOrder(
      { purchase_order_id: po.id, action: "approve" },
      await PURCHASE_HEAD(),
    );
    expect(recommended.purchase_order.status).toBe("pending_approval");
    expect(recommended.purchase_order.current_sequence).toBe(2);
    expect(recommended.purchase_order.current_step_code).toBe("B4");

    const authorised = await actOnPurchaseOrder(
      { purchase_order_id: po.id, action: "approve" },
      await HOD(),
    );
    expect(authorised.purchase_order.status).toBe("approved");
    expect(authorised.purchase_order.current_sequence).toBeNull();

    const issued = await issuePurchaseOrder(po.id, await PO());
    expect(issued.status).toBe("sent");
    expect(issued.sent_at).not.toBeNull();
  });

  async function authorised() {
    const po = await draft();
    await submitPurchaseOrder(po.id, await PO());
    await actOnPurchaseOrder({ purchase_order_id: po.id, action: "approve" }, await PURCHASE_HEAD());
    await actOnPurchaseOrder({ purchase_order_id: po.id, action: "approve" }, await HOD());
    return po;
  }

  it("records the covering email it was issued with, flagged as simulated", async () => {
    const po = await authorised();
    const issued = await issuePurchaseOrder(po.id, await PO(), {
      from: "purchase@manas.example",
      to: "sales@supplier.example, accounts@supplier.example",
      cc: "site@manas.example",
      bcc: "",
      subject: `Purchase Order ${po.po_number}`,
      body: "Please confirm.",
    });
    expect(issued.status).toBe("sent");
    expect(issued.send_record).toMatchObject({
      to: "sales@supplier.example, accounts@supplier.example",
      cc: "site@manas.example",
      subject: `Purchase Order ${po.po_number}`,
      simulated: true,
    });
    expect(issued.send_record?.attachment_name).toBe(poFileName(po.po_number));
  });

  it("writes a default send record when issued without a message", async () => {
    const po = await authorised();
    const issued = await issuePurchaseOrder(po.id, await PO());
    expect(issued.send_record?.subject).toContain(po.po_number);
    expect(issued.send_record?.to).toContain("@");
  });

  it("refuses an issue with a bad address or no recipient, and leaves the order approved", async () => {
    const po = await authorised();
    const ok = { from: "a@b.co", to: "c@d.co", cc: "", bcc: "", subject: "PO", body: "" };
    await expect(issuePurchaseOrder(po.id, await PO(), { ...ok, to: "" })).rejects.toThrow(/To/);
    await expect(
      issuePurchaseOrder(po.id, await PO(), { ...ok, cc: "not-an-address" }),
    ).rejects.toThrow(/not an email address/);
    await expect(issuePurchaseOrder(po.id, await PO(), { ...ok, subject: " " })).rejects.toThrow(
      /subject/,
    );
    expect((await repos().purchaseOrders.getById(po.id))?.status).toBe("approved");
  });

  it("cannot be issued before it is authorised", async () => {
    const po = await draft();
    await expect(issuePurchaseOrder(po.id, await PO())).rejects.toThrow(
      /cannot move from "draft"/,
    );
    await submitPurchaseOrder(po.id, await PO());
    await expect(issuePurchaseOrder(po.id, await PO())).rejects.toThrow(
      /cannot move from "pending_approval"/,
    );
  });

  it("sends back to draft with a comment, and reopening reuses the same chain rows", async () => {
    const po = await draft();
    await submitPurchaseOrder(po.id, await PO());
    const sentBack = await actOnPurchaseOrder(
      { purchase_order_id: po.id, action: "send_back", comment: "Rate is above the comparative." },
      await PURCHASE_HEAD(),
    );
    expect(sentBack.purchase_order.status).toBe("sent_back");
    expect(sentBack.purchase_order.decision_comment).toContain("above the comparative");
    expect(sentBack.approval.status).toBe("sent_back");

    await reopenPurchaseOrder(po.id, await PO());
    const again = await submitPurchaseOrder(po.id, await PO());
    expect(again.purchase_order.current_sequence).toBe(1);
    const rows = await repos().approvals.listForEntity("purchase_order", po.id);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.status === "pending")).toBe(true);
  });

  it("requires a comment to send back or reject", async () => {
    const po = await draft();
    await submitPurchaseOrder(po.id, await PO());
    await expect(
      actOnPurchaseOrder({ purchase_order_id: po.id, action: "reject" }, await PURCHASE_HEAD()),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses the Purchase Officer at an approval step", async () => {
    const po = await draft();
    await submitPurchaseOrder(po.id, await PO());
    await expect(
      actOnPurchaseOrder({ purchase_order_id: po.id, action: "approve" }, await PO()),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("refuses to submit an order with no lines", async () => {
    const po = await draft();
    for (const l of await repos().purchaseOrders.listLinesByPo(po.id)) {
      await repos().purchaseOrders.removeLine(l.id);
    }
    await expect(submitPurchaseOrder(po.id, await PO())).rejects.toBeInstanceOf(WorkflowError);
  });
});

describe("amendPurchaseOrder", () => {
  async function issued() {
    const { input } = await orderLines();
    const { purchase_order } = await createPurchaseOrder(input, await PO());
    await issueDraftPo(purchase_order.id);
    return { po: purchase_order, input };
  }

  it("increments the amend number and keeps the previous version", async () => {
    const { po } = await issued();
    const before = (await repos().purchaseOrders.getById(po.id))!;

    const { purchase_order, amendment } = await amendPurchaseOrder(
      { purchase_order_id: po.id, reason: "Supplier revised the cement rate." },
      await PO(),
    );

    expect(purchase_order.amend_no).toBe(1);
    expect(purchase_order.status).toBe("draft");
    expect(purchase_order.amend_reason).toContain("revised the cement rate");

    // The archive holds the version being replaced, numbered 0.
    expect(amendment.amend_no).toBe(0);
    expect(amendment.previous_total_amount).toBe(before.total_amount);
    const snapshot = parsePoSnapshot(amendment);
    expect(snapshot?.purchase_order.total_amount).toBe(before.total_amount);
    expect(snapshot?.lines).toHaveLength(2);
    expect(snapshot?.terms.length).toBeGreaterThan(0);
  });

  it("keeps one history row per amendment", async () => {
    const { po, input } = await issued();
    await amendPurchaseOrder({ purchase_order_id: po.id, reason: "First revision." }, await PO());
    await updatePurchaseOrder(po.id, input, await PO());
    await issueDraftPo(po.id);
    await amendPurchaseOrder({ purchase_order_id: po.id, reason: "Second revision." }, await PO());

    const history = await repos().purchaseOrders.listAmendmentsByPo(po.id);
    expect(history.map((h) => h.amend_no)).toEqual([0, 1]);
    const current = (await repos().purchaseOrders.getById(po.id))!;
    expect(current.amend_no).toBe(2);
  });

  it("runs the sign-off again after an amendment", async () => {
    const { po, input } = await issued();
    await amendPurchaseOrder({ purchase_order_id: po.id, reason: "Quantity reduced." }, await PO());
    await updatePurchaseOrder(
      po.id,
      { ...input, lines: [{ ...input.lines[0], ordered_qty: 50 }] },
      await PO(),
    );
    const reissued = await issueDraftPo(po.id);
    expect(reissued.status).toBe("sent");
    expect(reissued.amend_no).toBe(1);
  });

  it("refuses to amend a draft, and refuses once anything is received", async () => {
    const { input } = await orderLines();
    const { purchase_order } = await createPurchaseOrder(input, await PO());
    await expect(
      amendPurchaseOrder({ purchase_order_id: purchase_order.id, reason: "Too early." }, await PO()),
    ).rejects.toThrow(/still a draft/);

    await issueDraftPo(purchase_order.id);
    const line = (await repos().purchaseOrders.listLinesByPo(purchase_order.id))[0];
    await repos().purchaseOrders.updateLine(line.id, { received_qty: 10 });
    await expect(
      amendPurchaseOrder(
        { purchase_order_id: purchase_order.id, reason: "Rate changed." },
        await PO(),
      ),
    ).rejects.toThrow(/already has material received/);
  });

  it("needs a reason", async () => {
    const { po } = await issued();
    await expect(
      amendPurchaseOrder({ purchase_order_id: po.id, reason: "" }, await PO()),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
