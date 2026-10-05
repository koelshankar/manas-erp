import { beforeEach, describe, expect, it } from "vitest";
import { daysAheadDate } from "@/lib/clock";
import { approveIndent, createIndent } from "@/lib/services/indent-service";
import {
  createPurchaseOrder,
  updatePurchaseOrder,
} from "@/lib/services/po-service";
import { PermissionError, ValidationError, WorkflowError } from "@/lib/services/types";
import {
  boqLineByCode,
  materialByCode,
  PH,
  PO,
  project,
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
    expect(purchase_order.po_number).toMatch(/^MSP\/PO\/\d\d-\d\d\/\d{4}$/);
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
