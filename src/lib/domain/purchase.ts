import { z } from "zod";
import { base_entity_shape, project_scoped_shape, money } from "./primitives";
import {
  comparativeStatusSchema,
  grnStatusSchema,
  ledgerEntryTypeSchema,
  poStatusSchema,
  poVariableFieldSchema,
  returnStatusSchema,
  unitSchema,
  vendorBillStatusSchema,
} from "./enums";

/* ------------------------------------------------------------------ */
/* B1 - Comparative                                                    */
/* ------------------------------------------------------------------ */
export const comparativeSchema = z.object({
  ...project_scoped_shape,
  comparative_number: z.string(),
  /** Every indent this comparative draws lines from. */
  indent_ids: z.array(z.string()),
  prepared_by_user_id: z.string(),
  prepared_date: z.string(),
  status: comparativeStatusSchema,
  submitted_at: z.string().nullable(),
  /** B2 decision. */
  decided_by_user_id: z.string().nullable(),
  decided_at: z.string().nullable(),
  decision_comment: z.string(),
  total_selected_value: money,
  remarks: z.string(),
});
export type Comparative = z.infer<typeof comparativeSchema>;

/**
 * One row per material being compared. Holds the officer's choice; the quotes
 * that feed it hang off it.
 */
export const comparativeLineSchema = z.object({
  ...project_scoped_shape,
  comparative_id: z.string(),
  indent_id: z.string(),
  indent_line_id: z.string(),
  boq_line_id: z.string(),
  material_id: z.string(),
  unit: unitSchema,
  quantity: z.number(),
  selected_supplier_id: z.string().nullable(),
  selected_quote_id: z.string().nullable(),
  /** False when the officer passed over the cheapest landed rate. */
  is_l1_selected: z.boolean(),
  /** Required by createComparative when is_l1_selected is false. */
  justification: z.string(),
});
export type ComparativeLine = z.infer<typeof comparativeLineSchema>;

/** One supplier's offer for one comparative line. */
export const quoteSchema = z.object({
  ...project_scoped_shape,
  comparative_id: z.string(),
  comparative_line_id: z.string(),
  material_id: z.string(),
  supplier_id: z.string(),
  unit: unitSchema,
  quantity: z.number(),
  rate: money,
  gst_percent: z.number(),
  freight_amount: money,
  delivery_days: z.number(),
  payment_terms: z.string(),
  /** (rate * qty) + freight + tax, all in. This is what L1 is decided on. */
  basic_amount: money,
  tax_amount: money,
  landed_amount: money,
  landed_rate: money,
  /** Cheapest landed rate on this line. */
  is_l1: z.boolean(),
  is_selected: z.boolean(),
  remarks: z.string(),
});
export type Quote = z.infer<typeof quoteSchema>;

/* ------------------------------------------------------------------ */
/* B3-B4 - Purchase order                                              */
/* ------------------------------------------------------------------ */
export const purchaseOrderSchema = z.object({
  ...project_scoped_shape,
  po_number: z.string(),
  /**
   * 0 on a first issue, which is what prints the "PO Amend No." cell blank.
   * Every increment leaves a PoAmendment row behind it.
   */
  amend_no: z.number(),
  /** Why the last amendment was raised. Blank on a first issue. */
  amend_reason: z.string(),
  /** Null on a PO built from indents or raised blank. */
  comparative_id: z.string().nullable(),
  /**
   * Every indent this order draws on. One of the orders Manas sent us
   * consolidates thirteen, and all of them print in the Indent Details table.
   */
  indent_ids: z.array(z.string()),
  supplier_id: z.string(),
  po_date: z.string(),
  expected_delivery_date: z.string(),
  status: poStatusSchema,
  raised_by_user_id: z.string(),
  submitted_at: z.string().nullable(),
  /**
   * Which chain step the order waits on, mirrored off the pending Approval row
   * so a list can show it without a join — the same arrangement as RaBill.
   */
  current_step_code: z.string().nullable(),
  current_sequence: z.number().nullable(),
  /** Comment from whoever sent it back or rejected it. */
  decision_comment: z.string(),
  /** B4 — the issue to the supplier. Nothing can be received before it. */
  sent_at: z.string().nullable(),
  /** Σ (qty × rate) across the lines. "Material Value" on the printed form. */
  basic_amount: money,
  /** Freight quoted inside the lines, carried over from the comparative. */
  freight_amount: money,
  /** Transportation added on the order itself, taxed at `freight_gst_percent`. */
  transportation_charge: money,
  freight_gst_percent: z.number(),
  /** Goa supplier: CGST + SGST. Anyone else: IGST. */
  is_interstate: z.boolean(),
  cgst_amount: money,
  sgst_amount: money,
  igst_amount: money,
  total_amount: money,
  delivery_address: z.string(),
  /** Site contact printed in the Delivery Address block. */
  delivery_contact_name: z.string(),
  delivery_contact_phone: z.string(),
  /**
   * The four clauses that differ on every order. The library carries a clause
   * for each; these are the words that go into it. See PO_VARIABLE_FIELDS.
   */
  payment_terms: z.string(),
  po_validity: z.string(),
  warranty: z.string(),
  brand_terms: z.string(),
  /**
   * The old single free-text terms field. Kept so nothing that already reads
   * it breaks; the printed clause list comes from `po_terms`.
   */
  terms: z.string(),
});
export type PurchaseOrder = z.infer<typeof purchaseOrderSchema>;

export const poLineSchema = z.object({
  ...project_scoped_shape,
  purchase_order_id: z.string(),
  comparative_line_id: z.string().nullable(),
  indent_id: z.string().nullable(),
  indent_line_id: z.string().nullable(),
  boq_line_id: z.string(),
  material_id: z.string(),
  unit: unitSchema,
  ordered_qty: z.number(),
  rate: money,
  gst_percent: z.number(),
  freight_amount: money,
  basic_amount: money,
  tax_amount: money,
  line_total: money,
  /**
   * Brand and specification snapshotted off the material master when the line
   * was written. A PO is a document the supplier holds us to, so a later edit
   * of the master must not change what an issued order said. Brand is blank
   * where any make will do, and the printed Brand column is dropped when every
   * line on the order is blank.
   */
  brand: z.string(),
  specification: z.string(),
  /** Maintained by postGrn. */
  received_qty: z.number(),
  rejected_qty: z.number(),
});
export type PoLine = z.infer<typeof poLineSchema>;

/* ------------------------------------------------------------------ */
/* Delivery schedule — the staggered delivery on the PO, not the indent */
/* ------------------------------------------------------------------ */

/**
 * A PO may carry several schedules. Their orders print "Delivery Schedule 1"
 * against dated quantities and a second table for the balance, whose dates are
 * not known yet — that second one is `is_balance`, and it prints the note
 * instead of a date column.
 */
export const poDeliveryScheduleSchema = z.object({
  ...project_scoped_shape,
  purchase_order_id: z.string(),
  /** 1-based; prints as "Delivery Schedule 1". */
  sequence: z.number(),
  /** Overrides the "Delivery Schedule <n>" heading where one is given. */
  title: z.string(),
  /**
   * A balance schedule has no dates. Its lines carry `delivery_date` null and
   * it prints "Delivery schedule for this will be confirmed as per site
   * requirement."
   */
  is_balance: z.boolean(),
  note: z.string(),
});
export type PoDeliverySchedule = z.infer<typeof poDeliveryScheduleSchema>;

export const poDeliveryScheduleLineSchema = z.object({
  ...project_scoped_shape,
  purchase_order_id: z.string(),
  po_delivery_schedule_id: z.string(),
  /** The ordered line this instalment draws down. */
  po_line_id: z.string(),
  material_id: z.string(),
  unit: unitSchema,
  quantity: z.number(),
  /** Null on a balance schedule. */
  delivery_date: z.string().nullable(),
});
export type PoDeliveryScheduleLine = z.infer<typeof poDeliveryScheduleLineSchema>;

/* ------------------------------------------------------------------ */
/* Terms and conditions, snapshotted onto the order                    */
/* ------------------------------------------------------------------ */

/**
 * One printed clause on one PO.
 *
 * The clause library in Masters is the source, but the rows are copied here
 * when the order is raised: the terms an issued PO was agreed on must not
 * change because somebody edited the library afterwards. `po_clause_id` is
 * kept for the trail and is null on a clause typed straight onto the order.
 */
export const poTermSchema = z.object({
  ...project_scoped_shape,
  purchase_order_id: z.string(),
  po_clause_id: z.string().nullable(),
  /** 1-based; this is the printed clause number. */
  sequence: z.number(),
  text: z.string(),
  /**
   * Set when this clause carries one of the four per-PO fields. The text is
   * stored already substituted; the key records which field filled it.
   */
  variable_field: poVariableFieldSchema.nullable(),
  /** True when the officer edited the library wording on this order. */
  is_overridden: z.boolean(),
});
export type PoTerm = z.infer<typeof poTermSchema>;

/* ------------------------------------------------------------------ */
/* Amendment history                                                   */
/* ------------------------------------------------------------------ */

/**
 * One row per amendment, holding the order exactly as it stood before the
 * amendment was raised. The snapshot is JSON because it is an archive, not
 * something anything queries into — in Postgres it is a jsonb column.
 */
export const poAmendmentSchema = z.object({
  ...project_scoped_shape,
  purchase_order_id: z.string(),
  /** The amend number this row is the history *of*: 0 is the original issue. */
  amend_no: z.number(),
  amended_by_user_id: z.string(),
  reason: z.string(),
  /** The PO, its lines, schedules and terms as they were. */
  snapshot: z.string(),
  /** Totals pulled out of the snapshot so a list can show the movement. */
  previous_total_amount: money,
});
export type PoAmendment = z.infer<typeof poAmendmentSchema>;

/* ------------------------------------------------------------------ */
/* B5-B6 - GRN  (recorded on site, owned by site_execution)            */
/* ------------------------------------------------------------------ */
export const grnSchema = z.object({
  ...project_scoped_shape,
  grn_number: z.string(),
  purchase_order_id: z.string(),
  supplier_id: z.string(),
  received_on: z.string(),
  received_by_user_id: z.string(),
  /** A GRN is only ever "posted". It is immutable once written. */
  status: grnStatusSchema,
  vehicle_number: z.string(),
  challan_number: z.string(),
  remarks: z.string(),
});
export type Grn = z.infer<typeof grnSchema>;

export const grnLineSchema = z.object({
  ...project_scoped_shape,
  grn_id: z.string(),
  purchase_order_id: z.string(),
  po_line_id: z.string(),
  indent_line_id: z.string().nullable(),
  boq_line_id: z.string(),
  material_id: z.string(),
  unit: unitSchema,
  received_qty: z.number(),
  accepted_qty: z.number(),
  rejected_qty: z.number(),
  rejection_reason: z.string(),
  /** PO rate and GST, copied so valuation and billing never walk back to the PO. */
  rate: money,
  gst_percent: z.number(),
  /** Billed quantity consumed so far, maintained by createVendorBill. */
  billed_qty: z.number(),
});
export type GrnLine = z.infer<typeof grnLineSchema>;

/* ------------------------------------------------------------------ */
/* B7 - Vendor bill, three-way match                                   */
/* ------------------------------------------------------------------ */
export const vendorBillSchema = z.object({
  ...project_scoped_shape,
  /** The supplier's own invoice number. */
  bill_number: z.string(),
  /** Our internal reference, MSP/VB/26-27/0003. */
  reference_number: z.string(),
  supplier_id: z.string(),
  /** Every GRN this bill covers. All must belong to the same supplier. */
  grn_ids: z.array(z.string()),
  purchase_order_ids: z.array(z.string()),
  bill_date: z.string(),
  received_date: z.string(),
  status: vendorBillStatusSchema,
  bill_basic_amount: money,
  bill_tax_amount: money,
  bill_total_amount: money,
  /** What the GRN + PO say it should have been. */
  expected_basic_amount: money,
  expected_tax_amount: money,
  expected_total_amount: money,
  amount_variance: money,
  is_quantity_matched: z.boolean(),
  is_rate_matched: z.boolean(),
  is_tax_matched: z.boolean(),
  entered_by_user_id: z.string(),
  verified_by_user_id: z.string().nullable(),
  verified_at: z.string().nullable(),
  /** Required to verify a bill that failed the three-way match. */
  override_reason: z.string(),
  handed_over_at: z.string().nullable(),
  remarks: z.string(),
});
export type VendorBill = z.infer<typeof vendorBillSchema>;

export const vendorBillLineSchema = z.object({
  ...project_scoped_shape,
  vendor_bill_id: z.string(),
  grn_id: z.string(),
  grn_line_id: z.string(),
  po_line_id: z.string(),
  material_id: z.string(),
  unit: unitSchema,
  /** What the vendor billed. */
  billed_qty: z.number(),
  billed_rate: money,
  billed_gst_percent: z.number(),
  billed_amount: money,
  /** What the three-way match compares it against. */
  grn_accepted_qty: z.number(),
  po_rate: money,
  po_gst_percent: z.number(),
  expected_amount: money,
  qty_matched: z.boolean(),
  rate_matched: z.boolean(),
  tax_matched: z.boolean(),
  variance_amount: money,
});
export type VendorBillLine = z.infer<typeof vendorBillLineSchema>;

/* ------------------------------------------------------------------ */
/* Return to supplier                                                  */
/* ------------------------------------------------------------------ */
export const returnSchema = z.object({
  ...project_scoped_shape,
  return_number: z.string(),
  supplier_id: z.string(),
  purchase_order_id: z.string(),
  grn_id: z.string(),
  grn_line_id: z.string(),
  material_id: z.string(),
  unit: unitSchema,
  quantity: z.number(),
  rate: money,
  amount: money,
  return_date: z.string(),
  reason: z.string(),
  status: returnStatusSchema,
  raised_by_user_id: z.string(),
  dispatched_at: z.string().nullable(),
  debit_note_number: z.string().nullable(),
  debit_note_at: z.string().nullable(),
});
export type Return = z.infer<typeof returnSchema>;

/* ------------------------------------------------------------------ */
/* Supplier ledger                                                     */
/* ------------------------------------------------------------------ */
/**
 * Running account per supplier. Vendor bills credit the supplier (we owe);
 * debit notes from returns debit them back.
 */
export const supplierLedgerEntrySchema = z.object({
  ...base_entity_shape,
  project_id: z.string().nullable(),
  supplier_id: z.string(),
  entry_date: z.string(),
  entry_type: ledgerEntryTypeSchema,
  reference_type: z.string(),
  reference_id: z.string(),
  reference_number: z.string(),
  debit: money,
  credit: money,
  narration: z.string(),
});
export type SupplierLedgerEntry = z.infer<typeof supplierLedgerEntrySchema>;
