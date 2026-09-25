import { getRepositories } from "@/lib/data";
import { APPROVAL_CHAINS, ROLE_LABEL } from "@/config/permissions";
import { ageInDays, today } from "@/lib/clock";
import { formatDate, formatInrCompact } from "@/lib/format";
import { rupees } from "../pricing";
import { canSeeValues } from "./redaction";
import type { Role, StepCode, Team } from "@/lib/domain";

/**
 * Live counts for the workflow chart on a project's Overview.
 *
 * One query feeds every node, so the diagram can never disagree with itself.
 * Node ids match the boxes on the client-approved chart.
 */
export const FLOW_NODES = [
  "boq",
  "work_orders",
  "site_tasks",
  "material_indent",
  "indent_approval",
  "dpr",
  "work_done",
  "vendor_comparative",
  "approval_to_purchase",
  "purchase_order",
  "grn",
  "site_stock",
  "vendor_bill",
  "supplier_ledger",
  "joint_measurement",
  "ra_bill",
  "certified_bill",
  "budget_vs_actual",
  "accounts_handover",
] as const;

export type FlowNodeId = (typeof FLOW_NODES)[number];

export type FlowCount = {
  id: FlowNodeId;
  /** Box label, verbatim from the chart. */
  label: string;
  step_codes: StepCode[];
  team: Team;
  /** Records currently sitting at this stage. */
  count: number;
  /** How to read that number, e.g. "4 pending". */
  count_label: string;
  /** Second line where the stage carries money, e.g. Accounts Handover. */
  value_label: string | null;
  /** How many of those the current role can act on. */
  actionable: number;
  href: string;
};

export type FlowCounts = {
  project_id: string;
  nodes: Record<FlowNodeId, FlowCount>;
  /** Total actionable across the diagram, for the header. */
  total_actionable: number;
};

type NodeSpec = { label: string; step_codes: StepCode[]; team: Team; path: string };

/** Static shape of the chart. Colours follow CLAUDE.md — GRN is Site Execution. */
const NODE_SPECS: Record<FlowNodeId, NodeSpec> = {
  boq: { label: "BOQ & Budget", step_codes: [], team: "project_budget", path: "budget/boq" },
  work_orders: {
    label: "Work Orders & Rates",
    step_codes: [],
    team: "project_budget",
    path: "budget/work-orders",
  },
  site_tasks: {
    label: "Planned Site Tasks",
    step_codes: ["A1"],
    team: "site_execution",
    path: "site/tasks",
  },
  material_indent: {
    label: "Material Indent",
    step_codes: ["A2"],
    team: "site_execution",
    path: "site/indents",
  },
  indent_approval: {
    label: "Indent Approval",
    step_codes: ["A2"],
    team: "project_budget",
    path: "budget/indent-approval",
  },
  dpr: { label: "DPR & Labour", step_codes: ["A3"], team: "site_execution", path: "site/dpr" },
  work_done: {
    label: "Work Done v. Balance",
    step_codes: ["A4"],
    team: "site_execution",
    path: "site/work-done",
  },
  vendor_comparative: {
    label: "Vendor Comparative",
    step_codes: ["B1"],
    team: "purchase_stores",
    path: "purchase/comparatives",
  },
  approval_to_purchase: {
    label: "Approval to Purchase",
    step_codes: ["B2"],
    team: "purchase_stores",
    path: "purchase/approval",
  },
  purchase_order: {
    label: "Purchase Order",
    step_codes: ["B3", "B4"],
    team: "purchase_stores",
    path: "purchase/purchase-orders",
  },
  // The chart colours GRN green; the site records it, so it is orange here.
  grn: { label: "GRN", step_codes: ["B5", "B6"], team: "site_execution", path: "site/grn" },
  site_stock: {
    label: "Site Stock Balance",
    step_codes: ["A5"],
    team: "site_execution",
    path: "site/stock",
  },
  vendor_bill: {
    label: "Vendor Bill Check",
    step_codes: ["B7"],
    team: "purchase_stores",
    path: "purchase/vendor-bills",
  },
  supplier_ledger: {
    label: "Supplier Ledger",
    step_codes: [],
    team: "purchase_stores",
    path: "/ledgers/suppliers",
  },
  joint_measurement: {
    label: "Joint Measurement",
    step_codes: ["C1"],
    team: "billing_certification",
    path: "billing/measurements",
  },
  ra_bill: {
    label: "Contractor RA Bill",
    step_codes: ["C2"],
    team: "billing_certification",
    path: "billing/ra-bills",
  },
  certified_bill: {
    label: "Certified Bill",
    step_codes: ["C3", "C4"],
    team: "billing_certification",
    path: "billing/certification",
  },
  budget_vs_actual: {
    label: "Budget v. Actual",
    step_codes: [],
    team: "project_budget",
    path: "budget/budget-vs-actual",
  },
  accounts_handover: {
    label: "Accounts Handover",
    step_codes: ["B8", "C5"],
    team: "accounts",
    path: "/accounts-handover",
  },
};

export async function getFlowCounts(project_id: string, role: Role): Promise<FlowCounts> {
  const repos = getRepositories();
  const [
    boqLines,
    workOrders,
    woLines,
    tasks,
    indents,
    dprs,
    comparatives,
    comparativeLines,
    pos,
    grns,
    stock,
    vendorBills,
    ledger,
    measurements,
    raBills,
    returns,
  ] = await Promise.all([
    repos.boq.listByProject(project_id),
    repos.workOrders.listByProject(project_id),
    repos.workOrders.listLinesByProject(project_id),
    repos.siteTasks.listByProject(project_id),
    repos.indents.listByProject(project_id),
    repos.dprs.listByProject(project_id),
    repos.comparatives.listByProject(project_id),
    repos.comparatives.listLinesByProject(project_id),
    repos.purchaseOrders.listByProject(project_id),
    repos.grns.listByProject(project_id),
    repos.stock.listByProject(project_id),
    repos.vendorBills.listByProject(project_id),
    repos.supplierLedger.list(),
    repos.measurements.listByProject(project_id),
    repos.raBills.listByProject(project_id),
    repos.returns.listByProject(project_id),
  ]);

  const showValues = canSeeValues(role);
  const money = (n: number) => (showValues ? formatInrCompact(rupees(n)) : null);
  const now = today();

  /* ---- derived sets the nodes share ---- */
  const liveComparatives = new Set(
    comparatives.filter((c) => c.status !== "rejected" && c.status !== "sent_back").map((c) => c.id),
  );
  const committedIndents = new Set(
    comparativeLines.filter((l) => liveComparatives.has(l.comparative_id)).map((l) => l.indent_id),
  );
  const indentsToQuote = indents.filter(
    (i) =>
      (i.status === "approved" || i.status === "partially_approved") && !committedIndents.has(i.id),
  );
  const posWithComparative = new Set(pos.map((p) => p.comparative_id).filter(Boolean) as string[]);
  const billedGrns = new Set(vendorBills.flatMap((b) => b.grn_ids));
  const dueDeliveries = pos.filter(
    (p) => p.status === "sent" && ageInDays(p.expected_delivery_date) >= 0,
  );
  const unflaggedLines = woLines.filter(
    (l) => !l.ready_to_measure && l.done_qty - l.measured_qty > 0.5,
  );
  const readyLines = woLines.filter((l) => l.ready_to_measure);

  const stockBalances = new Map<string, number>();
  stock.forEach((e) =>
    stockBalances.set(
      e.material_id,
      (stockBalances.get(e.material_id) ?? 0) + e.quantity_in - e.quantity_out,
    ),
  );
  const materialsOnSite = [...stockBalances.values()].filter((v) => v > 0).length;

  const chainAt = (sequence: number) =>
    raBills.filter((b) => b.status === "in_certification" && b.current_sequence === sequence);
  const myChainStep = APPROVAL_CHAINS.ra_bill.find((s) => s.required_role === role);
  const inChain = raBills.filter((b) => b.status === "in_certification");

  const handedRa = raBills.filter((b) => b.status === "handed_over");
  const handedVendor = vendorBills.filter((b) => b.status === "handed_over");
  const handedValue = rupees(
    handedRa.reduce((s, b) => s + b.net_payable_amount, 0) +
      handedVendor.reduce((s, b) => s + b.bill_total_amount, 0),
  );

  const certifiedValue = rupees(
    raBills
      .filter((b) => b.status === "certified" || b.status === "handed_over")
      .reduce((s, b) => s + b.gross_amount, 0),
  );
  const issuedValue = rupees(
    (await repos.stock.listIssuesByProject(project_id)).reduce((s, i) => s + i.value, 0),
  );

  /**
   * Where bills sit. Naming every step at once overflows the chart box, so a
   * spread-out chain just says how many are in it — the certification pipeline
   * widget is where the per-step breakdown belongs.
   */
  const chainStages = APPROVAL_CHAINS.ra_bill
    .map((s) => ({ s, n: chainAt(s.sequence).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);
  const chainSummary =
    inChain.length === 0
      ? "None in the chain"
      : chainStages.length === 1
        ? `${chainStages[0].n} at ${ROLE_LABEL[chainStages[0].s.required_role]}`
        : `${inChain.length} in the chain`;

  const raw: Record<FlowNodeId, { count: number; count_label: string; value_label: string | null; actionable: number }> = {
    boq: {
      count: boqLines.length,
      count_label: `${boqLines.length} line${boqLines.length === 1 ? "" : "s"}`,
      value_label: money(boqLines.reduce((s, l) => s + l.amount, 0)),
      actionable: 0,
    },
    work_orders: {
      count: workOrders.length,
      count_label: `${workOrders.length} order${workOrders.length === 1 ? "" : "s"}`,
      value_label: money(workOrders.reduce((s, w) => s + w.order_value, 0)),
      actionable: 0,
    },
    site_tasks: {
      count: tasks.filter((t) => t.status === "in_progress").length,
      count_label: `${tasks.filter((t) => t.status === "in_progress").length} in progress`,
      value_label: null,
      actionable: 0,
    },
    material_indent: {
      count: indents.filter((i) => i.status !== "closed" && i.status !== "rejected").length,
      count_label: `${indents.filter((i) => i.status === "submitted").length} awaiting approval`,
      value_label: null,
      actionable: role === "site_engineer" ? 0 : 0,
    },
    indent_approval: {
      count: indents.filter((i) => i.status === "submitted").length,
      count_label: `${indents.filter((i) => i.status === "submitted").length} pending`,
      value_label: null,
      actionable:
        role === "project_head" ? indents.filter((i) => i.status === "submitted").length : 0,
    },
    dpr: {
      count: dprs.length,
      count_label: dprs.some((d) => d.report_date === now)
        ? "Today's report filed"
        : "Today's report pending",
      value_label: null,
      actionable:
        role === "site_engineer" && !dprs.some((d) => d.report_date === now) ? 1 : 0,
    },
    work_done: {
      count: woLines.filter((l) => l.done_qty > 0).length,
      count_label: `${readyLines.length} ready to measure`,
      value_label: null,
      actionable: role === "site_engineer" ? unflaggedLines.length : 0,
    },
    vendor_comparative: {
      count: comparatives.filter((c) => c.status === "draft" || c.status === "pending_approval")
        .length,
      count_label: `${indentsToQuote.length} indent${indentsToQuote.length === 1 ? "" : "s"} to quote`,
      value_label: null,
      actionable: role === "purchase_officer" ? indentsToQuote.length : 0,
    },
    approval_to_purchase: {
      count: comparatives.filter((c) => c.status === "pending_approval").length,
      count_label: `${comparatives.filter((c) => c.status === "pending_approval").length} pending`,
      value_label: money(
        comparatives
          .filter((c) => c.status === "pending_approval")
          .reduce((s, c) => s + c.total_selected_value, 0),
      ),
      actionable:
        role === "purchase_head"
          ? comparatives.filter((c) => c.status === "pending_approval").length
          : 0,
    },
    purchase_order: {
      count: pos.filter((p) => p.status !== "received" && p.status !== "closed").length,
      count_label: `${pos.filter((p) => p.status === "draft").length} to send · ${pos.filter((p) => p.status === "sent").length} open`,
      value_label: money(pos.reduce((s, p) => s + p.total_amount, 0)),
      actionable:
        role === "purchase_officer"
          ? pos.filter((p) => p.status === "draft").length +
            comparatives.filter((c) => c.status === "approved" && !posWithComparative.has(c.id))
              .length
          : 0,
    },
    grn: {
      count: grns.length,
      count_label: `${dueDeliveries.length} ${dueDeliveries.length === 1 ? "delivery" : "deliveries"} due`,
      value_label: null,
      actionable: role === "site_engineer" ? dueDeliveries.length : 0,
    },
    site_stock: {
      count: materialsOnSite,
      count_label: `${materialsOnSite} material${materialsOnSite === 1 ? "" : "s"} on site`,
      value_label: null,
      actionable: 0,
    },
    vendor_bill: {
      count: vendorBills.filter((b) => b.status !== "handed_over").length,
      count_label: `${vendorBills.filter((b) => b.status === "mismatch").length} mismatched · ${grns.filter((g) => !billedGrns.has(g.id)).length} unbilled`,
      value_label: money(vendorBills.reduce((s, b) => s + b.bill_total_amount, 0)),
      actionable:
        role === "purchase_officer"
          ? vendorBills.filter((b) => b.status !== "handed_over").length +
            grns.filter((g) => !billedGrns.has(g.id)).length
          : 0,
    },
    supplier_ledger: {
      count: new Set(ledger.filter((e) => e.project_id === project_id).map((e) => e.supplier_id))
        .size,
      count_label: `${returns.filter((r) => r.status !== "debit_note_issued").length} return${returns.filter((r) => r.status !== "debit_note_issued").length === 1 ? "" : "s"} open`,
      value_label: money(
        ledger
          .filter((e) => e.project_id === project_id)
          .reduce((s, e) => s + e.credit - e.debit, 0),
      ),
      actionable: 0,
    },
    joint_measurement: {
      count: measurements.filter((m) => m.status !== "billed").length,
      count_label: `${measurements.filter((m) => m.status === "draft").length} to sign · ${measurements.filter((m) => m.status === "signed").length} to bill`,
      value_label: money(
        measurements.filter((m) => m.status !== "billed").reduce((s, m) => s + m.total_value, 0),
      ),
      actionable:
        role === "project_qs"
          ? measurements.filter((m) => m.status !== "billed").length + readyLines.length
          : 0,
    },
    ra_bill: {
      count: raBills.filter((b) => b.status === "draft").length,
      count_label: `${raBills.filter((b) => b.status === "draft").length} draft${raBills.filter((b) => b.status === "draft").length === 1 ? "" : "s"}`,
      value_label: money(
        raBills.filter((b) => b.status === "draft").reduce((s, b) => s + b.gross_amount, 0),
      ),
      actionable: role === "project_qs" ? raBills.filter((b) => b.status === "draft").length : 0,
    },
    certified_bill: {
      count: inChain.length,
      count_label: chainSummary,
      value_label: money(inChain.reduce((s, b) => s + b.gross_amount, 0)),
      actionable: myChainStep ? chainAt(myChainStep.sequence).length : 0,
    },
    budget_vs_actual: {
      count: boqLines.length,
      count_label: "Live by BOQ line",
      value_label: money(issuedValue + certifiedValue),
      actionable: 0,
    },
    accounts_handover: {
      count: handedRa.length + handedVendor.length,
      count_label: `${handedVendor.length} vendor · ${handedRa.length} contractor`,
      value_label: money(handedValue),
      actionable:
        role === "project_qs" ? raBills.filter((b) => b.status === "certified").length : 0,
    },
  };

  const nodes = Object.fromEntries(
    FLOW_NODES.map((id) => {
      const spec = NODE_SPECS[id];
      return [
        id,
        {
          id,
          label: spec.label,
          step_codes: spec.step_codes,
          team: spec.team,
          href: spec.path.startsWith("/") ? spec.path : `/projects/${project_id}/${spec.path}`,
          ...raw[id],
        } satisfies FlowCount,
      ];
    }),
  ) as Record<FlowNodeId, FlowCount>;

  return {
    project_id,
    nodes,
    total_actionable: FLOW_NODES.reduce((s, id) => s + nodes[id].actionable, 0),
  };
}

export type ProjectAlert = {
  key: string;
  kind: "budget" | "stock" | "billing" | "reporting";
  title: string;
  detail: string;
  count: number;
  severity: "warn" | "bad";
  href: string;
};

/**
 * The handful of things on a project that somebody should look at today:
 * over-budget BOQ lines, low stock, bills stuck in the chain, missing reports.
 */
export async function getProjectAlerts(
  project_id: string,
  role: Role,
): Promise<ProjectAlert[]> {
  const { budgetVsActual, overrunOf } = await import("../budget-service");
  const repos = getRepositories();
  const [budget, materials, stock, raBills, dprs] = await Promise.all([
    budgetVsActual(project_id),
    repos.materials.list(),
    repos.stock.listByProject(project_id),
    repos.raBills.listByProject(project_id),
    repos.dprs.listByProject(project_id),
  ]);
  void role;

  const alerts: ProjectAlert[] = [];

  const over = budget.filter((r) => overrunOf(r) !== null);
  if (over.length > 0) {
    alerts.push({
      key: "over_budget",
      kind: "budget",
      title: `${over.length} BOQ line${over.length === 1 ? "" : "s"} over budget`,
      detail: over
        .slice(0, 3)
        .map((r) => r.item_code)
        .join(", "),
      count: over.length,
      severity: "bad",
      href: `/projects/${project_id}/budget/budget-vs-actual`,
    });
  }

  const balances = new Map<string, number>();
  stock.forEach((e) =>
    balances.set(
      e.material_id,
      (balances.get(e.material_id) ?? 0) + e.quantity_in - e.quantity_out,
    ),
  );
  const low = materials.filter((m) => {
    const b = balances.get(m.id);
    return b !== undefined && b > 0 && b < m.reorder_level;
  });
  if (low.length > 0) {
    alerts.push({
      key: "low_stock",
      kind: "stock",
      title: `${low.length} material${low.length === 1 ? "" : "s"} below reorder level`,
      detail: low
        .slice(0, 3)
        .map((m) => m.name)
        .join(", "),
      count: low.length,
      severity: "warn",
      href: `/projects/${project_id}/site/stock`,
    });
  }

  const stuck = raBills.filter(
    (b) => b.status === "in_certification" && ageInDays(b.submitted_at) > 7,
  );
  if (stuck.length > 0) {
    alerts.push({
      key: "stuck_bills",
      kind: "billing",
      title: `${stuck.length} bill${stuck.length === 1 ? "" : "s"} stuck over a week`,
      detail: stuck
        .slice(0, 3)
        .map((b) => b.bill_number)
        .join(", "),
      count: stuck.length,
      severity: "bad",
      href: `/projects/${project_id}/billing/certification`,
    });
  }

  const filed = new Set(dprs.map((d) => d.report_date));
  const missing: string[] = [];
  // Today is not missed yet — the site files it by evening. Same fortnight,
  // same rule as the DPR page.
  for (let i = 1; i < 14; i += 1) {
    const d = new Date(`${today()}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() - i);
    const date = d.toISOString().slice(0, 10);
    if (!filed.has(date)) missing.push(date);
  }
  if (missing.length > 0) {
    alerts.push({
      key: "missing_dpr",
      kind: "reporting",
      title: `${missing.length} day${missing.length === 1 ? "" : "s"} without a daily report`,
      detail: missing.slice(0, 3).map(formatDate).join(", "),
      count: missing.length,
      severity: "warn",
      href: `/projects/${project_id}/site/dpr`,
    });
  }

  return alerts;
}
