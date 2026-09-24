import { getRepositories } from "@/lib/data";
import { ageInDays, today } from "@/lib/clock";
import type { QueryScope } from "./types";
import { canSeeValues } from "./redaction";
import { projectBudgetSummary } from "../budget-service";

/**
 * The figures in the pinned project header.
 *
 * Two shapes, decided here rather than on the screen. A role that may see
 * values gets budget and spend; a value-blind role gets the four numbers that
 * actually govern their day — how far the work has got, how long is left, what
 * they are waiting on, and what is arriving. The money is not in the payload
 * at all, so the header cannot print it by accident (audit C1).
 */
export type ProjectHeaderStats = {
  project_id: string;
  name: string;
  code: string;
  location: string;
  status: string;
  percent_complete: number;
  target_completion_date: string;
  /** Negative once the target has passed. */
  days_to_target: number;
  /** Present only for a role that may see values. Spent is the actual to date. */
  budget_amount?: number;
  spent_amount?: number;
  spent_percent?: number;
  /** Present only for a value-blind role. */
  open_indents?: number;
  deliveries_due?: number;
};

export async function getProjectHeaderStats(
  scope: QueryScope,
  project_id: string,
): Promise<ProjectHeaderStats | null> {
  const repos = getRepositories();
  const project = (await repos.projects.list()).find((p) => p.id === project_id);
  if (!project) return null;

  const base = {
    project_id: project.id,
    name: project.name,
    code: project.code,
    location: project.location,
    status: project.status,
    percent_complete: project.percent_complete,
    target_completion_date: project.target_completion_date,
    // ageInDays counts backwards from today, so a future target is negative.
    days_to_target: -ageInDays(project.target_completion_date),
  };

  if (canSeeValues(scope.role)) {
    // The same roll-up as the dashboard's project cards and the report.
    const summary = await projectBudgetSummary(project_id);
    return {
      ...base,
      budget_amount: summary.budget,
      spent_amount: summary.actual,
      spent_percent: summary.spent_percent,
    };
  }

  const [indents, purchaseOrders] = await Promise.all([
    repos.indents.listByProject(project_id),
    repos.purchaseOrders.listByProject(project_id),
  ]);

  const open_indents = indents.filter((i) =>
    ["submitted", "approved", "partially_approved", "in_comparative", "po_raised"].includes(
      i.status,
    ),
  ).length;

  const now = today();
  const deliveries_due = purchaseOrders.filter(
    (p) =>
      (p.status === "sent" || p.status === "partially_received") &&
      p.expected_delivery_date <= now,
  ).length;

  return { ...base, open_indents, deliveries_due };
}
