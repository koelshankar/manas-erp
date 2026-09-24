import { getRepositories } from "@/lib/data";
import { APPROVAL_CHAINS, ROLE_LABEL } from "@/config/permissions";
import type { Role, StepCode, Team } from "@/lib/domain";
import { canSeeValues } from "./redaction";

/**
 * The chain of records a document sits in, upstream and down.
 *
 * Material: Indent → Comparative → PO → GRN → Issues → BOQ line,
 * with the vendor branch GRN → Vendor bill → Supplier ledger → Handover,
 * and Returns hanging off the GRN.
 *
 * Billing: Work-order line → Site task → Work done → Joint measurement →
 * RA bill → Certification steps → Handover → BOQ line.
 */
export const TRAIL_ENTITY_TYPES = [
  "indent",
  "comparative",
  "purchase_order",
  "grn",
  "material_issue",
  "vendor_bill",
  "supplier_return",
  "boq_line",
  "work_order_line",
  "site_task",
  "joint_measurement",
  "ra_bill",
  "supplier_ledger",
  "accounts_handover",
  "certification",
] as const;

export type TrailEntityType = (typeof TRAIL_ENTITY_TYPES)[number];

export type TrailNode = {
  entity_type: TrailEntityType;
  id: string;
  /** Document number, or a readable stand-in where there is none. */
  number: string;
  status: string;
  step_code: StepCode | null;
  team: Team;
  /** The date this record was raised. */
  date: string;
  href: string | null;
  /** Absent when the role may not see values — stripped by redactMoney. */
  value?: number;
  /** Secondary line: contractor, supplier, material. */
  context: string;
};

/** A position in the chain. One-to-many links collapse into a single group. */
export type TrailStep = {
  key: string;
  /** What this position in the chain is, e.g. "Purchase orders". */
  label: string;
  nodes: TrailNode[];
  /** True for the record the trail was asked about. */
  is_current: boolean;
};

export type RecordTrail = {
  entity_type: TrailEntityType;
  entity_id: string;
  steps: TrailStep[];
};

/* ------------------------------------------------------------------ */

type Ctx = Awaited<ReturnType<typeof loadContext>>;

async function loadContext(role: Role) {
  const repos = getRepositories();
  const [
    indents,
    comparatives,
    comparativeLines,
    pos,
    poLines,
    grns,
    grnLines,
    issues,
    vendorBills,
    returns,
    ledger,
    boqLines,
    woLines,
    workOrders,
    tasks,
    measurements,
    measurementLines,
    raBills,
    raBillLines,
    approvals,
    contractors,
    suppliers,
    materials,
  ] = await Promise.all([
    repos.indents.list(),
    repos.comparatives.list(),
    repos.comparatives.listLines(),
    repos.purchaseOrders.list(),
    repos.purchaseOrders.listLines(),
    repos.grns.list(),
    repos.grns.listLines(),
    repos.stock.listIssues(),
    repos.vendorBills.list(),
    repos.returns.list(),
    repos.supplierLedger.list(),
    repos.boq.list(),
    repos.workOrders.listLines(),
    repos.workOrders.list(),
    repos.siteTasks.list(),
    repos.measurements.list(),
    repos.measurements.listLines(),
    repos.raBills.list(),
    repos.raBills.listLines(),
    repos.approvals.list(),
    repos.contractors.list(),
    repos.suppliers.list(),
    repos.materials.list(),
  ]);

  return {
    role,
    showValues: canSeeValues(role),
    indents,
    comparatives,
    comparativeLines,
    pos,
    poLines,
    grns,
    grnLines,
    issues,
    vendorBills,
    returns,
    ledger,
    boqLines,
    woLines,
    workOrders,
    tasks,
    measurements,
    measurementLines,
    raBills,
    raBillLines,
    approvals,
    contractorName: new Map(contractors.map((c) => [c.id, c.name])),
    supplierName: new Map(suppliers.map((s) => [s.id, s.name])),
    materialName: new Map(materials.map((m) => [m.id, m.name])),
  };
}

/**
 * The figure, as-is. `redactMoney` at the query index removes it entirely for
 * a role that may not see values, so masking here would only produce a second,
 * different kind of absence.
 */
const value = (ctx: Ctx, n: number): number => {
  void ctx;
  return n;
};

/* ---- node builders, one per entity type ---- */

function indentNode(ctx: Ctx, id: string): TrailNode | null {
  const r = ctx.indents.find((x) => x.id === id);
  if (!r) return null;
  return {
    entity_type: "indent",
    id: r.id,
    number: r.indent_number,
    status: r.status,
    step_code: "A2",
    team: "site_execution",
    date: r.raised_date,
    href: `/projects/${r.project_id}/site/indents`,
    context: r.remarks,
  };
}

function comparativeNode(ctx: Ctx, id: string): TrailNode | null {
  const r = ctx.comparatives.find((x) => x.id === id);
  if (!r) return null;
  return {
    entity_type: "comparative",
    id: r.id,
    number: r.comparative_number,
    status: r.status,
    step_code: "B1",
    team: "purchase_stores",
    date: r.prepared_date,
    href: `/projects/${r.project_id}/purchase/comparatives`,
    value: value(ctx, r.total_selected_value),
    context: "",
  };
}

function poNode(ctx: Ctx, id: string): TrailNode | null {
  const r = ctx.pos.find((x) => x.id === id);
  if (!r) return null;
  return {
    entity_type: "purchase_order",
    id: r.id,
    number: r.po_number,
    status: r.status,
    step_code: "B3",
    team: "purchase_stores",
    date: r.po_date,
    href: `/projects/${r.project_id}/purchase/purchase-orders`,
    value: value(ctx, r.total_amount),
    context: ctx.supplierName.get(r.supplier_id) ?? "",
  };
}

function grnNode(ctx: Ctx, id: string): TrailNode | null {
  const r = ctx.grns.find((x) => x.id === id);
  if (!r) return null;
  return {
    entity_type: "grn",
    id: r.id,
    number: r.grn_number,
    status: r.status,
    step_code: "B5",
    team: "site_execution",
    date: r.received_on,
    href: `/projects/${r.project_id}/site/grn`,
    context: ctx.supplierName.get(r.supplier_id) ?? "",
  };
}

function issueNode(ctx: Ctx, id: string): TrailNode | null {
  const r = ctx.issues.find((x) => x.id === id);
  if (!r) return null;
  return {
    entity_type: "material_issue",
    id: r.id,
    number: r.issue_number,
    status: "issued",
    step_code: "A5",
    team: "site_execution",
    date: r.issue_date,
    href: `/projects/${r.project_id}/site/stock`,
    value: value(ctx, r.value),
    context: ctx.materialName.get(r.material_id) ?? "",
  };
}

function vendorBillNode(ctx: Ctx, id: string): TrailNode | null {
  const r = ctx.vendorBills.find((x) => x.id === id);
  if (!r) return null;
  return {
    entity_type: "vendor_bill",
    id: r.id,
    number: r.bill_number,
    status: r.status,
    step_code: "B7",
    team: "purchase_stores",
    date: r.bill_date,
    href: `/projects/${r.project_id}/purchase/vendor-bills`,
    value: value(ctx, r.bill_total_amount),
    context: ctx.supplierName.get(r.supplier_id) ?? "",
  };
}

function returnNode(ctx: Ctx, id: string): TrailNode | null {
  const r = ctx.returns.find((x) => x.id === id);
  if (!r) return null;
  return {
    entity_type: "supplier_return",
    id: r.id,
    number: r.return_number,
    status: r.status,
    step_code: null,
    team: "purchase_stores",
    date: r.return_date,
    href: `/projects/${r.project_id}/purchase/returns`,
    value: value(ctx, r.amount),
    context: r.reason,
  };
}

function boqNode(ctx: Ctx, id: string): TrailNode | null {
  const r = ctx.boqLines.find((x) => x.id === id);
  if (!r) return null;
  return {
    entity_type: "boq_line",
    id: r.id,
    number: r.item_code,
    status: "budget",
    step_code: null,
    team: "project_budget",
    date: r.created_at.slice(0, 10),
    href: `/projects/${r.project_id}/budget/budget-vs-actual`,
    value: value(ctx, r.amount),
    context: r.description,
  };
}

function woLineNode(ctx: Ctx, id: string): TrailNode | null {
  const r = ctx.woLines.find((x) => x.id === id);
  if (!r) return null;
  const wo = ctx.workOrders.find((w) => w.id === r.work_order_id);
  return {
    entity_type: "work_order_line",
    id: r.id,
    number: wo?.wo_number ?? "",
    status: "agreed",
    step_code: null,
    team: "project_budget",
    date: wo?.issued_date ?? r.created_at.slice(0, 10),
    href: `/projects/${r.project_id}/budget/work-orders`,
    value: value(ctx, r.amount),
    context: r.description,
  };
}

function taskNode(ctx: Ctx, id: string): TrailNode | null {
  const r = ctx.tasks.find((x) => x.id === id);
  if (!r) return null;
  return {
    entity_type: "site_task",
    id: r.id,
    number: r.task_code,
    status: r.status,
    step_code: "A1",
    team: "site_execution",
    date: r.planned_start,
    href: `/projects/${r.project_id}/site/tasks`,
    context: r.title,
  };
}

function measurementNode(ctx: Ctx, id: string): TrailNode | null {
  const r = ctx.measurements.find((x) => x.id === id);
  if (!r) return null;
  return {
    entity_type: "joint_measurement",
    id: r.id,
    number: r.measurement_number,
    status: r.status,
    step_code: "C1",
    team: "billing_certification",
    date: r.measurement_date,
    href: `/projects/${r.project_id}/billing/measurements`,
    value: value(ctx, r.total_value),
    context: ctx.contractorName.get(r.contractor_id) ?? "",
  };
}

function raBillNode(ctx: Ctx, id: string): TrailNode | null {
  const r = ctx.raBills.find((x) => x.id === id);
  if (!r) return null;
  return {
    entity_type: "ra_bill",
    id: r.id,
    number: r.bill_number,
    status: r.status,
    step_code: "C2",
    team: "billing_certification",
    date: r.bill_date,
    href: `/projects/${r.project_id}/billing/ra-bills`,
    value: value(ctx, r.gross_amount),
    context: ctx.contractorName.get(r.contractor_id) ?? "",
  };
}

/** The C3–C4 steps as trail nodes, so the chain reads as part of the story. */
function certificationNodes(ctx: Ctx, ra_bill_id: string): TrailNode[] {
  const bill = ctx.raBills.find((b) => b.id === ra_bill_id);
  if (!bill) return [];
  const rows = ctx.approvals.filter(
    (a) => a.entity_type === "ra_bill" && a.entity_id === ra_bill_id,
  );
  if (rows.length === 0) return [];

  return APPROVAL_CHAINS.ra_bill.map((step) => {
    const row = rows.find((r) => r.sequence === step.sequence);
    return {
      entity_type: "certification" as const,
      id: `${ra_bill_id}:${step.sequence}`,
      number: `${step.step_code} ${ROLE_LABEL[step.required_role]}`,
      status: row?.status ?? "not_started",
      step_code: step.step_code,
      team:
        step.required_role === "project_head" ? "project_budget" : "billing_certification",
      date: row?.acted_at?.slice(0, 10) ?? bill.bill_date,
      href: `/projects/${bill.project_id}/billing/certification`,
      context: row?.comment ?? "",
    };
  });
}

function ledgerNodes(ctx: Ctx, vendor_bill_id: string): TrailNode[] {
  const bill = ctx.vendorBills.find((b) => b.id === vendor_bill_id);
  // The chip carries the supplier, not the invoice number again — the bill
  // chip right before it already says that.
  const supplier = bill ? (ctx.supplierName.get(bill.supplier_id) ?? "Supplier") : "Supplier";
  return ctx.ledger
    .filter((e) => e.reference_type === "vendor_bill" && e.reference_id === vendor_bill_id)
    .map((e) => ({
      entity_type: "supplier_ledger" as const,
      id: e.id,
      number: supplier,
      status: e.entry_type,
      step_code: null,
      team: "purchase_stores" as Team,
      date: e.entry_date,
      href: "/ledgers/suppliers",
      value: value(ctx, e.credit - e.debit),
      context: e.narration,
    }));
}

function handoverNode(ctx: Ctx, node: TrailNode | null): TrailNode | null {
  if (!node) return null;
  return {
    ...node,
    entity_type: "accounts_handover",
    id: `handover:${node.id}`,
    number: node.number,
    status: "handed_over",
    step_code: node.entity_type === "ra_bill" ? "C5" : "B8",
    team: "accounts",
    href: "/accounts-handover",
  };
}

/* ------------------------------------------------------------------ */
/* Chain assembly                                                      */
/* ------------------------------------------------------------------ */

const compact = (nodes: Array<TrailNode | null>): TrailNode[] =>
  nodes.filter((n): n is TrailNode => n !== null);

/**
 * The whole chain a record belongs to, in workflow order. The caller marks
 * which step is "current" by entity id.
 */
export async function getRecordTrail(
  entity_type: TrailEntityType,
  entity_id: string,
  role: Role,
): Promise<RecordTrail> {
  const ctx = await loadContext(role);
  const steps: TrailStep[] =
    MATERIAL_TYPES.has(entity_type)
      ? materialChain(ctx, entity_type, entity_id)
      : billingChain(ctx, entity_type, entity_id);

  return {
    entity_type,
    entity_id,
    steps: steps
      .filter((s) => s.nodes.length > 0)
      .map((s) => ({
        ...s,
        is_current: s.nodes.some((n) => n.id === entity_id),
      })),
  };
}

const MATERIAL_TYPES = new Set<TrailEntityType>([
  "indent",
  "comparative",
  "purchase_order",
  "grn",
  "material_issue",
  "vendor_bill",
  "supplier_return",
]);

/** Walks back to the indent, then forward through the purchase thread. */
function materialChain(ctx: Ctx, type: TrailEntityType, id: string): TrailStep[] {
  /* ---- find the anchor indent ---- */
  let indentId: string | null = null;
  let grnIds: string[] = [];
  let poIds: string[] = [];
  let comparativeId: string | null = null;

  if (type === "indent") indentId = id;
  if (type === "comparative") {
    comparativeId = id;
    indentId = ctx.comparatives.find((c) => c.id === id)?.indent_ids[0] ?? null;
  }
  if (type === "purchase_order") {
    const po = ctx.pos.find((p) => p.id === id);
    comparativeId = po?.comparative_id ?? null;
    indentId = po?.indent_ids[0] ?? null;
  }
  if (type === "grn") {
    const grn = ctx.grns.find((g) => g.id === id);
    const po = ctx.pos.find((p) => p.id === grn?.purchase_order_id);
    comparativeId = po?.comparative_id ?? null;
    indentId = po?.indent_ids[0] ?? null;
  }
  if (type === "vendor_bill") {
    const bill = ctx.vendorBills.find((b) => b.id === id);
    const po = ctx.pos.find((p) => bill?.purchase_order_ids.includes(p.id));
    comparativeId = po?.comparative_id ?? null;
    indentId = po?.indent_ids[0] ?? null;
  }
  if (type === "supplier_return") {
    const ret = ctx.returns.find((r) => r.id === id);
    const po = ctx.pos.find((p) => p.id === ret?.purchase_order_id);
    comparativeId = po?.comparative_id ?? null;
    indentId = po?.indent_ids[0] ?? null;
  }
  if (type === "material_issue") {
    const issue = ctx.issues.find((i) => i.id === id);
    const grnLine = ctx.grnLines.find(
      (l) => l.project_id === issue?.project_id && l.material_id === issue?.material_id,
    );
    if (grnLine) {
      grnIds = [grnLine.grn_id];
      const po = ctx.pos.find((p) => p.id === grnLine.purchase_order_id);
      poIds = po ? [po.id] : [];
      comparativeId = po?.comparative_id ?? null;
      indentId = po?.indent_ids[0] ?? null;
    }
  }

  /* ---- walk forward ---- */
  if (!comparativeId && indentId) {
    comparativeId =
      ctx.comparatives.find(
        (c) => c.indent_ids.includes(indentId!) && c.status !== "rejected",
      )?.id ?? null;
  }
  if (poIds.length === 0) {
    poIds = ctx.pos
      .filter(
        (p) =>
          (comparativeId && p.comparative_id === comparativeId) ||
          (indentId && p.indent_ids.includes(indentId)),
      )
      .map((p) => p.id);
  }
  if (grnIds.length === 0) {
    grnIds = ctx.grns.filter((g) => poIds.includes(g.purchase_order_id)).map((g) => g.id);
  }

  const issueIds =
    type === "material_issue"
      ? [id]
      : ctx.issues
          .filter((i) =>
            ctx.grnLines.some(
              (l) => grnIds.includes(l.grn_id) && l.material_id === i.material_id,
            ),
          )
          .map((i) => i.id);

  const billIds = ctx.vendorBills
    .filter((b) => b.grn_ids.some((g) => grnIds.includes(g)))
    .map((b) => b.id);
  const returnIds = ctx.returns.filter((r) => grnIds.includes(r.grn_id)).map((r) => r.id);

  const boqIds = [
    ...new Set(
      ctx.poLines.filter((l) => poIds.includes(l.purchase_order_id)).map((l) => l.boq_line_id),
    ),
  ];

  const handed = billIds
    .map((b) => ctx.vendorBills.find((x) => x.id === b))
    .filter((b) => b?.status === "handed_over")
    .map((b) => handoverNode(ctx, vendorBillNode(ctx, b!.id)));

  return [
    { key: "indent", label: "Indent", nodes: compact([indentId ? indentNode(ctx, indentId) : null]), is_current: false },
    { key: "comparative", label: "Comparative", nodes: compact([comparativeId ? comparativeNode(ctx, comparativeId) : null]), is_current: false },
    { key: "po", label: "Purchase orders", nodes: compact(poIds.map((p) => poNode(ctx, p))), is_current: false },
    { key: "grn", label: "Goods received", nodes: compact(grnIds.map((g) => grnNode(ctx, g))), is_current: false },
    { key: "return", label: "Returns", nodes: compact(returnIds.map((r) => returnNode(ctx, r))), is_current: false },
    { key: "issue", label: "Issued to site", nodes: compact(issueIds.map((i) => issueNode(ctx, i))), is_current: false },
    { key: "vendor_bill", label: "Vendor bill", nodes: compact(billIds.map((b) => vendorBillNode(ctx, b))), is_current: false },
    { key: "ledger", label: "Supplier ledger", nodes: billIds.flatMap((b) => ledgerNodes(ctx, b)), is_current: false },
    { key: "handover", label: "Accounts", nodes: compact(handed), is_current: false },
    { key: "boq", label: "BOQ line", nodes: compact(boqIds.map((b) => boqNode(ctx, b))), is_current: false },
  ];
}

/** Walks back to the work-order line, then forward through the billing thread. */
function billingChain(ctx: Ctx, type: TrailEntityType, id: string): TrailStep[] {
  let woLineIds: string[] = [];
  let measurementIds: string[] = [];
  let raBillIds: string[] = [];

  if (type === "work_order_line") woLineIds = [id];
  if (type === "boq_line") {
    woLineIds = ctx.woLines.filter((l) => l.boq_line_id === id).map((l) => l.id);
  }
  if (type === "site_task") {
    const task = ctx.tasks.find((t) => t.id === id);
    woLineIds = task?.work_order_line_id ? [task.work_order_line_id] : [];
  }
  if (type === "joint_measurement") {
    measurementIds = [id];
    woLineIds = [
      ...new Set(
        ctx.measurementLines
          .filter((l) => l.joint_measurement_id === id)
          .map((l) => l.work_order_line_id),
      ),
    ];
  }
  if (type === "ra_bill") {
    raBillIds = [id];
    const bill = ctx.raBills.find((b) => b.id === id);
    measurementIds = bill?.joint_measurement_ids ?? [];
    woLineIds = [
      ...new Set(ctx.raBillLines.filter((l) => l.ra_bill_id === id).map((l) => l.work_order_line_id)),
    ];
  }

  if (measurementIds.length === 0 && woLineIds.length > 0) {
    measurementIds = [
      ...new Set(
        ctx.measurementLines
          .filter((l) => woLineIds.includes(l.work_order_line_id))
          .map((l) => l.joint_measurement_id),
      ),
    ];
  }
  if (raBillIds.length === 0 && measurementIds.length > 0) {
    raBillIds = ctx.raBills
      .filter((b) => b.joint_measurement_ids.some((m) => measurementIds.includes(m)))
      .map((b) => b.id);
  }

  const taskIds = ctx.tasks
    .filter((t) => t.work_order_line_id && woLineIds.includes(t.work_order_line_id))
    .map((t) => t.id);
  const boqIds = [
    ...new Set(
      ctx.woLines.filter((l) => woLineIds.includes(l.id)).map((l) => l.boq_line_id),
    ),
  ];

  const handed = raBillIds
    .map((b) => ctx.raBills.find((x) => x.id === b))
    .filter((b) => b?.status === "handed_over")
    .map((b) => handoverNode(ctx, raBillNode(ctx, b!.id)));

  return [
    { key: "wo_line", label: "Work order", nodes: compact(woLineIds.map((l) => woLineNode(ctx, l))), is_current: false },
    { key: "task", label: "Site task", nodes: compact(taskIds.map((t) => taskNode(ctx, t))), is_current: false },
    { key: "measurement", label: "Joint measurement", nodes: compact(measurementIds.map((m) => measurementNode(ctx, m))), is_current: false },
    { key: "ra_bill", label: "RA bill", nodes: compact(raBillIds.map((b) => raBillNode(ctx, b))), is_current: false },
    { key: "certification", label: "Certification", nodes: raBillIds.flatMap((b) => certificationNodes(ctx, b)), is_current: false },
    { key: "handover", label: "Accounts", nodes: compact(handed), is_current: false },
    { key: "boq", label: "BOQ line", nodes: compact(boqIds.map((b) => boqNode(ctx, b))), is_current: false },
  ];
}
