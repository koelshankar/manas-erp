import type {
  ApprovableEntityType,
  Approval,
  Attachment,
  AttachmentEntityType,
  BoqMaterialBudget,
  ComparativeLine,
  ComparativeStatus,
  DprLabourEntry,
  DprProgressEntry,
  GrnLine,
  IndentLine,
  IndentStatus,
  JointMeasurementLine,
  MaterialIssue,
  MeasurementStatus,
  PoLine,
  PoStatus,
  Quote,
  RaBillLine,
  RaBillRevision,
  RaBillStatus,
  Return,
  ReturnStatus,
  Role,
  SiteTask,
  SiteTaskStatus,
  StockLedgerEntry,
  SupplierLedgerEntry,
  SupplierRate,
  VendorBillLine,
  VendorBillStatus,
  WorkOrderLine,
} from "@/lib/domain";
import type { Repositories } from "../repositories";
import { allOf, childrenOf, makeCrud, makeProjectScopedCrud } from "./crud";

/**
 * The local (localStorage-backed) implementation of every repository.
 * This whole file is what a `src/lib/data/supabase/` sibling would replace.
 */
export function createLocalRepositories(): Repositories {
  const projects = makeCrud("projects");
  const users = makeCrud("users");
  const contractors = makeCrud("contractors");
  const materials = makeCrud("materials");
  const suppliers = makeCrud("suppliers");
  const supplierRates = makeCrud("supplier_rates");
  const boq = makeProjectScopedCrud("boq_lines");
  const boqBudgets = makeProjectScopedCrud("boq_material_budgets");
  const workOrders = makeProjectScopedCrud("work_orders");
  const workOrderLines = makeProjectScopedCrud("work_order_lines");
  const siteTasks = makeProjectScopedCrud("site_tasks");
  const indents = makeProjectScopedCrud("indents");
  const indentLines = makeProjectScopedCrud("indent_lines");
  const comparatives = makeProjectScopedCrud("comparatives");
  const comparativeLines = makeProjectScopedCrud("comparative_lines");
  const quotes = makeProjectScopedCrud("quotes");
  const purchaseOrders = makeProjectScopedCrud("purchase_orders");
  const poLines = makeProjectScopedCrud("po_lines");
  const grns = makeProjectScopedCrud("grns");
  const grnLines = makeProjectScopedCrud("grn_lines");
  const stock = makeProjectScopedCrud("stock_ledger_entries");
  const materialIssues = makeProjectScopedCrud("material_issues");
  const dprs = makeProjectScopedCrud("dprs");
  const dprProgress = makeProjectScopedCrud("dpr_progress_entries");
  const dprLabour = makeProjectScopedCrud("dpr_labour_entries");
  const workProgress = makeProjectScopedCrud("work_progress");
  const measurements = makeProjectScopedCrud("joint_measurements");
  const measurementLines = makeProjectScopedCrud("joint_measurement_lines");
  const raBills = makeProjectScopedCrud("ra_bills");
  const raBillLines = makeProjectScopedCrud("ra_bill_lines");
  const raBillRevisions = makeCrud("ra_bill_revisions");
  const vendorBills = makeProjectScopedCrud("vendor_bills");
  const vendorBillLines = makeProjectScopedCrud("vendor_bill_lines");
  const returns = makeProjectScopedCrud("returns");
  const approvals = makeCrud("approvals");
  const supplierLedger = makeCrud("supplier_ledger_entries");
  const attachments = makeCrud("attachments");

  return {
    projects: {
      ...projects,
      async getByCode(code) {
        return allOf("projects").find((p) => p.code === code) ?? null;
      },
    },

    users: {
      ...users,
      async getByRole(role: Role) {
        return allOf("users").find((u) => u.role === role) ?? null;
      },
    },

    contractors,
    materials,

    suppliers: {
      ...suppliers,
      async listRates() {
        return allOf("supplier_rates");
      },
      async listRatesBySupplier(supplier_id) {
        return childrenOf("supplier_rates", "supplier_id", supplier_id);
      },
      async listRatesByMaterial(material_id) {
        return childrenOf("supplier_rates", "material_id", material_id);
      },
      createRate: (input) => supplierRates.create(input as SupplierRate),
      updateRate: (id, patch) => supplierRates.update(id, patch),
      removeRate: (id) => supplierRates.remove(id),
    },

    boq: {
      ...boq,
      async listMaterialBudgets() {
        return allOf("boq_material_budgets");
      },
      listMaterialBudgetsByProject: (project_id) => boqBudgets.listByProject(project_id),
      async listMaterialBudgetsByBoqLine(boq_line_id) {
        return childrenOf("boq_material_budgets", "boq_line_id", boq_line_id);
      },
      async getMaterialBudget(boq_line_id, material_id) {
        return (
          allOf("boq_material_budgets").find(
            (b) => b.boq_line_id === boq_line_id && b.material_id === material_id,
          ) ?? null
        );
      },
      createMaterialBudget: (input) => boqBudgets.create(input as BoqMaterialBudget),
      updateMaterialBudget: (id, patch) => boqBudgets.update(id, patch),
      removeMaterialBudget: (id) => boqBudgets.remove(id),
    },

    workOrders: {
      ...workOrders,
      async listLines() {
        return allOf("work_order_lines");
      },
      listLinesByProject: (project_id) => workOrderLines.listByProject(project_id),
      async listLinesByWorkOrder(work_order_id) {
        return childrenOf("work_order_lines", "work_order_id", work_order_id);
      },
      async listLinesByBoqLine(boq_line_id) {
        return childrenOf("work_order_lines", "boq_line_id", boq_line_id);
      },
      createLine: (input) => workOrderLines.create(input as WorkOrderLine),
      updateLine: (id, patch) => workOrderLines.update(id, patch),
      removeLine: (id) => workOrderLines.remove(id),
    },

    siteTasks: {
      ...siteTasks,
      async listByWorkOrder(work_order_id) {
        return childrenOf("site_tasks", "work_order_id", work_order_id);
      },
      async listByStatus(project_id: string, status: SiteTaskStatus) {
        return allOf("site_tasks").filter(
          (t: SiteTask) => t.project_id === project_id && t.status === status,
        );
      },
    },

    indents: {
      ...indents,
      async listByStatus(status: IndentStatus) {
        return allOf("indents").filter((i) => i.status === status);
      },
      async listLines() {
        return allOf("indent_lines");
      },
      listLinesByProject: (project_id) => indentLines.listByProject(project_id),
      async listLinesByIndent(indent_id) {
        return childrenOf("indent_lines", "indent_id", indent_id);
      },
      createLine: (input) => indentLines.create(input as IndentLine),
      updateLine: (id, patch) => indentLines.update(id, patch),
      removeLine: (id) => indentLines.remove(id),
    },

    comparatives: {
      ...comparatives,
      async listByStatus(status: ComparativeStatus) {
        return allOf("comparatives").filter((c) => c.status === status);
      },
      async listByIndent(indent_id) {
        return allOf("comparatives").filter((c) => c.indent_ids.includes(indent_id));
      },
      async listLines() {
        return allOf("comparative_lines");
      },
      listLinesByProject: (project_id) => comparativeLines.listByProject(project_id),
      async listLinesByComparative(comparative_id) {
        return childrenOf("comparative_lines", "comparative_id", comparative_id);
      },
      async listLinesByIndentLine(indent_line_id) {
        return childrenOf("comparative_lines", "indent_line_id", indent_line_id);
      },
      createLine: (input) => comparativeLines.create(input as ComparativeLine),
      updateLine: (id, patch) => comparativeLines.update(id, patch),
      removeLine: (id) => comparativeLines.remove(id),
      async listQuotes() {
        return allOf("quotes");
      },
      listQuotesByProject: (project_id) => quotes.listByProject(project_id),
      async listQuotesByComparative(comparative_id) {
        return childrenOf("quotes", "comparative_id", comparative_id);
      },
      async listQuotesByLine(comparative_line_id) {
        return childrenOf("quotes", "comparative_line_id", comparative_line_id);
      },
      createQuote: (input) => quotes.create(input as Quote),
      updateQuote: (id, patch) => quotes.update(id, patch),
      removeQuote: (id) => quotes.remove(id),
    },

    purchaseOrders: {
      ...purchaseOrders,
      async listBySupplier(supplier_id) {
        return childrenOf("purchase_orders", "supplier_id", supplier_id);
      },
      async listByStatus(status: PoStatus) {
        return allOf("purchase_orders").filter((p) => p.status === status);
      },
      async listByComparative(comparative_id) {
        return childrenOf("purchase_orders", "comparative_id", comparative_id);
      },
      async listLines() {
        return allOf("po_lines");
      },
      listLinesByProject: (project_id) => poLines.listByProject(project_id),
      async listLinesByPo(purchase_order_id) {
        return childrenOf("po_lines", "purchase_order_id", purchase_order_id);
      },
      async listLinesByIndentLine(indent_line_id) {
        return childrenOf("po_lines", "indent_line_id", indent_line_id);
      },
      createLine: (input) => poLines.create(input as PoLine),
      updateLine: (id, patch) => poLines.update(id, patch),
      removeLine: (id) => poLines.remove(id),
    },

    grns: {
      ...grns,
      async listByPo(purchase_order_id) {
        return childrenOf("grns", "purchase_order_id", purchase_order_id);
      },
      async listLines() {
        return allOf("grn_lines");
      },
      listLinesByProject: (project_id) => grnLines.listByProject(project_id),
      async listLinesByGrn(grn_id) {
        return childrenOf("grn_lines", "grn_id", grn_id);
      },
      createLine: (input) => grnLines.create(input as GrnLine),
      updateLine: (id, patch) => grnLines.update(id, patch),
      removeLine: (id) => grnLines.remove(id),
    },

    stock: {
      ...stock,
      async listByMaterial(project_id, material_id) {
        return allOf("stock_ledger_entries").filter(
          (e) => e.project_id === project_id && e.material_id === material_id,
        );
      },
      async balances(project_id) {
        const byMaterial = new Map<string, number>();
        allOf("stock_ledger_entries")
          .filter((e: StockLedgerEntry) => e.project_id === project_id)
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
          .forEach((e) => {
            byMaterial.set(e.material_id, (byMaterial.get(e.material_id) ?? 0) + e.quantity_in - e.quantity_out);
          });
        return [...byMaterial.entries()].map(([material_id, balance_quantity]) => ({
          material_id,
          balance_quantity,
        }));
      },
      async listIssues() {
        return allOf("material_issues");
      },
      listIssuesByProject: (project_id) => materialIssues.listByProject(project_id),
      createIssue: (input) => materialIssues.create(input as MaterialIssue),
      updateIssue: (id, patch) => materialIssues.update(id, patch),
      removeIssue: (id) => materialIssues.remove(id),
    },

    dprs: {
      ...dprs,
      async getByDate(project_id: string, report_date: string) {
        return (
          allOf("dprs").find((d) => d.project_id === project_id && d.report_date === report_date) ??
          null
        );
      },
      async listProgressEntries() {
        return allOf("dpr_progress_entries");
      },
      listProgressEntriesByProject: (project_id) => dprProgress.listByProject(project_id),
      async listProgressEntriesByDpr(dpr_id) {
        return childrenOf("dpr_progress_entries", "dpr_id", dpr_id);
      },
      async listProgressEntriesByWorkOrderLine(work_order_line_id) {
        return childrenOf("dpr_progress_entries", "work_order_line_id", work_order_line_id);
      },
      createProgressEntry: (input) => dprProgress.create(input as DprProgressEntry),
      updateProgressEntry: (id, patch) => dprProgress.update(id, patch),
      removeProgressEntry: (id) => dprProgress.remove(id),
      async listLabourEntries() {
        return allOf("dpr_labour_entries");
      },
      listLabourEntriesByProject: (project_id) => dprLabour.listByProject(project_id),
      async listLabourEntriesByDpr(dpr_id) {
        return childrenOf("dpr_labour_entries", "dpr_id", dpr_id);
      },
      createLabourEntry: (input) => dprLabour.create(input as DprLabourEntry),
      updateLabourEntry: (id, patch) => dprLabour.update(id, patch),
      removeLabourEntry: (id) => dprLabour.remove(id),
    },

    workProgress: {
      ...workProgress,
      async listByWorkOrderLine(work_order_line_id) {
        return childrenOf("work_progress", "work_order_line_id", work_order_line_id);
      },
    },

    measurements: {
      ...measurements,
      async listByWorkOrder(work_order_id) {
        return childrenOf("joint_measurements", "work_order_id", work_order_id);
      },
      async listByStatus(status: MeasurementStatus) {
        return allOf("joint_measurements").filter((m) => m.status === status);
      },
      async listLines() {
        return allOf("joint_measurement_lines");
      },
      listLinesByProject: (project_id) => measurementLines.listByProject(project_id),
      async listLinesByMeasurement(joint_measurement_id) {
        return childrenOf("joint_measurement_lines", "joint_measurement_id", joint_measurement_id);
      },
      async listLinesByWorkOrderLine(work_order_line_id) {
        return childrenOf("joint_measurement_lines", "work_order_line_id", work_order_line_id);
      },
      createLine: (input) => measurementLines.create(input as JointMeasurementLine),
      updateLine: (id, patch) => measurementLines.update(id, patch),
      removeLine: (id) => measurementLines.remove(id),
    },

    raBills: {
      ...raBills,
      async listByStatus(status: RaBillStatus) {
        return allOf("ra_bills").filter((b) => b.status === status);
      },
      async listByWorkOrder(work_order_id) {
        return childrenOf("ra_bills", "work_order_id", work_order_id);
      },
      async listByContractor(contractor_id) {
        return childrenOf("ra_bills", "contractor_id", contractor_id);
      },
      async listLines() {
        return allOf("ra_bill_lines");
      },
      listLinesByProject: (project_id) => raBillLines.listByProject(project_id),
      async listLinesByBill(ra_bill_id) {
        return childrenOf("ra_bill_lines", "ra_bill_id", ra_bill_id);
      },
      async listLinesByWorkOrderLine(work_order_line_id) {
        return childrenOf("ra_bill_lines", "work_order_line_id", work_order_line_id);
      },
      createLine: (input) => raBillLines.create(input as RaBillLine),
      updateLine: (id, patch) => raBillLines.update(id, patch),
      removeLine: (id) => raBillLines.remove(id),
      async listRevisions() {
        return allOf("ra_bill_revisions");
      },
      async listRevisionsByBill(ra_bill_id) {
        return allOf("ra_bill_revisions")
          .filter((r: RaBillRevision) => r.ra_bill_id === ra_bill_id)
          .sort((a, b) => a.acted_at.localeCompare(b.acted_at));
      },
      createRevision: (input) => raBillRevisions.create(input as RaBillRevision),
    },

    vendorBills: {
      ...vendorBills,
      async listBySupplier(supplier_id) {
        return childrenOf("vendor_bills", "supplier_id", supplier_id);
      },
      async listByStatus(status: VendorBillStatus) {
        return allOf("vendor_bills").filter((b) => b.status === status);
      },
      async listLines() {
        return allOf("vendor_bill_lines");
      },
      listLinesByProject: (project_id) => vendorBillLines.listByProject(project_id),
      async listLinesByBill(vendor_bill_id) {
        return childrenOf("vendor_bill_lines", "vendor_bill_id", vendor_bill_id);
      },
      createLine: (input) => vendorBillLines.create(input as VendorBillLine),
      updateLine: (id, patch) => vendorBillLines.update(id, patch),
      removeLine: (id) => vendorBillLines.remove(id),
    },

    returns: {
      ...returns,
      async listBySupplier(supplier_id) {
        return childrenOf("returns", "supplier_id", supplier_id);
      },
      async listByStatus(status: ReturnStatus) {
        return allOf("returns").filter((r: Return) => r.status === status);
      },
      async listByGrn(grn_id) {
        return childrenOf("returns", "grn_id", grn_id);
      },
    },

    supplierLedger: {
      ...supplierLedger,
      async listBySupplier(supplier_id: string) {
        return allOf("supplier_ledger_entries")
          .filter((e: SupplierLedgerEntry) => e.supplier_id === supplier_id)
          .sort((a, b) => a.entry_date.localeCompare(b.entry_date));
      },
      async balanceFor(supplier_id: string) {
        return allOf("supplier_ledger_entries")
          .filter((e: SupplierLedgerEntry) => e.supplier_id === supplier_id)
          .reduce((sum, e) => sum + e.credit - e.debit, 0);
      },
    },

    approvals: {
      ...approvals,
      async listForEntity(entity_type: ApprovableEntityType, entity_id: string) {
        return allOf("approvals")
          .filter((a: Approval) => a.entity_type === entity_type && a.entity_id === entity_id)
          .sort((a, b) => a.sequence - b.sequence);
      },
      async listPendingForRole(required_role: Role) {
        return allOf("approvals").filter(
          (a: Approval) => a.required_role === required_role && a.status === "pending",
        );
      },
      async listPendingForProject(project_id: string) {
        return allOf("approvals").filter(
          (a: Approval) => a.project_id === project_id && a.status === "pending",
        );
      },
      async listByProject(project_id: string) {
        return allOf("approvals").filter((a: Approval) => a.project_id === project_id);
      },
    },

    attachments: {
      ...attachments,
      async listByProject(project_id: string) {
        return allOf("attachments").filter((a: Attachment) => a.project_id === project_id);
      },
      async listByEntity(entity_type: AttachmentEntityType, entity_id: string) {
        return allOf("attachments")
          .filter(
            (a: Attachment) => a.entity_type === entity_type && a.entity_id === entity_id,
          )
          .sort((a, b) => a.uploaded_at.localeCompare(b.uploaded_at));
      },
    },
  };
}
