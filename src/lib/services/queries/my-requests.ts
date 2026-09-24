import { getRepositories } from "@/lib/data";
import { ageInDays } from "@/lib/clock";
import { ROLE_LABEL } from "@/config/permissions";
import type { Role, StepCode, Team } from "@/lib/domain";
import { inScope } from "./scope";
import type { QueryScope } from "./types";

/**
 * One thing this user submitted, and where it has got to.
 *
 * The mirror image of an ActionItem: that one says "you must act", this one
 * says "you asked, and here is who is sitting on it".
 */
export type MyRequest = {
  id: string;
  entity_type: string;
  entity_id: string;
  step_code: StepCode | null;
  team: Team;
  document_number: string;
  project_id: string;
  project_name: string;
  /** What the request was for — materials, supplier, work order. */
  context: string;
  /** Where it has got to, in the user's words. */
  stage: string;
  /** Whose desk it is on, or "" once nothing is pending. */
  waiting_on: string;
  /** Absent when the role may not see values — stripped by redactMoney. */
  value?: number;
  /** The date the clock started. */
  since: string;
  age_days: number;
  href: string;
  /** Sent back or rejected — these pin to the top of the list. */
  attention: "sent_back" | "rejected" | null;
  /** The decision comment, when there is one. */
  comment: string;
  /** Nothing further is expected: received, closed, handed over. */
  settled: boolean;
};

/**
 * Everything the current user has put into the system, newest trouble first.
 *
 * A Site Engineer sees the indents and GRNs he raised; a Purchase Officer sees
 * the comparatives he prepared. Anything sent back or rejected sorts to the
 * top, because that is the only part of the list that needs them.
 */
export async function getMyRequests(scope: QueryScope): Promise<MyRequest[]> {
  const repos = getRepositories();
  const projects = await repos.projects.list();
  const byProject = new Map(projects.map((p) => [p.id, p]));
  const name = (id: string) => byProject.get(id)?.name ?? "";

  const rows: MyRequest[] = [];

  if (scope.role === "site_engineer") {
    await indentRequests(scope, name, rows);
    await grnRequests(scope, name, rows);
  }
  if (scope.role === "purchase_officer" || scope.role === "purchase_head") {
    await comparativeRequests(scope, name, rows);
  }

  // Trouble first, then the oldest thing still waiting, then the settled tail.
  return rows.sort(
    (a, b) =>
      Number(b.attention !== null) - Number(a.attention !== null) ||
      Number(a.settled) - Number(b.settled) ||
      b.age_days - a.age_days,
  );
}

/** How many of this user's requests came back needing rework. */
export async function getSentBackCount(scope: QueryScope): Promise<number> {
  const rows = await getMyRequests(scope);
  return rows.filter((r) => r.attention !== null).length;
}

/* ------------------------------------------------------------------ */
/* A2 indents                                                          */
/* ------------------------------------------------------------------ */

async function indentRequests(scope: QueryScope, name: (id: string) => string, out: MyRequest[]) {
  const repos = getRepositories();
  const mine = inScope(await repos.indents.list(), scope).filter(
    (i) => i.raised_by_user_id === scope.user_id,
  );
  const lines = await repos.indents.listLines();
  const materials = await repos.materials.list();
  const materialName = new Map(materials.map((m) => [m.id, m.name]));

  mine.forEach((indent) => {
    const context = lines
      .filter((l) => l.indent_id === indent.id)
      .slice(0, 2)
      .map((l) => materialName.get(l.material_id) ?? "")
      .filter(Boolean)
      .join(", ");

    const { stage, waiting_on, settled } = indentStage(indent.status);
    out.push({
      id: `indent:${indent.id}`,
      entity_type: "indent",
      entity_id: indent.id,
      step_code: "A2",
      team: "site_execution",
      document_number: indent.indent_number,
      project_id: indent.project_id,
      project_name: name(indent.project_id),
      context,
      stage,
      waiting_on,
      since: indent.raised_date,
      age_days: ageInDays(indent.raised_date),
      href: `/projects/${indent.project_id}/site/indents`,
      attention: indent.status === "rejected" ? "rejected" : null,
      comment: indent.approval_comment ?? "",
      settled,
    });
  });
}

function indentStage(status: string): { stage: string; waiting_on: string; settled: boolean } {
  switch (status) {
    case "submitted":
      return { stage: "Waiting for approval", waiting_on: ROLE_LABEL.project_head, settled: false };
    case "approved":
    case "partially_approved":
      return { stage: "Approved — waiting to be quoted", waiting_on: ROLE_LABEL.purchase_officer, settled: false };
    case "rejected":
      return { stage: "Rejected", waiting_on: "", settled: true };
    case "in_comparative":
      return { stage: "On a comparative", waiting_on: ROLE_LABEL.purchase_head, settled: false };
    case "po_raised":
      return { stage: "Purchase order raised", waiting_on: "the supplier", settled: false };
    case "partially_received":
      return { stage: "Part delivered", waiting_on: "the supplier", settled: false };
    case "received":
      return { stage: "Fully received", waiting_on: "", settled: true };
    default:
      return { stage: "Closed", waiting_on: "", settled: true };
  }
}

/* ------------------------------------------------------------------ */
/* B5–B6 GRNs — posted by the site, then matched by purchase           */
/* ------------------------------------------------------------------ */

async function grnRequests(scope: QueryScope, name: (id: string) => string, out: MyRequest[]) {
  const repos = getRepositories();
  const mine = inScope(await repos.grns.list(), scope).filter(
    (g) => g.received_by_user_id === scope.user_id,
  );
  const suppliers = await repos.suppliers.list();
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));
  const bills = await repos.vendorBills.list();

  mine.forEach((grn) => {
    const bill = bills.find((b) => b.grn_ids.includes(grn.id));
    out.push({
      id: `grn:${grn.id}`,
      entity_type: "grn",
      entity_id: grn.id,
      step_code: "B5",
      team: "site_execution",
      document_number: grn.grn_number,
      project_id: grn.project_id,
      project_name: name(grn.project_id),
      context: supplierName.get(grn.supplier_id) ?? "",
      stage: bill
        ? bill.status === "handed_over"
          ? "Billed and handed to Accounts"
          : "Vendor bill raised against it"
        : "Posted — no vendor bill yet",
      waiting_on: bill && bill.status !== "handed_over" ? ROLE_LABEL.purchase_officer : "",
      since: grn.received_on,
      age_days: ageInDays(grn.received_on),
      href: `/projects/${grn.project_id}/site/grn`,
      attention: null,
      comment: "",
      settled: Boolean(bill && bill.status === "handed_over"),
    });
  });
}

/* ------------------------------------------------------------------ */
/* B1–B2 comparatives                                                  */
/* ------------------------------------------------------------------ */

async function comparativeRequests(
  scope: QueryScope,
  name: (id: string) => string,
  out: MyRequest[],
) {
  const repos = getRepositories();
  const mine = inScope(await repos.comparatives.list(), scope).filter(
    (c) => c.prepared_by_user_id === scope.user_id,
  );
  const suppliers = await repos.suppliers.list();
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));
  const lines = await repos.comparatives.listLines();

  mine.forEach((comparative) => {
    const { stage, waiting_on, settled, attention } = comparativeStage(comparative.status);
    out.push({
      id: `comparative:${comparative.id}`,
      entity_type: "comparative",
      entity_id: comparative.id,
      step_code: "B2",
      team: "purchase_stores",
      document_number: comparative.comparative_number,
      project_id: comparative.project_id,
      project_name: name(comparative.project_id),
      context: selectedSuppliers(comparative.id, lines, supplierName),
      stage,
      waiting_on,
      value: comparative.total_selected_value,
      since: comparative.prepared_date,
      age_days: ageInDays(comparative.prepared_date),
      href: `/projects/${comparative.project_id}/purchase/comparatives`,
      attention,
      comment: comparative.decision_comment ?? "",
      settled,
    });
  });
}

/** The vendors this comparative actually recommends, named once each. */
function selectedSuppliers(
  comparativeId: string,
  lines: Array<{ comparative_id: string; selected_supplier_id: string | null }>,
  supplierName: Map<string, string>,
): string {
  const names = [
    ...new Set(
      lines
        .filter((l) => l.comparative_id === comparativeId && l.selected_supplier_id)
        .map((l) => supplierName.get(l.selected_supplier_id as string) ?? "")
        .filter(Boolean),
    ),
  ];
  return names.length > 0 ? names.join(", ") : "No vendor selected yet";
}

function comparativeStage(status: string): {
  stage: string;
  waiting_on: string;
  settled: boolean;
  attention: MyRequest["attention"];
} {
  switch (status) {
    case "draft":
      return { stage: "Draft — not submitted", waiting_on: "you", settled: false, attention: null };
    case "pending_approval":
      return {
        stage: "Waiting for approval",
        waiting_on: ROLE_LABEL.purchase_head,
        settled: false,
        attention: null,
      };
    case "sent_back":
      return { stage: "Sent back", waiting_on: "you", settled: false, attention: "sent_back" };
    case "rejected":
      return { stage: "Rejected", waiting_on: "", settled: true, attention: "rejected" };
    default:
      return { stage: "Approved", waiting_on: "", settled: true, attention: null };
  }
}

/** Roles that raise requests rather than approve them. */
export function usesMyRequests(role: Role): boolean {
  return role === "site_engineer" || role === "purchase_officer";
}
