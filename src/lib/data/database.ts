import type {
  Approval,
  Attachment,
  BoqLine,
  BoqMaterialBudget,
  Comparative,
  ComparativeLine,
  Contractor,
  Dpr,
  DprLabourEntry,
  DprProgressEntry,
  Grn,
  GrnLine,
  Indent,
  IndentLine,
  JointMeasurement,
  JointMeasurementLine,
  DocumentSeries,
  Material,
  MaterialName,
  MaterialType,
  MaterialIssue,
  PoAmendment,
  PoClause,
  PoDeliverySchedule,
  PoDeliveryScheduleLine,
  PoLine,
  PoTerm,
  Project,
  PurchaseOrder,
  Quote,
  RaBill,
  RaBillLine,
  RaBillRevision,
  Return,
  SiteTask,
  StockLedgerEntry,
  Supplier,
  SupplierLedgerEntry,
  SupplierRate,
  User,
  VendorBill,
  VendorBillLine,
  WorkOrder,
  WorkOrderLine,
  WorkProgress,
} from "@/lib/domain";

/**
 * The shape of the demo database. Each key is a future Postgres table; the
 * local Zustand store holds exactly this and nothing else.
 */
export type DemoDatabase = {
  projects: Project[];
  users: User[];
  contractors: Contractor[];
  material_names: MaterialName[];
  material_types: MaterialType[];
  materials: Material[];
  suppliers: Supplier[];
  supplier_rates: SupplierRate[];
  po_clauses: PoClause[];
  document_series: DocumentSeries[];
  boq_lines: BoqLine[];
  boq_material_budgets: BoqMaterialBudget[];
  work_orders: WorkOrder[];
  work_order_lines: WorkOrderLine[];
  site_tasks: SiteTask[];
  indents: Indent[];
  indent_lines: IndentLine[];
  comparatives: Comparative[];
  comparative_lines: ComparativeLine[];
  quotes: Quote[];
  purchase_orders: PurchaseOrder[];
  po_lines: PoLine[];
  po_delivery_schedules: PoDeliverySchedule[];
  po_delivery_schedule_lines: PoDeliveryScheduleLine[];
  po_terms: PoTerm[];
  po_amendments: PoAmendment[];
  grns: Grn[];
  grn_lines: GrnLine[];
  stock_ledger_entries: StockLedgerEntry[];
  material_issues: MaterialIssue[];
  dprs: Dpr[];
  dpr_progress_entries: DprProgressEntry[];
  dpr_labour_entries: DprLabourEntry[];
  work_progress: WorkProgress[];
  joint_measurements: JointMeasurement[];
  joint_measurement_lines: JointMeasurementLine[];
  ra_bills: RaBill[];
  ra_bill_lines: RaBillLine[];
  ra_bill_revisions: RaBillRevision[];
  vendor_bills: VendorBill[];
  vendor_bill_lines: VendorBillLine[];
  returns: Return[];
  supplier_ledger_entries: SupplierLedgerEntry[];
  approvals: Approval[];
  attachments: Attachment[];
};

export type TableName = keyof DemoDatabase;

export function emptyDatabase(): DemoDatabase {
  return {
    projects: [],
    users: [],
    contractors: [],
    material_names: [],
    material_types: [],
    materials: [],
    suppliers: [],
    supplier_rates: [],
    po_clauses: [],
    document_series: [],
    boq_lines: [],
    boq_material_budgets: [],
    work_orders: [],
    work_order_lines: [],
    site_tasks: [],
    indents: [],
    indent_lines: [],
    comparatives: [],
    comparative_lines: [],
    quotes: [],
    purchase_orders: [],
    po_lines: [],
    po_delivery_schedules: [],
    po_delivery_schedule_lines: [],
    po_terms: [],
    po_amendments: [],
    grns: [],
    grn_lines: [],
    stock_ledger_entries: [],
    material_issues: [],
    dprs: [],
    dpr_progress_entries: [],
    dpr_labour_entries: [],
    work_progress: [],
    joint_measurements: [],
    joint_measurement_lines: [],
    ra_bills: [],
    ra_bill_lines: [],
    ra_bill_revisions: [],
    vendor_bills: [],
    vendor_bill_lines: [],
    returns: [],
    supplier_ledger_entries: [],
    approvals: [],
    attachments: [],
  };
}
