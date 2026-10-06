import { rupees } from "./pricing";
import type { StatutoryDeductionHead } from "@/lib/domain";

/**
 * Phase 7 — the RA bill deduction waterfall. Pure, with no repository
 * imports, so the deterministic seed can build bills with exactly the same
 * maths the service uses (see ra-bill-math.ts, pricing.ts).
 *
 * The order is fixed by the brief and printed in this order on the bill:
 *   1. Gross value of work done this bill
 *   2. Less retention
 *   3. Less mobilisation advance recovery, capped at the advance paid
 *   4. Less statutory deductions (a configurable list of heads)
 *   5. Less liquidated damages, if any
 *   6. Less any other deduction
 *   7. Net payable this bill
 *   8. Release split: due now / due in 30 days
 */

export type StatutoryDeductionLine = {
  head_id: string;
  label: string;
  percent: number;
  amount: number;
};

export type RaBillWaterfallInput = {
  /** Certified qty x rate, summed across this bill's lines. */
  gross_amount: number;
  previous_gross_amount: number;

  retention_percent: number;
  previous_retention_amount: number;

  /** Rate applied to gross this bill, e.g. 12.5%. */
  advance_recovery_percent: number;
  /** Sum of every mobilisation instalment actually released. */
  advance_paid_total: number;
  previous_advance_recovery_amount: number;

  statutory_heads: StatutoryDeductionHead[];
  previous_statutory_deductions_amount: number;

  /** Entered per bill — delay is not tracked elsewhere in the demo. */
  ld_amount: number;
  previous_ld_amount: number;

  other_deductions_amount: number;
  previous_other_deductions_amount: number;

  payment_release_percent_1: number;
  payment_release_percent_2: number;
};

export type RaBillWaterfallResult = {
  gross_amount: number;
  cumulative_gross_amount: number;

  retention_amount: number;
  cumulative_retention_amount: number;

  advance_recovery_amount: number;
  cumulative_advance_recovery_amount: number;
  advance_outstanding_amount: number;

  statutory_deductions: StatutoryDeductionLine[];
  statutory_deductions_amount: number;
  cumulative_statutory_deductions_amount: number;

  ld_amount: number;
  cumulative_ld_amount: number;

  other_deductions_amount: number;
  cumulative_other_deductions_amount: number;

  total_deductions: number;
  net_payable_amount: number;

  amount_due_now: number;
  amount_due_30_days: number;
};

/**
 * Advance recovery this bill, capped two ways: it can never exceed what is
 * still outstanding on the advance, and it is computed on the gross of THIS
 * bill alone (never on the cumulative), which is what lets recovery taper to
 * zero exactly when the advance is exhausted rather than overshooting on the
 * bill that crosses the line.
 */
export function advanceRecoveryFor(
  gross_amount: number,
  advance_recovery_percent: number,
  advance_paid_total: number,
  previous_advance_recovery_amount: number,
): number {
  const outstanding = rupees(advance_paid_total - previous_advance_recovery_amount);
  if (outstanding <= 0) return 0;
  const standard = rupees((gross_amount * advance_recovery_percent) / 100);
  return rupees(Math.min(standard, outstanding));
}

/** Every statutory head applied to this bill's gross, snapshotted with its amount. */
export function statutoryDeductionsFor(
  gross_amount: number,
  heads: StatutoryDeductionHead[],
): StatutoryDeductionLine[] {
  return heads.map((h) => ({
    head_id: h.id,
    label: h.label,
    percent: h.percent,
    amount: rupees((gross_amount * h.percent) / 100),
  }));
}

/**
 * The full waterfall for one bill. Called on creation and again whenever a
 * certified quantity is adjusted in the certification chain, so the totals
 * can never drift from the lines.
 */
export function computeRaBillWaterfall(input: RaBillWaterfallInput): RaBillWaterfallResult {
  const gross_amount = rupees(input.gross_amount);

  const retention_amount = rupees((gross_amount * input.retention_percent) / 100);
  const cumulative_retention_amount = rupees(input.previous_retention_amount + retention_amount);

  const advance_recovery_amount = advanceRecoveryFor(
    gross_amount,
    input.advance_recovery_percent,
    input.advance_paid_total,
    input.previous_advance_recovery_amount,
  );
  const cumulative_advance_recovery_amount = rupees(
    input.previous_advance_recovery_amount + advance_recovery_amount,
  );
  const advance_outstanding_amount = rupees(
    input.advance_paid_total - cumulative_advance_recovery_amount,
  );

  const statutory_deductions = statutoryDeductionsFor(gross_amount, input.statutory_heads);
  const statutory_deductions_amount = rupees(
    statutory_deductions.reduce((s, d) => s + d.amount, 0),
  );
  const cumulative_statutory_deductions_amount = rupees(
    input.previous_statutory_deductions_amount + statutory_deductions_amount,
  );

  const ld_amount = rupees(input.ld_amount);
  const cumulative_ld_amount = rupees(input.previous_ld_amount + ld_amount);

  const other_deductions_amount = rupees(input.other_deductions_amount);
  const cumulative_other_deductions_amount = rupees(
    input.previous_other_deductions_amount + other_deductions_amount,
  );

  const total_deductions = rupees(
    retention_amount +
      advance_recovery_amount +
      statutory_deductions_amount +
      ld_amount +
      other_deductions_amount,
  );
  const net_payable_amount = rupees(gross_amount - total_deductions);

  const amount_due_now = rupees((net_payable_amount * input.payment_release_percent_1) / 100);
  const amount_due_30_days = rupees(net_payable_amount - amount_due_now);

  return {
    gross_amount,
    cumulative_gross_amount: rupees(input.previous_gross_amount + gross_amount),
    retention_amount,
    cumulative_retention_amount,
    advance_recovery_amount,
    cumulative_advance_recovery_amount,
    advance_outstanding_amount,
    statutory_deductions,
    statutory_deductions_amount,
    cumulative_statutory_deductions_amount,
    ld_amount,
    cumulative_ld_amount,
    other_deductions_amount,
    cumulative_other_deductions_amount,
    total_deductions,
    net_payable_amount,
    amount_due_now,
    amount_due_30_days,
  };
}

/** The ceiling the brief sets: advance must be clear before this % completion. */
export function advanceClearedByCompletionPercent(
  advance_recovery_percent: number,
  mobilisation_advance_percent: number,
): number {
  if (advance_recovery_percent <= 0) return 100;
  return rupees((mobilisation_advance_percent / advance_recovery_percent) * 100);
}

/** The LD cap in rupees, for validating a typed LD figure against the contract. */
export function ldCapAmount(contract_value: number, ld_cap_percent: number): number {
  return rupees((contract_value * ld_cap_percent) / 100);
}
