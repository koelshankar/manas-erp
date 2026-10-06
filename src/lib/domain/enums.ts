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
  /**
   * Manager - Stores, a named position on the client's org chart. Added in
   * Phase 5 with the Stores tab: the three documents that tab holds are the
   * store keeper's own work, and until now nobody could sign in to do it.
   */
  "store_keeper",
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

/**
 * B3 -> B4 -> B5/B6 purchase order lifecycle.
 *
 * Phase 4 put the two-level sign-off Manas described in front of the issue:
 * a draft is submitted, recommended by the Manager Procurement and authorised,
 * and only then issued to the supplier. `sent` is that issue — nothing can be
 * received against a PO that has not reached it.
 *
 * Amending an issued order takes it back to `draft` and runs the chain again,
 * which is why `approved` and `sent` both lead back there. An order with
 * receipts against it is not amendable: see `amendPurchaseOrder`.
 */
export const PO_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "sent_back",
  "rejected",
  "sent",
  "partially_received",
  "received",
  "closed",
] as const;
export const poStatusSchema = z.enum(PO_STATUSES);
export type PoStatus = (typeof PO_STATUSES)[number];

export const PO_TRANSITIONS: Record<PoStatus, PoStatus[]> = {
  draft: ["pending_approval"],
  pending_approval: ["approved", "sent_back", "rejected"],
  // Authorised: issue it, or reopen it as an amendment.
  approved: ["sent", "draft"],
  sent_back: ["draft"],
  rejected: [],
  sent: ["partially_received", "received", "draft"],
  partially_received: ["partially_received", "received"],
  received: ["closed"],
  closed: [],
};

/** A GRN only ever exists posted. It is immutable once written. */
export const GRN_STATUSES = ["posted"] as const;
export const grnStatusSchema = z.enum(GRN_STATUSES);
export type GrnStatus = (typeof GRN_STATUSES)[number];

/**
 * Every way a quantity moves through a store.
 *
 * The four original kinds are the material thread's: a GRN receipt, an issue to
 * a work order, and the two directions a return travels. Phase 5 adds the four
 * the Stores tab writes — a transfer order leaves one store and arrives in
 * another, and a gate pass takes stock off site and may bring it back.
 *
 * A transfer is deliberately two rows rather than one signed both ways: the
 * out row is written when the lorry leaves and the in row only when the
 * receiving store acknowledges it, which is what makes "in transit" a real
 * state rather than a flag.
 */
export const STOCK_MOVEMENT_TYPES = [
  "receipt",
  "issue",
  "return_to_supplier",
  "return_from_site",
  "transfer_out",
  "transfer_in",
  "gate_pass_out",
  "gate_pass_return",
] as const;
export const stockMovementTypeSchema = z.enum(STOCK_MOVEMENT_TYPES);
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

/* ------------------------------------------------------------------ */
/* Stores                                                             */
/* ------------------------------------------------------------------ */

/**
 * What kind of gate pass this is. One choice per pass, and it changes what the
 * form asks for: only a returnable pass carries an expected return date, and
 * only a returnable pass has an outstanding position to chase.
 *
 * `transfer` is the gate pass that accompanies a material transfer order out
 * of the gate. It is the type on their own template, so it stays — the
 * movement itself is still the transfer order's.
 */
export const GATE_PASS_TYPES = ["returnable", "non_returnable", "transfer"] as const;
export const gatePassTypeSchema = z.enum(GATE_PASS_TYPES);
export type GatePassType = (typeof GATE_PASS_TYPES)[number];

/**
 * Gate pass lifecycle, which follows the three signatures on their form:
 * stores raise it, the project manager approves it, the receiver acknowledges
 * it at the gate.
 *
 *   draft -> pending_approval -> approved | rejected
 *   approved -> acknowledged          (the receiver has signed for it)
 *   acknowledged -> returned          (returnable only, in full)
 *   acknowledged -> closed            (non-returnable, nothing to come back)
 *
 * Stock leaves the store on approval, because that is when the material
 * physically goes out of the gate.
 */
export const GATE_PASS_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "rejected",
  "acknowledged",
  "returned",
  "closed",
] as const;
export const gatePassStatusSchema = z.enum(GATE_PASS_STATUSES);
export type GatePassStatus = (typeof GATE_PASS_STATUSES)[number];

export const GATE_PASS_TRANSITIONS: Record<GatePassStatus, GatePassStatus[]> = {
  draft: ["pending_approval"],
  pending_approval: ["approved", "rejected", "draft"],
  approved: ["acknowledged"],
  rejected: [],
  acknowledged: ["returned", "closed"],
  returned: [],
  closed: [],
};

/**
 * Material issue lifecycle.
 *
 * An issue is not a gate: the material is handed over the counter and the
 * stock has gone. So it is `issued` the moment it is written, and the only
 * thing that can still happen is the contractor's storeman signing for it.
 * The four signature blocks their template prints are wet ink, not state —
 * the same separation the purchase order keeps (see PO_SIGNATURE_LABELS).
 */
export const MATERIAL_ISSUE_STATUSES = ["issued", "acknowledged"] as const;
export const materialIssueStatusSchema = z.enum(MATERIAL_ISSUE_STATUSES);
export type MaterialIssueStatus = (typeof MATERIAL_ISSUE_STATUSES)[number];

export const MATERIAL_ISSUE_TRANSITIONS: Record<MaterialIssueStatus, MaterialIssueStatus[]> = {
  issued: ["acknowledged"],
  acknowledged: [],
};

/**
 * Material transfer order lifecycle.
 *
 *   draft -> in_transit -> acknowledged
 *
 * `in_transit` is the whole point of the document. The quantity has left the
 * issuing store and has not arrived anywhere yet; only the receiving store
 * acknowledging it writes the second stock row. A draft that was never
 * dispatched can be cancelled; a dispatched one cannot, because the material
 * is on a lorry.
 */
export const TRANSFER_STATUSES = ["draft", "in_transit", "acknowledged", "cancelled"] as const;
export const transferStatusSchema = z.enum(TRANSFER_STATUSES);
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];

export const TRANSFER_TRANSITIONS: Record<TransferStatus, TransferStatus[]> = {
  draft: ["in_transit", "cancelled"],
  in_transit: ["acknowledged"],
  acknowledged: [],
  cancelled: [],
};

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
export const APPROVABLE_ENTITY_TYPES = [
  "indent",
  "comparative",
  "purchase_order",
  "ra_bill",
  "vendor_bill",
  /**
   * The gate pass is the one gate that is not on the client's chart, so its
   * chain step carries a null step_code rather than an invented one. See
   * APPROVAL_CHAINS.
   */
  "gate_pass",
] as const;
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

/* ------------------------------------------------------------------ */
/* Purchase order terms and conditions                                 */
/* ------------------------------------------------------------------ */

/**
 * How a terms clause is filed in the library. Category is for grouping the
 * library screen and for ordering a PO's printed clause list; it carries no
 * authority of its own.
 */
export const PO_CLAUSE_CATEGORIES = [
  "payment",
  "transport",
  "delivery",
  "inspection",
  "quality",
  "statutory",
  "validity",
  "warranty",
  "brand",
  "general",
] as const;
export const poClauseCategorySchema = z.enum(PO_CLAUSE_CATEGORIES);
export type PoClauseCategory = (typeof PO_CLAUSE_CATEGORIES)[number];

/**
 * The four clauses that read differently on every order Manas sent us, so they
 * are fields on the PO rather than library text. The library still carries a
 * clause for each — the PO's own wording is substituted into it when printed.
 */
export const PO_VARIABLE_FIELDS = ["payment_terms", "po_validity", "warranty", "brand"] as const;
export const poVariableFieldSchema = z.enum(PO_VARIABLE_FIELDS);
export type PoVariableField = (typeof PO_VARIABLE_FIELDS)[number];

/**
 * The four signature blocks printed across the footer of their purchase order.
 *
 * These are print labels, **not** approval state. The chain is two levels
 * (recommend, authorise); "Verified By" is a wet signature their office adds
 * on paper, so it prints as an empty block. Keeping the two apart is what lets
 * the paper form match theirs without inventing a system step nobody holds.
 */
export const PO_SIGNATURE_BLOCKS = [
  "prepared_by",
  "recommended_by",
  "verified_by",
  "authorised_signatory",
] as const;
export const poSignatureBlockSchema = z.enum(PO_SIGNATURE_BLOCKS);
export type PoSignatureBlock = (typeof PO_SIGNATURE_BLOCKS)[number];

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
  "GP",
  "MTO",
  "DT",
] as const;
export const documentKindSchema = z.enum(DOCUMENT_KINDS);
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/** Tolerance on the "Issued v. Measured" check — the dashed line on the chart. */
export const ISSUED_VS_MEASURED_TOLERANCE_PERCENT = 5;

/* ------------------------------------------------------------------ */
/* Drawings                                                            */
/* ------------------------------------------------------------------ */

/** The five disciplines on Manas's drawing register template. */
export const DRAWING_DISCIPLINES = [
  "architectural",
  "structural",
  "mep",
  "plumbing",
  "electrical",
] as const;
export const drawingDisciplineSchema = z.enum(DRAWING_DISCIPLINES);
export type DrawingDiscipline = (typeof DRAWING_DISCIPLINES)[number];

/** Standard drafting sheet sizes. */
export const DRAWING_SHEET_SIZES = ["A0", "A1", "A2", "A3", "A4"] as const;
export const drawingSheetSizeSchema = z.enum(DRAWING_SHEET_SIZES);
export type DrawingSheetSize = (typeof DRAWING_SHEET_SIZES)[number];

/**
 * A drawing carries revisions R0 through R4 only, exactly as their template's
 * five revision columns. `addDrawingRevision` refuses a sixth.
 */
export const DRAWING_REVISION_CODES = ["R0", "R1", "R2", "R3", "R4"] as const;
export const drawingRevisionCodeSchema = z.enum(DRAWING_REVISION_CODES);
export type DrawingRevisionCode = (typeof DRAWING_REVISION_CODES)[number];

/** What a transmittal line is carrying. */
export const TRANSMITTAL_DOCUMENT_TYPES = [
  "drawing",
  "specification",
  "schedule",
  "other",
] as const;
export const transmittalDocumentTypeSchema = z.enum(TRANSMITTAL_DOCUMENT_TYPES);
export type TransmittalDocumentType = (typeof TRANSMITTAL_DOCUMENT_TYPES)[number];

/** Why the drawings are going out. */
export const TRANSMITTAL_PURPOSES = [
  "for_construction",
  "for_approval",
  "for_information",
  "for_tender",
  "as_built",
] as const;
export const transmittalPurposeSchema = z.enum(TRANSMITTAL_PURPOSES);
export type TransmittalPurpose = (typeof TRANSMITTAL_PURPOSES)[number];

/**
 * Transmittal lifecycle.
 *
 *   draft -> issued         (locked; the issued-by signature is taken)
 *   issued -> acknowledged  (the receiver's signature and date are recorded)
 *
 * There is no approval chain: issuing a transmittal is the sender's own act,
 * not a gate another team holds.
 */
export const TRANSMITTAL_STATUSES = ["draft", "issued", "acknowledged"] as const;
export const transmittalStatusSchema = z.enum(TRANSMITTAL_STATUSES);
export type TransmittalStatus = (typeof TRANSMITTAL_STATUSES)[number];

export const TRANSMITTAL_TRANSITIONS: Record<TransmittalStatus, TransmittalStatus[]> = {
  draft: ["issued"],
  issued: ["acknowledged"],
  acknowledged: [],
};
