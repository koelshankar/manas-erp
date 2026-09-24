import { getRepositories } from "@/lib/data";
import { budgetVsActual, needsAttention, overrunOf, projectBudgetSummary } from "../budget-service";
import { can } from "@/config/permissions";
import { getIssuedVsMeasured } from "../measurement-service";
import { formatInrCompact } from "@/lib/format";
import { rupees } from "../pricing";
import { inScope } from "./scope";
import type { Kpi, QueryScope } from "./types";

/* Project & Budget dashboard. */

export type ProjectCard = {
  project_id: string;
  name: string;
  location: string;
  status: string;
  code: string;
  start_date: string;
  target_completion_date: string;
  budget: number;
  material_budget: number;
  labour_budget: number;
  material_actual: number;
  certified_actual: number;
  total_actual: number;
  variance: number;
  variance_percent: number;
  /** total_actual ÷ budget, whole percent. */
  spent_percent: number;
  percent_complete: number;
  href: string;
};

/** Budget against material issued plus contractor certified, per project. */
export async function getProjectCards(scope: QueryScope): Promise<ProjectCard[]> {
  const repos = getRepositories();
  const projects = (await repos.projects.list()).filter((p) => scope.project_ids.includes(p.id));

  const cards: ProjectCard[] = [];
  for (const project of projects) {
    const summary = await projectBudgetSummary(project.id);
    const { budget, actual: total_actual } = summary;
    cards.push({
      project_id: project.id,
      name: project.name,
      location: project.location,
      status: project.status,
      code: project.code,
      start_date: project.start_date,
      target_completion_date: project.target_completion_date,
      budget,
      material_budget: summary.material_budget,
      labour_budget: summary.labour_budget,
      material_actual: summary.material_actual,
      certified_actual: summary.certified_actual,
      total_actual,
      variance: rupees(budget - total_actual),
      variance_percent: budget > 0 ? Math.round(((budget - total_actual) / budget) * 1000) / 10 : 0,
      spent_percent: summary.spent_percent,
      percent_complete: project.percent_complete,
      href: `/projects/${project.id}/budget/budget-vs-actual`,
    });
  }
  return cards;
}

/**
 * Budget, actual, and spend read against progress — the three figures the
 * dashboard and a project's Budget vs Actual page share. `href` is where each
 * card leads; omitted when the cards already sit on that page.
 */
function budgetKpis(cards: ProjectCard[], href?: string): Kpi[] {
  const budget = rupees(cards.reduce((s, c) => s + c.budget, 0));
  const actual = rupees(cards.reduce((s, c) => s + c.total_actual, 0));
  const material = rupees(cards.reduce((s, c) => s + c.material_actual, 0));
  const certified = rupees(cards.reduce((s, c) => s + c.certified_actual, 0));
  const spent = budget > 0 ? Math.round((actual / budget) * 100) : 0;
  // Progress across several sites is weighted by budget, so a small site
  // cannot drag the figure around.
  const complete =
    budget > 0
      ? Math.round(cards.reduce((s, c) => s + c.percent_complete * c.budget, 0) / budget)
      : 0;
  const ahead = spent - complete;

  return [
    {
      key: "budget",
      label: "Total budget",
      display: formatInrCompact(budget),
      hint:
        cards.length === 1
          ? `Material ${formatInrCompact(cards[0].material_budget)} · labour ${formatInrCompact(cards[0].labour_budget)}`
          : `${cards.length} projects you are posted to`,
      href,
    },
    {
      key: "actual",
      label: "Actual to date",
      display: formatInrCompact(actual),
      hint: `Material ${formatInrCompact(material)} · contractors ${formatInrCompact(certified)}`,
      href,
    },
    {
      // Budget left says nothing on its own: 45% left is fine at 40% complete
      // and alarming at 90%. Spend is read against progress.
      key: "spent_vs_progress",
      label: "Spent vs progress",
      display: `${spent}% spent`,
      hint:
        spent > 100
          ? `Over budget · ${complete}% complete`
          : ahead > 5
            ? `${complete}% complete · spending ahead of the work`
            : `${complete}% complete · in step with the work`,
      tone: spent > 100 ? "bad" : ahead > 5 ? "warn" : "neutral",
      href,
    },
  ];
}

export async function getProjectHeadKpis(scope: QueryScope): Promise<Kpi[]> {
  const repos = getRepositories();
  const cards = await getProjectCards(scope);

  const indents = inScope(await repos.indents.list(), scope).filter(
    (i) => i.status === "submitted",
  );
  const bills = inScope(await repos.raBills.list(), scope).filter(
    (b) => b.status === "in_certification" && b.current_sequence === 2,
  );

  // One project in view: its own page. Several: the roll-up across them.
  const budgetHref = cards.length === 1 ? cards[0].href : "/reports/budget-vs-actual";

  return [
    ...budgetKpis(cards, budgetHref),
    {
      key: "awaiting",
      label: "Awaiting my approval",
      display: String(indents.length + bills.length),
      hint: `${indents.length} indent${indents.length === 1 ? "" : "s"} · ${bills.length} bill${bills.length === 1 ? "" : "s"}`,
      tone: indents.length + bills.length > 0 ? "warn" : "neutral",
      href: "/approvals",
    },
  ];
}

/**
 * The KPI row on one project's Budget vs Actual page: the dashboard's three
 * budget figures, plus how many BOQ lines need looking at. Empty for a role
 * the page itself shows no values to — every one of these is a rupee figure
 * or a judgement on one, and `display` is a pre-formatted string the
 * redaction cannot strip.
 */
export async function getProjectBudgetKpis(
  scope: QueryScope,
  project_id: string,
): Promise<Kpi[]> {
  if (!can(scope.role, "view_values", "budget_vs_actual")) return [];
  const cards = await getProjectCards({ ...scope, project_ids: [project_id] });
  const rows = await budgetVsActual(project_id);
  const attention = rows.filter(needsAttention);
  const over = rows.filter((r) => overrunOf(r) !== null).length;
  const flagged = rows.filter((r) => r.issued_vs_measured_flagged).length;

  return [
    ...budgetKpis(cards),
    {
      key: "attention",
      label: "Lines needing attention",
      display: String(attention.length),
      hint:
        attention.length === 0
          ? "Every line is inside its budget"
          : `${over} over budget · ${flagged} drawing excess material`,
      tone: attention.length > 0 ? "warn" : "neutral",
    },
  ];
}

export type OverBudgetLine = {
  project_id: string;
  project_name: string;
  /** Which allowance was passed — the line's material, or the line itself. */
  head: "material" | "total";
  boq_line_id: string;
  item_code: string;
  description: string;
  budget: number;
  actual: number;
  overrun: number;
  percent_consumed: number;
  href: string;
};

/** BOQ lines consuming more than they were budgeted, worst overrun first. */
export async function getOverBudgetLines(
  scope: QueryScope,
  limit = 5,
): Promise<OverBudgetLine[]> {
  const projects = await getRepositories().projects.list();
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const rows: OverBudgetLine[] = [];
  for (const project_id of scope.project_ids) {
    for (const r of await budgetVsActual(project_id)) {
      const over = overrunOf(r);
      if (!over) continue;
      rows.push({
        project_id,
        project_name: projectName.get(project_id) ?? "",
        head: over.head,
        boq_line_id: r.boq_line_id,
        item_code: r.item_code,
        description: r.description,
        budget: over.budget,
        actual: over.actual,
        overrun: over.overrun,
        percent_consumed: over.percent_consumed,
        href: `/projects/${project_id}/budget/budget-vs-actual`,
      });
    }
  }
  return rows.sort((a, b) => b.overrun - a.overrun).slice(0, limit);
}

export type WorkOrderNearLimit = {
  work_order_id: string;
  wo_number: string;
  project_id: string;
  contractor_name: string;
  order_value: number;
  certified: number;
  percent_used: number;
  href: string;
};

/**
 * Work orders whose certified value has reached 85% of the order — the point
 * at which a variation order usually has to be thought about.
 */
export async function getWorkOrdersNearLimit(
  scope: QueryScope,
  threshold = 85,
): Promise<WorkOrderNearLimit[]> {
  const repos = getRepositories();
  const [workOrders, bills, contractors] = await Promise.all([
    repos.workOrders.list(),
    repos.raBills.list(),
    repos.contractors.list(),
  ]);
  const contractorName = new Map(contractors.map((c) => [c.id, c.name]));

  return inScope(workOrders, scope)
    .map((wo) => {
      const certified = rupees(
        bills
          .filter(
            (b) =>
              b.work_order_id === wo.id &&
              (b.status === "certified" || b.status === "handed_over"),
          )
          .reduce((s, b) => s + b.gross_amount, 0),
      );
      const percent_used =
        wo.order_value > 0 ? Math.round((certified / wo.order_value) * 1000) / 10 : 0;
      return {
        work_order_id: wo.id,
        wo_number: wo.wo_number,
        project_id: wo.project_id,
        contractor_name: contractorName.get(wo.contractor_id) ?? "",
        order_value: wo.order_value,
        certified,
        percent_used,
        href: `/projects/${wo.project_id}/budget/work-orders`,
      };
    })
    .filter((r) => r.percent_used >= threshold)
    .sort((a, b) => b.percent_used - a.percent_used);
}

export type IssuedVsMeasuredFlag = {
  project_id: string;
  project_name: string;
  boq_line_id: string;
  item_code: string;
  description: string;
  material_id: string;
  variance_percent: number;
  issued_qty: number;
  theoretical_qty: number;
  unit: string;
  href: string;
};

/** The dashed line on the chart, wherever it is out by more than tolerance. */
export async function getIssuedVsMeasuredFlags(
  scope: QueryScope,
  limit = 6,
): Promise<IssuedVsMeasuredFlag[]> {
  const projects = await getRepositories().projects.list();
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const rows: IssuedVsMeasuredFlag[] = [];
  for (const project_id of scope.project_ids) {
    for (const r of await getIssuedVsMeasured(project_id)) {
      // is_flagged is now false for an unmeasured line, so variance_percent
      // is guaranteed non-null here.
      if (!r.is_flagged || r.variance_percent === null) continue;
      rows.push({
        project_id,
        project_name: projectName.get(project_id) ?? "",
        boq_line_id: r.boq_line_id,
        item_code: r.item_code,
        description: r.description,
        material_id: r.material_id,
        variance_percent: r.variance_percent,
        issued_qty: r.issued_qty,
        theoretical_qty: r.theoretical_qty,
        unit: r.unit,
        href: `/projects/${project_id}/billing/measurements`,
      });
    }
  }
  return rows.sort((a, b) => b.variance_percent - a.variance_percent).slice(0, limit);
}
