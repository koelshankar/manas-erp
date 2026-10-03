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

/**
 * The eight tabs of the project workspace.
 *
 * Navigation is **spatial**, not role-shaped: every screen in the app hangs off
 * one of these tabs, and a role is a filter over them rather than a way of
 * reaching them. The five team-named tabs this replaced asked the reader to
 * know which team owned a document before they could find it.
 *
 * Two of them cut across the chart's teams on purpose:
 *
 * - **Procurement** carries the whole A2 -> B7 material thread, so an indent,
 *   the comparative it feeds and the GRN that closes it sit together. Indents
 *   and GRN are owned by Site Execution (see the authority matrix) and still
 *   are — ownership is `RESOURCE_META.owner_team`, which is what colours the
 *   page, not which tab the page is filed under.
 * - **Progress** is the site's own view of its work: today's DPR, the task
 *   list, work done against balance, and the programme it all runs to.
 */
export const WORKSPACE_TABS: WorkspaceTab[] = [
  {
    key: "overview",
    label: "Overview",
    segment: "overview",
    team: "project_budget",
    pages: [],
  },
  {
    key: "progress",
    label: "Progress",
    segment: "progress",
    team: "site_execution",
    pages: [
      { label: "Daily report", segment: "progress/daily-report", resource: "dpr" },
      { label: "Site tasks", segment: "progress/tasks", resource: "site_tasks" },
      { label: "Work done", segment: "progress/work-done", resource: "work_done" },
      { label: "Programme", segment: "progress/programme", resource: "programme" },
    ],
  },
  {
    key: "budget",
    label: "Budget",
    segment: "budget",
    team: "project_budget",
    pages: [
      { label: "BOQ", segment: "budget/boq", resource: "boq" },
      { label: "Budget vs Actual", segment: "budget/budget-vs-actual", resource: "budget_vs_actual" },
    ],
  },
  {
    key: "procurement",
    label: "Procurement",
    segment: "procurement",
    team: "purchase_stores",
    pages: [
      { label: "Indents", segment: "procurement/indents", resource: "indents" },
      { label: "Indent approval", segment: "procurement/indent-approval", resource: "indent_approval" },
      { label: "Comparatives", segment: "procurement/comparatives", resource: "comparatives" },
      { label: "Approval", segment: "procurement/approval", resource: "purchase_approval" },
      { label: "Purchase orders", segment: "procurement/purchase-orders", resource: "purchase_orders" },
      { label: "GRN", segment: "procurement/grn", resource: "grn" },
      { label: "Vendor bills", segment: "procurement/vendor-bills", resource: "vendor_bills" },
      { label: "Returns", segment: "procurement/returns", resource: "returns" },
    ],
  },
  {
    key: "stores",
    label: "Stores",
    segment: "stores",
    team: "site_execution",
    pages: [
      { label: "Material issue", segment: "stores/stock", resource: "site_stock" },
      { label: "Gate pass", segment: "stores/gate-pass", resource: "gate_pass" },
      { label: "Material transfer order", segment: "stores/transfer-orders", resource: "transfer_orders" },
    ],
  },
  {
    key: "billing",
    label: "Billing",
    segment: "billing",
    team: "billing_certification",
    pages: [
      { label: "Measurements", segment: "billing/measurements", resource: "measurements" },
      { label: "RA bills", segment: "billing/ra-bills", resource: "ra_bills" },
      { label: "Certification", segment: "billing/certification", resource: "certification" },
      { label: "Handed over", segment: "billing/handed-over", resource: "handed_over" },
    ],
  },
  {
    key: "drawings",
    label: "Drawings",
    segment: "drawings",
    team: "project_budget",
    pages: [
      { label: "Register", segment: "drawings/register", resource: "drawings" },
      { label: "Transmittals", segment: "drawings/transmittals", resource: "transmittals" },
    ],
  },
  {
    key: "contracts",
    label: "Contracts",
    segment: "contracts",
    team: "project_budget",
    pages: [
      { label: "Work orders", segment: "contracts/work-orders", resource: "work_orders" },
    ],
  },
];
