import { rupees } from "./pricing";

/**
 * RA bill arithmetic. Pure, with no repository imports, so the deterministic
 * seed can build bills with exactly the same maths the service uses.
 */

export type RaBillTotals = {
  gross_amount: number;
  cumulative_gross_amount: number;
  retention_amount: number;
  tds_amount: number;
  total_deductions: number;
  net_payable_amount: number;
};

export type RaBillTotalsInput = {
  previous_gross_amount: number;
  retention_percent: number;
  tds_percent: number;
  advance_recovery_amount: number;
  other_deductions_amount: number;
};

/**
 * Every figure on a bill, derived from its certified lines. Called on creation
 * and again after any certified quantity is adjusted in the chain, so the
 * totals can never drift from the lines.
 */
export function computeRaBillTotals(
  lines: Array<{ certified_qty: number; rate: number }>,
  opts: RaBillTotalsInput,
): RaBillTotals {
  const gross_amount = rupees(lines.reduce((s, l) => s + l.certified_qty * l.rate, 0));
  const retention_amount = rupees((gross_amount * opts.retention_percent) / 100);
  const tds_amount = rupees((gross_amount * opts.tds_percent) / 100);
  const total_deductions = rupees(
    retention_amount + tds_amount + opts.advance_recovery_amount + opts.other_deductions_amount,
  );
  return {
    gross_amount,
    cumulative_gross_amount: rupees(opts.previous_gross_amount + gross_amount),
    retention_amount,
    tds_amount,
    total_deductions,
    net_payable_amount: rupees(gross_amount - total_deductions),
  };
}
