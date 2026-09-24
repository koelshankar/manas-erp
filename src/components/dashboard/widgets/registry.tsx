"use client";

import type { ReactNode } from "react";
import type { Team } from "@/lib/domain";
import type { QueryScope } from "@/lib/services/queries";
import type { DashboardData } from "../use-dashboard-data";
import { KpiRow } from "./kpis";
import { ActionItemsWidget } from "./action-items";
import {
  IssuedVsMeasuredWidget,
  OverBudgetLinesWidget,
  ProjectCardsWidget,
  WorkOrdersNearLimitWidget,
} from "./project-head";
import {
  DprStreakWidget,
  ExpectedDeliveriesWidget,
  IndentPipelineWidget,
  LowStockWidget,
  TodaysTasksWidget,
} from "./site-engineer";
import {
  L1AdherenceWidget,
  OverduePosWidget,
  PayablesWidget,
  SpendByCategoryWidget,
  UnbilledGrnsWidget,
} from "./purchase";
import {
  CertificationPipelineWidget,
  ContractorSummaryWidget,
  PortfolioBudgetWidget,
  StuckBillsWidget,
} from "./certification";

export type WidgetProps = {
  data: DashboardData;
  team: Team;
  scope: QueryScope;
  emphasis?: boolean;
  materialName: (id: string) => string;
};

/**
 * widget_id → component.
 *
 * `DASHBOARD_LAYOUTS` in permissions.ts decides which of these a role gets and
 * how wide each sits; this map is the only place that knows what one looks
 * like. Adding a widget means adding it here and to the layout.
 */
export const WIDGET_REGISTRY: Record<
  string,
  (props: WidgetProps) => ReactNode
> = {
  kpis: ({ data, team }) => <KpiRow kpis={data.kpis} team={team} />,

  action_items: ({ data, team, emphasis }) => (
    <ActionItemsWidget
      items={data.actionItems}
      team={team}
      emphasis={emphasis}
    />
  ),

  /* --- Project & Budget --- */
  project_cards: ({ data }) => <ProjectCardsWidget cards={data.projectCards} />,
  over_budget_lines: ({ data }) => (
    <OverBudgetLinesWidget rows={data.overBudgetLines} />
  ),
  work_orders_near_limit: ({ data }) => (
    <WorkOrdersNearLimitWidget rows={data.workOrdersNearLimit} />
  ),
  issued_vs_measured_flags: ({ data, materialName }) => (
    <IssuedVsMeasuredWidget
      rows={data.issuedVsMeasured}
      materialName={materialName}
    />
  ),

  /* --- Site Execution --- */
  todays_tasks: ({ data }) => <TodaysTasksWidget tasks={data.todaysTasks} />,
  dpr_streak: ({ data, scope }) => (
    <DprStreakWidget
      days={data.dprStreak}
      href={
        scope.project_ids[0]
          ? `/projects/${scope.project_ids[0]}/site/dpr`
          : "/projects"
      }
    />
  ),
  indent_pipeline: ({ data }) => (
    <IndentPipelineWidget stages={data.indentPipeline} />
  ),
  expected_deliveries: ({ data }) => (
    <ExpectedDeliveriesWidget rows={data.expectedDeliveries} />
  ),
  low_stock: ({ data }) => <LowStockWidget rows={data.lowStock} />,

  /* --- Purchase & Stores --- */
  overdue_pos: ({ data }) => <OverduePosWidget rows={data.overduePos} />,
  unbilled_grns: ({ data }) => <UnbilledGrnsWidget rows={data.unbilledGrns} />,
  payables_by_supplier: ({ data }) => <PayablesWidget rows={data.payables} />,
  spend_by_category: ({ data }) => (
    <SpendByCategoryWidget rows={data.spendByCategory} />
  ),
  l1_adherence: ({ data }) =>
    data.l1Adherence ? <L1AdherenceWidget data={data.l1Adherence} /> : null,

  /* --- Billing & Certification --- */
  certification_pipeline: ({ data }) => (
    <CertificationPipelineWidget stages={data.certificationPipeline} />
  ),
  contractor_summary: ({ data }) => (
    <ContractorSummaryWidget rows={data.contractorSummary} />
  ),
  stuck_bills: ({ data }) => <StuckBillsWidget rows={data.stuckBills} />,
  portfolio_budget: ({ data }) => (
    <PortfolioBudgetWidget rows={data.portfolio} />
  ),
};
