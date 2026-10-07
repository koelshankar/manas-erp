import { getRepositories } from "@/lib/data";
import { ageInDays } from "@/lib/clock";
import { recordLabel } from "@/config/labels";
import type { Team } from "@/lib/domain";
import type { QueryScope } from "./types";

/** One thing this user did, for the "Recent activity" panel on My work. */
export type ActivityEntry = {
  id: string;
  entity_type: string;
  entity_id: string;
  team: Team;
  /** What happened, in plain words: "Raised indent", "Decided approval". */
  action: string;
  document_number: string;
  project_id: string;
  project_name: string;
  /** Absent when the role may not see values — stripped by redactMoney. */
  value?: number;
  at: string;
  age_days: number;
  href: string;
};

const MAX = 8;

/**
 * What this user has touched lately, newest first.
 *
 * My work answers "what is on me?"; three of its panels are queues, and this
 * is the fourth — the one that says "and here is what you just did". It is the
 * trail back to a record you filed ten minutes ago and now want to correct,
 * which otherwise means remembering which list it landed in.
 *
 * Deliberately narrow: the records a user actually authors or decides. This is
 * a demo-grade read over `created_by` and the approval log; in Postgres it
 * becomes a view over an events table, which is where a real audit trail
 * belongs.
 */
export async function getMyRecentActivity(scope: QueryScope): Promise<ActivityEntry[]> {
  const repos = getRepositories();
  const projects = await repos.projects.list();
  const byProject = new Map(projects.map((p) => [p.id, p]));
  const projectName = (id: string) => byProject.get(id)?.name ?? "";
  const mine = (projectId: string) => scope.project_ids.includes(projectId);

  const rows: ActivityEntry[] = [];

  const [indents, grns, comparatives, pos, measurements, bills, dprs, approvals] =
    await Promise.all([
      repos.indents.list(),
      repos.grns.list(),
      repos.comparatives.list(),
      repos.purchaseOrders.list(),
      repos.measurements.list(),
      repos.raBills.list(),
      repos.dprs.list(),
      repos.approvals.list(),
    ]);

  const add = (
    entity_type: string,
    entity_id: string,
    team: Team,
    action: string,
    document_number: string,
    project_id: string,
    at: string,
    href: string,
    value?: number,
  ) => {
    if (!mine(project_id)) return;
    rows.push({
      id: `${entity_type}:${entity_id}:${at}:${action}`,
      entity_type,
      entity_id,
      team,
      action,
      document_number,
      project_id,
      project_name: projectName(project_id),
      value,
      at,
      age_days: ageInDays(at),
      href,
    });
  };

  indents
    .filter((r) => r.raised_by_user_id === scope.user_id)
    .forEach((r) =>
      add(
        "indent",
        r.id,
        "site_execution",
        "Raised indent",
        r.indent_number,
        r.project_id,
        r.created_at,
        `/projects/${r.project_id}/procurement/indents`,
      ),
    );

  grns
    .filter((r) => r.received_by_user_id === scope.user_id)
    .forEach((r) =>
      add(
        "grn",
        r.id,
        "site_execution",
        "Posted GRN",
        r.grn_number,
        r.project_id,
        r.created_at,
        `/projects/${r.project_id}/procurement/grn`,
      ),
    );

  dprs
    .filter((r) => r.prepared_by_user_id === scope.user_id)
    .forEach((r) =>
      add(
        "dpr",
        r.id,
        "site_execution",
        "Filed daily report",
        r.report_date,
        r.project_id,
        r.created_at,
        `/projects/${r.project_id}/progress/daily-report`,
      ),
    );

  comparatives
    .filter((r) => r.prepared_by_user_id === scope.user_id)
    .forEach((r) =>
      add(
        "comparative",
        r.id,
        "purchase_stores",
        "Prepared comparative",
        r.comparative_number,
        r.project_id,
        r.created_at,
        `/projects/${r.project_id}/procurement/comparatives`,
      ),
    );

  pos
    .filter((r) => r.raised_by_user_id === scope.user_id)
    .forEach((r) =>
      add(
        "purchase_order",
        r.id,
        "purchase_stores",
        "Raised purchase order",
        r.po_number,
        r.project_id,
        r.created_at,
        `/projects/${r.project_id}/procurement/purchase-orders`,
        r.total_amount,
      ),
    );

  measurements
    .filter((r) => r.measured_by_user_id === scope.user_id)
    .forEach((r) =>
      add(
        "joint_measurement",
        r.id,
        "billing_certification",
        "Recorded measurement",
        r.measurement_number,
        r.project_id,
        r.created_at,
        `/projects/${r.project_id}/billing/measurements`,
      ),
    );

  bills
    .filter((r) => r.prepared_by_user_id === scope.user_id)
    .forEach((r) =>
      add(
        "ra_bill",
        r.id,
        "billing_certification",
        "Submitted RA bill",
        r.bill_number,
        r.project_id,
        r.created_at,
        `/projects/${r.project_id}/billing/ra-bills`,
        r.net_payable_amount,
      ),
    );

  // Decisions, which is the whole of an approver's activity.
  approvals
    .filter((a) => a.actor_user_id === scope.user_id && a.acted_at !== null)
    .forEach((a) =>
      add(
        a.entity_type,
        a.entity_id,
        "project_budget",
        a.status === "approved"
          ? `Approved ${recordLabel(a.entity_type).toLowerCase()}`
          : a.status === "sent_back"
            ? `Sent back ${recordLabel(a.entity_type).toLowerCase()}`
            : `Rejected ${recordLabel(a.entity_type).toLowerCase()}`,
        // A gate pass approval has no chart step, so the row names the record.
        a.step_code ?? recordLabel(a.entity_type),
        a.project_id ?? "",
        a.acted_at as string,
        "/approvals",
      ),
    );

  return rows.sort((a, b) => b.at.localeCompare(a.at)).slice(0, MAX);
}
