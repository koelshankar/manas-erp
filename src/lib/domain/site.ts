import { z } from "zod";
import { project_scoped_shape, money, percent } from "./primitives";
import {
  indentStatusSchema,
  labourTradeSchema,
  materialIssueStatusSchema,
  siteTaskStatusSchema,
  stockMovementTypeSchema,
  tradeSchema,
  unitSchema,
} from "./enums";

/* ------------------------------------------------------------------ */
/* Work Order  (Project & Budget authority)                            */
/* ------------------------------------------------------------------ */
export const workOrderSchema = z.object({
  ...project_scoped_shape,
  wo_number: z.string(),
  contractor_id: z.string(),
  title: z.string(),
  scope_summary: z.string(),
  issued_date: z.string(),
  start_date: z.string(),
  end_date: z.string(),
  retention_percent: percent,
  order_value: money,
  is_active: z.boolean(),
});
export type WorkOrder = z.infer<typeof workOrderSchema>;

/** A work order line prices one BOQ line at the contractor's agreed rate. */
export const workOrderLineSchema = z.object({
  ...project_scoped_shape,
  work_order_id: z.string(),
  boq_line_id: z.string(),
  description: z.string(),
  unit: unitSchema,
  quantity: z.number(),
  agreed_rate: money,
  amount: money,
  retention_percent: percent,
  /* --- Live roll-ups, each maintained by one service ------------------ */
  /** A4: cumulative quantity reported done, summed from DPR progress entries. */
  done_qty: z.number(),
  /** C1: cumulative quantity on signed joint measurements. */
  measured_qty: z.number(),
  /** C2: cumulative quantity certified through RA bills. */
  billed_qty: z.number(),
  /** A4: the Site Engineer has flagged this line ready for the QS to measure. */
  ready_to_measure: z.boolean(),
  /** Quantity claimed ready, which is what the QS measures against. */
  ready_qty: z.number(),
});
export type WorkOrderLine = z.infer<typeof workOrderLineSchema>;

/* ------------------------------------------------------------------ */
/* A1 - Site task                                                      */
/* ------------------------------------------------------------------ */
export const siteTaskSchema = z.object({
  ...project_scoped_shape,
  task_code: z.string(),
  title: z.string(),
  description: z.string(),
  work_order_id: z.string().nullable(),
  /** The priced line this task delivers against; progress is reported here. */
  work_order_line_id: z.string().nullable(),
  boq_line_id: z.string().nullable(),
  trade: tradeSchema,
  location_block: z.string(),
  planned_start: z.string(),
  planned_end: z.string(),
  status: siteTaskStatusSchema,
  assigned_contractor_id: z.string().nullable(),
  progress_percent: percent,
});
export type SiteTask = z.infer<typeof siteTaskSchema>;

/* ------------------------------------------------------------------ */
/* A2 - Indent                                                         */
/* ------------------------------------------------------------------ */
export const indentSchema = z.object({
  ...project_scoped_shape,
  indent_number: z.string(),
  site_task_id: z.string().nullable(),
  work_order_id: z.string().nullable(),
  raised_by_user_id: z.string(),
  raised_date: z.string(),
  /** Earliest required_by across the lines. */
  required_by_date: z.string(),
  status: indentStatusSchema,
  remarks: z.string(),
  /** Set by approveIndent (A2). */
  approved_by_user_id: z.string().nullable(),
  approved_at: z.string().nullable(),
  approval_comment: z.string(),
});
export type Indent = z.infer<typeof indentSchema>;

export const indentLineSchema = z.object({
  ...project_scoped_shape,
  indent_id: z.string(),
  /** The BOQ line whose material budget this draw is checked against. */
  boq_line_id: z.string(),
  material_id: z.string(),
  unit: unitSchema,
  requested_qty: z.number(),
  /** null until the Project Head decides; 0 means the line was rejected. */
  approved_qty: z.number().nullable(),
  rejection_reason: z.string(),
  /** Maintained by createPurchaseOrders and postGrn. */
  ordered_qty: z.number(),
  received_qty: z.number(),
  required_by: z.string(),
  remarks: z.string(),
});
export type IndentLine = z.infer<typeof indentLineSchema>;

/* ------------------------------------------------------------------ */
/* A3 - DPR and labour                                                 */
/* ------------------------------------------------------------------ */
/** One report per project per day. The date is the natural key. */
export const dprSchema = z.object({
  ...project_scoped_shape,
  report_date: z.string(),
  prepared_by_user_id: z.string(),
  weather: z.string(),
  remarks: z.string(),
  /** Roll-ups of the child rows, so lists need no join. */
  total_labour_count: z.number(),
  total_progress_entries: z.number(),
});
export type Dpr = z.infer<typeof dprSchema>;

/**
 * Quantity done today against one work-order line. These are what
 * WorkOrderLine.done_qty (A4) is summed from — nothing else writes it.
 */
export const dprProgressEntrySchema = z.object({
  ...project_scoped_shape,
  dpr_id: z.string(),
  site_task_id: z.string().nullable(),
  work_order_line_id: z.string(),
  qty_done_today: z.number(),
  remarks: z.string(),
});
export type DprProgressEntry = z.infer<typeof dprProgressEntrySchema>;

export const dprLabourEntrySchema = z.object({
  ...project_scoped_shape,
  dpr_id: z.string(),
  contractor_id: z.string(),
  trade: labourTradeSchema,
  count: z.number(),
  remarks: z.string(),
});
export type DprLabourEntry = z.infer<typeof dprLabourEntrySchema>;

/* ------------------------------------------------------------------ */
/* A4 - Work done vs balance                                           */
/* ------------------------------------------------------------------ */
/**
 * The running total per work-order line, DERIVED from DPR progress entries.
 *
 * submitDpr() is the only writer: it appends a row here and updates
 * WorkOrderLine.done_qty. Nothing reads it to decide anything — it exists so
 * the A4 screen can show how the total was arrived at.
 */
export const workProgressSchema = z.object({
  ...project_scoped_shape,
  work_order_line_id: z.string(),
  boq_line_id: z.string(),
  dpr_id: z.string().nullable(),
  progress_date: z.string(),
  quantity_done: z.number(),
  cumulative_quantity: z.number(),
  recorded_by_user_id: z.string(),
  remarks: z.string(),
});
export type WorkProgress = z.infer<typeof workProgressSchema>;

/* ------------------------------------------------------------------ */
/* A5 - Site stock                                                     */
/* ------------------------------------------------------------------ */
export const stockLedgerEntrySchema = z.object({
  ...project_scoped_shape,
  /**
   * Which store the quantity moved in or out of.
   *
   * Added with the Stores tab: the position has to be readable per store, and
   * a project with two stores cannot answer "what is on site" from a ledger
   * that only knows the project. Every writer sets it; a GRN takes the
   * project's primary store, and the stores documents name theirs.
   */
  store_id: z.string(),
  material_id: z.string(),
  movement_type: stockMovementTypeSchema,
  movement_date: z.string(),
  quantity_in: z.number(),
  quantity_out: z.number(),
  balance_quantity: z.number(),
  /** Receipts carry the PO rate; issues carry the weighted-average rate. */
  rate: money.nullable(),
  /** quantity * rate, signed the same way as the movement. */
  value: money,
  /** Polymorphic pointer to the Grn / MaterialIssue / Return that caused this. */
  source_entity_type: z.string(),
  source_entity_id: z.string(),
  remarks: z.string(),
});
export type StockLedgerEntry = z.infer<typeof stockLedgerEntrySchema>;

/* ------------------------------------------------------------------ */
/* A5 - Material issue                                                */
/* ------------------------------------------------------------------ */
/**
 * Material issued from a store to the contractor working on that project.
 *
 * Restructured in Phase 5 from one row per material into a document with
 * lines, because that is what their template is: one issue note, one
 * contractor, one work order, and as many materials as the storeman handed
 * over that morning. Everything downstream reads the lines.
 *
 * The four signature blocks their form prints — Manas stores, Manas project
 * manager, contractor project manager, contractor stores — are print labels,
 * not state. The only thing that can happen to an issue after it is written is
 * the contractor's side signing for it, which is `acknowledged`.
 */
export const materialIssueSchema = z.object({
  ...project_scoped_shape,
  issue_number: z.string(),
  issue_date: z.string(),
  /** The store it came out of. */
  store_id: z.string(),
  /** The work order it is issued against, which is how the cumulative is read. */
  work_order_id: z.string(),
  issued_to_contractor_id: z.string().nullable(),
  issued_by_user_id: z.string(),
  status: materialIssueStatusSchema,
  /** The contractor's storeman has no login, so this is a name. */
  acknowledged_by_name: z.string(),
  acknowledged_at: z.string().nullable(),
  remarks: z.string(),
});
export type MaterialIssue = z.infer<typeof materialIssueSchema>;

/**
 * One material on an issue note.
 *
 * `cumulative_qty` is the total issued to this contractor for this material up
 * to and including this line. It is **computed when the issue is written and
 * then stored**, which is the point of the column on their form: the project
 * manager reads consumption by contractor off it. It is stored rather than
 * derived on render for the same reason a GRN line keeps the PO rate — a
 * printed document must still say what it said when it was signed, and a later
 * issue must not rewrite the figure on last month's paper.
 *
 * `rate` and `value` are the weighted average of receipts, fixed at the moment
 * of issue. They are what Budget vs Actual consumes, and they are never
 * rendered anywhere in the Stores tab.
 */
export const materialIssueLineSchema = z.object({
  ...project_scoped_shape,
  material_issue_id: z.string(),
  material_id: z.string(),
  unit: unitSchema,
  quantity: z.number(),
  cumulative_qty: z.number(),
  /** Where the cost lands in Budget vs Actual. */
  boq_line_id: z.string().nullable(),
  rate: money,
  value: money,
  remarks: z.string(),
});
export type MaterialIssueLine = z.infer<typeof materialIssueLineSchema>;
