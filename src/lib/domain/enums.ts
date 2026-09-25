import { z } from "zod";

/** Teams, exactly as coloured on the client-approved workflow chart. */
export const TEAMS = [
  "project_budget",
  "site_execution",
  "purchase_stores",
  "billing_certification",
  "accounts",
] as const;
export const teamSchema = z.enum(TEAMS);
export type Team = (typeof TEAMS)[number];

export const ROLES = [
  "project_head",
  "site_engineer",
  "purchase_officer",
  "purchase_head",
  "project_qs",
  "qs_head",
  "hod",
] as const;
export const roleSchema = z.enum(ROLES);
export type Role = (typeof ROLES)[number];

/** Step codes reproduced verbatim from the workflow chart. Do not rename. */
export const STEP_CODES = [
  "A1",
  "A2",
  "A3",
  "A4",
  "A5",
  "B1",
  "B2",
  "B3",
  "B4",
  "B5",
  "B6",
  "B7",
  "B8",
  "C1",
  "C2",
  "C3",
  "C4",
  "C5",
] as const;
export const stepCodeSchema = z.enum(STEP_CODES);
export type StepCode = (typeof STEP_CODES)[number];

/* ------------------------------------------------------------------ */
/* Status enums                                                        */
/* ------------------------------------------------------------------ */

export const PROJECT_STATUSES = ["planning", "in_progress", "on_hold", "completed"] as const;
export const projectStatusSchema = z.enum(PROJECT_STATUSES);
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** A1 site task lifecycle. */
export const SITE_TASK_STATUSES = ["planned", "in_progress", "completed"] as const;
export const siteTaskStatusSchema = z.enum(SITE_TASK_STATUSES);
export type SiteTaskStatus = (typeof SITE_TASK_STATUSES)[number];

export const SITE_TASK_TRANSITIONS: Record<SiteTaskStatus, SiteTaskStatus[]> = {
  planned: ["in_progress"],
  // Work can slip back to in_progress if a completed task is reopened.
  in_progress: ["completed", "planned"],
  completed: ["in_progress"],
};

/**
 * A2 indent lifecycle.
 *   submitted -> approved | partially_approved | rejected
 *   approved | partially_approved -> in_comparative -> po_raised
 *   po_raised -> partially_received -> received -> closed
 */
export const INDENT_STATUSES = [
  "submitted",
  "approved",
  "partially_approved",
  "rejected",
  "in_comparative",
  "po_raised",
  "partially_received",
  "received",
  "closed",
] as const;
export const indentStatusSchema = z.enum(INDENT_STATUSES);
export type IndentStatus = (typeof INDENT_STATUSES)[number];

export const INDENT_TRANSITIONS: Record<IndentStatus, IndentStatus[]> = {
  submitted: ["approved", "partially_approved", "rejected"],
  approved: ["in_comparative"],
  partially_approved: ["in_comparative"],
  rejected: [],
  in_comparative: ["po_raised", "approved", "partially_approved"],
  po_raised: ["partially_received", "received"],
  partially_received: ["partially_received", "received"],
  received: ["closed"],
  closed: [],
};

/** B1 -> B2 comparative lifecycle. */
export const COMPARATIVE_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "sent_back",
  "rejected",
] as const;
export const comparativeStatusSchema = z.enum(COMPARATIVE_STATUSES);
export type ComparativeStatus = (typeof COMPARATIVE_STATUSES)[number];

export const COMPARATIVE_TRANSITIONS: Record<ComparativeStatus, ComparativeStatus[]> = {
  draft: ["pending_approval"],
  pending_approval: ["approved", "sent_back", "rejected"],
  approved: [],
  sent_back: ["pending_approval"],
  rejected: [],
};

/** B3 -> B4 -> B5/B6 purchase order lifecycle. */
export const PO_STATUSES = ["draft", "sent", "partially_received", "received", "closed"] as const;
export const poStatusSchema = z.enum(PO_STATUSES);
export type PoStatus = (typeof PO_STATUSES)[number];

export const PO_TRANSITIONS: Record<PoStatus, PoStatus[]> = {
  draft: ["sent"],
  sent: ["partially_received", "received"],
  partially_received: ["partially_received", "received"],
  received: ["closed"],
  closed: [],
};

/** A GRN only ever exists posted. It is immutable once written. */
export const GRN_STATUSES = ["posted"] as const;
export const grnStatusSchema = z.enum(GRN_STATUSES);
export type GrnStatus = (typeof GRN_STATUSES)[number];

export const STOCK_MOVEMENT_TYPES = [
  "receipt",
  "issue",
  "return_to_supplier",
  "return_from_site",
] as const;
export const stockMovementTypeSchema = z.enum(STOCK_MOVEMENT_TYPES);
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

/**
 * C1 joint measurement lifecycle. `billed` is set when an RA bill consumes the
 * measurement, so the same sheet cannot be billed twice.
 */
export const MEASUREMENT_STATUSES = ["draft", "signed", "billed"] as const;
export const measurementStatusSchema = z.enum(MEASUREMENT_STATUSES);
export type MeasurementStatus = (typeof MEASUREMENT_STATUSES)[number];

export const MEASUREMENT_TRANSITIONS: Record<MeasurementStatus, MeasurementStatus[]> = {
  draft: ["signed"],
  signed: ["billed"],
  billed: [],
};

/** RA bill states track the C2 -> C3 -> C4 -> C5 chain. */
/**
 * C2 -> C5 RA bill lifecycle.
 *
 * Where a bill sits *inside* certification is the pending Approval row, not a
 * status — the status only says whether the chain is running, done or stopped.
 */
export const RA_BILL_STATUSES = [
  "draft",
  "submitted",
  "in_certification",
  "certified",
  "handed_over",
  "rejected",
] as const;
export const raBillStatusSchema = z.enum(RA_BILL_STATUSES);
export type RaBillStatus = (typeof RA_BILL_STATUSES)[number];

export const RA_BILL_TRANSITIONS: Record<RaBillStatus, RaBillStatus[]> = {
  draft: ["submitted"],
  submitted: ["in_certification", "draft"],
  // Any step may send the bill back to draft or reject it outright.
  in_certification: ["certified", "draft", "rejected"],
  certified: ["handed_over"],
  handed_over: [],
  rejected: [],
};

/** B7 -> B8 vendor bill lifecycle. */
export const VENDOR_BILL_STATUSES = [
  "draft",
  "matched",
  "mismatch",
  "verified",
  "handed_over",
] as const;
export const vendorBillStatusSchema = z.enum(VENDOR_BILL_STATUSES);
export type VendorBillStatus = (typeof VENDOR_BILL_STATUSES)[number];

export const VENDOR_BILL_TRANSITIONS: Record<VendorBillStatus, VendorBillStatus[]> = {
  draft: ["matched", "mismatch"],
  matched: ["verified"],
  // A mismatch can still be verified, but only with an override reason.
  mismatch: ["verified"],
  verified: ["handed_over"],
  handed_over: [],
};

/** Rejected material going back to the supplier. */
export const RETURN_STATUSES = ["raised", "dispatched", "debit_note_issued"] as const;
export const returnStatusSchema = z.enum(RETURN_STATUSES);
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

export const RETURN_TRANSITIONS: Record<ReturnStatus, ReturnStatus[]> = {
  raised: ["dispatched"],
  dispatched: ["debit_note_issued"],
  debit_note_issued: [],
};

/** A step that returned the document for rework is `sent_back`, not `rejected`. */
export const APPROVAL_STATUSES = ["pending", "approved", "sent_back", "rejected"] as const;
export const approvalStatusSchema = z.enum(APPROVAL_STATUSES);
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

/** Entities that can sit behind a generic Approval gate. */
export const APPROVABLE_ENTITY_TYPES = ["indent", "comparative", "ra_bill", "vendor_bill"] as const;
export const approvableEntityTypeSchema = z.enum(APPROVABLE_ENTITY_TYPES);
export type ApprovableEntityType = (typeof APPROVABLE_ENTITY_TYPES)[number];

export const UNITS = ["cum", "sqm", "rmt", "nos", "kg", "mt", "bag", "ltr", "brass"] as const;
export const unitSchema = z.enum(UNITS);
export type Unit = (typeof UNITS)[number];

/** Labour categories counted on the A3 daily report. */
export const LABOUR_TRADES = [
  "mason",
  "helper",
  "carpenter",
  "bar_bender",
  "plumber",
  "electrician",
  "painter",
] as const;
export const labourTradeSchema = z.enum(LABOUR_TRADES);
export type LabourTrade = (typeof LABOUR_TRADES)[number];

/** Contractor constitution, which decides the TDS rate on an RA bill. */
export const CONTRACTOR_TYPES = ["individual", "huf", "firm", "company"] as const;
export const contractorTypeSchema = z.enum(CONTRACTOR_TYPES);
export type ContractorType = (typeof CONTRACTOR_TYPES)[number];

/** Section 194C: 1% for an individual or HUF, 2% for anyone else. */
export const TDS_PERCENT: Record<ContractorType, number> = {
  individual: 1,
  huf: 1,
  firm: 2,
  company: 2,
};

export const TRADES = [
  "rcc",
  "masonry",
  "plaster",
  "waterproofing",
  "flooring",
  "painting",
  "plumbing",
  "electrical",
  "general",
] as const;
export const tradeSchema = z.enum(TRADES);
export type Trade = (typeof TRADES)[number];

/** Supplier states. Drives CGST+SGST vs IGST on the purchase order. */
export const SUPPLIER_STATES = ["Goa", "Maharashtra", "Karnataka"] as const;
export const supplierStateSchema = z.enum(SUPPLIER_STATES);
export type SupplierState = (typeof SUPPLIER_STATES)[number];

/** The project the demo runs in is registered in Goa. */
export const HOME_STATE: SupplierState = "Goa";

/** Supplier ledger movement kinds. */
export const LEDGER_ENTRY_TYPES = ["bill", "debit_note", "payment"] as const;
export const ledgerEntryTypeSchema = z.enum(LEDGER_ENTRY_TYPES);
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];

/** Document number prefixes. See src/lib/services/numbering.ts. */
export const DOCUMENT_KINDS = [
  "IND",
  "CMP",
  "PO",
  "GRN",
  "ISS",
  "RTN",
  "DN",
  "VB",
  "JM",
] as const;
export const documentKindSchema = z.enum(DOCUMENT_KINDS);
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/** Tolerance on the "Issued v. Measured" check — the dashed line on the chart. */
export const ISSUED_VS_MEASURED_TOLERANCE_PERCENT = 5;
