/**
 * SINGLE SOURCE OF TRUTH for authority.
 *
 * Every page, tab, button and widget in the app must decide what it shows by
 * calling `can()` / `canEditResource()` / `dashboardWidgetsFor()` from this
 * file. Nothing else may hard-code a role name.
 *
 * When Supabase lands, this matrix is mirrored into RLS policies; the shape of
 * the exports below is deliberately data-only so it can be generated.
 */
import type { Role, StepCode, Team } from "@/lib/domain/enums";
import { ROLES } from "@/lib/domain/enums";

/* ------------------------------------------------------------------ */
/* Resources                                                           */
/* ------------------------------------------------------------------ */

export const RESOURCES = [
  // Project & budget
  "boq",
  "work_orders",
  "indent_approval",
  "budget_vs_actual",
  "contractors",
  // Site execution
  "site_tasks",
  "indents",
  "dpr",
  "work_done",
  "grn",
  "site_stock",
  "programme",
  "gate_pass",
  "transfer_orders",
  // Purchase & stores
  "comparatives",
  "purchase_approval",
  "purchase_orders",
  "vendor_bills",
  "returns",
  "materials",
  "suppliers",
  "supplier_ledger",
  // Billing & certification
  "measurements",
  "ra_bills",
  "certification",
  "handed_over",
  "contractor_ledger",
  // Drawings
  "drawings",
  "transmittals",
  // Cross-cutting
  "rates",
  "projects",
  "users",
  "permissions_matrix",
  "boq_library",
  "po_clauses",
  "document_numbering",
  "approvals_inbox",
  "accounts_handover",
  "reports",
] as const;

export type Resource = (typeof RESOURCES)[number];

export type Action = "view" | "view_values" | "create" | "edit" | "delete" | "approve";

export type ResourceMeta = {
  key: Resource;
  label: string;
  owner_team: Team;
  /** Step codes printed verbatim on the page header badge. */
  step_codes: StepCode[];
  /** Route relative to the project workspace, or absolute for global pages. */
  href: string;
  /** True when the route lives under /projects/[projectId]. */
  project_scoped: boolean;
};

export const RESOURCE_META: Record<Resource, ResourceMeta> = {
  /* --- Project & budget (purple) --- */
  boq: {
    key: "boq",
    label: "BOQ & Budget",
    owner_team: "project_budget",
    step_codes: [],
    href: "/budget/boq",
    project_scoped: true,
  },
  work_orders: {
    key: "work_orders",
    label: "Work Orders & Rates",
    owner_team: "project_budget",
    step_codes: [],
    href: "/contracts/work-orders",
    project_scoped: true,
  },
  indent_approval: {
    key: "indent_approval",
    label: "Indent Approval",
    owner_team: "project_budget",
    step_codes: ["A2"],
    href: "/procurement/indent-approval",
    project_scoped: true,
  },
  budget_vs_actual: {
    key: "budget_vs_actual",
    label: "Budget vs Actual",
    owner_team: "project_budget",
    step_codes: [],
    href: "/budget/budget-vs-actual",
    project_scoped: true,
  },
  contractors: {
    key: "contractors",
    label: "Contractor Master",
    owner_team: "project_budget",
    step_codes: [],
    href: "/masters/contractors",
    project_scoped: false,
  },

  /* --- Site execution (orange) --- */
  site_tasks: {
    key: "site_tasks",
    label: "Site Tasks",
    owner_team: "site_execution",
    step_codes: ["A1"],
    href: "/progress/tasks",
    project_scoped: true,
  },
  indents: {
    key: "indents",
    label: "Material Indent",
    owner_team: "site_execution",
    step_codes: ["A2"],
    href: "/procurement/indents",
    project_scoped: true,
  },
  dpr: {
    key: "dpr",
    label: "DPR & Labour",
    owner_team: "site_execution",
    step_codes: ["A3"],
    href: "/progress/daily-report",
    project_scoped: true,
  },
  work_done: {
    key: "work_done",
    label: "Work Done vs Balance",
    owner_team: "site_execution",
    step_codes: ["A4"],
    href: "/progress/work-done",
    project_scoped: true,
  },
  grn: {
    key: "grn",
    label: "Goods Received Note (GRN)",
    owner_team: "site_execution",
    step_codes: ["B5", "B6"],
    href: "/procurement/grn",
    project_scoped: true,
  },
  site_stock: {
    key: "site_stock",
    label: "Material Issue & Site Stock",
    owner_team: "site_execution",
    step_codes: ["A5"],
    href: "/stores/stock",
    project_scoped: true,
  },

  programme: {
    key: "programme",
    label: "Programme",
    owner_team: "site_execution",
    step_codes: [],
    href: "/progress/programme",
    project_scoped: true,
  },
  gate_pass: {
    key: "gate_pass",
    label: "Gate Pass",
    owner_team: "site_execution",
    step_codes: [],
    href: "/stores/gate-pass",
    project_scoped: true,
  },
  transfer_orders: {
    key: "transfer_orders",
    label: "Material Transfer Order",
    owner_team: "site_execution",
    step_codes: [],
    href: "/stores/transfer-orders",
    project_scoped: true,
  },

  /* --- Purchase & stores (green) --- */
  comparatives: {
    key: "comparatives",
    label: "Vendor Comparatives",
    owner_team: "purchase_stores",
    step_codes: ["B1"],
    href: "/procurement/comparatives",
    project_scoped: true,
  },
  purchase_approval: {
    key: "purchase_approval",
    label: "Approval to Purchase",
    owner_team: "purchase_stores",
    step_codes: ["B2"],
    href: "/procurement/approval",
    project_scoped: true,
  },
  purchase_orders: {
    key: "purchase_orders",
    label: "Purchase Orders",
    owner_team: "purchase_stores",
    step_codes: ["B3", "B4"],
    href: "/procurement/purchase-orders",
    project_scoped: true,
  },
  vendor_bills: {
    key: "vendor_bills",
    label: "Vendor Bill Check",
    owner_team: "purchase_stores",
    step_codes: ["B7"],
    href: "/procurement/vendor-bills",
    project_scoped: true,
  },
  returns: {
    key: "returns",
    label: "Returns",
    owner_team: "purchase_stores",
    step_codes: [],
    href: "/procurement/returns",
    project_scoped: true,
  },
  materials: {
    key: "materials",
    label: "Material Master",
    owner_team: "purchase_stores",
    step_codes: [],
    href: "/masters/materials",
    project_scoped: false,
  },
  suppliers: {
    key: "suppliers",
    label: "Supplier Master & Rates",
    owner_team: "purchase_stores",
    step_codes: [],
    href: "/masters/suppliers",
    project_scoped: false,
  },
  supplier_ledger: {
    key: "supplier_ledger",
    label: "Supplier Ledger",
    owner_team: "purchase_stores",
    step_codes: [],
    href: "/ledgers/suppliers",
    project_scoped: false,
  },

  /* --- Billing & certification (teal) --- */
  measurements: {
    key: "measurements",
    label: "Joint Measurements",
    owner_team: "billing_certification",
    step_codes: ["C1"],
    href: "/billing/measurements",
    project_scoped: true,
  },
  ra_bills: {
    key: "ra_bills",
    label: "RA Bills",
    owner_team: "billing_certification",
    step_codes: ["C2"],
    href: "/billing/ra-bills",
    project_scoped: true,
  },
  certification: {
    key: "certification",
    label: "Certification Chain",
    owner_team: "billing_certification",
    step_codes: ["C3", "C4"],
    href: "/billing/certification",
    project_scoped: true,
  },
  handed_over: {
    key: "handed_over",
    label: "Handed Over",
    owner_team: "billing_certification",
    step_codes: ["C5"],
    href: "/billing/handed-over",
    project_scoped: true,
  },
  contractor_ledger: {
    key: "contractor_ledger",
    label: "Contractor Ledger",
    owner_team: "billing_certification",
    step_codes: [],
    href: "/ledgers/contractors",
    project_scoped: false,
  },

  /* --- Drawings (project office) --- */
  drawings: {
    key: "drawings",
    label: "Drawing Register",
    owner_team: "project_budget",
    step_codes: [],
    href: "/drawings/register",
    project_scoped: true,
  },
  transmittals: {
    key: "transmittals",
    label: "Transmittals",
    owner_team: "project_budget",
    step_codes: [],
    href: "/drawings/transmittals",
    project_scoped: true,
  },

  /* --- Cross-cutting --- */
  /**
   * Not a page. A data class: every rate, landed cost, PO value and bill amount
   * in the purchase thread. Site Execution is denied `view` on it, which is
   * what the GRN and Stock screens check before rendering a money column.
   */
  rates: {
    key: "rates",
    label: "Rates & Values",
    owner_team: "purchase_stores",
    step_codes: [],
    href: "/masters/suppliers",
    project_scoped: false,
  },
  projects: {
    key: "projects",
    label: "Projects",
    owner_team: "project_budget",
    step_codes: [],
    href: "/projects",
    project_scoped: false,
  },
  users: {
    key: "users",
    label: "Users & Roles",
    owner_team: "project_budget",
    step_codes: [],
    href: "/masters/users",
    project_scoped: false,
  },
  permissions_matrix: {
    key: "permissions_matrix",
    label: "Permissions Matrix",
    owner_team: "project_budget",
    step_codes: [],
    href: "/masters/permissions",
    project_scoped: false,
  },
  po_clauses: {
    key: "po_clauses",
    label: "PO Terms Library",
    owner_team: "purchase_stores",
    step_codes: [],
    href: "/masters/po-terms",
    project_scoped: false,
  },
  document_numbering: {
    key: "document_numbering",
    label: "Document Numbering",
    owner_team: "project_budget",
    step_codes: [],
    href: "/masters/numbering",
    project_scoped: false,
  },
  boq_library: {
    key: "boq_library",
    label: "BOQ Library",
    owner_team: "project_budget",
    step_codes: [],
    href: "/masters/boq-library",
    project_scoped: false,
  },
  approvals_inbox: {
    key: "approvals_inbox",
    label: "Approvals",
    owner_team: "project_budget",
    step_codes: [],
    href: "/approvals",
    project_scoped: false,
  },
  accounts_handover: {
    key: "accounts_handover",
    label: "Accounts Handover",
    owner_team: "accounts",
    step_codes: ["B8", "C5"],
    href: "/accounts-handover",
    project_scoped: false,
  },
  reports: {
    key: "reports",
    label: "Budget vs Actual Report",
    owner_team: "project_budget",
    step_codes: [],
    href: "/reports/budget-vs-actual",
    project_scoped: false,
  },
};

/* ------------------------------------------------------------------ */
/* Role -> team                                                        */
/* ------------------------------------------------------------------ */

export const ROLE_TEAM: Record<Role, Team> = {
  project_head: "project_budget",
  site_engineer: "site_execution",
  purchase_officer: "purchase_stores",
  purchase_head: "purchase_stores",
  project_qs: "billing_certification",
  qs_head: "billing_certification",
  hod: "billing_certification",
};

/**
 * What each role is called on screen.
 *
 * These are the client's own job titles. The stored values keep the names the
 * approval chains, the seed and the tests were built on — a title is a label,
 * not an identity, and renaming one must not rewrite the audit trail.
 */
export const ROLE_LABEL: Record<Role, string> = {
  project_head: "Senior project manager",
  site_engineer: "Project engineer",
  purchase_officer: "Purchase officer",
  purchase_head: "Manager procurement",
  project_qs: "QS",
  qs_head: "Billing head",
  hod: "GM / management",
};

/**
 * The nine job titles on the client's org chart, in their order.
 *
 * Seven of them are roles you can sign in as. Store keeper and QA/QC are on
 * the chart and in the matrix, but have no login yet: their work is done by
 * the project engineer today, and splitting them out means new seed users,
 * their own approval steps and their own dashboards. They are listed here so
 * the matrix shows the whole organisation rather than the part that happens
 * to be built, and `role: null` is what marks them as not yet selectable.
 */
export type ClientRole = {
  label: string;
  role: Role | null;
  /** What this person does, for the matrix screen. */
  description: string;
};

export const CLIENT_ROLES: ClientRole[] = [
  {
    label: "Project engineer",
    role: "site_engineer",
    description: "Runs the work on the ground. Raises indents, records GRNs and issues stock.",
  },
  {
    label: "Store keeper",
    role: null,
    description: "Holds the site store. Today the project engineer does this.",
  },
  {
    label: "QS",
    role: "project_qs",
    description: "Measures work done and prepares the RA bill against the contract.",
  },
  {
    label: "QA / QC",
    role: null,
    description: "Inspects material on arrival and work before it is measured.",
  },
  {
    label: "Senior project manager",
    role: "project_head",
    description: "Owns the budget and the contract. Approves indents and verifies bills.",
  },
  {
    label: "Purchase officer",
    role: "purchase_officer",
    description: "Runs the comparative, raises the PO and checks the vendor bill.",
  },
  {
    label: "Manager procurement",
    role: "purchase_head",
    description: "Approves the purchase and owns the supply contracts.",
  },
  {
    label: "Billing head",
    role: "qs_head",
    description: "Certifies bills and owns the billing position across sites.",
  },
  {
    label: "GM / management",
    role: "hod",
    description: "Reads the whole portfolio. Final link in the certification chain.",
  },
];

/* ------------------------------------------------------------------ */
/* Grants                                                              */
/* ------------------------------------------------------------------ */

/**
 * Mutating grants only. Every role can `view` every resource — the demo never
 * disables navigation — so `view` is implied and not listed here.
 *
 * `view_values` is also implied, except where `VALUE_BLIND` removes it.
 */
type Grants = Partial<Record<Resource, Action[]>>;

const GRANTS: Record<Role, Grants> = {
  /* Project Head — BOQ & budget, work orders & rates, contractor master,
     indent approval (A2), and the cross-team verification step in the bill
     chain (C3, after the QS). */
  project_head: {
    boq: ["create", "edit", "delete"],
    work_orders: ["create", "edit", "delete"],
    contractors: ["create", "edit", "delete"],
    indent_approval: ["approve"],
    certification: ["approve"],
    document_numbering: ["edit"],
  },

  /* Site Engineer — everything that happens on site. GRN (B5-B6) is owned by
     site, not purchase. Must not see supplier rates or PO values. */
  site_engineer: {
    site_tasks: ["create", "edit", "delete"],
    indents: ["create", "edit", "delete"],
    dpr: ["create", "edit"],
    work_done: ["create", "edit"],
    grn: ["create", "edit"],
    site_stock: ["create", "edit"],
  },

  /* Purchase Officer — comparative (B1), POs (B3-B4), vendor bill check (B7),
     returns, and the material & supplier masters. */
  purchase_officer: {
    comparatives: ["create", "edit"],
    purchase_orders: ["create", "edit"],
    vendor_bills: ["create", "edit"],
    returns: ["create", "edit"],
    materials: ["create", "edit", "delete"],
    suppliers: ["create", "edit", "delete"],
    po_clauses: ["create", "edit", "delete"],
  },

  /* Purchase Head — approval to purchase (B2) and the first level of the
     purchase order sign-off (B3, "recommended by"). */
  purchase_head: {
    purchase_approval: ["approve"],
    purchase_orders: ["approve"],
  },

  /* Project QS — joint measurement (C1), RA bill entry (C2), first
     verification (C3), handover (C5). */
  project_qs: {
    measurements: ["create", "edit"],
    ra_bills: ["create", "edit"],
    certification: ["approve"],
    handed_over: ["create", "edit"],
  },

  /* QS Head — third link in the bill chain (C4). */
  qs_head: {
    certification: ["approve"],
  },

  /* HoD — final link in the bill chain (C4), and the authorised signatory on
     a purchase order (B4). */
  hod: {
    certification: ["approve"],
    purchase_orders: ["approve"],
  },
};

/**
 * Resources whose monetary columns are hidden from a role that can otherwise
 * see money.
 *
 * A role denied the `rates` data class outright needs no entry here — see
 * `can()`, which makes it value-blind everywhere. This list is for the
 * narrower case: a role that reads rupees on most screens but is held to
 * quantities on one.
 *
 * The QS is the live example. They bill against contract rates all day, so
 * they are not value-blind; but the BOQ and Budget vs Actual are the project
 * manager's view of the money, and the QS is given quantity, consumed and
 * balance against a line without the rate behind it.
 */
const VALUE_BLIND: Partial<Record<Role, Resource[]>> = {
  project_qs: ["boq", "budget_vs_actual"],
};

/**
 * Resources a role cannot see at all.
 *
 * Pages are never listed here — navigation is never disabled. Only data
 * classes like `rates` are, and denying that one is what makes the project
 * engineer value-blind across the whole app.
 */
const VIEW_DENIED: Partial<Record<Role, Resource[]>> = {
  site_engineer: ["rates"],
};

/* ------------------------------------------------------------------ */
/* Approval chains                                                     */
/* ------------------------------------------------------------------ */

export type ApprovalStepSpec = {
  step_code: StepCode;
  sequence: number;
  required_role: Role;
  label: string;
  /**
   * True when the step is held by a team other than the one that owns the
   * entity — the Project Head verifying a billing document, for instance. The
   * screen labels these so it is obvious why another team is in the chain.
   */
  cross_team?: boolean;
};

/**
 * The generic Approval entity is created from these specs.
 *
 * Only three gates on the chart are approvals: the indent (A2), approval to
 * purchase (B2), and the bill chain (C3-C4), which runs
 * Project QS -> Project Head -> QS Head -> HoD in that order. B7 is a
 * three-way match check, not a sign-off, so it has no chain here.
 */
export const APPROVAL_CHAINS = {
  indent: [
    { step_code: "A2", sequence: 1, required_role: "project_head", label: "Indent approval" },
  ],
  comparative: [
    { step_code: "B2", sequence: 1, required_role: "purchase_head", label: "Approval to purchase" },
  ],
  /**
   * The purchase order's own two-level sign-off, between B3 (the order is
   * written) and B4 (it is issued to the supplier).
   *
   * Manas described two levels — recommended by the Manager Procurement, then
   * authorised. The printed form carries four signature blocks, which is a
   * different thing: see PO_SIGNATURE_LABELS. Keeping them apart is what stops
   * the app inventing a "Verified By" step that nobody in their office holds.
   */
  purchase_order: [
    {
      step_code: "B3",
      sequence: 1,
      required_role: "purchase_head",
      label: "Recommended by — Manager Procurement",
    },
    {
      step_code: "B4",
      sequence: 2,
      required_role: "hod",
      label: "Authorised signatory",
      cross_team: true,
    },
  ],
  ra_bill: [
    { step_code: "C3", sequence: 1, required_role: "project_qs", label: "QS verification" },
    {
      step_code: "C3",
      sequence: 2,
      required_role: "project_head",
      label: "Cross-team verification — Project & Budget",
      cross_team: true,
    },
    { step_code: "C4", sequence: 3, required_role: "qs_head", label: "QS Head approval" },
    { step_code: "C4", sequence: 4, required_role: "hod", label: "HoD approval" },
  ],
} as const satisfies Record<string, readonly ApprovalStepSpec[]>;

export type ApprovalChainKey = keyof typeof APPROVAL_CHAINS;

/* ------------------------------------------------------------------ */
/* Dashboard layout                                                    */
/* ------------------------------------------------------------------ */

/**
 * How wide a widget sits in the dashboard grid. The grid is four columns from
 * `lg` up, two at `md`, one on a phone.
 */
export type WidgetSize = "sm" | "md" | "lg" | "full";

export type DashboardSlot = {
  widget_id: string;
  size: WidgetSize;
  /** Give the widget the role's team colour and a heavier surface. */
  emphasis?: boolean;
};

/**
 * My work: what is on this person right now.
 *
 * **Four tiles at most, and every one of them actionable.** The dashboards
 * this replaced ran to eight panels, most of them figures to look at rather
 * than work to do, and the queue that mattered was somewhere in the middle of
 * them. Anything informational belongs in the tab it describes — spend on
 * Budget, deliveries on Procurement, stock on Stores — where it has the room
 * to be read properly and the context to be understood.
 *
 * The KPI row went with them: a row of numbers is the definition of something
 * you cannot act on.
 *
 * "Needs your action" is first on every layout and pools every queue the role
 * owns; "Your recent activity" is last and is the way back to what you just
 * filed. The widget registry in `src/components/dashboard/widgets` maps every
 * `widget_id` to a component; nothing here knows what a widget looks like.
 */
export const DASHBOARD_LAYOUTS: Record<Role, DashboardSlot[]> = {
  project_head: [
    { widget_id: "action_items", size: "full", emphasis: true },
    { widget_id: "over_budget_lines", size: "md" },
    { widget_id: "work_orders_near_limit", size: "md" },
    { widget_id: "recent_activity", size: "full" },
  ],
  site_engineer: [
    { widget_id: "dpr_cta", size: "full", emphasis: true },
    { widget_id: "action_items", size: "full", emphasis: true },
    { widget_id: "indent_pipeline", size: "md" },
    { widget_id: "recent_activity", size: "md" },
  ],
  purchase_officer: [
    { widget_id: "action_items", size: "full", emphasis: true },
    { widget_id: "overdue_pos", size: "md" },
    { widget_id: "unbilled_grns", size: "md" },
    { widget_id: "recent_activity", size: "full" },
  ],
  purchase_head: [
    { widget_id: "action_items", size: "full", emphasis: true },
    { widget_id: "overdue_pos", size: "md" },
    { widget_id: "unbilled_grns", size: "md" },
    { widget_id: "recent_activity", size: "full" },
  ],
  project_qs: [
    { widget_id: "action_items", size: "full", emphasis: true },
    { widget_id: "certification_pipeline", size: "md" },
    { widget_id: "recent_activity", size: "md" },
  ],
  qs_head: [
    { widget_id: "action_items", size: "full", emphasis: true },
    { widget_id: "stuck_bills", size: "md" },
    { widget_id: "recent_activity", size: "md" },
  ],
  hod: [
    { widget_id: "action_items", size: "full", emphasis: true },
    { widget_id: "stuck_bills", size: "md" },
    { widget_id: "recent_activity", size: "md" },
  ],
};

export function dashboardLayoutFor(role: Role): DashboardSlot[] {
  return DASHBOARD_LAYOUTS[role];
}

/* ------------------------------------------------------------------ */
/* Project navigation                                                  */
/* ------------------------------------------------------------------ */

/**
 * Which project pages are *relevant* to a role.
 *
 * This is visibility, not authority — `can()` still decides what may be edited,
 * and a page listed here for a role that cannot edit it opens read-only exactly
 * as before. What changed is that the workspace no longer shows all five tabs
 * to everybody: a Site Engineer has no reason to carry a Billing tab he can
 * only look at.
 *
 * A page left out is **not** blocked. It has no route guard, so a link from the
 * record trail, the Approvals inbox or a dashboard still opens it — with a
 * "Viewing <team> record" note so the reader knows they have stepped outside
 * their own workspace. Leaving a page out of this list only takes it out of the
 * navigation.
 *
 * Order does not matter: the workspace groups these under the tabs in
 * `WORKSPACE_TABS`, so the on-screen order is always the chart's order.
 */
export const PROJECT_NAV: Record<Role, Resource[]> = {
  /* Senior project manager — owns the budget and the contract, approves the
     indent (A2) and holds the cross-team C3 step in the bill chain. Carries
     every tab. */
  project_head: [
    "dpr",
    "site_tasks",
    "work_done",
    "programme",
    "boq",
    "budget_vs_actual",
    "indents",
    "indent_approval",
    "comparatives",
    "purchase_approval",
    "purchase_orders",
    "grn",
    "vendor_bills",
    "returns",
    "site_stock",
    "gate_pass",
    "transfer_orders",
    "measurements",
    "ra_bills",
    "certification",
    "handed_over",
    "drawings",
    "transmittals",
    "work_orders",
  ],

  /* Project engineer — everything on the ground. Raises the indent and
     records the GRN; issues stock and passes material out at the gate. Reads
     the BOQ for quantity balance, and never sees a rupee (see VALUE_BLIND). */
  site_engineer: [
    "dpr",
    "site_tasks",
    "work_done",
    "programme",
    "boq",
    "budget_vs_actual",
    "indents",
    "grn",
    "site_stock",
    "gate_pass",
    "drawings",
    "transmittals",
  ],

  /* Purchase officer — the procurement thread end to end, and the budget
     read-only to see what a line can bear. No site, stores or billing. */
  purchase_officer: [
    "boq",
    "budget_vs_actual",
    "indents",
    "indent_approval",
    "comparatives",
    "purchase_approval",
    "purchase_orders",
    "grn",
    "vendor_bills",
    "returns",
  ],

  /* Manager procurement — approves the purchase (B2) and owns the supply
     contracts. Reads the budget; nothing on site. */
  purchase_head: [
    "boq",
    "budget_vs_actual",
    "indents",
    "indent_approval",
    "comparatives",
    "purchase_approval",
    "purchase_orders",
    "grn",
    "vendor_bills",
    "returns",
    "work_orders",
  ],

  /* QS — measures (C1) and bills (C2) against the contract. Needs the site's
     progress and the drawings it was built to; quantities only on the BOQ. */
  project_qs: [
    "dpr",
    "site_tasks",
    "work_done",
    "programme",
    "boq",
    "budget_vs_actual",
    "measurements",
    "ra_bills",
    "certification",
    "handed_over",
    "drawings",
    "transmittals",
    "work_orders",
  ],

  /* Billing head — certifies (C4). Full budget, procurement read-only to tie
     material cost back to the bill, and the contract behind it. */
  qs_head: [
    "boq",
    "budget_vs_actual",
    "indents",
    "comparatives",
    "purchase_orders",
    "grn",
    "vendor_bills",
    "measurements",
    "ra_bills",
    "certification",
    "handed_over",
    "work_orders",
  ],

  /* GM / management — reads the whole project. Final link in the bill chain. */
  hod: [
    "dpr",
    "site_tasks",
    "work_done",
    "programme",
    "boq",
    "budget_vs_actual",
    "indents",
    "indent_approval",
    "comparatives",
    "purchase_approval",
    "purchase_orders",
    "grn",
    "vendor_bills",
    "returns",
    "site_stock",
    "gate_pass",
    "transfer_orders",
    "measurements",
    "ra_bills",
    "certification",
    "handed_over",
    "drawings",
    "transmittals",
    "work_orders",
  ],
};

/* ------------------------------------------------------------------ */
/* Role x tab matrix                                                   */
/* ------------------------------------------------------------------ */

/**
 * Which of the eight workspace tabs each role carries.
 *
 * This is the client-approved matrix, and it is the **seed** for the editable
 * copy behind `/masters/permissions`: the screen reads this, the reader may
 * change it, and the overlay is what `projectTabsFor()` actually consults. Keep
 * it as plain data — in Postgres it becomes a `role_tab_access` table, and the
 * Masters screen becomes writes against it.
 *
 * A tab turned off here is **hidden**, not disabled. An empty tab, or one full
 * of controls that do nothing, only raises questions; a role that has no
 * business in Billing simply has no Billing tab. The pages behind it keep
 * working — a link from the record trail, an approval or a dashboard still
 * opens them read-only, marked as another team's record. See PROJECT_NAV.
 */
export type WorkspaceTabKey =
  | "overview"
  | "progress"
  | "budget"
  | "procurement"
  | "stores"
  | "billing"
  | "drawings"
  | "contracts";

export const WORKSPACE_TAB_KEYS: readonly WorkspaceTabKey[] = [
  "overview",
  "progress",
  "budget",
  "procurement",
  "stores",
  "billing",
  "drawings",
  "contracts",
] as const;

export type RoleTabAccess = Record<WorkspaceTabKey, boolean>;

export const ROLE_TAB_ACCESS: Record<Role, RoleTabAccess> = {
  //              overview progress budget procurement stores billing drawings contracts
  project_head:   tabs("y", "y", "y", "y", "y", "y", "y", "y"),
  site_engineer:  tabs("y", "y", "y", "y", "y", "n", "y", "n"),
  purchase_officer: tabs("n", "n", "y", "y", "n", "n", "n", "n"),
  purchase_head:  tabs("n", "n", "y", "y", "n", "n", "n", "y"),
  project_qs:     tabs("y", "y", "y", "n", "n", "y", "y", "y"),
  qs_head:        tabs("y", "n", "y", "y", "n", "y", "n", "y"),
  hod:            tabs("y", "y", "y", "y", "y", "y", "y", "y"),
};

function tabs(
  overview: "y" | "n",
  progress: "y" | "n",
  budget: "y" | "n",
  procurement: "y" | "n",
  stores: "y" | "n",
  billing: "y" | "n",
  drawings: "y" | "n",
  contracts: "y" | "n",
): RoleTabAccess {
  return {
    overview: overview === "y",
    progress: progress === "y",
    budget: budget === "y",
    procurement: procurement === "y",
    stores: stores === "y",
    billing: billing === "y",
    drawings: drawings === "y",
    contracts: contracts === "y",
  };
}

/**
 * What each role sees on a project's Overview.
 *
 * Same widget ids, same registry and same query services as the role dashboard
 * — the only difference is that the scope is narrowed to the one project. The
 * dashboard answers "where is my work?", the overview answers "where is this
 * project, from where I sit?".
 */
export const PROJECT_OVERVIEW_LAYOUTS: Record<Role, DashboardSlot[]> = {
  /*
   * Four tiles here too, and the same reasoning: the Site Engineer's Overview
   * ran to eight, so the thing he opens the app to do — file today's report —
   * was the second of eight panels and below the fold on a phone.
   *
   * Overview keeps its KPI row, unlike My work. Here the figures *are* the
   * job: "what is the state of this project" is the question the tab is for,
   * and the row answers it in one line. The panels under it then say what to
   * do about it, and anything that is neither has moved to the tab that owns
   * it — deliveries to Procurement, stock to Stores, the certification
   * pipeline to Billing, issued-vs-measured to Budget.
   */

  // The budget position, then what the budget says is going wrong.
  project_head: [
    { widget_id: "kpis", size: "full" },
    { widget_id: "action_items", size: "full", emphasis: true },
    { widget_id: "over_budget_lines", size: "md" },
    { widget_id: "work_orders_near_limit", size: "md" },
  ],
  // The day on site. The DPR call to action outranks everything, including
  // the figures — it disappears the moment today's report exists.
  site_engineer: [
    { widget_id: "dpr_cta", size: "full", emphasis: true },
    { widget_id: "kpis", size: "full" },
    { widget_id: "action_items", size: "full", emphasis: true },
    { widget_id: "todays_tasks", size: "full" },
  ],
  purchase_officer: [
    { widget_id: "kpis", size: "full" },
    { widget_id: "action_items", size: "full", emphasis: true },
    { widget_id: "indent_pipeline", size: "md" },
    { widget_id: "overdue_pos", size: "md" },
  ],
  purchase_head: [
    { widget_id: "kpis", size: "full" },
    { widget_id: "action_items", size: "full", emphasis: true },
    { widget_id: "indent_pipeline", size: "md" },
    { widget_id: "overdue_pos", size: "md" },
  ],
  // Ready to measure, the sheets, and how far each contractor has got.
  project_qs: [
    { widget_id: "kpis", size: "full" },
    { widget_id: "action_items", size: "full", emphasis: true },
    { widget_id: "certification_pipeline", size: "md" },
    { widget_id: "contractor_summary", size: "md" },
  ],
  // The chain, and the bills that have stopped moving in it.
  qs_head: [
    { widget_id: "kpis", size: "full" },
    { widget_id: "action_items", size: "full", emphasis: true },
    { widget_id: "certification_pipeline", size: "md" },
    { widget_id: "stuck_bills", size: "md" },
  ],
  hod: [
    { widget_id: "kpis", size: "full" },
    { widget_id: "action_items", size: "full", emphasis: true },
    { widget_id: "certification_pipeline", size: "md" },
    { widget_id: "stuck_bills", size: "md" },
  ],
};

export function projectOverviewLayoutFor(role: Role): DashboardSlot[] {
  return PROJECT_OVERVIEW_LAYOUTS[role];
}

/**
 * Resources that live inside a project workspace. Masters, ledgers and reports
 * are not among them, so they never carry the "viewing another team" note.
 */
const PROJECT_PAGES: readonly Resource[] = [
  "boq",
  "work_orders",
  "indent_approval",
  "budget_vs_actual",
  "site_tasks",
  "indents",
  "dpr",
  "work_done",
  "grn",
  "site_stock",
  "comparatives",
  "purchase_approval",
  "purchase_orders",
  "vendor_bills",
  "returns",
  "measurements",
  "ra_bills",
  "certification",
  "handed_over",
];

/** Project pages this role carries in its workspace navigation. */
export function projectNavFor(role: Role): Resource[] {
  return PROJECT_NAV[role];
}

/**
 * True when the page belongs to this role's workspace. False does not mean
 * "blocked" — it means the page opens as another team's record. See PROJECT_NAV.
 */
export function inProjectNav(role: Role, resource: Resource): boolean {
  return PROJECT_NAV[role].includes(resource);
}

/**
 * True when the role has opened a project page that is not in its own
 * workspace — reached from a record trail, an approval or a dashboard link.
 * The page still renders; it just says whose record it is.
 */
export function viewingOtherTeamRecord(role: Role, resource: Resource): boolean {
  return PROJECT_PAGES.includes(resource) && !inProjectNav(role, resource);
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/** The one permission check. Every page, button and service goes through this. */
export function can(role: Role, action: Action, resource: Resource): boolean {
  if (action === "view") return !(VIEW_DENIED[role] ?? []).includes(resource);
  if (action === "view_values") {
    if (!can(role, "view", resource)) return false;
    /*
     * `rates` is the data class, not a page: every rate, landed cost, PO value
     * and bill amount in the system. A role denied it sees no money anywhere,
     * on any screen — stated once here rather than as a list of resources that
     * goes stale the first time someone adds a page. It is the same boolean
     * `redactMoney` reads, so the payload and the screen can never disagree.
     *
     * The project engineer is the role this is for. They need the quantity
     * balance on a BOQ line to raise an indent, and nothing else about it.
     */
    if (resource !== "rates" && !can(role, "view", "rates")) return false;
    return !(VALUE_BLIND[role] ?? []).includes(resource);
  }
  return (GRANTS[role][resource] ?? []).includes(action);
}

export function teamOf(role: Role): Team {
  return ROLE_TEAM[role];
}

export function ownerTeamOf(resource: Resource): Team {
  return RESOURCE_META[resource].owner_team;
}

/** True when the role has no mutating grant at all on the resource. */
export function isReadOnly(role: Role, resource: Resource): boolean {
  return (GRANTS[role][resource] ?? []).length === 0;
}

/** Resources this role may edit, used by the nav to decide "Owned by" tags. */
export function editablePages(role: Role): Resource[] {
  return (Object.keys(GRANTS[role]) as Resource[]).filter((r) => !isReadOnly(role, r));
}

/**
 * Which inbox a role carries in the top bar.
 *
 * A role that holds an approval step gets "Approvals" — things waiting on it.
 * A role that only raises work gets "My Requests" — things it is waiting on.
 * Nobody needs both: an approver's own submissions come back to them through
 * the chain, and a requester has no queue to clear.
 */
export type InboxKind = "approvals" | "my_requests";

export function inboxFor(role: Role): InboxKind {
  return approvalStepsFor(role).length > 0 ? "approvals" : "my_requests";
}

/** Approval steps this role is responsible for, across all chains. */
export function approvalStepsFor(role: Role): ApprovalStepSpec[] {
  return Object.values(APPROVAL_CHAINS)
    .flat()
    .filter((step) => step.required_role === role);
}

export const ALL_ROLES: readonly Role[] = ROLES;

/* ------------------------------------------------------------------ */
/* Global navigation                                                   */
/* ------------------------------------------------------------------ */

/**
 * The top bar, per role.
 *
 * Every role gets its own bar rather than a shared one filtered down: a Site
 * Engineer's day is "Today / Daily Reports / Material / Work Progress", not a
 * subset of the Project Head's portfolio view. Labels are the words the role
 * uses, not the resource keys.
 *
 * `project_segment` is a path under /projects/[projectId]/. `TopNav` resolves
 * it against the active project — automatically for the single-project roles
 * (Site Engineer, Project QS), and through the top-bar project switcher for
 * the roles posted across the portfolio.
 *
 * `enabled: false` hides the item. It is how a route that has not been built
 * stays out of the bar without showing the reader a dead link or dev copy; a
 * later prompt flips it to true.
 */
export type TopNavItem = {
  label: string;
  /** Absolute route. Mutually exclusive with `project_segment`. */
  href?: string;
  /** Path under /projects/[projectId]/, resolved against the active project. */
  project_segment?: string;
  resource?: Resource;
  children?: TopNavItem[];
  enabled: boolean;
};

/**
 * The top bar: the three global levels, plus the one inbox this role gets.
 *
 * It used to be a per-role list of a dozen items, many of them deep links into
 * a project — which is how navigation came to be organised around roles in the
 * first place. Now the bar holds only what is genuinely global, and everything
 * project-shaped is reached by picking the project.
 *
 * My work · Projects · Masters · <inbox> · Workflow
 *
 * Every role gets the same bar. What differs is the inbox — an approver gets
 * Approvals, a role that only raises work gets My Requests (`inboxFor`) — and
 * what each of those destinations contains once opened.
 */
const MY_WORK: TopNavItem = { label: "My work", href: "/", enabled: true };
const PROJECTS: TopNavItem = {
  label: "Projects",
  href: "/projects",
  resource: "projects",
  enabled: true,
};
const MASTERS: TopNavItem = {
  label: "Masters",
  href: "/masters",
  enabled: true,
  children: [
    { label: "Materials", href: "/masters/materials", resource: "materials", enabled: true },
    { label: "Contractors", href: "/masters/contractors", resource: "contractors", enabled: true },
    { label: "Suppliers", href: "/masters/suppliers", resource: "suppliers", enabled: true },
    { label: "BOQ library", href: "/masters/boq-library", resource: "boq_library", enabled: true },
    { label: "PO terms", href: "/masters/po-terms", resource: "po_clauses", enabled: true },
    {
      label: "Numbering",
      href: "/masters/numbering",
      resource: "document_numbering",
      enabled: true,
    },
    { label: "Users & roles", href: "/masters/users", resource: "users", enabled: true },
    {
      label: "Permissions matrix",
      href: "/masters/permissions",
      resource: "permissions_matrix",
      enabled: true,
    },
  ],
};
const APPROVALS: TopNavItem = {
  label: "Approvals",
  href: "/approvals",
  resource: "approvals_inbox",
  enabled: true,
};
const MY_REQUESTS: TopNavItem = { label: "My Requests", href: "/my-requests", enabled: true };
const WORKFLOW: TopNavItem = { label: "Workflow", href: "/workflow", enabled: true };

function barFor(role: Role): TopNavItem[] {
  return [
    MY_WORK,
    PROJECTS,
    MASTERS,
    inboxFor(role) === "approvals" ? APPROVALS : MY_REQUESTS,
    WORKFLOW,
  ];
}

export const TOP_NAV: Record<Role, TopNavItem[]> = {
  project_head: barFor("project_head"),
  site_engineer: barFor("site_engineer"),
  purchase_officer: barFor("purchase_officer"),
  purchase_head: barFor("purchase_head"),
  project_qs: barFor("project_qs"),
  qs_head: barFor("qs_head"),
  hod: barFor("hod"),
};

export function topNavFor(role: Role): TopNavItem[] {
  return TOP_NAV[role]
    .filter((item) => item.enabled)
    .map((item) =>
      item.children ? { ...item, children: item.children.filter((c) => c.enabled) } : item,
    )
    .filter((item) => !item.children || item.children.length > 0);
}

/**
 * Roles posted to exactly one site. Their pages resolve to that project with
 * no picker at all — a Site Engineer has never needed to choose a project.
 */
export function isSingleProjectRole(role: Role): boolean {
  return role === "site_engineer" || role === "project_qs";
}

/* ------------------------------------------------------------------ */
/* Create actions — the "+ New" menu                                   */
/* ------------------------------------------------------------------ */

/**
 * What a role can start from anywhere in the app. Derived from GRANTS, so a
 * role never sees a create action `can()` would refuse.
 */
export type CreateAction = {
  resource: Resource;
  label: string;
  href?: string;
  project_segment?: string;
  /**
   * True when the action opens its own page rather than a dialog on the list.
   * The four long-form documents are full-page editors, so "+ New" links
   * straight to them instead of `?new=1`, which they no longer answer.
   */
  full_page?: boolean;
};

/**
 * `editor: true` means the record is written on its own page, not in a dialog.
 * Comparative, Joint Measurement, RA Bill and the Purchase Order each carry a
 * line grid and several minutes of typing, which a modal could not hold.
 */
const CREATE_ACTION_META: Partial<Record<Resource, { label: string; editor?: boolean }>> = {
  indents: { label: "Raise indent" },
  site_tasks: { label: "Add site task" },
  grn: { label: "Record a delivery" },
  site_stock: { label: "Issue material" },
  comparatives: { label: "New comparative", editor: true },
  purchase_orders: { label: "Raise purchase order", editor: true },
  vendor_bills: { label: "Enter vendor bill" },
  returns: { label: "Raise a return" },
  materials: { label: "Add material" },
  suppliers: { label: "Add supplier" },
  contractors: { label: "Add contractor" },
  measurements: { label: "New measurement sheet", editor: true },
  ra_bills: { label: "New RA bill", editor: true },
  boq: { label: "Add BOQ line" },
  work_orders: { label: "New work order" },
};

export function createActionsFor(role: Role): CreateAction[] {
  return (Object.keys(CREATE_ACTION_META) as Resource[])
    .filter((resource) => can(role, "create", resource))
    .map((resource) => {
      const meta = RESOURCE_META[resource];
      const action = CREATE_ACTION_META[resource]!;
      const segment = meta.href.replace(/^\//, "") + (action.editor ? "/new" : "");
      return {
        resource,
        label: action.label,
        full_page: action.editor ?? false,
        ...(meta.project_scoped ? { project_segment: segment } : { href: `/${segment}` }),
      };
    });
}
