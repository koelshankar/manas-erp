import type {
  BoqLine,
  BoqMaterialBudget,
  Contractor,
  Project,
  WorkOrder,
  WorkOrderLine,
} from "@/lib/domain";
import type { DemoDatabase } from "../database";
import { BOQ_TEMPLATE, type ProjectPlan } from "./catalog";
import { baseRateOf, contractorByCode, materialByCode, type Masters } from "./masters";
import { daysAgoDate, daysAgoIso, daysAheadDate, jitter, rupees, sid } from "./ids";
import { seedMaterialThread } from "./material-thread-seed";
import { seedBillingThread } from "./billing-thread-seed";
import { seedAttachments } from "./attachment-seed";

/** Mutable row counters so ids stay unique across projects. */
export type Counters = Record<string, number>;

export function next(c: Counters, key: string): number {
  c[key] = (c[key] ?? 0) + 1;
  return c[key];
}

/**
 * How much of each material a BOQ line is budgeted to consume, per unit of BOQ
 * quantity. This is what BoqMaterialBudget rows are built from, and therefore
 * what every indent is checked against.
 *
 * Per item rather than per trade, because the lines of one trade differ: M30
 * takes more cement than M25, external plaster is thicker than internal, and
 * floor tiles are not wall tiles. Concrete carries no steel — reinforcement is
 * its own line, BOQ-04. The per-flat plumbing and electrical items budget
 * only the pipe and wire the site draws from stores; the fixtures come with
 * the contractor's supply-and-fix rate.
 */
const ITEM_FACTORS: Record<string, Record<string, number>> = {
  "BOQ-01": { "MAT-001": 7.2, "MAT-005": 0.16, "MAT-007": 0.3 },
  "BOQ-02": { "MAT-001": 8, "MAT-005": 0.16, "MAT-007": 0.3 },
  "BOQ-03": { "MAT-001": 8, "MAT-005": 0.16, "MAT-007": 0.3 },
  "BOQ-04": { "MAT-003": 0.55, "MAT-004": 0.47 },
  "BOQ-05": { "MAT-009": 8.6, "MAT-001": 0.3, "MAT-006": 0.006 },
  "BOQ-06": { "MAT-009": 8.6, "MAT-001": 0.25, "MAT-006": 0.005 },
  "BOQ-07": { "MAT-001": 0.18, "MAT-005": 0.004, "MAT-006": 0.003 },
  "BOQ-08": { "MAT-001": 0.3, "MAT-005": 0.008, "MAT-006": 0.004 },
  "BOQ-09": { "MAT-013": 1.15, "MAT-001": 0.12 },
  "BOQ-10": { "MAT-011": 1.1, "MAT-001": 0.25 },
  "BOQ-11": { "MAT-012": 1.08, "MAT-001": 0.2 },
  "BOQ-12": { "MAT-015": 0.24 },
  "BOQ-13": { "MAT-015": 0.36 },
  "BOQ-14": { "MAT-014": 45 },
  "BOQ-15": { "MAT-010": 320 },
};

/** The BOQ allows a small margin over the day's market rate. */
function budgetRateOf(code: string): number {
  return rupees(baseRateOf(code) * 1.05);
}

/** Material allowance per unit of a BOQ line, in rupees. */
function materialPerUnit(item_code: string): number {
  return Object.entries(ITEM_FACTORS[item_code] ?? {}).reduce(
    (sum, [code, perUnit]) => sum + perUnit * budgetRateOf(code),
    0,
  );
}

/* ------------------------------------------------------------------ */
/* Seeder                                                              */
/* ------------------------------------------------------------------ */

export function seedProject(
  db: DemoDatabase,
  plan: ProjectPlan,
  index: number,
  masters: Masters,
  counters: Counters,
): void {
  const project_id = sid("project", index + 1);
  const created = daysAgoIso(plan.started_days_ago);

  const projectContractors: Contractor[] = plan.contractors.map((code) =>
    contractorByCode(masters.contractors, code),
  );

  /* ---------------- BOQ ---------------- */
  const boqLines: BoqLine[] = BOQ_TEMPLATE.map((t, i) => {
    const quantity = Math.round(t.base_quantity * plan.scale);
    return {
      id: sid("boq_line", next(counters, "boq_line")),
      project_id,
      created_at: created,
      updated_at: daysAgoIso(30 + i),
      item_code: t.item_code,
      description: t.description,
      trade: t.trade,
      unit: t.unit,
      quantity,
      rate: t.rate,
      amount: rupees(quantity * t.rate),
    };
  });
  db.boq_lines.push(...boqLines);

  const project: Project = {
    id: project_id,
    created_at: created,
    updated_at: daysAgoIso(1),
    code: plan.code,
    short_code: plan.short_code,
    name: plan.name,
    location: plan.location,
    client_name: plan.client_name,
    status: plan.status,
    start_date: daysAgoDate(plan.started_days_ago),
    target_completion_date: daysAheadDate(plan.target_days_ahead),
    percent_complete: plan.percent_complete,
  };
  db.projects.push(project);

  /* ---------------- Work orders ---------------- */
  const workOrders: WorkOrder[] = [];
  const workOrderLines: WorkOrderLine[] = [];

  projectContractors.forEach((contractor, ci) => {
    const lines = boqLines.filter((l) => l.trade === contractor.trade);
    if (lines.length === 0) return;
    const wo_id = sid("work_order", next(counters, "work_order"));
    const woLines: WorkOrderLine[] = lines.map((l) => {
      // The BOQ rate is material plus labour. Material is budgeted on the
      // line and issued from stores, so the contractor is let the labour
      // share — and a few percent under it, which is the saving procurement
      // is there to find.
      const labour = l.rate - materialPerUnit(l.item_code);
      const agreed_rate = rupees(labour * (0.9 + jitter(ci * 13 + l.quantity) * 0.06));
      return {
        id: sid("work_order_line", next(counters, "work_order_line")),
        project_id,
        created_at: created,
        updated_at: daysAgoIso(20),
        work_order_id: wo_id,
        boq_line_id: l.id,
        description: l.description,
        unit: l.unit,
        quantity: l.quantity,
        agreed_rate,
        amount: rupees(l.quantity * agreed_rate),
        retention_percent: contractor.default_retention_percent,
        // All four roll-ups start empty; the billing thread fills them from
        // DPRs, measurements and certified bills.
        done_qty: 0,
        measured_qty: 0,
        billed_qty: 0,
        ready_to_measure: false,
        ready_qty: 0,
      };
    });
    workOrderLines.push(...woLines);
    workOrders.push({
      id: wo_id,
      project_id,
      created_at: created,
      updated_at: daysAgoIso(20),
      wo_number: `${plan.code}/WO/${String(ci + 1).padStart(3, "0")}`,
      contractor_id: contractor.id,
      title: `${contractor.trade.toUpperCase()} works — ${plan.name}`,
      scope_summary: `${lines.length} BOQ items covering ${contractor.trade} scope at ${plan.location}.`,
      issued_date: daysAgoDate(plan.started_days_ago - 20),
      start_date: daysAgoDate(plan.started_days_ago - 30),
      end_date: daysAheadDate(Math.round(plan.target_days_ahead * 0.7)),
      retention_percent: contractor.default_retention_percent,
      order_value: woLines.reduce((s, l) => s + l.amount, 0),
      is_active: true,
    });
  });
  db.work_orders.push(...workOrders);
  db.work_order_lines.push(...workOrderLines);

  /* ---------------- BOQ material budgets ---------------- */
  const materialBudgets: BoqMaterialBudget[] = [];
  boqLines.forEach((line) => {
    Object.entries(ITEM_FACTORS[line.item_code] ?? {}).forEach(([code, perUnit]) => {
      const material = materialByCode(masters.materials, code);
      materialBudgets.push({
        id: sid("boq_material_budget", next(counters, "boq_material_budget")),
        project_id,
        created_at: created,
        updated_at: created,
        boq_line_id: line.id,
        material_id: material.id,
        budget_qty: Math.round(line.quantity * perUnit * 100) / 100,
        budget_rate: budgetRateOf(code),
      });
    });
  });
  db.boq_material_budgets.push(...materialBudgets);


  /* ---------------- The material thread, A2 -> B8 ---------------- */
  const seedConsumptionHistory = seedMaterialThread({
    db,
    plan,
    index,
    masters,
    counters,
    project,
    boqLines,
    materialBudgets,
    workOrders,
  });

  /* ---------------- The billing thread, A1 -> C5 ---------------- */
  seedBillingThread({
    db,
    plan,
    masters,
    counters,
    project,
    boqLines,
    workOrders,
    workOrderLines,
  });

  /* ---------------- Material history, by each line's progress ------ */
  // Measured where the QS has measured, else what the site reports done.
  const lineShare = new Map<string, number>();
  boqLines.forEach((line) => {
    const woLines = workOrderLines.filter((l) => l.boq_line_id === line.id);
    const measured = woLines.reduce((s, l) => s + l.measured_qty, 0);
    const done = woLines.reduce((s, l) => s + l.done_qty, 0);
    const got = measured > 0 ? measured : done;
    if (line.quantity > 0 && got > 0) lineShare.set(line.id, got / line.quantity);
  });
  seedConsumptionHistory(lineShare);

  // Last: the paper hangs off records the threads above have written.
  seedAttachments(db, project_id, masters, counters);
}
