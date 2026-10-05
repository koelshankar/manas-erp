import { rupees } from "./pricing";
import { HOME_STATE } from "@/lib/domain";

/**
 * Purchase order arithmetic, pure, so the deterministic seed and the print
 * layout share exactly the maths the services write with — the same reason
 * `pricing.ts` and `ra-bill-math.ts` are pure.
 *
 * The printed Additional Charges block on the orders Manas sent us runs:
 *
 *   Material Value · Transportation Charge · GST on freight · CGST · SGST ·
 *   IGST · Total Cost · Grand Total (and the amount in words)
 *
 * Line tax already covers the freight quoted inside a line — `landedCost`
 * taxes (goods + freight) at the line's own GST rate, which is what the
 * comparative compared on. So the freight tax printed on its own is the
 * freight portion of that, plus the tax on any transportation charge added on
 * the order itself. Nothing is double-counted and nothing is invented: the
 * block always adds back up to `total_amount`.
 */

export type PoChargeLine = {
  ordered_qty: number;
  rate: number;
  gst_percent: number;
  freight_amount: number;
};

export type PoCharges = {
  /** Σ (qty × rate). */
  material_value: number;
  /** Tax on the goods alone. */
  material_tax_amount: number;
  /** Line freight plus the order's own transportation charge. */
  transportation_charge: number;
  /** Tax on all of that freight. */
  freight_tax_amount: number;
  tax_amount: number;
  is_interstate: boolean;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  /** material_value + transportation_charge + tax_amount. */
  total_amount: number;
};

/**
 * The whole charges block for an order.
 *
 * `transportation_charge` is freight added on the order (a blank PO, or a
 * delivery charge the comparative did not carry); it is taxed at
 * `freight_gst_percent` rather than at any line's rate.
 */
export function poCharges(
  lines: PoChargeLine[],
  opts: {
    transportation_charge?: number;
    freight_gst_percent?: number;
    supplier_state: string;
  },
): PoCharges {
  const extra = opts.transportation_charge ?? 0;
  const extraGst = opts.freight_gst_percent ?? 0;

  let material_value = 0;
  let material_tax = 0;
  let line_freight = 0;
  let freight_tax = 0;

  for (const l of lines) {
    const basic = rupees(l.ordered_qty * l.rate);
    material_value += basic;
    material_tax += (basic * l.gst_percent) / 100;
    line_freight += l.freight_amount;
    freight_tax += (l.freight_amount * l.gst_percent) / 100;
  }

  freight_tax += (extra * extraGst) / 100;

  const transportation_charge = rupees(line_freight + extra);
  const material_tax_amount = rupees(material_tax);
  const freight_tax_amount = rupees(freight_tax);
  const tax_amount = rupees(material_tax_amount + freight_tax_amount);

  return {
    material_value: rupees(material_value),
    material_tax_amount,
    transportation_charge,
    freight_tax_amount,
    tax_amount,
    ...splitPoTax(opts.supplier_state, tax_amount),
    total_amount: rupees(material_value + transportation_charge + tax_amount),
  };
}

/** CGST + SGST for a Goa supplier, IGST for anyone else. Mirrors `splitTax`. */
export function splitPoTax(
  supplier_state: string,
  tax_amount: number,
): Pick<PoCharges, "is_interstate" | "cgst_amount" | "sgst_amount" | "igst_amount"> {
  const is_interstate = supplier_state !== HOME_STATE;
  if (is_interstate) {
    return { is_interstate, cgst_amount: 0, sgst_amount: 0, igst_amount: rupees(tax_amount) };
  }
  const half = rupees(tax_amount / 2);
  return {
    is_interstate,
    cgst_amount: half,
    sgst_amount: rupees(tax_amount - half),
    igst_amount: 0,
  };
}

/**
 * What a schedule still has to account for on each ordered line.
 *
 * A PO line's scheduled quantities may not exceed what was ordered, and the
 * balance is what the editor shows so an officer can see at a glance whether
 * a second (balance) schedule is still needed.
 */
export function scheduledBalance(
  lines: Array<{ id: string; ordered_qty: number }>,
  scheduled: Array<{ po_line_id: string; quantity: number }>,
): Map<string, { ordered_qty: number; scheduled_qty: number; balance_qty: number }> {
  const byLine = new Map<string, number>();
  for (const s of scheduled) {
    byLine.set(s.po_line_id, (byLine.get(s.po_line_id) ?? 0) + s.quantity);
  }
  const out = new Map<string, { ordered_qty: number; scheduled_qty: number; balance_qty: number }>();
  for (const l of lines) {
    const scheduled_qty = Math.round((byLine.get(l.id) ?? 0) * 1000) / 1000;
    out.set(l.id, {
      ordered_qty: l.ordered_qty,
      scheduled_qty,
      balance_qty: Math.round((l.ordered_qty - scheduled_qty) * 1000) / 1000,
    });
  }
  return out;
}
