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
  // Cross-cutting
  "rates",
  "projects",
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
    href: "/budget/work-orders",
    project_scoped: true,
  },
  indent_approval: {
    key: "indent_approval",
    label: "Indent Approval",
    owner_team: "project_budget",
    step_codes: ["A2"],
    href: "/budget/indent-approval",
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
    href: "/site/tasks",
    project_scoped: true,
  },
  indents: {
    key: "indents",
    label: "Material Indents",
    owner_team: "site_execution",
    step_codes: ["A2"],
    href: "/site/indents",
    project_scoped: true,
  },
  dpr: {
    key: "dpr",
    label: "DPR & Labour",
    owner_team: "site_execution",
    step_codes: ["A3"],
    href: "/site/dpr",
    project_scoped: true,
  },
  work_done: {
    key: "work_done",
    label: "Work Done vs Balance",
    owner_team: "site_execution",
    step_codes: ["A4"],
    href: "/site/work-done",
    project_scoped: true,
  },
  grn: {
    key: "grn",
    label: "Goods Receipt (GRN)",
    owner_team: "site_execution",
    step_codes: ["B5", "B6"],
    href: "/site/grn",
    project_scoped: true,
  },
  site_stock: {
    key: "site_stock",
    label: "Site Stock & Issue",
    owner_team: "site_execution",
    step_codes: ["A5"],
    href: "/site/stock",
    project_scoped: true,
  },

  /* --- Purchase & stores (green) --- */
  comparatives: {
    key: "comparatives",
    label: "Vendor Comparatives",
    owner_team: "purchase_stores",
    step_codes: ["B1"],
    href: "/purchase/comparatives",
    project_scoped: true,
  },
  purchase_approval: {
    key: "purchase_approval",
    label: "Approval to Purchase",
    owner_team: "purchase_stores",
    step_codes: ["B2"],
    href: "/purchase/approval",
    project_scoped: true,
  },
  purchase_orders: {
    key: "purchase_orders",
    label: "Purchase Orders",
    owner_team: "purchase_stores",
    step_codes: ["B3", "B4"],
    href: "/purchase/purchase-orders",
    project_scoped: true,
  },
  vendor_bills: {
    key: "vendor_bills",
    label: "Vendor Bill Check",
    owner_team: "purchase_stores",
    step_codes: ["B7"],
    href: "/purchase/vendor-bills",
    project_scoped: true,
  },
  returns: {
    key: "returns",
    label: "Returns",
    owner_team: "purchase_stores",
    step_codes: [],
    href: "/purchase/returns",
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

export const ROLE_LABEL: Record<Role, string> = {
  project_head: "Project Head",
  site_engineer: "Site Engineer",
  purchase_officer: "Purchase Officer",
  purchase_head: "Purchase Head",
  project_qs: "Project QS",
  qs_head: "QS Head",
  hod: "HoD",
};

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
  },

  /* Purchase Head — approval to purchase (B2) and nothing else. */
  purchase_head: {
    purchase_approval: ["approve"],
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

  /* HoD — final link in the bill chain (C4). */
  hod: {
    certification: ["approve"],
  },
};

/**
 * Resources whose monetary columns are hidden from a role.
 * Site Engineer must not see supplier rates or PO values.
 */
const VALUE_BLIND: Partial<Record<Role, Resource[]>> = {
  site_engineer: [
    "rates",
    "suppliers",
    "comparatives",
    "purchase_approval",
    "purchase_orders",
    "vendor_bills",
    "supplier_ledger",
    "grn",
    "site_stock",
    // Actual is issued material at PO rates plus certified contractor work;
    // showing it would let the rates be worked back out.
    "budget_vs_actual",
  ],
};

/**
 * Resources a role cannot see at all.
 *
 * Pages are never listed here — navigation is never disabled. Only data classes
 * like `rates` are, which is how `can(role, "view", "rates")` comes back false
 * for the Site Engineer on the GRN and Stock screens.
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
 * The dashboard each role gets, in order. The widget registry in
 * `src/components/dashboard/widgets` maps every `widget_id` to a component;
 * nothing here knows what a widget looks like.
 *
 * "Needs your action" always sits directly under the KPI row — it is the
 * reason the page exists.
 */
export const DASHBOARD_LAYOUTS: Record<Role, DashboardSlot[]> = {
  project_head: [
    { widget_id: "kpis", size: "full" },
    { widget_id: "action_items", size: "full", emphasis: true },
    { widget_id: "project_cards", size: "full" },
    { widget_id: "over_budget_lines", size: "md" },
    { widget_id: "work_orders_near_limit", size: "md" },
    { widget_id: "issued_vs_measured_flags", size: "full" },
  ],
  site_engineer: [
    { widget_id: "kpis", size: "full" },
    { widget_id: "action_items", size: "full", emphasis: true },
    { widget_id: "todays_tasks", size: "lg" },
    { widget_id: "dpr_streak", size: "md" },
    { widget_id: "indent_pipeline", size: "md" },
    { widget_id: "expected_deliveries", size: "lg" },
    { widget_id: "low_stock", size: "md" },
  ],
  purchase_officer: [
    { widget_id: "kpis", size: "full" },
    { widget_id: "action_items", size: "full", emphasis: true },
    { widget_id: "overdue_pos", size: "md" },
    { widget_id: "unbilled_grns", size: "md" },
    { widget_id: "payables_by_supplier", size: "full" },
  ],
  purchase_head: [
    { widget_id: "kpis", size: "full" },
    { widget_id: "action_items", size: "full", emphasis: true },
    { widget_id: "spend_by_category", size: "md", emphasis: true },
    { widget_id: "l1_adherence", size: "md", emphasis: true },
    { widget_id: "overdue_pos", size: "md" },
    { widget_id: "unbilled_grns", size: "md" },
    { widget_id: "payables_by_supplier", size: "full" },
  ],
  project_qs: [
    { widget_id: "kpis", size: "full" },
    { widget_id: "action_items", size: "full", emphasis: true },
    { widget_id: "certification_pipeline", size: "full" },
    { widget_id: "contractor_summary", size: "full" },
  ],
  qs_head: [
    { widget_id: "kpis", size: "full" },
    { widget_id: "action_items", size: "full", emphasis: true },
    { widget_id: "certification_pipeline", size: "full" },
    { widget_id: "stuck_bills", size: "full" },
  ],
  hod: [
    { widget_id: "kpis", size: "full" },
    { widget_id: "action_items", size: "full", emphasis: true },
    { widget_id: "portfolio_budget", size: "full", emphasis: true },
    { widget_id: "certification_pipeline", size: "full" },
    { widget_id: "stuck_bills", size: "full" },
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
  // Owns the budget; watches the site and holds the cross-team C3 step.
  project_head: [
    "boq",
    "work_orders",
    "indent_approval",
    "budget_vs_actual",
    "dpr",
    "work_done",
    "site_stock",
    "certification",
  ],
  // Everything on the ground, plus work-order quantities (never rates).
  site_engineer: [
    "site_tasks",
    "indents",
    "dpr",
    "work_done",
    "grn",
    "site_stock",
    "work_orders",
  ],
  purchase_officer: [
    "comparatives",
    "purchase_approval",
    "purchase_orders",
    "vendor_bills",
    "returns",
    "grn",
    "site_stock",
  ],
  purchase_head: [
    "comparatives",
    "purchase_approval",
    "purchase_orders",
    "vendor_bills",
    "returns",
    "grn",
    "site_stock",
  ],
  // Measures and bills; reads what the site recorded and the rates it bills at.
  project_qs: [
    "measurements",
    "ra_bills",
    "certification",
    "handed_over",
    "work_done",
    "dpr",
    "work_orders",
  ],
  // The approvers only need the bills in front of them.
  qs_head: ["ra_bills", "certification", "handed_over"],
  hod: ["ra_bills", "certification", "handed_over", "budget_vs_actual"],
};

/**
 * What each role sees on a project's Overview.
 *
 * Same widget ids, same registry and same query services as the role dashboard
 * — the only difference is that the scope is narrowed to the one project. The
 * dashboard answers "where is my work?", the overview answers "where is this
 * project, from where I sit?".
 */
export const PROJECT_OVERVIEW_LAYOUTS: Record<Role, DashboardSlot[]> = {
  // Budget, actual and variance, then what the budget says is going wrong.
  project_head: [
    { widget_id: "kpis", size: "full" },
    { widget_id: "action_items", size: "full", emphasis: true },
    { widget_id: "over_budget_lines", size: "md" },
    { widget_id: "work_orders_near_limit", size: "md" },
    { widget_id: "issued_vs_measured_flags", size: "full" },
  ],
  // The day on site: what is running, what was reported, what is coming in.
  site_engineer: [
    { widget_id: "kpis", size: "full" },
    { widget_id: "action_items", size: "full", emphasis: true },
    { widget_id: "todays_tasks", size: "lg" },
    { widget_id: "dpr_streak", size: "md" },
    { widget_id: "indent_pipeline", size: "md" },
    { widget_id: "expected_deliveries", size: "lg" },
    { widget_id: "low_stock", size: "md" },
  ],
  purchase_officer: [
    { widget_id: "kpis", size: "full" },
    { widget_id: "action_items", size: "full", emphasis: true },
    { widget_id: "indent_pipeline", size: "md" },
    { widget_id: "overdue_pos", size: "md" },
    { widget_id: "unbilled_grns", size: "full" },
  ],
  purchase_head: [
    { widget_id: "kpis", size: "full" },
    { widget_id: "action_items", size: "full", emphasis: true },
    { widget_id: "indent_pipeline", size: "md" },
    { widget_id: "overdue_pos", size: "md" },
    { widget_id: "unbilled_grns", size: "full" },
  ],
  // Ready to measure, the sheets, the chain, and how far each contractor is.
  project_qs: [
    { widget_id: "kpis", size: "full" },
    { widget_id: "action_items", size: "full", emphasis: true },
    { widget_id: "certification_pipeline", size: "full" },
    { widget_id: "contractor_summary", size: "full" },
  ],
  // The chain with values, and certified-to-date against the order value.
  qs_head: [
    { widget_id: "kpis", size: "full" },
    { widget_id: "action_items", size: "full", emphasis: true },
    { widget_id: "certification_pipeline", size: "full" },
    { widget_id: "contractor_summary", size: "full" },
    { widget_id: "stuck_bills", size: "full" },
  ],
  hod: [
    { widget_id: "kpis", size: "full" },
    { widget_id: "action_items", size: "full", emphasis: true },
    { widget_id: "portfolio_budget", size: "full", emphasis: true },
    { widget_id: "certification_pipeline", size: "full" },
    { widget_id: "contractor_summary", size: "full" },
    { widget_id: "stuck_bills", size: "full" },
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

const DASHBOARD: TopNavItem = { label: "Dashboard", href: "/", enabled: true };
const APPROVALS: TopNavItem = {
  label: "Approvals",
  href: "/approvals",
  resource: "approvals_inbox",
  enabled: true,
};
const MY_REQUESTS: TopNavItem = { label: "My Requests", href: "/my-requests", enabled: true };

export const TOP_NAV: Record<Role, TopNavItem[]> = {
  site_engineer: [
    { label: "Today", href: "/", enabled: true },
    // No standalone daily-reports route yet; DPR lives in the workspace.
    { label: "Daily Reports", project_segment: "site/dpr", resource: "dpr", enabled: false },
    {
      label: "Material",
      enabled: true,
      children: [
        { label: "Indents", project_segment: "site/indents", resource: "indents", enabled: true },
        { label: "Deliveries & GRN", project_segment: "site/grn", resource: "grn", enabled: true },
        { label: "Stock", project_segment: "site/stock", resource: "site_stock", enabled: true },
      ],
    },
    {
      label: "Work Progress",
      project_segment: "site/work-done",
      resource: "work_done",
      enabled: true,
    },
    MY_REQUESTS,
  ],

  project_head: [
    DASHBOARD,
    { label: "Projects", href: "/projects", resource: "projects", enabled: true },
    APPROVALS,
    {
      label: "Budget",
      enabled: true,
      children: [
        { label: "BOQ", project_segment: "budget/boq", resource: "boq", enabled: true },
        {
          label: "Work Orders",
          project_segment: "budget/work-orders",
          resource: "work_orders",
          enabled: true,
        },
        {
          label: "Budget vs Actual",
          project_segment: "budget/budget-vs-actual",
          resource: "budget_vs_actual",
          enabled: true,
        },
      ],
    },
    { label: "Contractors", href: "/masters/contractors", resource: "contractors", enabled: true },
    // Portfolio reporting is not built.
    { label: "Reports", href: "/reports/budget-vs-actual", resource: "reports", enabled: false },
  ],

  purchase_officer: [
    DASHBOARD,
    // Cross-project purchase queue is not built; comparatives and POs live in
    // the project workspace.
    { label: "Purchase Desk", project_segment: "purchase/comparatives", resource: "comparatives", enabled: false },
    { label: "Deliveries", project_segment: "site/grn", resource: "grn", enabled: true },
    {
      label: "Vendor Bills",
      project_segment: "purchase/vendor-bills",
      resource: "vendor_bills",
      enabled: true,
    },
    {
      label: "Suppliers",
      enabled: true,
      children: [
        { label: "Supplier Master", href: "/masters/suppliers", resource: "suppliers", enabled: true },
        {
          label: "Supplier Ledger",
          href: "/ledgers/suppliers",
          resource: "supplier_ledger",
          enabled: true,
        },
      ],
    },
    { label: "Materials", href: "/masters/materials", resource: "materials", enabled: true },
    MY_REQUESTS,
  ],

  purchase_head: [
    DASHBOARD,
    APPROVALS,
    { label: "Purchase Desk", project_segment: "purchase/comparatives", resource: "comparatives", enabled: false },
    {
      label: "Suppliers",
      enabled: true,
      children: [
        { label: "Supplier Master", href: "/masters/suppliers", resource: "suppliers", enabled: true },
        {
          label: "Supplier Ledger",
          href: "/ledgers/suppliers",
          resource: "supplier_ledger",
          enabled: true,
        },
      ],
    },
    // Portfolio spend analysis is not built.
    { label: "Spend", href: "/reports/budget-vs-actual", resource: "reports", enabled: false },
  ],

  project_qs: [
    DASHBOARD,
    {
      label: "Measurements",
      project_segment: "billing/measurements",
      resource: "measurements",
      enabled: true,
    },
    { label: "RA Bills", project_segment: "billing/ra-bills", resource: "ra_bills", enabled: true },
    APPROVALS,
    {
      label: "Contractors",
      enabled: true,
      children: [
        { label: "Contractor Master", href: "/masters/contractors", resource: "contractors", enabled: true },
        {
          label: "Contractor Ledger",
          href: "/ledgers/contractors",
          resource: "contractor_ledger",
          enabled: true,
        },
      ],
    },
  ],

  qs_head: [
    DASHBOARD,
    APPROVALS,
    {
      label: "Bills",
      enabled: true,
      children: [
        { label: "RA Bills", project_segment: "billing/ra-bills", resource: "ra_bills", enabled: true },
        {
          label: "Certification",
          project_segment: "billing/certification",
          resource: "certification",
          enabled: true,
        },
        {
          label: "Handed Over",
          project_segment: "billing/handed-over",
          resource: "handed_over",
          enabled: true,
        },
      ],
    },
    {
      label: "Contractors",
      enabled: true,
      children: [
        { label: "Contractor Master", href: "/masters/contractors", resource: "contractors", enabled: true },
        {
          label: "Contractor Ledger",
          href: "/ledgers/contractors",
          resource: "contractor_ledger",
          enabled: true,
        },
      ],
    },
    { label: "Reports", href: "/reports/budget-vs-actual", resource: "reports", enabled: false },
  ],

  hod: [
    DASHBOARD,
    APPROVALS,
    { label: "Projects", href: "/projects", resource: "projects", enabled: true },
    { label: "Reports", href: "/reports/budget-vs-actual", resource: "reports", enabled: false },
    {
      label: "Ledgers",
      enabled: true,
      children: [
        {
          label: "Contractor Ledger",
          href: "/ledgers/contractors",
          resource: "contractor_ledger",
          enabled: true,
        },
        {
          label: "Supplier Ledger",
          href: "/ledgers/suppliers",
          resource: "supplier_ledger",
          enabled: true,
        },
        {
          label: "Accounts Handover",
          href: "/accounts-handover",
          resource: "accounts_handover",
          enabled: true,
        },
      ],
    },
  ],
};

/** The bar this role actually sees: enabled items, with enabled children only. */
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
   * The three long-form documents are full-page editors, so "+ New" links
   * straight to them instead of `?new=1`, which they no longer answer.
   */
  full_page?: boolean;
};

/**
 * `editor: true` means the record is written on its own page, not in a dialog.
 * Comparative, Joint Measurement and RA Bill each carry a line grid and
 * several minutes of typing, which a modal could not hold.
 */
const CREATE_ACTION_META: Partial<Record<Resource, { label: string; editor?: boolean }>> = {
  indents: { label: "Raise indent" },
  site_tasks: { label: "Add site task" },
  dpr: { label: "File today's DPR" },
  grn: { label: "Record a delivery" },
  site_stock: { label: "Issue material" },
  comparatives: { label: "New comparative", editor: true },
  purchase_orders: { label: "Raise purchase order" },
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
