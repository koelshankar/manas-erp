import { describe, expect, it } from "vitest";
import {
  advanceClearedByCompletionPercent,
  advanceRecoveryFor,
  computeRaBillWaterfall,
  ldCapAmount,
  statutoryDeductionsFor,
  type RaBillWaterfallInput,
} from "@/lib/services/contract-math";
import type { StatutoryDeductionHead } from "@/lib/domain";

const TDS_HEAD: StatutoryDeductionHead = { id: "tds", label: "TDS (s.194C)", percent: 2 };

function baseInput(overrides: Partial<RaBillWaterfallInput> = {}): RaBillWaterfallInput {
  return {
    gross_amount: 1_000_000,
    previous_gross_amount: 0,
    retention_percent: 5,
    previous_retention_amount: 0,
    advance_recovery_percent: 12.5,
    advance_paid_total: 1_000_000, // 10% of a 1 crore contract
    previous_advance_recovery_amount: 0,
    statutory_heads: [TDS_HEAD],
    previous_statutory_deductions_amount: 0,
    ld_amount: 0,
    previous_ld_amount: 0,
    other_deductions_amount: 0,
    previous_other_deductions_amount: 0,
    payment_release_percent_1: 70,
    payment_release_percent_2: 30,
    ...overrides,
  };
}

describe("advanceRecoveryFor", () => {
  it("recovers the standard rate when the advance is far from exhausted", () => {
    expect(advanceRecoveryFor(1_000_000, 12.5, 1_000_000, 0)).toBe(125_000);
  });

  it("caps recovery at what remains outstanding", () => {
    expect(advanceRecoveryFor(1_000_000, 12.5, 1_000_000, 950_000)).toBe(50_000);
  });

  it("recovers nothing once the advance is fully cleared", () => {
    expect(advanceRecoveryFor(1_000_000, 12.5, 1_000_000, 1_000_000)).toBe(0);
  });

  it("never goes negative when a bill shrinks after the advance is cleared", () => {
    expect(advanceRecoveryFor(500_000, 12.5, 1_000_000, 1_000_000)).toBe(0);
  });
});

describe("statutoryDeductionsFor", () => {
  it("applies every configured head independently", () => {
    const heads: StatutoryDeductionHead[] = [
      { id: "tds", label: "TDS (s.194C)", percent: 2 },
      { id: "cess", label: "Labour welfare cess", percent: 1 },
    ];
    const lines = statutoryDeductionsFor(1_000_000, heads);
    expect(lines).toHaveLength(2);
    expect(lines[0].amount).toBe(20_000);
    expect(lines[1].amount).toBe(10_000);
  });

  it("returns an empty list for a contract with no statutory heads configured", () => {
    expect(statutoryDeductionsFor(1_000_000, [])).toEqual([]);
  });
});

describe("computeRaBillWaterfall", () => {
  it("computes every step in order on a first bill", () => {
    const result = computeRaBillWaterfall(baseInput());

    expect(result.gross_amount).toBe(1_000_000);
    expect(result.retention_amount).toBe(50_000);
    expect(result.advance_recovery_amount).toBe(125_000);
    expect(result.statutory_deductions_amount).toBe(20_000);
    expect(result.ld_amount).toBe(0);
    expect(result.other_deductions_amount).toBe(0);
    expect(result.total_deductions).toBe(50_000 + 125_000 + 20_000);
    expect(result.net_payable_amount).toBe(1_000_000 - result.total_deductions);
  });

  it("carries cumulative columns forward from the previous bill", () => {
    const result = computeRaBillWaterfall(
      baseInput({
        previous_gross_amount: 2_000_000,
        previous_retention_amount: 100_000,
        previous_advance_recovery_amount: 200_000,
        previous_statutory_deductions_amount: 40_000,
        previous_ld_amount: 5_000,
        previous_other_deductions_amount: 1_000,
      }),
    );

    expect(result.cumulative_gross_amount).toBe(3_000_000);
    expect(result.cumulative_retention_amount).toBe(150_000);
    expect(result.cumulative_advance_recovery_amount).toBe(200_000 + result.advance_recovery_amount);
    expect(result.cumulative_statutory_deductions_amount).toBe(40_000 + result.statutory_deductions_amount);
    expect(result.cumulative_ld_amount).toBe(5_000);
    expect(result.cumulative_other_deductions_amount).toBe(1_000);
  });

  it("stops recovering the advance once it is exhausted mid-bill", () => {
    const result = computeRaBillWaterfall(
      baseInput({ previous_advance_recovery_amount: 950_000 }),
    );
    expect(result.advance_recovery_amount).toBe(50_000);
    expect(result.advance_outstanding_amount).toBe(0);
    expect(result.cumulative_advance_recovery_amount).toBe(1_000_000);
  });

  it("never recovers more than the advance actually paid", () => {
    const result = computeRaBillWaterfall(
      baseInput({ advance_paid_total: 500_000, previous_advance_recovery_amount: 0 }),
    );
    // Standard 12.5% of 10,00,000 is 1,25,000 but only 5,00,000 was ever paid.
    expect(result.advance_recovery_amount).toBeLessThanOrEqual(500_000);
  });

  it("includes liquidated damages and other deductions in the total", () => {
    const result = computeRaBillWaterfall(
      baseInput({ ld_amount: 30_000, other_deductions_amount: 7_500 }),
    );
    expect(result.total_deductions).toBe(50_000 + 125_000 + 20_000 + 30_000 + 7_500);
    expect(result.net_payable_amount).toBe(1_000_000 - result.total_deductions);
  });

  it("splits net payable 70/30 for the release schedule", () => {
    const result = computeRaBillWaterfall(baseInput({ advance_recovery_percent: 0, advance_paid_total: 0 }));
    expect(result.amount_due_now).toBeCloseTo(result.net_payable_amount * 0.7, 2);
    expect(result.amount_due_30_days).toBeCloseTo(result.net_payable_amount * 0.3, 2);
    expect(result.amount_due_now + result.amount_due_30_days).toBeCloseTo(result.net_payable_amount, 2);
  });

  it("a zero-gross bill produces zero deductions, not a divide-by-zero artifact", () => {
    const result = computeRaBillWaterfall(baseInput({ gross_amount: 0 }));
    expect(result.total_deductions).toBe(0);
    expect(result.net_payable_amount).toBe(0);
    expect(result.advance_recovery_amount).toBe(0);
  });
});

describe("advanceClearedByCompletionPercent", () => {
  it("matches the work order's own stated completion point", () => {
    // 10% advance recovered at 12.5% of gross clears exactly at 80% completion.
    expect(advanceClearedByCompletionPercent(12.5, 10)).toBe(80);
  });

  it("returns 100 when there is nothing to recover", () => {
    expect(advanceClearedByCompletionPercent(0, 10)).toBe(100);
  });
});

describe("ldCapAmount", () => {
  it("caps at the configured percentage of contract value", () => {
    expect(ldCapAmount(10_000_000, 5)).toBe(500_000);
  });
});
