import { z } from "zod";
import { getRepositories } from "@/lib/data";
import {
  TRADES,
  UNITS,
  type BoqLine,
  type BoqMaterialBudget,
  type WorkOrder,
  type WorkOrderLine,
} from "@/lib/domain";
import { assertCan, parseInput, required, rupees } from "./guards";
import { ValidationError, type ActingUser } from "./types";
import { getIssuedVsMeasured } from "./measurement-service";

/* Project & Budget. The roll-ups below are read-only — they aggregate what the
   material and billing threads have already recorded. The writers at the foot
   of the file are the two documents this team owns: BOQ lines and work
   orders. */

export type BudgetVsActualRow = {
  boq_line_id: string;
  item_code: string;
  description: string;
  trade: string;
  unit: string;
  budget_quantity: number;
  /** Work reported done on the line, summed from its work-order lines (A3). */
  done_qty: number;
  boq_amount: number;
  /** Material allowance inside the BOQ line — the yardstick for this thread. */
  material_budget_value: number;
  /** Value of everything issued from site stock against the line. */
  material_issued_value: number;
  material_variance: number;
  material_percent_consumed: number;
  /** Contractor scope on this BOQ line, at the agreed work-order rates. */
  work_order_value: number;
  /** Gross certified through RA bills that have cleared the C3-C4 chain. */
  certified_amount: number;
  certified_percent: number;
  /** The BOQ amount: the line's material allowance plus its labour. */
  total_budget: number;
  /** material issued + contractor certified. */
  total_actual: number;
  total_variance: number;
  total_percent_consumed: number;
  /** Worst "Issued v. Measured" variance on the line, if any material is off. */
  issued_vs_measured_percent: number | null;
  issued_vs_measured_flagged: boolean;
};

/** Colour thresholds used by the screen. Kept here so the rule has one home. */
export type ConsumptionBand = "neutral" | "amber" | "red";

/**
 * Over 100% of budget is red. 80-100% is amber only while spending runs ahead
 * of the work: a line 100% done at 83% spent is good news, not a warning.
 */
export function consumptionBand(percent: number, done_percent: number): ConsumptionBand {
  if (percent > 100) return "red";
  if (percent >= 80 && percent > done_percent) return "amber";
  return "neutral";
}

/** Work done on the line as a share of its BOQ quantity. */
export function donePercent(row: BudgetVsActualRow): number {
  return row.budget_quantity > 0 ? (row.done_qty / row.budget_quantity) * 100 : 0;
}

/**
 * Budget against actual, per BOQ line.
 *
 * Budget is the BOQ amount — the line's material allowance plus its labour;
 * actual is material issued plus contractor work certified. This is the
 * one definition of budget and actual in the app — the dashboard, the project
 * header, the Projects list and the report all roll it up through
 * `projectBudgetSummary`.
 */
export async function budgetVsActual(project_id: string): Promise<BudgetVsActualRow[]> {
  const repos = getRepositories();
  const [boqLines, budgets, issues, woLines, raBills, raBillLines, issuedVsMeasured] =
    await Promise.all([
      repos.boq.listByProject(project_id),
      repos.boq.listMaterialBudgetsByProject(project_id),
      repos.stock.listIssuesByProject(project_id),
      repos.workOrders.listLinesByProject(project_id),
      repos.raBills.listByProject(project_id),
      repos.raBills.listLinesByProject(project_id),
      getIssuedVsMeasured(project_id),
    ]);

  // Only a bill that has cleared the chain counts as certified.
  const certifiedBillIds = new Set(
    raBills.filter((b) => b.status === "certified" || b.status === "handed_over").map((b) => b.id),
  );

  return boqLines.map((line) => {
    const material_budget_value = rupees(
      budgets
        .filter((b) => b.boq_line_id === line.id)
        .reduce((sum, b) => sum + b.budget_qty * b.budget_rate, 0),
    );
    const material_issued_value = rupees(
      issues.filter((i) => i.boq_line_id === line.id).reduce((sum, i) => sum + i.value, 0),
    );

    const lineWoLines = woLines.filter((l) => l.boq_line_id === line.id);
    const work_order_value = rupees(lineWoLines.reduce((sum, l) => sum + l.amount, 0));
    const done_qty = lineWoLines.reduce((sum, l) => sum + l.done_qty, 0);
    const certified_amount = rupees(
      raBillLines
        .filter((l) => l.boq_line_id === line.id && certifiedBillIds.has(l.ra_bill_id))
        .reduce((sum, l) => sum + l.amount, 0),
    );

    // The budget is what the BOQ priced the line at. Work orders are
    // commitments inside it, not additions to it — a line whose contractor
    // has not been let yet still has its full budget.
    const total_budget = rupees(line.amount);
    const total_actual = rupees(material_issued_value + certified_amount);

    // The worst overdraw across the materials budgeted on this BOQ line.
    // Only measured lines can have an overdraw; an unmeasured one has no
    // denominator and must not masquerade as the worst on the BOQ line.
    const variances = issuedVsMeasured.filter(
      (r) => r.boq_line_id === line.id && r.variance_percent !== null,
    );
    const worst = variances.reduce<(typeof variances)[number] | null>(
      (max, r) => (max === null || r.variance_percent! > max.variance_percent! ? r : max),
      null,
    );

    return {
      boq_line_id: line.id,
      item_code: line.item_code,
      description: line.description,
      trade: line.trade,
      unit: line.unit,
      budget_quantity: line.quantity,
      done_qty,
      boq_amount: line.amount,
      material_budget_value,
      material_issued_value,
      material_variance: rupees(material_budget_value - material_issued_value),
      material_percent_consumed:
        material_budget_value > 0
          ? Math.round((material_issued_value / material_budget_value) * 1000) / 10
          : 0,
      work_order_value,
      certified_amount,
      certified_percent:
        work_order_value > 0 ? Math.round((certified_amount / work_order_value) * 1000) / 10 : 0,
      total_budget,
      total_actual,
      total_variance: rupees(total_budget - total_actual),
      total_percent_consumed:
        total_budget > 0 ? Math.round((total_actual / total_budget) * 1000) / 10 : 0,
      issued_vs_measured_percent: worst ? worst.variance_percent : null,
      issued_vs_measured_flagged: variances.some((r) => r.is_flagged),
    };
  });
}

export type Overrun = {
  /** Which allowance was passed: the material inside the line, or the line. */
  head: "material" | "total";
  budget: number;
  actual: number;
  overrun: number;
  percent_consumed: number;
};

/**
 * How far a line is past its budget, or null when it is inside it.
 *
 * Judged per cost head as well as on the whole: mid-project, a line's labour
 * is barely billed, so its total can sit well inside the BOQ amount while its
 * material has already run through the allowance. That is the overrun a
 * Project Head needs to see now, not when the last bill lands.
 */
export function overrunOf(row: BudgetVsActualRow): Overrun | null {
  const heads: Overrun[] = [
    {
      head: "material",
      budget: row.material_budget_value,
      actual: row.material_issued_value,
      overrun: rupees(row.material_issued_value - row.material_budget_value),
      percent_consumed: row.material_percent_consumed,
    },
    {
      head: "total",
      budget: row.total_budget,
      actual: row.total_actual,
      overrun: rupees(row.total_actual - row.total_budget),
      percent_consumed: row.total_percent_consumed,
    },
  ];
  const over = heads.filter((h) => h.budget > 0 && h.overrun > 0);
  return over.sort((a, b) => b.overrun - a.overrun)[0] ?? null;
}

/**
 * A line worth a Project Head's look: over its budget on the whole or on
 * material, or drawing more material than its measured work accounts for.
 * The page's filter and its KPI count both use this.
 */
export function needsAttention(row: BudgetVsActualRow): boolean {
  return overrunOf(row) !== null || row.issued_vs_measured_flagged;
}

export type ProjectBudgetSummary = {
  /** The BOQ total: material allowance plus labour, across every line. */
  budget: number;
  material_budget: number;
  /** budget less material — the labour the work orders are let against. */
  labour_budget: number;
  work_order_value: number;
  /** Material issued plus contractor certified. */
  actual: number;
  material_actual: number;
  certified_actual: number;
  /** actual ÷ budget, whole percent. */
  spent_percent: number;
};

/** One project's budget and actual, rolled up from `budgetVsActual`. */
export async function projectBudgetSummary(project_id: string): Promise<ProjectBudgetSummary> {
  const rows = await budgetVsActual(project_id);
  const sum = (f: (r: BudgetVsActualRow) => number) => rupees(rows.reduce((s, r) => s + f(r), 0));
  const budget = sum((r) => r.total_budget);
  const actual = sum((r) => r.total_actual);
  const material_budget = sum((r) => r.material_budget_value);
  return {
    budget,
    material_budget,
    labour_budget: rupees(budget - material_budget),
    work_order_value: sum((r) => r.work_order_value),
    actual,
    material_actual: sum((r) => r.material_issued_value),
    certified_actual: sum((r) => r.certified_amount),
    spent_percent: budget > 0 ? Math.round((actual / budget) * 100) : 0,
  };
}

export type BudgetRaBillRow = {
  ra_bill_id: string;
  bill_number: string;
  bill_date: string;
  status: string;
  work_order_id: string;
  contractor_id: string;
  certified_qty: number;
  unit: string;
  rate: number;
  amount: number;
};

export type BudgetDrilldownRow = {
  issue_id: string;
  issue_number: string;
  issue_date: string;
  material_id: string;
  unit: string;
  quantity: number;
  rate: number;
  value: number;
  work_order_id: string;
  contractor_id: string | null;
  /** Upstream links, so the record trail in Prompt 4 has something to walk. */
  grn_id: string | null;
  grn_number: string | null;
  purchase_order_id: string | null;
  po_number: string | null;
};

/** RA bill lines booked against one BOQ line, newest first. */
export async function budgetRaBills(
  project_id: string,
  boq_line_id: string,
): Promise<BudgetRaBillRow[]> {
  const repos = getRepositories();
  const [bills, lines] = await Promise.all([
    repos.raBills.listByProject(project_id),
    repos.raBills.listLinesByProject(project_id),
  ]);
  const billById = new Map(bills.map((b) => [b.id, b]));

  const rows: BudgetRaBillRow[] = [];
  for (const line of lines) {
    if (line.boq_line_id !== boq_line_id) continue;
    const bill = billById.get(line.ra_bill_id);
    if (!bill) continue;
    rows.push({
      ra_bill_id: bill.id,
      bill_number: bill.bill_number,
      bill_date: bill.bill_date,
      status: bill.status,
      work_order_id: bill.work_order_id,
      contractor_id: bill.contractor_id,
      certified_qty: line.certified_qty,
      unit: line.unit,
      rate: line.rate,
      amount: line.amount,
    });
  }
  return rows.sort((a, b) => b.bill_date.localeCompare(a.bill_date));
}

/**
 * Every issue booked against one BOQ line, with the GRN and PO that brought the
 * material on site. Receipts are matched back by material, most recent first.
 */
export async function budgetDrilldown(
  project_id: string,
  boq_line_id: string,
): Promise<BudgetDrilldownRow[]> {
  const repos = getRepositories();
  const [issues, grnLines, grns, pos] = await Promise.all([
    repos.stock.listIssuesByProject(project_id),
    repos.grns.listLinesByProject(project_id),
    repos.grns.listByProject(project_id),
    repos.purchaseOrders.listByProject(project_id),
  ]);
  const grnById = new Map(grns.map((g) => [g.id, g]));
  const poById = new Map(pos.map((p) => [p.id, p]));

  return issues
    .filter((i) => i.boq_line_id === boq_line_id)
    .sort((a, b) => b.issue_date.localeCompare(a.issue_date))
    .map((issue) => {
      /*
       * The receipt that supplied this material against the same BOQ line.
       *
       * Stock is a pool, so an issue has no single receipt behind it — the
       * most recent one on or before the issue date is the honest answer, and
       * the one a storekeeper would give. Falling back through "any receipt on
       * this BOQ line" to "any receipt of this material" keeps a row on the
       * drilldown even where the opening history supplied it.
       */
      const onOrBefore = (l: (typeof grnLines)[number]) => {
        const grn = grnById.get(l.grn_id);
        return grn ? grn.received_on <= issue.issue_date : false;
      };
      const byDateDesc = (a: (typeof grnLines)[number], b: (typeof grnLines)[number]) =>
        (grnById.get(b.grn_id)?.received_on ?? "").localeCompare(
          grnById.get(a.grn_id)?.received_on ?? "",
        );
      const candidates = grnLines
        .filter((l) => l.material_id === issue.material_id)
        .sort(byDateDesc);
      const source =
        candidates.find((l) => l.boq_line_id === boq_line_id && onOrBefore(l)) ??
        candidates.find(onOrBefore) ??
        candidates.find((l) => l.boq_line_id === boq_line_id) ??
        candidates[0];
      const grn = source ? grnById.get(source.grn_id) : undefined;
      const po = source ? poById.get(source.purchase_order_id) : undefined;

      return {
        issue_id: issue.id,
        issue_number: issue.issue_number,
        issue_date: issue.issue_date,
        material_id: issue.material_id,
        unit: issue.unit,
        quantity: issue.quantity,
        rate: issue.rate,
        value: issue.value,
        work_order_id: issue.work_order_id,
        contractor_id: issue.issued_to_contractor_id,
        grn_id: grn?.id ?? null,
        grn_number: grn?.grn_number ?? null,
        purchase_order_id: po?.id ?? null,
        po_number: po?.po_number ?? null,
      };
    });
}

/* ------------------------------------------------------------------ */
/* Writing the budget: BOQ lines and work orders                       */
/* ------------------------------------------------------------------ */

/**
 * A BOQ line, with the material allowances it carries.
 *
 * The allowances are not optional decoration: `BoqMaterialBudget` is what
 * every indent is checked against and what Budget vs Actual measures issues
 * with, so a line added without them can never be indented for.
 */
export const boqLineInput = z.object({
  project_id: z.string().min(1),
  item_code: z.string().min(2, "an item code is required"),
  description: z.string().min(4, "describe the work"),
  trade: z.enum(TRADES),
  unit: z.enum(UNITS),
  quantity: z.number().positive("quantity must be more than zero"),
  rate: z.number().positive("rate must be more than zero"),
  material_budgets: z
    .array(
      z.object({
        material_id: z.string().min(1, "pick a material"),
        /** Allowance for the whole line, not per unit of BOQ quantity. */
        budget_qty: z.number().positive("allowance must be more than zero"),
        budget_rate: z.number().nonnegative(),
      }),
    )
    .default([]),
});

export type BoqLineInput = z.input<typeof boqLineInput>;

export async function createBoqLine(
  input: BoqLineInput,
  actor: ActingUser,
): Promise<{ line: BoqLine; budgets: BoqMaterialBudget[] }> {
  assertCan(actor, "create", "boq");
  const data = parseInput(boqLineInput, input);
  const repos = getRepositories();

  const existing = await repos.boq.listByProject(data.project_id);
  if (existing.some((l) => l.item_code === data.item_code)) {
    throw new ValidationError(`item_code: ${data.item_code} is already on this BOQ`);
  }

  const line = await repos.boq.create({
    project_id: data.project_id,
    item_code: data.item_code,
    description: data.description,
    trade: data.trade,
    unit: data.unit,
    quantity: data.quantity,
    rate: data.rate,
    amount: rupees(data.quantity * data.rate),
  });

  const budgets: BoqMaterialBudget[] = [];
  for (const b of data.material_budgets) {
    budgets.push(
      await repos.boq.createMaterialBudget({
        project_id: data.project_id,
        boq_line_id: line.id,
        material_id: b.material_id,
        budget_qty: b.budget_qty,
        budget_rate: b.budget_rate,
      }),
    );
  }

  return { line, budgets };
}

/**
 * A work order: a contractor, the BOQ lines they are engaged on, and the rate
 * agreed for each.
 *
 * The agreed rate is the contractor's, and sits below the BOQ sell rate — that
 * difference is the margin, and the service refuses a rate above the BOQ's so
 * a typo cannot quietly give the work away.
 */
export const workOrderInput = z.object({
  project_id: z.string().min(1),
  contractor_id: z.string().min(1, "pick a contractor"),
  title: z.string().min(4, "give the order a title"),
  scope_summary: z.string().default(""),
  issued_date: z.string().min(4, "an issue date is required"),
  start_date: z.string().min(4, "a start date is required"),
  end_date: z.string().min(4, "an end date is required"),
  retention_percent: z.number().min(0).max(20),
  lines: z
    .array(
      z.object({
        boq_line_id: z.string().min(1),
        quantity: z.number().positive("quantity must be more than zero"),
        agreed_rate: z.number().positive("rate must be more than zero"),
      }),
    )
    .min(1, "a work order needs at least one line"),
});

export type WorkOrderInput = z.input<typeof workOrderInput>;

export async function createWorkOrder(
  input: WorkOrderInput,
  actor: ActingUser,
): Promise<{ workOrder: WorkOrder; lines: WorkOrderLine[] }> {
  assertCan(actor, "create", "work_orders");
  const data = parseInput(workOrderInput, input);
  const repos = getRepositories();

  const contractor = required(
    await repos.contractors.getById(data.contractor_id),
    "Contractor",
  );
  const boqLines = await repos.boq.listByProject(data.project_id);
  const boqById = new Map(boqLines.map((l) => [l.id, l]));

  if (data.end_date < data.start_date) {
    throw new ValidationError("end_date: the order cannot end before it starts");
  }

  let order_value = 0;
  const prepared = data.lines.map((l) => {
    const boq = boqById.get(l.boq_line_id);
    if (!boq) throw new ValidationError("lines: a BOQ line is not on this project");
    if (l.agreed_rate > boq.rate) {
      throw new ValidationError(
        `lines: ${boq.item_code} is agreed above its BOQ rate of ${boq.rate}`,
      );
    }
    if (l.quantity > boq.quantity) {
      throw new ValidationError(
        `lines: ${boq.item_code} is ordered above its BOQ quantity of ${boq.quantity}`,
      );
    }
    const amount = rupees(l.quantity * l.agreed_rate);
    order_value += amount;
    return { boq, line: l, amount };
  });

  const workOrder = await repos.workOrders.create({
    project_id: data.project_id,
    wo_number: await nextWorkOrderNumber(data.project_id),
    contractor_id: data.contractor_id,
    title: data.title,
    scope_summary: data.scope_summary,
    issued_date: data.issued_date,
    start_date: data.start_date,
    end_date: data.end_date,
    retention_percent: data.retention_percent || contractor.default_retention_percent,
    order_value: rupees(order_value),
    is_active: true,
  });

  const lines: WorkOrderLine[] = [];
  for (const p of prepared) {
    lines.push(
      await repos.workOrders.createLine({
        project_id: data.project_id,
        work_order_id: workOrder.id,
        boq_line_id: p.boq.id,
        description: p.boq.description,
        unit: p.boq.unit,
        quantity: p.line.quantity,
        agreed_rate: p.line.agreed_rate,
        amount: p.amount,
        retention_percent: workOrder.retention_percent,
        done_qty: 0,
        measured_qty: 0,
        billed_qty: 0,
        ready_to_measure: false,
        ready_qty: 0,
      }),
    );
  }

  return { workOrder, lines };
}

/** MNS-SAP/WO-005 — sequential within the project, like the seed's. */
async function nextWorkOrderNumber(project_id: string): Promise<string> {
  const repos = getRepositories();
  const project = required(await repos.projects.getById(project_id), "Project");
  const existing = await repos.workOrders.listByProject(project_id);
  const seq = String(existing.length + 1).padStart(3, "0");
  return `${project.code}/WO-${seq}`;
}
