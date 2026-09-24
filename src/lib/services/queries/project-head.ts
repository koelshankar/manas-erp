import { getRepositories } from "@/lib/data";
import { budgetVsActual } from "../budget-service";
import { getIssuedVsMeasured } from "../measurement-service";
import { formatInrCompact, formatPercent } from "@/lib/format";
import { rupees } from "../pricing";
import { inScope } from "./scope";
import type { Kpi, QueryScope } from "./types";

/* Project & Budget dashboard. */

export type ProjectCard = {
  project_id: string;
  name: string;
  location: string;
  budget: number;
  material_actual: number;
  certified_actual: number;
  total_actual: number;
  variance: number;
  variance_percent: number;
  percent_complete: number;
  href: string;
};

/** Budget against material issued plus contractor certified, per project. */
export async function getProjectCards(scope: QueryScope): Promise<ProjectCard[]> {
  const repos = getRepositories();
  const projects = (await repos.projects.list()).filter((p) => scope.project_ids.includes(p.id));

  const cards: ProjectCard[] = [];
  for (const project of projects) {
    const rows = await budgetVsActual(project.id);
    const budget = rupees(rows.reduce((s, r) => s + r.total_budget, 0));
    const material_actual = rupees(rows.reduce((s, r) => s + r.material_issued_value, 0));
    const certified_actual = rupees(rows.reduce((s, r) => s + r.certified_amount, 0));
    const total_actual = rupees(material_actual + certified_actual);
    cards.push({
      project_id: project.id,
      name: project.name,
      location: project.location,
      budget,
      material_actual,
      certified_actual,
      total_actual,
      variance: rupees(budget - total_actual),
      variance_percent: budget > 0 ? Math.round(((budget - total_actual) / budget) * 1000) / 10 : 0,
      percent_complete: project.percent_complete,
      href: `/projects/${project.id}/budget/budget-vs-actual`,
    });
  }
  return cards;
}

export async function getProjectHeadKpis(scope: QueryScope): Promise<Kpi[]> {
  const repos = getRepositories();
  const cards = await getProjectCards(scope);
  const budget = rupees(cards.reduce((s, c) => s + c.budget, 0));
  const actual = rupees(cards.reduce((s, c) => s + c.total_actual, 0));
  const variance_percent = budget > 0 ? Math.round(((budget - actual) / budget) * 1000) / 10 : 0;

  const indents = inScope(await repos.indents.list(), scope).filter(
    (i) => i.status === "submitted",
  );
  const bills = inScope(await repos.raBills.list(), scope).filter(
    (b) => b.status === "in_certification" && b.current_sequence === 2,
  );

  return [
    {
      key: "budget",
      label: "Total budget",
      display: formatInrCompact(budget),
      hint: `${cards.length} project${cards.length === 1 ? "" : "s"} you are posted to`,
      href: "/reports/budget-vs-actual",
    },
    {
      key: "actual",
      label: "Actual to date",
      display: formatInrCompact(actual),
      hint: "Material issued plus contractor certified",
      href: "/reports/budget-vs-actual",
    },
    {
      key: "variance",
      label: "Variance",
      display: formatPercent(variance_percent, 1),
      hint: variance_percent < 0 ? "Over budget" : "Budget remaining",
      tone: variance_percent < 0 ? "bad" : "good",
      href: "/reports/budget-vs-actual",
    },
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

export type OverBudgetLine = {
  project_id: string;
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
  const rows: OverBudgetLine[] = [];
  for (const project_id of scope.project_ids) {
    for (const r of await budgetVsActual(project_id)) {
      if (r.total_budget <= 0 || r.total_actual <= r.total_budget) continue;
      rows.push({
        project_id,
        boq_line_id: r.boq_line_id,
        item_code: r.item_code,
        description: r.description,
        budget: r.total_budget,
        actual: r.total_actual,
        overrun: rupees(r.total_actual - r.total_budget),
        percent_consumed: r.total_percent_consumed,
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
  const rows: IssuedVsMeasuredFlag[] = [];
  for (const project_id of scope.project_ids) {
    for (const r of await getIssuedVsMeasured(project_id)) {
      // is_flagged is now false for an unmeasured line, so variance_percent
      // is guaranteed non-null here.
      if (!r.is_flagged || r.variance_percent === null) continue;
      rows.push({
        project_id,
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
