import { z } from "zod";
import { base_entity_shape, project_scoped_shape, money, percent } from "./primitives";
import { measurementStatusSchema, raBillStatusSchema, stepCodeSchema, unitSchema } from "./enums";

/* ------------------------------------------------------------------ */
/* C1 - Joint measurement                                              */
/* ------------------------------------------------------------------ */
export const jointMeasurementSchema = z.object({
  ...project_scoped_shape,
  measurement_number: z.string(),
  work_order_id: z.string(),
  contractor_id: z.string(),
  measurement_date: z.string(),
  period_from: z.string(),
  period_to: z.string(),
  status: measurementStatusSchema,
  measured_by_user_id: z.string(),
  /** The contractor signs by name on the sheet, not as a system user. */
  signed_by_contractor_name: z.string(),
  signed_by_contractor_at: z.string().nullable(),
  signed_by_qs_user_id: z.string().nullable(),
  signed_by_qs_at: z.string().nullable(),
  /** Set when an RA bill consumes this sheet. */
  ra_bill_id: z.string().nullable(),
  /** True when any line takes the cumulative measure past the work-order qty. */
  has_excess: z.boolean(),
  total_value: money,
  remarks: z.string(),
});
export type JointMeasurement = z.infer<typeof jointMeasurementSchema>;

/**
 * One measured line. Quantity is normally computed from the dimension grid
 * (nos × length × breadth × depth, skipping whichever dimensions the unit does
 * not use) but may be entered directly for lump-sum items.
 */
export const jointMeasurementLineSchema = z.object({
  ...project_scoped_shape,
  joint_measurement_id: z.string(),
  boq_line_id: z.string(),
  work_order_line_id: z.string(),
  description: z.string(),
  unit: unitSchema,
  nos: z.number().nullable(),
  length: z.number().nullable(),
  breadth: z.number().nullable(),
  depth: z.number().nullable(),
  /** True when the quantity was typed rather than derived from dimensions. */
  is_manual_qty: z.boolean(),
  measured_qty: z.number(),
  previous_measured_qty: z.number(),
  cumulative_measured_qty: z.number(),
  agreed_rate: money,
  amount: money,
  /** This line takes the cumulative measure past the work-order quantity. */
  is_excess: z.boolean(),
  excess_reason: z.string(),
  remarks: z.string(),
});
export type JointMeasurementLine = z.infer<typeof jointMeasurementLineSchema>;

/* ------------------------------------------------------------------ */
/* C2-C5 - RA bill                                                     */
/* ------------------------------------------------------------------ */
export const raBillSchema = z.object({
  ...project_scoped_shape,
  /** MSP/RA/WO-001/RA-03 */
  bill_number: z.string(),
  /** 1 for RA-01, 2 for RA-02 — sequential within the work order. */
  bill_sequence: z.number(),
  work_order_id: z.string(),
  contractor_id: z.string(),
  /** Every signed measurement this bill was built from. */
  joint_measurement_ids: z.array(z.string()),
  bill_date: z.string(),
  period_from: z.string(),
  period_to: z.string(),
  status: raBillStatusSchema,

  /* --- Totals, all recomputed whenever a certified qty changes -------- */
  /** Certified value of this bill alone. */
  gross_amount: money,
  /** Certified gross in all earlier bills on this work order. */
  previous_gross_amount: money,
  cumulative_gross_amount: money,

  /* --- Deductions ----------------------------------------------------- */
  retention_percent: percent,
  retention_amount: money,
  /** 1% for an individual or HUF contractor, 2% otherwise (s.194C). */
  tds_percent: percent,
  tds_amount: money,
  advance_recovery_amount: money,
  other_deductions_amount: money,
  other_deductions_reason: z.string(),
  total_deductions: money,
  net_payable_amount: money,

  prepared_by_user_id: z.string(),
  submitted_at: z.string().nullable(),
  /** Chart step the bill is waiting on; null once it leaves certification. */
  current_step_code: z.string().nullable(),
  /** Sequence of the pending Approval row, so only that step is actionable. */
  current_sequence: z.number().nullable(),
  certified_at: z.string().nullable(),
  handed_over_at: z.string().nullable(),
  /** Comment from whoever sent the bill back or rejected it. */
  decision_comment: z.string(),
  remarks: z.string(),
});
export type RaBill = z.infer<typeof raBillSchema>;

export const raBillLineSchema = z.object({
  ...project_scoped_shape,
  ra_bill_id: z.string(),
  work_order_line_id: z.string(),
  boq_line_id: z.string(),
  description: z.string(),
  unit: unitSchema,
  /** Copied from the work order — the rate is never re-negotiated on a bill. */
  rate: money,
  previous_cumulative_qty: z.number(),
  /** What the measurement said. */
  claimed_qty: z.number(),
  /** What the chain has certified. Starts equal to claimed_qty. */
  certified_qty: z.number(),
  cumulative_qty: z.number(),
  amount: money,
});
export type RaBillLine = z.infer<typeof raBillLineSchema>;

/**
 * Audit log of every certified-quantity change made inside the C3-C4 chain.
 * Rows are only ever appended.
 */
export const raBillRevisionSchema = z.object({
  ...base_entity_shape,
  project_id: z.string(),
  ra_bill_id: z.string(),
  ra_bill_line_id: z.string(),
  step_code: stepCodeSchema,
  sequence: z.number(),
  user_id: z.string(),
  from_qty: z.number(),
  to_qty: z.number(),
  comment: z.string(),
  acted_at: z.string(),
});
export type RaBillRevision = z.infer<typeof raBillRevisionSchema>;
