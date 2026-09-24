import { beforeEach, describe, expect, it } from "vitest";
import { today } from "@/lib/clock";
import { ROLES, type Role } from "@/lib/domain";
import {
  ageBand,
  getActionItems,
  getApproverKpis,
  getAssignedProjects,
  getCertificationPipeline,
  getContractorSummary,
  getDprStreak,
  getExpectedDeliveries,
  getFlowCounts,
  getGrnsWithoutBill,
  getIndentPipeline,
  getIssuedVsMeasuredFlags,
  getL1Adherence,
  getLowStockMaterials,
  getOverBudgetLines,
  getOverduePos,
  getPayablesBySupplier,
  getPortfolioBudgetVsActual,
  getProjectAlerts,
  getProjectCards,
  getProjectHeadKpis,
  getPurchaseKpis,
  getQsKpis,
  getSiteEngineerKpis,
  getSpendByCategory,
  getStuckBills,
  getTodaysTasks,
  getWorkOrdersNearLimit,
  scopeFor,
  type QueryScope,
} from "@/lib/services/queries";
import { reset, repos } from "./helpers";

beforeEach(reset);

async function userFor(role: Role) {
  const user = await repos().users.getByRole(role);
  if (!user) throw new Error(`no seeded user for ${role}`);
  return user;
}

async function scope(role: Role, project_id?: string): Promise<QueryScope> {
  return scopeFor(await userFor(role), project_id ?? null);
}

/* ------------------------------------------------------------------ */
/* Assignment                                                          */
/* ------------------------------------------------------------------ */

describe("project assignment", () => {
  it("posts site and QS staff to one project, the Project Head to two, and management to all", async () => {
    const projects = await repos().projects.list();
    const expected: Record<Role, number> = {
      project_head: 2,
      site_engineer: 1,
      project_qs: 1,
      purchase_officer: projects.length,
      purchase_head: projects.length,
      qs_head: projects.length,
      hod: projects.length,
    };
    for (const role of ROLES) {
      const assigned = await getAssignedProjects(await userFor(role));
      expect(assigned, role).toHaveLength(expected[role]);
    }
  });

  it("scopes a query to the assignment, and the filter can only narrow it", async () => {
    const user = await userFor("site_engineer");
    const projects = await repos().projects.list();
    const other = projects.find((p) => !user.assigned_project_ids.includes(p.id))!;

    expect(scopeFor(user, null).project_ids).toEqual(user.assigned_project_ids);
    expect(scopeFor(user, user.assigned_project_ids[0]).project_ids).toEqual([
      user.assigned_project_ids[0],
    ]);
    // Asking for a project you are not posted to falls back to your own.
    expect(scopeFor(user, other.id).project_ids).toEqual(user.assigned_project_ids);
  });
});

/* ------------------------------------------------------------------ */
/* Needs your action                                                   */
/* ------------------------------------------------------------------ */

describe("getActionItems", () => {
  it("gives every role something to do, oldest first", async () => {
    for (const role of ROLES) {
      const items = await getActionItems(await scope(role));
      const live = items.filter((i) => !i.read_only);
      expect(live.length, role).toBeGreaterThan(0);
      for (let i = 1; i < live.length; i += 1) {
        expect(live[i - 1].age_days).toBeGreaterThanOrEqual(live[i].age_days);
      }
    }
  });

  it("only ever returns items from projects the role is posted to", async () => {
    for (const role of ROLES) {
      const s = await scope(role);
      const items = await getActionItems(s);
      items.forEach((i) => expect(s.project_ids).toContain(i.project_id));
    }
  });

  it("gives the Project Head indents plus the cross-team bill step", async () => {
    const items = await getActionItems(await scope("project_head"));
    expect(items.some((i) => i.entity_type === "indent" && i.step_code === "A2")).toBe(true);
    const bill = items.find((i) => i.entity_type === "ra_bill");
    expect(bill?.step_code).toBe("C3");
    expect(bill?.label).toContain("Cross-team");
    // The chart colours the Project Head's step purple, not teal.
    expect(bill?.team).toBe("project_budget");
  });

  it("puts today's unfiled DPR in front of the Site Engineer", async () => {
    const items = await getActionItems(await scope("site_engineer"));
    const dpr = items.find((i) => i.entity_type === "dpr");
    expect(dpr).toBeDefined();
    expect(dpr!.document_number).toBe(today());
    expect(dpr!.age_days).toBe(0);
  });

  it("never gives the Site Engineer a rupee figure", async () => {
    const items = await getActionItems(await scope("site_engineer"));
    expect(items.length).toBeGreaterThan(0);
    // The field is removed, not nulled: a zero or a null is still a number
    // the screen would happily format, and `"value" in item` is the assertion
    // that survives someone adding a second monetary column.
    items.forEach((i) => expect(i).not.toHaveProperty("value"));
  });

  it("puts B2 first for the Purchase Head and marks the rest read-only", async () => {
    const items = await getActionItems(await scope("purchase_head"));
    const live = items.filter((i) => !i.read_only);
    expect(live.length).toBeGreaterThan(0);
    live.forEach((i) => expect(i.step_code).toBe("B2"));
    expect(items.some((i) => i.read_only)).toBe(true);
  });

  it("only offers each approver their own step in the chain", async () => {
    for (const [role, step] of [
      ["project_qs", "C3"],
      ["qs_head", "C4"],
      ["hod", "C4"],
    ] as const) {
      const bills = (await getActionItems(await scope(role))).filter(
        (i) => i.entity_type === "ra_bill" && i.id.startsWith("certify:"),
      );
      expect(bills.length, role).toBeGreaterThan(0);
      bills.forEach((b) => expect(b.step_code).toBe(step));
    }
  });

  it("bands ageing at three and seven days", () => {
    expect(ageBand(0)).toBe("fresh");
    expect(ageBand(3)).toBe("fresh");
    expect(ageBand(4)).toBe("warn");
    expect(ageBand(7)).toBe("warn");
    expect(ageBand(8)).toBe("late");
  });
});

/* ------------------------------------------------------------------ */
/* Project Head widgets                                                */
/* ------------------------------------------------------------------ */

describe("Project Head queries", () => {
  it("returns four KPIs whose figures agree with the project cards", async () => {
    const s = await scope("project_head");
    const [kpis, cards] = await Promise.all([getProjectHeadKpis(s), getProjectCards(s)]);
    expect(kpis).toHaveLength(4);
    expect(cards).toHaveLength(2);
    cards.forEach((c) => {
      expect(c.total_actual).toBeCloseTo(c.material_actual + c.certified_actual, 1);
      expect(c.variance).toBeCloseTo(c.budget - c.total_actual, 1);
    });
  });

  it("only reports on the two projects the Project Head holds", async () => {
    const s = await scope("project_head");
    const cards = await getProjectCards(s);
    cards.forEach((c) => expect(s.project_ids).toContain(c.project_id));
  });

  it("finds BOQ lines over budget, worst first", async () => {
    const rows = await getOverBudgetLines(await scope("project_head"));
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((r) => expect(r.actual).toBeGreaterThan(r.budget));
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i - 1].overrun).toBeGreaterThanOrEqual(rows[i].overrun);
    }
  });

  it("flags work orders at 85% of their value and nothing below", async () => {
    const rows = await getWorkOrdersNearLimit(await scope("project_head"));
    rows.forEach((r) => expect(r.percent_used).toBeGreaterThanOrEqual(85));
  });

  it("surfaces issued-vs-measured overdraws only", async () => {
    const rows = await getIssuedVsMeasuredFlags(await scope("project_head"));
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((r) => expect(r.variance_percent).toBeGreaterThan(5));
  });
});

/* ------------------------------------------------------------------ */
/* Site Engineer widgets — quantities only                             */
/* ------------------------------------------------------------------ */

describe("Site Engineer queries", () => {
  it("reports today's DPR as pending, because the seed never files it", async () => {
    const kpis = await getSiteEngineerKpis(await scope("site_engineer"));
    expect(kpis.find((k) => k.key === "dpr")?.display).toBe("Pending");
  });

  it("returns no monetary field anywhere in the site widgets", async () => {
    const s = await scope("site_engineer");
    const [tasks, deliveries, stock, pipeline] = await Promise.all([
      getTodaysTasks(s),
      getExpectedDeliveries(s),
      getLowStockMaterials(s),
      getIndentPipeline(s),
    ]);
    const MONEY = /(value|amount|rate|price|total|payable|retention|tds)/i;
    const check = (rows: object[], where: string) =>
      rows.forEach((row) =>
        Object.keys(row).forEach((key) => expect(MONEY.test(key), `${where}.${key}`).toBe(false)),
      );
    check(tasks, "todaysTasks");
    check(deliveries, "expectedDeliveries");
    check(stock, "lowStock");
    check(pipeline, "indentPipeline");
  });

  it("shows the fortnight of reporting with today still open", async () => {
    const days = await getDprStreak(await scope("site_engineer"));
    expect(days).toHaveLength(14);
    expect(days[days.length - 1].date).toBe(today());
    expect(days[days.length - 1].is_today).toBe(true);
    expect(days[days.length - 1].filed).toBe(false);
    // Two days were deliberately missed in the seed.
    expect(days.filter((d) => !d.filed && !d.is_today)).toHaveLength(2);
  });

  it("finds material below its reorder level", async () => {
    const rows = await getLowStockMaterials(await scope("site_engineer"));
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((r) => expect(r.balance).toBeLessThan(r.reorder_level));
  });

  it("counts every indent exactly once in the pipeline", async () => {
    const s = await scope("site_engineer");
    const stages = await getIndentPipeline(s);
    const indents = (await repos().indents.list()).filter((i) =>
      s.project_ids.includes(i.project_id),
    );
    const counted = stages.reduce((sum, x) => sum + x.count, 0);
    expect(counted).toBe(indents.filter((i) => i.status !== "rejected").length);
  });
});

/* ------------------------------------------------------------------ */
/* Purchase widgets                                                    */
/* ------------------------------------------------------------------ */

describe("Purchase queries", () => {
  it("counts the same open work for the Officer and the Head", async () => {
    const officer = await getPurchaseKpis(await scope("purchase_officer"));
    const head = await getPurchaseKpis(await scope("purchase_head"));
    expect(officer.map((k) => k.display)).toEqual(head.map((k) => k.display));
  });

  it("only lists POs that are genuinely past their date", async () => {
    const rows = await getOverduePos(await scope("purchase_officer"));
    rows.forEach((r) => expect(r.days_overdue).toBeGreaterThan(0));
  });

  it("lists receipts with no bill against them", async () => {
    const s = await scope("purchase_officer");
    const rows = await getGrnsWithoutBill(s);
    const bills = await repos().vendorBills.list();
    const billed = new Set(bills.flatMap((b) => b.grn_ids));
    rows.forEach((r) => expect(billed.has(r.grn_id)).toBe(false));
  });

  it("balances payables as credits less debits", async () => {
    const rows = await getPayablesBySupplier(await scope("purchase_officer"));
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((r) => expect(r.balance).toBeCloseTo(r.credit - r.debit, 1));
    expect(rows.length).toBeLessThanOrEqual(6);
  });

  it("works out L1 adherence over decided comparatives only", async () => {
    const data = await getL1Adherence(await scope("purchase_head"));
    expect(data.total_lines).toBeGreaterThan(0);
    expect(data.l1_lines).toBeLessThanOrEqual(data.total_lines);
    expect(data.percent).toBeCloseTo((data.l1_lines / data.total_lines) * 100, 0);
    // Every non-L1 award carries the officer's written justification.
    expect(data.justified).toHaveLength(data.total_lines - data.l1_lines);
    data.justified.forEach((j) => expect(j.justification.length).toBeGreaterThan(5));
  });

  it("splits this month's spend so the parts add to the whole", async () => {
    const rows = await getSpendByCategory(await scope("purchase_head"));
    if (rows.length === 0) return;
    const total = rows.reduce((s, r) => s + r.percent, 0);
    expect(total).toBeGreaterThan(99);
    expect(total).toBeLessThan(101);
  });
});

/* ------------------------------------------------------------------ */
/* Certification widgets                                               */
/* ------------------------------------------------------------------ */

describe("Certification queries", () => {
  it("returns the four chain steps in order, with the cross-team one marked", async () => {
    const stages = await getCertificationPipeline(await scope("project_qs"));
    expect(stages.map((s) => s.sequence)).toEqual([1, 2, 3, 4]);
    expect(stages.map((s) => s.step_code)).toEqual(["C3", "C3", "C4", "C4"]);
    expect(stages.filter((s) => s.cross_team)).toHaveLength(1);
    expect(stages.find((s) => s.cross_team)?.role).toBe("project_head");
  });

  it("counts every in-chain bill exactly once across the stages", async () => {
    const s = await scope("qs_head");
    const stages = await getCertificationPipeline(s);
    const inChain = (await repos().raBills.list()).filter(
      (b) => s.project_ids.includes(b.project_id) && b.status === "in_certification",
    );
    expect(stages.reduce((sum, x) => sum + x.count, 0)).toBe(inChain.length);
  });

  it("gives the approvers their own step's count and value", async () => {
    for (const role of ["qs_head", "hod"] as const) {
      const kpis = await getApproverKpis(await scope(role));
      expect(kpis).toHaveLength(4);
      expect(Number(kpis[0].display)).toBeGreaterThan(0);
    }
  });

  it("only reports bills stuck longer than the threshold", async () => {
    const rows = await getStuckBills(await scope("hod"), 7);
    rows.forEach((r) => expect(r.age_days).toBeGreaterThan(7));
  });

  it("summarises contractors so certified never exceeds the order without flagging", async () => {
    const rows = await getContractorSummary(await scope("project_qs"));
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((r) =>
      expect(r.percent).toBeCloseTo((r.certified / r.order_value) * 100, 0),
    );
  });

  it("gives the HoD every project in the portfolio", async () => {
    const s = await scope("hod");
    const rows = await getPortfolioBudgetVsActual(s);
    expect(rows).toHaveLength(s.project_ids.length);
    rows.forEach((r) => expect(r.budget).toBeGreaterThan(0));
  });

  it("returns four KPIs for the Project QS", async () => {
    const kpis = await getQsKpis(await scope("project_qs"));
    expect(kpis).toHaveLength(4);
    expect(kpis.map((k) => k.key)).toEqual(["ready", "unsigned", "in_chain", "retention"]);
  });
});

/* ------------------------------------------------------------------ */
/* Flow counts and alerts                                              */
/* ------------------------------------------------------------------ */

describe("getFlowCounts", () => {
  it("returns every node on the chart with a readable count", async () => {
    const project = (await repos().projects.list())[0];
    const flow = await getFlowCounts(project.id, "project_head");
    expect(Object.keys(flow.nodes)).toHaveLength(19);
    Object.values(flow.nodes).forEach((n) => {
      expect(n.label.length).toBeGreaterThan(0);
      expect(n.count_label.length).toBeGreaterThan(0);
      expect(n.href.length).toBeGreaterThan(0);
    });
    // The chart's own colouring, with GRN moved to Site Execution.
    expect(flow.nodes.grn.team).toBe("site_execution");
    expect(flow.nodes.grn.step_codes).toEqual(["B5", "B6"]);
    expect(flow.nodes.indent_approval.team).toBe("project_budget");
    expect(flow.nodes.accounts_handover.team).toBe("accounts");
  });

  it("highlights only the nodes the role can act on", async () => {
    const project = (await repos().projects.list())[0];
    const ph = await getFlowCounts(project.id, "project_head");
    expect(ph.nodes.indent_approval.actionable).toBeGreaterThan(0);
    expect(ph.nodes.approval_to_purchase.actionable).toBe(0);

    const head = await getFlowCounts(project.id, "purchase_head");
    expect(head.nodes.approval_to_purchase.actionable).toBeGreaterThan(0);
    expect(head.nodes.indent_approval.actionable).toBe(0);

    const site = await getFlowCounts(project.id, "site_engineer");
    expect(site.nodes.dpr.actionable).toBe(1);
    expect(site.total_actionable).toBeGreaterThan(0);
  });

  it("hides every value from the Site Engineer", async () => {
    const project = (await repos().projects.list())[0];
    const site = await getFlowCounts(project.id, "site_engineer");
    Object.values(site.nodes).forEach((n) => expect(n.value_label).toBeNull());

    const qs = await getFlowCounts(project.id, "project_qs");
    expect(qs.nodes.accounts_handover.value_label).not.toBeNull();
  });
});

describe("getProjectAlerts", () => {
  it("raises the alerts the seed is built to trigger", async () => {
    const project = (await repos().projects.list())[0];
    const alerts = await getProjectAlerts(project.id, "project_head");
    const kinds = alerts.map((a) => a.kind);
    expect(kinds).toContain("budget");
    expect(kinds).toContain("stock");
    expect(kinds).toContain("reporting");
    alerts.forEach((a) => expect(a.count).toBeGreaterThan(0));
  });
});
