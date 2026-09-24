import type {
  BoqLine,
  BoqMaterialBudget,
  Contractor,
  Project,
  Trade,
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
 */
const BUDGET_FACTORS: Record<Trade, Record<string, number>> = {
  rcc: { "MAT-001": 7.2, "MAT-003": 0.085, "MAT-005": 0.018, "MAT-007": 0.031 },
  masonry: { "MAT-009": 8.4, "MAT-001": 0.35, "MAT-006": 0.006 },
  plaster: { "MAT-001": 0.18, "MAT-005": 0.004, "MAT-006": 0.003 },
  waterproofing: { "MAT-013": 1.1, "MAT-001": 0.12 },
  flooring: { "MAT-011": 1.05, "MAT-012": 0.28, "MAT-001": 0.22 },
  painting: { "MAT-015": 0.22 },
  plumbing: { "MAT-014": 8 },
  electrical: { "MAT-010": 95 },
  general: {},
};

/** The reinforcement BOQ line is measured in tonnes of steel, not concrete. */
const STEEL_LINE_FACTORS: Record<string, number> = { "MAT-003": 0.55, "MAT-004": 0.45 };

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
      // The contractor's agreed rate sits below the BOQ sell rate.
      const agreed_rate = rupees(l.rate * (0.83 + jitter(ci * 13 + l.quantity) * 0.06));
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
    const factors = line.item_code === "BOQ-04" ? STEEL_LINE_FACTORS : BUDGET_FACTORS[line.trade];
    Object.entries(factors).forEach(([code, perUnit]) => {
      const material = materialByCode(masters.materials, code);
      materialBudgets.push({
        id: sid("boq_material_budget", next(counters, "boq_material_budget")),
        project_id,
        created_at: created,
        updated_at: created,
        boq_line_id: line.id,
        material_id: material.id,
        budget_qty: Math.round(line.quantity * perUnit * 100) / 100,
        // The BOQ allows a small margin over the day's market rate.
        budget_rate: rupees(baseRateOf(code) * 1.05),
      });
    });
  });
  db.boq_material_budgets.push(...materialBudgets);


  /* ---------------- The material thread, A2 -> B8 ---------------- */
  seedMaterialThread({
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

  // Last: the paper hangs off records the threads above have written.
  seedAttachments(db, project_id, masters, counters);
}
