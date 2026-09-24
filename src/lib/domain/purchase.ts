import { z } from "zod";
import { base_entity_shape, project_scoped_shape, money } from "./primitives";
import {
  comparativeStatusSchema,
  grnStatusSchema,
  ledgerEntryTypeSchema,
  poStatusSchema,
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
  comparative_id: z.string().nullable(),
  indent_ids: z.array(z.string()),
  supplier_id: z.string(),
  po_date: z.string(),
  expected_delivery_date: z.string(),
  status: poStatusSchema,
  raised_by_user_id: z.string(),
  /** B4. */
  sent_at: z.string().nullable(),
  basic_amount: money,
  freight_amount: money,
  /** Goa supplier: CGST + SGST. Anyone else: IGST. */
  is_interstate: z.boolean(),
  cgst_amount: money,
  sgst_amount: money,
  igst_amount: money,
  total_amount: money,
  delivery_address: z.string(),
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
  /** Maintained by postGrn. */
  received_qty: z.number(),
  rejected_qty: z.number(),
});
export type PoLine = z.infer<typeof poLineSchema>;

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
