import { beforeEach, describe, expect, it } from "vitest";
import { daysAheadDate } from "@/lib/clock";
import { createIndent, approveIndent } from "@/lib/services/indent-service";
import {
  createComparative,
  createPurchaseOrders,
  decideComparative,
  landedCost,
  markPoSent,
  splitTax,
} from "@/lib/services/purchase-service";
import { PermissionError, ValidationError } from "@/lib/services/types";
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
  supplierByCode,
  threeSuppliersFor,
} from "./helpers";

beforeEach(reset);

/** Raises and approves a one-line indent, ready to be quoted. */
async function approvedIndent(qtyWanted = 100) {
  const p = await project();
  const boq = await boqLineByCode(p.id, "BOQ-10");
  const tiles = await materialByCode("MAT-011");
  const { indent, lines } = await createIndent(
    {
      project_id: p.id,
      lines: [
        {
          boq_line_id: boq.id,
          material_id: tiles.id,
          requested_qty: qtyWanted,
          required_by: daysAheadDate(28),
          remarks: "",
        },
      ],
    },
    await SITE(),
  );
  await approveIndent(
    {
      indent_id: indent.id,
      comment: "",
      lines: lines.map((l) => ({ indent_line_id: l.id, decision: "approve" as const })),
    },
    await PH(),
  );
  return { project: p, indent, lines };
}

async function quoteSet(material_id: string) {
  const rates = await threeSuppliersFor(material_id);
  return rates.map((r, i) => ({
    supplier_id: r.supplier_id,
    rate: r.rate + i * 5,
    gst_percent: 18,
    freight_amount: 500 + i * 100,
    delivery_days: r.lead_time_days,
    payment_terms: "30 days from GRN",
  }));
}

describe("landedCost", () => {
  it("taxes goods plus freight and prices L1 on the landed rate", async () => {
    const c = landedCost(100, 500, 18, 1000);
    expect(c.basic_amount).toBe(50_000);
    expect(c.tax_amount).toBe(9_180);
    expect(c.landed_amount).toBe(60_180);
    expect(c.landed_rate).toBe(601.8);
  });
});

describe("splitTax", () => {
  it("splits CGST and SGST for a Goa supplier", () => {
    expect(splitTax("Goa", 1000)).toEqual({
      is_interstate: false,
      cgst_amount: 500,
      sgst_amount: 500,
      igst_amount: 0,
    });
  });
  it("charges IGST outside Goa", () => {
    expect(splitTax("Karnataka", 1000)).toEqual({
      is_interstate: true,
      cgst_amount: 0,
      sgst_amount: 0,
      igst_amount: 1000,
    });
  });
});

describe("createComparative (B1)", () => {
  it("prices every quote, marks L1, and records the officer's selection", async () => {
    const { project: p, lines } = await approvedIndent();
    const tiles = await materialByCode("MAT-011");
    const quotes = await quoteSet(tiles.id);

    const result = await createComparative(
      {
        project_id: p.id,
        lines: [
          {
            indent_line_id: lines[0].id,
            quotes,
            selected_supplier_id: quotes[0].supplier_id,
          },
        ],
      },
      await PO(),
    );

    expect(result.comparative.status).toBe("draft");
    expect(result.comparative.comparative_number).toMatch(/^MSP\/CMP\/26-27\/\d{4}$/);
    expect(result.quotes).toHaveLength(3);
    expect(result.quotes.filter((q) => q.is_l1)).toHaveLength(1);
    expect(result.quotes.filter((q) => q.is_selected)).toHaveLength(1);
    expect(result.lines[0].quantity).toBe(100);
    expect(result.lines[0].selected_quote_id).not.toBeNull();
    expect(result.comparative.total_selected_value).toBeGreaterThan(0);
  });

  it("requires a justification when the selection is not L1", async () => {
    const { project: p, lines } = await approvedIndent();
    const tiles = await materialByCode("MAT-011");
    const quotes = await quoteSet(tiles.id);
    const cheapest = [...quotes].sort(
      (a, b) =>
        landedCost(100, a.rate, a.gst_percent, a.freight_amount).landed_rate -
        landedCost(100, b.rate, b.gst_percent, b.freight_amount).landed_rate,
    )[0];
    const notL1 = quotes.find((q) => q.supplier_id !== cheapest.supplier_id)!;

    await expect(
      createComparative(
        {
          project_id: p.id,
          lines: [{ indent_line_id: lines[0].id, quotes, selected_supplier_id: notL1.supplier_id }],
        },
        await PO(),
      ),
    ).rejects.toThrow(/justification is required/);

    const ok = await createComparative(
      {
        project_id: p.id,
        lines: [
          {
            indent_line_id: lines[0].id,
            quotes,
            selected_supplier_id: notL1.supplier_id,
            justification: "L1 could not meet the site delivery window.",
          },
        ],
      },
      await PO(),
    );
    expect(ok.lines[0].is_l1_selected).toBe(false);
    expect(ok.lines[0].justification).toContain("delivery window");
  });
});

describe("createComparative — permission", () => {
  it("refuses the Site Engineer", async () => {
    const { project: p, lines } = await approvedIndent();
    const tiles = await materialByCode("MAT-011");
    await expect(
      createComparative(
        {
          project_id: p.id,
          lines: [
            {
              indent_line_id: lines[0].id,
              quotes: await quoteSet(tiles.id),
              selected_supplier_id: (await quoteSet(tiles.id))[0].supplier_id,
            },
          ],
        },
        await SITE(),
      ),
    ).rejects.toBeInstanceOf(PermissionError);
  });
});

describe("createComparative — validation", () => {
  it("insists on at least three quotes per line", async () => {
    const { project: p, lines } = await approvedIndent();
    const tiles = await materialByCode("MAT-011");
    const quotes = (await quoteSet(tiles.id)).slice(0, 2);
    await expect(
      createComparative(
        {
          project_id: p.id,
          lines: [
            { indent_line_id: lines[0].id, quotes, selected_supplier_id: quotes[0].supplier_id },
          ],
        },
        await PO(),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses an indent line that has not been approved", async () => {
    const p = await project();
    const boq = await boqLineByCode(p.id, "BOQ-10");
    const tiles = await materialByCode("MAT-011");
    const { lines } = await createIndent(
      {
        project_id: p.id,
        lines: [
          {
            boq_line_id: boq.id,
            material_id: tiles.id,
            requested_qty: 10,
            required_by: daysAheadDate(28),
            remarks: "",
          },
        ],
      },
      await SITE(),
    );
    const quotes = await quoteSet(tiles.id);
    await expect(
      createComparative(
        {
          project_id: p.id,
          lines: [
            { indent_line_id: lines[0].id, quotes, selected_supplier_id: quotes[0].supplier_id },
          ],
        },
        await PO(),
      ),
    ).rejects.toThrow(/not approved for purchase/);
  });

  it("refuses a selected supplier that did not quote", async () => {
    const { project: p, lines } = await approvedIndent();
    const tiles = await materialByCode("MAT-011");
    const quotes = await quoteSet(tiles.id);
    const outsider = await supplierByCode("SUP-002");
    await expect(
      createComparative(
        {
          project_id: p.id,
          lines: [
            { indent_line_id: lines[0].id, quotes, selected_supplier_id: outsider.id },
          ],
        },
        await PO(),
      ),
    ).rejects.toThrow(/no quote on this line/);
  });
});

describe("submitComparative + decideComparative (B2)", () => {
  async function pendingComparative() {
    const { project: p, indent, lines } = await approvedIndent();
    const tiles = await materialByCode("MAT-011");
    const quotes = await quoteSet(tiles.id);
    const result = await createComparative(
      {
        project_id: p.id,
        submit: true,
        lines: [
          { indent_line_id: lines[0].id, quotes, selected_supplier_id: quotes[0].supplier_id },
        ],
      },
      await PO(),
    );
    return { ...result, project: p, indent };
  }

  it("submitting opens the B2 gate and moves the indent to in_comparative", async () => {
    const { comparative, approval, indent } = await pendingComparative();
    expect(comparative.status).toBe("pending_approval");
    expect(approval?.step_code).toBe("B2");
    expect(approval?.required_role).toBe("purchase_head");
    expect((await repos().indents.getById(indent.id))!.status).toBe("in_comparative");
  });

  it("approving fixes the rates", async () => {
    const { comparative } = await pendingComparative();
    const { comparative: decided, approval } = await decideComparative(
      { comparative_id: comparative.id, decision: "approve", comment: "" },
      await PURCHASE_HEAD(),
    );
    expect(decided.status).toBe("approved");
    expect(decided.decided_by_user_id).not.toBeNull();
    expect(approval.status).toBe("approved");
  });

  it("sending back releases the indent so it can be quoted again", async () => {
    const { comparative, indent } = await pendingComparative();
    const { comparative: decided, approval } = await decideComparative(
      { comparative_id: comparative.id, decision: "send_back", comment: "Need a third quote." },
      await PURCHASE_HEAD(),
    );
    expect(decided.status).toBe("sent_back");
    expect(approval.status).toBe("sent_back");
    expect((await repos().indents.getById(indent.id))!.status).toBe("approved");
  });

  it("refuses the Purchase Officer", async () => {
    const { comparative } = await pendingComparative();
    await expect(
      decideComparative(
        { comparative_id: comparative.id, decision: "approve", comment: "" },
        await PO(),
      ),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("requires a comment to send back or reject", async () => {
    const { comparative } = await pendingComparative();
    await expect(
      decideComparative(
        { comparative_id: comparative.id, decision: "reject", comment: "" },
        await PURCHASE_HEAD(),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses to decide a comparative that is still a draft", async () => {
    const { project: p, lines } = await approvedIndent();
    const tiles = await materialByCode("MAT-011");
    const quotes = await quoteSet(tiles.id);
    const { comparative } = await createComparative(
      {
        project_id: p.id,
        lines: [
          { indent_line_id: lines[0].id, quotes, selected_supplier_id: quotes[0].supplier_id },
        ],
      },
      await PO(),
    );
    await expect(
      decideComparative(
        { comparative_id: comparative.id, decision: "approve", comment: "" },
        await PURCHASE_HEAD(),
      ),
    ).rejects.toThrow(/cannot move from "draft"/);
  });
});

describe("createPurchaseOrders (B3) and markPoSent (B4)", () => {
  async function approvedComparative() {
    const { project: p, indent, lines } = await approvedIndent();
    const tiles = await materialByCode("MAT-011");
    const quotes = await quoteSet(tiles.id);
    const { comparative } = await createComparative(
      {
        project_id: p.id,
        submit: true,
        lines: [
          { indent_line_id: lines[0].id, quotes, selected_supplier_id: quotes[0].supplier_id },
        ],
      },
      await PO(),
    );
    await decideComparative(
      { comparative_id: comparative.id, decision: "approve", comment: "" },
      await PURCHASE_HEAD(),
    );
    return { project: p, comparative, indent, indentLines: lines };
  }

  it("raises one PO per supplier and pushes the indent to po_raised", async () => {
    const { comparative, indent, indentLines } = await approvedComparative();
    const { purchase_orders, lines } = await createPurchaseOrders(
      { comparative_id: comparative.id },
      await PO(),
    );

    expect(purchase_orders).toHaveLength(1);
    const po = purchase_orders[0];
    expect(po.status).toBe("draft");
    expect(po.po_number).toMatch(/^MSP\/PO\/26-27\/\d{4}$/);
    expect(po.delivery_address).toContain("Manas Sapphire");
    expect(lines[0].ordered_qty).toBe(100);
    expect(po.total_amount).toBe(
      Math.round((po.basic_amount + po.freight_amount + po.cgst_amount + po.sgst_amount + po.igst_amount) * 100) / 100,
    );

    expect((await repos().indents.getById(indent.id))!.status).toBe("po_raised");
    const refreshed = await repos().indents.listLinesByIndent(indent.id);
    expect(refreshed.find((l) => l.id === indentLines[0].id)!.ordered_qty).toBe(100);
  });

  it("marks the PO sent", async () => {
    const { comparative } = await approvedComparative();
    const { purchase_orders } = await createPurchaseOrders(
      { comparative_id: comparative.id },
      await PO(),
    );
    const sent = await markPoSent(purchase_orders[0].id, await PO());
    expect(sent.status).toBe("sent");
    expect(sent.sent_at).not.toBeNull();
  });

  it("refuses the Site Engineer", async () => {
    const { comparative } = await approvedComparative();
    await expect(
      createPurchaseOrders({ comparative_id: comparative.id }, await SITE()),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("refuses to raise POs twice from one comparative", async () => {
    const { comparative } = await approvedComparative();
    await createPurchaseOrders({ comparative_id: comparative.id }, await PO());
    await expect(
      createPurchaseOrders({ comparative_id: comparative.id }, await PO()),
    ).rejects.toThrow(/already been generated/);
  });

  it("refuses to send a PO twice", async () => {
    const { comparative } = await approvedComparative();
    const { purchase_orders } = await createPurchaseOrders(
      { comparative_id: comparative.id },
      await PO(),
    );
    await markPoSent(purchase_orders[0].id, await PO());
    await expect(markPoSent(purchase_orders[0].id, await PO())).rejects.toThrow(
      /cannot move from "sent"/,
    );
  });
});
