/**
 * The plain words for every internal value that reaches a screen.
 *
 * Nothing in the UI may show a snake_case value, a table name or an
 * `entity_type` — `humanise()` turns "ra_bill" into "Ra bill" and "rcc" into
 * "Rcc", which is worse than useless in front of a client. Industry terms
 * (DPR, GRN, RA Bill, BOQ, PO, JM, indent) stay exactly as the trade says
 * them.
 *
 * Statuses are not here: they live in `components/common/status-chip.tsx`
 * alongside their tone.
 */
import type { ContractorType, LabourTrade, LedgerEntryType, StockMovementType, Trade } from "@/lib/domain";

/** What a record is called, keyed by entity_type / reference_type. */
export const RECORD_LABEL: Record<string, string> = {
  indent: "Indent",
  comparative: "Comparative",
  purchase_order: "Purchase order",
  grn: "Delivery (GRN)",
  material_issue: "Material issue",
  vendor_bill: "Vendor bill",
  supplier_return: "Return",
  boq_line: "BOQ line",
  work_order: "Work order",
  work_order_line: "Work order line",
  site_task: "Site task",
  joint_measurement: "Joint measurement",
  ra_bill: "RA bill",
  supplier_ledger: "Supplier ledger",
  contractor_ledger: "Contractor ledger",
  accounts_handover: "Accounts handover",
  certification: "Certification",
  dpr: "DPR",
  approval: "Approval",
};

export function recordLabel(entityType: string): string {
  return RECORD_LABEL[entityType] ?? titleCase(entityType);
}

/** BOQ trades. "rcc" is RCC, not "Rcc". */
export const TRADE_LABEL: Record<Trade, string> = {
  rcc: "RCC",
  masonry: "Masonry",
  plaster: "Plaster",
  waterproofing: "Waterproofing",
  flooring: "Flooring",
  painting: "Painting",
  plumbing: "Plumbing",
  electrical: "Electrical",
  general: "General",
};

export function tradeLabel(trade: string): string {
  return TRADE_LABEL[trade as Trade] ?? titleCase(trade);
}

/** Labour trades on a DPR. */
export const LABOUR_TRADE_LABEL: Record<LabourTrade, string> = {
  mason: "Mason",
  helper: "Helper",
  carpenter: "Carpenter",
  bar_bender: "Bar bender",
  plumber: "Plumber",
  electrician: "Electrician",
  painter: "Painter",
};

export function labourTradeLabel(trade: string): string {
  return LABOUR_TRADE_LABEL[trade as LabourTrade] ?? titleCase(trade);
}

/** Contractor constitution, which sets the TDS rate. */
export const CONTRACTOR_TYPE_LABEL: Record<ContractorType, string> = {
  individual: "Individual",
  huf: "HUF",
  firm: "Firm",
  company: "Company",
};

export function contractorTypeLabel(type: string): string {
  return CONTRACTOR_TYPE_LABEL[type as ContractorType] ?? titleCase(type);
}

/** Stock ledger movements, in the storekeeper's words. */
export const MOVEMENT_LABEL: Record<StockMovementType, string> = {
  receipt: "Received",
  issue: "Issued to work",
  return_to_supplier: "Returned to supplier",
  return_from_site: "Returned from site",
};

export function movementLabel(type: string): string {
  return MOVEMENT_LABEL[type as StockMovementType] ?? titleCase(type);
}

/** Supplier ledger entries. */
export const LEDGER_ENTRY_LABEL: Record<LedgerEntryType, string> = {
  bill: "Bill",
  debit_note: "Debit note",
  payment: "Payment",
};

export function ledgerEntryLabel(type: string): string {
  return LEDGER_ENTRY_LABEL[type as LedgerEntryType] ?? titleCase(type);
}

function titleCase(value: string): string {
  const words = value.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
