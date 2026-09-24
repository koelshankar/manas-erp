"use client";

import { dashboardLayoutFor, type DashboardSlot } from "@/config/permissions";
import { useMoneyLeakCheck, useRepositoryQuery } from "@/lib/hooks";
import {
  getActionItems,
  getApproverKpis,
  getCertificationPipeline,
  getContractorSummary,
  getDprStreak,
  getExpectedDeliveries,
  getIndentPipeline,
  getIssuedVsMeasuredFlags,
  getL1Adherence,
  getLowStockMaterials,
  getOverBudgetLines,
  getOverduePos,
  getPayablesBySupplier,
  getPortfolioBudgetVsActual,
  getProjectCards,
  getProjectHeadKpis,
  getPurchaseHeadKpis,
  getPurchaseKpis,
  getQsKpis,
  getGrnsWithoutBill,
  getSiteEngineerKpis,
  getSpendByCategory,
  getStuckBills,
  getTodaysTasks,
  getWorkOrdersNearLimit,
  type ActionItem,
  type CategorySpend,
  type CertificationStage,
  type ContractorSummary,
  type DprDay,
  type ExpectedDelivery,
  type IndentPipelineStage,
  type IssuedVsMeasuredFlag,
  type Kpi,
  type L1Adherence,
  type LowStockMaterial,
  type OverBudgetLine,
  type OverduePo,
  type PortfolioRow,
  type ProjectCard,
  type QueryScope,
  type StuckBill,
  type SupplierPayable,
  type TodayTask,
  type UnbilledGrn,
  type WorkOrderNearLimit,
} from "@/lib/services/queries";
import type { Role } from "@/lib/domain";

/** Everything the registry can hand a widget. */
export type DashboardData = {
  kpis: Kpi[];
  actionItems: ActionItem[];
  projectCards: ProjectCard[];
  overBudgetLines: OverBudgetLine[];
  workOrdersNearLimit: WorkOrderNearLimit[];
  issuedVsMeasured: IssuedVsMeasuredFlag[];
  todaysTasks: TodayTask[];
  dprStreak: DprDay[];
  indentPipeline: IndentPipelineStage[];
  expectedDeliveries: ExpectedDelivery[];
  lowStock: LowStockMaterial[];
  overduePos: OverduePo[];
  unbilledGrns: UnbilledGrn[];
  payables: SupplierPayable[];
  spendByCategory: CategorySpend[];
  l1Adherence: L1Adherence | null;
  certificationPipeline: CertificationStage[];
  contractorSummary: ContractorSummary[];
  stuckBills: StuckBill[];
  portfolio: PortfolioRow[];
};

const EMPTY: DashboardData = {
  kpis: [],
  actionItems: [],
  projectCards: [],
  overBudgetLines: [],
  workOrdersNearLimit: [],
  issuedVsMeasured: [],
  todaysTasks: [],
  dprStreak: [],
  indentPipeline: [],
  expectedDeliveries: [],
  lowStock: [],
  overduePos: [],
  unbilledGrns: [],
  payables: [],
  spendByCategory: [],
  l1Adherence: null,
  certificationPipeline: [],
  contractorSummary: [],
  stuckBills: [],
  portfolio: [],
};

/** The KPI query for a role. One per dashboard, not one per widget. */
function kpiQuery(role: Role) {
  switch (role) {
    case "project_head":
      return getProjectHeadKpis;
    case "site_engineer":
      return getSiteEngineerKpis;
    case "purchase_officer":
      return getPurchaseKpis;
    case "purchase_head":
      return getPurchaseHeadKpis;
    case "project_qs":
      return getQsKpis;
    default:
      return getApproverKpis;
  }
}

/**
 * Runs only the queries the given layout actually asks for, so a dashboard
 * never pays for a widget it does not show.
 *
 * `layout` lets the project Overview reuse this with its own slots; it defaults
 * to the role's dashboard.
 */
export function useDashboardData(scope: QueryScope | null, layout?: DashboardSlot[]) {
  const widgetIds = (layout ?? (scope ? dashboardLayoutFor(scope.role) : []))
    .map((s) => s.widget_id)
    .join(",");

  const { data, loading } = useRepositoryQuery<DashboardData>(
    async () => {
      if (!scope) return EMPTY;
      const wanted = new Set(widgetIds.split(",").filter(Boolean));
      const want = (id: string) => wanted.has(id);

      const [kpis, actionItems] = await Promise.all([
        kpiQuery(scope.role)(scope),
        getActionItems(scope),
      ]);

      return {
        ...EMPTY,
        kpis,
        actionItems,
        projectCards: want("project_cards") ? await getProjectCards(scope) : [],
        overBudgetLines: want("over_budget_lines") ? await getOverBudgetLines(scope) : [],
        workOrdersNearLimit: want("work_orders_near_limit")
          ? await getWorkOrdersNearLimit(scope)
          : [],
        issuedVsMeasured: want("issued_vs_measured_flags")
          ? await getIssuedVsMeasuredFlags(scope)
          : [],
        todaysTasks: want("todays_tasks") ? await getTodaysTasks(scope) : [],
        dprStreak: want("dpr_streak") ? await getDprStreak(scope) : [],
        indentPipeline: want("indent_pipeline") ? await getIndentPipeline(scope) : [],
        expectedDeliveries: want("expected_deliveries") ? await getExpectedDeliveries(scope) : [],
        lowStock: want("low_stock") ? await getLowStockMaterials(scope) : [],
        overduePos: want("overdue_pos") ? await getOverduePos(scope) : [],
        unbilledGrns: want("unbilled_grns") ? await getGrnsWithoutBill(scope) : [],
        payables: want("payables_by_supplier") ? await getPayablesBySupplier(scope) : [],
        spendByCategory: want("spend_by_category") ? await getSpendByCategory(scope) : [],
        l1Adherence: want("l1_adherence") ? await getL1Adherence(scope) : null,
        certificationPipeline: want("certification_pipeline")
          ? await getCertificationPipeline(scope)
          : [],
        contractorSummary: want("contractor_summary") ? await getContractorSummary(scope) : [],
        stuckBills: want("stuck_bills") ? await getStuckBills(scope) : [],
        portfolio: want("portfolio_budget") ? await getPortfolioBudgetVsActual(scope) : [],
      };
    },
    [scope?.role, scope?.project_ids.join(","), widgetIds],
  );

  // Dev tripwire: the dashboard is where the most query payloads meet one
  // screen, so a leak shows up here first (audit C1).
  useMoneyLeakCheck("dashboard", data);

  return { data: data ?? EMPTY, loading };
}
