import { HOME_STATE } from "@/lib/domain";

/**
 * Pure purchase arithmetic. No repository imports, so the deterministic seed
 * can build its rows with exactly the same maths the services use at runtime.
 */

/**
 * Round to whole paise so demo arithmetic never drifts on floats.
 * Negative zero is normalised, otherwise a nil variance renders as "-₹0".
 */
export function rupees(n: number): number {
  const rounded = Math.round(n * 100) / 100;
  return rounded === 0 ? 0 : rounded;
}

export type LandedCost = {
  basic_amount: number;
  tax_amount: number;
  landed_amount: number;
  landed_rate: number;
};

/**
 * Landed cost for one quote. Freight is taxable, so GST applies to
 * (goods + freight). L1 is decided on landed_rate, never on the bare rate.
 */
export function landedCost(
  quantity: number,
  rate: number,
  gst_percent: number,
  freight_amount: number,
): LandedCost {
  const basic_amount = rupees(quantity * rate);
  const tax_amount = rupees(((basic_amount + freight_amount) * gst_percent) / 100);
  const landed_amount = rupees(basic_amount + freight_amount + tax_amount);
  return {
    basic_amount,
    tax_amount,
    landed_amount,
    landed_rate: quantity > 0 ? rupees(landed_amount / quantity) : 0,
  };
}

export type TaxSplit = {
  is_interstate: boolean;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
};

/** CGST + SGST for a Goa supplier, IGST for anyone else. */
export function splitTax(supplier_state: string, tax_amount: number): TaxSplit {
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
