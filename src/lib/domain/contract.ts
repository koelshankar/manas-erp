import { z } from "zod";
import { project_scoped_shape, money, percent } from "./primitives";

/**
 * Phase 7 — the commercial terms behind a work order's RA bills.
 *
 * One `WorkOrderContract` per work order (`work_order_id` is a 1:1 key, not a
 * foreign list). `budget-service.ts` / `billing-service.ts` never read
 * `WorkOrder.retention_percent` for a bill once a contract row exists —
 * `contractFor()` in `contract-service.ts` is the one place that decides
 * which terms govern a bill, falling back to item-rate defaults for a work
 * order nobody has set up a contract for yet.
 */

export const contractTypeSchema = z.enum(["item_rate_remeasurable", "lump_sum"]);
export type ContractType = z.infer<typeof contractTypeSchema>;

export const billingCycleSchema = z.enum(["monthly_progressive"]);
export type BillingCycle = z.infer<typeof billingCycleSchema>;

/**
 * One instalment of the mobilisation advance. Manas release theirs in two —
 * on acceptance and on a defined milestone — but the list is open-ended.
 * `released_at` is null until Accounts actually pays it out; an instalment
 * that has not been released cannot be recovered against, see
 * `advancePaidTotal` in `contract-math.ts`.
 */
export const mobilisationInstalmentSchema = z.object({
  id: z.string(),
  label: z.string(),
  percent: percent,
  released_at: z.string().nullable(),
});
export type MobilisationInstalment = z.infer<typeof mobilisationInstalmentSchema>;

/** One stage of the retention release, e.g. half on virtual completion. */
export const retentionReleaseStageSchema = z.object({
  id: z.string(),
  label: z.string(),
  percent: percent,
});
export type RetentionReleaseStage = z.infer<typeof retentionReleaseStageSchema>;

/**
 * One statutory deduction head. TDS is seeded here like any other head —
 * `contract-math.ts` is not told it is special — but its rate still starts
 * from `TDS_PERCENT[contractor.type]` (s.194C) when a contract is first
 * created, because that figure depends on the contractor, not the contract.
 */
export const statutoryDeductionHeadSchema = z.object({
  id: z.string(),
  label: z.string(),
  percent: percent,
});
export type StatutoryDeductionHead = z.infer<typeof statutoryDeductionHeadSchema>;

export const workOrderContractSchema = z.object({
  ...project_scoped_shape,
  work_order_id: z.string(),
  contract_value: money,
  contract_type: contractTypeSchema,

  mobilisation_advance_percent: percent,
  mobilisation_instalments: z.array(mobilisationInstalmentSchema),

  /** Recovered from the gross certified value of every bill from RA-01. */
  advance_recovery_percent: percent,
  /**
   * The advance must be fully recovered before cumulative gross reaches this
   * percentage of contract value. At the seeded 12.5% recovery rate against a
   * 10% advance that point is 80% completion, which is the number their work
   * order actually states — the two are not independent.
   */
  advance_recovery_ceiling_percent: percent,

  retention_percent: percent,
  retention_release_stages: z.array(retentionReleaseStageSchema),

  billing_cycle: billingCycleSchema,
  /** No minimum applies to the first two bills on the work order. */
  minimum_bill_value: money,
  minimum_bill_value_from_sequence: z.number().int().min(1),

  payment_release_percent_1: percent,
  payment_release_days_1: z.number().int().min(0),
  payment_release_percent_2: percent,
  payment_release_days_2: z.number().int().min(0),

  defects_liability_months: z.number().int().min(0),
  ld_percent_per_week: percent,
  ld_cap_percent: percent,

  statutory_deduction_heads: z.array(statutoryDeductionHeadSchema),

  remarks: z.string(),
});
export type WorkOrderContract = z.infer<typeof workOrderContractSchema>;
