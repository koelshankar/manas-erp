import { getRepositories } from "@/lib/data";
import { APPROVAL_CHAINS, ROLE_LABEL } from "@/config/permissions";
import { ageInDays, isThisMonth } from "@/lib/clock";
import { formatInrCompact } from "@/lib/format";
import { rupees } from "../pricing";
import { contractorRunningAccount } from "../billing-service";
import type { Role, StepCode } from "@/lib/domain";
import { inScope } from "./scope";
import type { Kpi, QueryScope } from "./types";

/* Billing & Certification dashboards — Project QS, QS Head and HoD. */

export async function getQsKpis(scope: QueryScope): Promise<Kpi[]> {
  const repos = getRepositories();
  const [lines, measurements, bills] = await Promise.all([
    repos.workOrders.listLines(),
    repos.measurements.list(),
    repos.raBills.list(),
  ]);
  const project = scope.project_ids[0];

  const ready = inScope(lines, scope).filter((l) => l.ready_to_measure).length;
  const unsigned = inScope(measurements, scope).filter((m) => m.status === "draft").length;
  const inChain = inScope(bills, scope).filter((b) => b.status === "in_certification").length;
  const retention = rupees(
    inScope(bills, scope)
      .filter((b) => b.status === "certified" || b.status === "handed_over")
      .reduce((s, b) => s + b.retention_amount, 0),
  );

  return [
    {
      key: "ready",
      label: "Lines ready to measure",
      display: String(ready),
      hint: "Flagged by the site",
      tone: ready > 0 ? "warn" : "neutral",
      href: project ? `/projects/${project}/billing/measurements` : undefined,
    },
    {
      key: "unsigned",
      label: "Measurements to sign",
      display: String(unsigned),
      hint: "Drafted, not yet signed",
      tone: unsigned > 0 ? "warn" : "neutral",
      href: project ? `/projects/${project}/billing/measurements` : undefined,
    },
    {
      key: "in_chain",
      label: "Bills in certification",
      display: String(inChain),
      hint: "Somewhere in C3–C4",
      href: project ? `/projects/${project}/billing/certification` : undefined,
    },
    {
      key: "retention",
      label: "Retention held",
      display: formatInrCompact(retention),
      hint: "Across certified bills",
      href: "/ledgers/contractors",
    },
  ];
}

export async function getApproverKpis(scope: QueryScope): Promise<Kpi[]> {
  const repos = getRepositories();
  const bills = inScope(await repos.raBills.list(), scope);

  const step = APPROVAL_CHAINS.ra_bill.find((s) => s.required_role === scope.role);
  const mine = bills.filter(
    (b) => b.status === "in_certification" && b.current_sequence === step?.sequence,
  );
  const certifiedThisMonth = bills.filter((b) => isThisMonth(b.certified_at?.slice(0, 10)));
  const handedThisMonth = bills.filter((b) => isThisMonth(b.handed_over_at?.slice(0, 10)));
  const stuck = bills.filter(
    (b) => b.status === "in_certification" && ageInDays(b.submitted_at) > 7,
  );

  return [
    {
      key: "mine",
      label: "Awaiting my approval",
      display: String(mine.length),
      hint: formatInrCompact(rupees(mine.reduce((s, b) => s + b.gross_amount, 0))),
      tone: mine.length > 0 ? "warn" : "neutral",
      href: "/approvals",
    },
    {
      key: "certified",
      label: "Certified this month",
      display: String(certifiedThisMonth.length),
      hint: formatInrCompact(rupees(certifiedThisMonth.reduce((s, b) => s + b.gross_amount, 0))),
      tone: "good",
    },
    {
      key: "handed",
      label: "Sent to accounts",
      display: String(handedThisMonth.length),
      hint: formatInrCompact(
        rupees(handedThisMonth.reduce((s, b) => s + b.net_payable_amount, 0)),
      ),
      href: "/accounts-handover",
    },
    {
      key: "stuck",
      label: "Stuck over 7 days",
      display: String(stuck.length),
      hint: "Anywhere in the chain",
      tone: stuck.length > 0 ? "bad" : "good",
    },
  ];
}

export type CertificationStage = {
  sequence: number;
  step_code: StepCode;
  role: Role;
  role_label: string;
  cross_team: boolean;
  count: number;
  value: number;
  href: string;
};

/** How many bills, and how much, are sitting at each link in the chain. */
export async function getCertificationPipeline(
  scope: QueryScope,
): Promise<CertificationStage[]> {
  const repos = getRepositories();
  const bills = inScope(await repos.raBills.list(), scope).filter(
    (b) => b.status === "in_certification",
  );
  const project = scope.project_ids[0];

  return APPROVAL_CHAINS.ra_bill.map((step) => {
    const mine = bills.filter((b) => b.current_sequence === step.sequence);
    return {
      sequence: step.sequence,
      step_code: step.step_code,
      role: step.required_role,
      role_label: ROLE_LABEL[step.required_role],
      cross_team: Boolean((step as { cross_team?: boolean }).cross_team),
      count: mine.length,
      value: rupees(mine.reduce((s, b) => s + b.gross_amount, 0)),
      href: project ? `/projects/${project}/billing/certification` : "/approvals",
    };
  });
}

export type StuckBill = {
  ra_bill_id: string;
  bill_number: string;
  project_id: string;
  project_name: string;
  contractor_name: string;
  waiting_on: string;
  step_code: StepCode | null;
  age_days: number;
  value: number;
  href: string;
};

/** Bills that have sat in the chain longer than they should have. */
export async function getStuckBills(scope: QueryScope, days = 7): Promise<StuckBill[]> {
  const repos = getRepositories();
  const [bills, contractors, projects] = await Promise.all([
    repos.raBills.list(),
    repos.contractors.list(),
    repos.projects.list(),
  ]);
  const contractorName = new Map(contractors.map((c) => [c.id, c.name]));
  const projectName = new Map(projects.map((p) => [p.id, p.name]));

  return inScope(bills, scope)
    .filter((b) => b.status === "in_certification" && ageInDays(b.submitted_at) > days)
    .map((b) => {
      const step = APPROVAL_CHAINS.ra_bill.find((s) => s.sequence === b.current_sequence);
      return {
        ra_bill_id: b.id,
        bill_number: b.bill_number,
        project_id: b.project_id,
        project_name: projectName.get(b.project_id) ?? "",
        contractor_name: contractorName.get(b.contractor_id) ?? "",
        waiting_on: step ? ROLE_LABEL[step.required_role] : "—",
        step_code: step?.step_code ?? null,
        age_days: ageInDays(b.submitted_at),
        value: b.gross_amount,
        href: `/projects/${b.project_id}/billing/certification`,
      };
    })
    .sort((a, b) => b.age_days - a.age_days);
}

export type ContractorSummary = {
  contractor_id: string;
  contractor_name: string;
  order_value: number;
  certified: number;
  percent: number;
  retention_held: number;
  href: string;
};

/** Work-order value against certified, per contractor. */
export async function getContractorSummary(scope: QueryScope): Promise<ContractorSummary[]> {
  const repos = getRepositories();
  const contractors = await repos.contractors.list();
  const contractorName = new Map(contractors.map((c) => [c.id, c.name]));

  const accounts = (
    await Promise.all(
      scope.project_ids.map((project_id) => contractorRunningAccount({ project_id })),
    )
  ).flat();

  const byContractor = new Map<string, ContractorSummary>();
  accounts.forEach((row) => {
    const entry = byContractor.get(row.contractor_id) ?? {
      contractor_id: row.contractor_id,
      contractor_name: contractorName.get(row.contractor_id) ?? "",
      order_value: 0,
      certified: 0,
      percent: 0,
      retention_held: 0,
      href: "/ledgers/contractors",
    };
    entry.order_value = rupees(entry.order_value + row.order_value);
    entry.certified = rupees(entry.certified + row.certified_amount);
    entry.retention_held = rupees(entry.retention_held + row.retention_held);
    entry.percent =
      entry.order_value > 0 ? Math.round((entry.certified / entry.order_value) * 1000) / 10 : 0;
    byContractor.set(row.contractor_id, entry);
  });

  return [...byContractor.values()].sort((a, b) => b.certified - a.certified);
}

export type PortfolioRow = {
  project_id: string;
  name: string;
  budget: number;
  material: number;
  certified: number;
  href: string;
};

/** Budget against material and contractor spend, every project. HoD's view. */
export async function getPortfolioBudgetVsActual(
  scope: QueryScope,
): Promise<PortfolioRow[]> {
  const { budgetVsActual } = await import("../budget-service");
  const repos = getRepositories();
  const projects = (await repos.projects.list()).filter((p) => scope.project_ids.includes(p.id));

  const rows: PortfolioRow[] = [];
  for (const project of projects) {
    const lines = await budgetVsActual(project.id);
    rows.push({
      project_id: project.id,
      name: project.name,
      budget: rupees(lines.reduce((s, r) => s + r.total_budget, 0)),
      material: rupees(lines.reduce((s, r) => s + r.material_issued_value, 0)),
      certified: rupees(lines.reduce((s, r) => s + r.certified_amount, 0)),
      href: `/projects/${project.id}/budget/budget-vs-actual`,
    });
  }
  return rows;
}
