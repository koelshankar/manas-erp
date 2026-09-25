import { beforeEach, describe, expect, it } from "vitest";
import type { Role } from "@/lib/domain";
import {
  assertNoMoney,
  getActionItems,
  getApproverKpis,
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
  getMyRequests,
  getOverBudgetLines,
  getOverduePos,
  getPayablesBySupplier,
  getPortfolioBudgetVsActual,
  getProjectAlerts,
  getProjectCards,
  getProjectHeadKpis,
  getProjectHeaderStats,
  getPurchaseHeadKpis,
  getPurchaseKpis,
  getQsKpis,
  getRecordTrail,
  getSiteEngineerKpis,
  getSpendByCategory,
  getStuckBills,
  getTodaysTasks,
  getWorkOrdersNearLimit,
  isMoneyField,
  scopeFor,
  searchRecords,
  type QueryScope,
} from "@/lib/services/queries";
import { reset, repos } from "./helpers";

beforeEach(reset);

const BLIND: Role = "site_engineer";

async function scope(role: Role): Promise<QueryScope> {
  const user = await repos().users.getByRole(role);
  if (!user) throw new Error(`no seeded user for ${role}`);
  return scopeFor(user, null);
}

/**
 * Walks a payload and returns the path of every monetary field still present.
 *
 * The same rule `assertNoMoney` uses in dev, applied as an assertion here so a
 * new column in a query fails the suite rather than a screenshot audit.
 */
function moneyPaths(node: unknown, path = ""): string[] {
  if (node === null || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap((v, i) => moneyPaths(v, `${path}[${i}]`));
  return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) => {
    const here = path ? `${path}.${key}` : key;
    if (isMoneyField(key) && value !== undefined) return [here];
    return moneyPaths(value, here);
  });
}

describe("the money-field rule", () => {
  it("catches the shapes the audit found leaking", () => {
    ["budget_amount", "spent_amount", "total_value", "agreed_rate", "net_payable_amount",
     "certified_amount", "gross_amount", "landed_cost", "unit_price", "total_actual",
     "material_actual", "variance"].forEach((f) =>
      expect(isMoneyField(f)).toBe(true),
    );
  });

  it("leaves quantities, counts and percentages alone", () => {
    ["measured_qty", "budget_qty", "percent_complete", "gst_percent", "tds_percent",
     "retention_percent", "age_days", "reorder_level", "document_number"].forEach((f) =>
      expect(isMoneyField(f)).toBe(false),
    );
  });
});

/* ------------------------------------------------------------------ */
/* Every query, for the one value-blind role                           */
/* ------------------------------------------------------------------ */

describe("no query returns a monetary field to a Site Engineer", () => {
  /** Each entry is a query the Site Engineer's app can actually reach. */
  async function everyPayload(): Promise<Array<[string, unknown]>> {
    const s = await scope(BLIND);
    const project_id = s.project_ids[0];
    const bill = (await repos().raBills.listByProject(project_id))[0];
    const indent = (await repos().indents.listByProject(project_id))[0];

    const entries: Array<[string, Promise<unknown>]> = [
      ["getActionItems", getActionItems(s)],
      ["getMyRequests", getMyRequests(s)],
      ["getProjectHeaderStats", getProjectHeaderStats(s, project_id)],
      ["getSiteEngineerKpis", getSiteEngineerKpis(s)],
      ["getTodaysTasks", getTodaysTasks(s)],
      ["getDprStreak", getDprStreak(s)],
      ["getIndentPipeline", getIndentPipeline(s)],
      ["getExpectedDeliveries", getExpectedDeliveries(s)],
      ["getLowStockMaterials", getLowStockMaterials(s)],
      ["getProjectCards", getProjectCards(s)],
      ["getProjectHeadKpis", getProjectHeadKpis(s)],
      ["getOverBudgetLines", getOverBudgetLines(s)],
      ["getWorkOrdersNearLimit", getWorkOrdersNearLimit(s)],
      ["getIssuedVsMeasuredFlags", getIssuedVsMeasuredFlags(s)],
      ["getPurchaseKpis", getPurchaseKpis(s)],
      ["getPurchaseHeadKpis", getPurchaseHeadKpis(s)],
      ["getOverduePos", getOverduePos(s)],
      ["getGrnsWithoutBill", getGrnsWithoutBill(s)],
      ["getPayablesBySupplier", getPayablesBySupplier(s)],
      ["getSpendByCategory", getSpendByCategory(s)],
      ["getL1Adherence", getL1Adherence(s)],
      ["getQsKpis", getQsKpis(s)],
      ["getApproverKpis", getApproverKpis(s)],
      ["getCertificationPipeline", getCertificationPipeline(s)],
      ["getStuckBills", getStuckBills(s)],
      ["getContractorSummary", getContractorSummary(s)],
      ["getPortfolioBudgetVsActual", getPortfolioBudgetVsActual(s)],
      ["getFlowCounts", getFlowCounts(project_id, BLIND)],
      ["getProjectAlerts", getProjectAlerts(project_id, BLIND)],
      ["searchRecords", searchRecords(s, "MSP")],
      ["getRecordTrail(ra_bill)", getRecordTrail("ra_bill", bill.id, BLIND)],
      ["getRecordTrail(indent)", getRecordTrail("indent", indent.id, BLIND)],
    ];

    return Promise.all(entries.map(async ([name, p]) => [name, await p] as [string, unknown]));
  }

  it("strips every one of them", async () => {
    const leaks: string[] = [];
    for (const [name, payload] of await everyPayload()) {
      moneyPaths(payload).forEach((p) => leaks.push(`${name}: ${p}`));
    }
    expect(leaks).toEqual([]);
  });

  it("still returns rows, so the assertion is not passing on empty payloads", async () => {
    const payloads = await everyPayload();
    const nonEmpty = payloads.filter(
      ([, p]) => (Array.isArray(p) ? p.length > 0 : p !== null && p !== undefined),
    );
    expect(nonEmpty.length).toBeGreaterThan(payloads.length / 2);
  });

  it("keeps every workflow-chart node, with its value label blanked", async () => {
    const project_id = (await scope(BLIND)).project_ids[0];
    const blind = await getFlowCounts(project_id, BLIND);
    const sighted = await getFlowCounts(project_id, "project_head");
    expect(Object.keys(blind.nodes)).toEqual(Object.keys(sighted.nodes));
    expect(blind.nodes.budget_vs_actual.value_label).toBeNull();
  });

  it("agrees with the dev-time assertion", async () => {
    for (const [name, payload] of await everyPayload()) {
      expect(assertNoMoney(BLIND, payload, name)).toEqual([]);
    }
  });
});

/* ------------------------------------------------------------------ */
/* The other side: a sighted role must still get its figures           */
/* ------------------------------------------------------------------ */

describe("roles that may see values still get them", () => {
  it("keeps budget and spend on the project header for the Project Head", async () => {
    const s = await scope("project_head");
    const stats = await getProjectHeaderStats(s, s.project_ids[0]);
    expect(stats?.budget_amount).toBeGreaterThan(0);
    expect(stats?.spent_percent).toBeGreaterThanOrEqual(0);
  });

  it("gives the Site Engineer activity figures in their place", async () => {
    const s = await scope(BLIND);
    const stats = await getProjectHeaderStats(s, s.project_ids[0]);
    expect(stats).not.toHaveProperty("budget_amount");
    expect(stats).not.toHaveProperty("spent_amount");
    expect(stats?.open_indents).toBeGreaterThanOrEqual(0);
    expect(stats?.deliveries_due).toBeGreaterThanOrEqual(0);
    expect(stats?.percent_complete).toBeGreaterThan(0);
  });

  it("keeps rupee figures in the Project Head's action list", async () => {
    const items = await getActionItems(await scope("project_head"));
    expect(items.some((i) => typeof i.value === "number" && i.value > 0)).toBe(true);
  });
});
