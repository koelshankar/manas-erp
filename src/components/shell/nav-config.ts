import type { Resource } from "@/config/permissions";

/* ------------------------------------------------------------------ */
/* Project workspace                                                   */
/* ------------------------------------------------------------------ */

export type WorkspaceTab = {
  key: string;
  label: string;
  /** Segment under /projects/[projectId]/ */
  segment: string;
  team: import("@/lib/domain").Team;
  pages: Array<{ label: string; segment: string; resource: Resource }>;
};

export const WORKSPACE_TABS: WorkspaceTab[] = [
  {
    key: "overview",
    label: "Overview",
    segment: "overview",
    team: "project_budget",
    pages: [],
  },
  {
    key: "budget",
    label: "Project & Budget",
    segment: "budget",
    team: "project_budget",
    pages: [
      { label: "BOQ", segment: "budget/boq", resource: "boq" },
      { label: "Work Orders", segment: "budget/work-orders", resource: "work_orders" },
      { label: "Indent Approval", segment: "budget/indent-approval", resource: "indent_approval" },
      { label: "Budget vs Actual", segment: "budget/budget-vs-actual", resource: "budget_vs_actual" },
    ],
  },
  {
    key: "site",
    label: "Site Execution",
    segment: "site",
    team: "site_execution",
    pages: [
      { label: "Tasks", segment: "site/tasks", resource: "site_tasks" },
      { label: "Indents", segment: "site/indents", resource: "indents" },
      { label: "DPR", segment: "site/dpr", resource: "dpr" },
      { label: "Work Done", segment: "site/work-done", resource: "work_done" },
      { label: "GRN", segment: "site/grn", resource: "grn" },
      { label: "Stock", segment: "site/stock", resource: "site_stock" },
    ],
  },
  {
    key: "purchase",
    label: "Purchase & Stores",
    segment: "purchase",
    team: "purchase_stores",
    pages: [
      { label: "Comparatives", segment: "purchase/comparatives", resource: "comparatives" },
      { label: "Approval", segment: "purchase/approval", resource: "purchase_approval" },
      { label: "Purchase Orders", segment: "purchase/purchase-orders", resource: "purchase_orders" },
      { label: "Vendor Bills", segment: "purchase/vendor-bills", resource: "vendor_bills" },
      { label: "Returns", segment: "purchase/returns", resource: "returns" },
    ],
  },
  {
    key: "billing",
    label: "Billing & Certification",
    segment: "billing",
    team: "billing_certification",
    pages: [
      { label: "Measurements", segment: "billing/measurements", resource: "measurements" },
      { label: "RA Bills", segment: "billing/ra-bills", resource: "ra_bills" },
      { label: "Certification", segment: "billing/certification", resource: "certification" },
      { label: "Handed Over", segment: "billing/handed-over", resource: "handed_over" },
    ],
  },
];
