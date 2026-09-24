"use client";

import { useState } from "react";
import {
  PageHeader,
  DataTable,
  HydrationGate,
  StatTile,
  type Column,
} from "@/components/common";
import { TriangleAlert } from "lucide-react";
import { useAccess, useProjectId, useRepositoryQuery } from "@/lib/hooks";
import {
  budgetVsActual,
  consumptionBand,
  type BudgetVsActualRow,
} from "@/lib/services/budget-service";
import { formatInr, formatNumber, formatPercent } from "@/lib/format";
import { BudgetDrilldownSheet } from "@/components/material/budget-drilldown-sheet";
import { Button } from "@/components/ui/button";
import { cn } from "cn";

const BAND_CLASS = {
  neutral: "",
  amber: "text-warning",
  red: "text-destructive font-semibold",
} as const;

/** Material budget against material actually issued, per BOQ line. */
export default function BudgetVsActualPage() {
  const projectId = useProjectId();
  const access = useAccess("budget_vs_actual");
  const [selected, setSelected] = useState<BudgetVsActualRow | null>(null);

  const { data } = useRepositoryQuery<BudgetVsActualRow[]>(
    async () => (projectId ? budgetVsActual(projectId) : []),
    [projectId],
  );
  const rows = data ?? [];

  const totals = rows.reduce(
    (acc, r) => ({
      materialBudget: acc.materialBudget + r.material_budget_value,
      materialIssued: acc.materialIssued + r.material_issued_value,
      woValue: acc.woValue + r.work_order_value,
      certified: acc.certified + r.certified_amount,
      budget: acc.budget + r.total_budget,
      actual: acc.actual + r.total_actual,
    }),
    {
      materialBudget: 0,
      materialIssued: 0,
      woValue: 0,
      certified: 0,
      budget: 0,
      actual: 0,
    },
  );
  const overrun = rows.filter((r) => r.total_percent_consumed > 100).length;
  const flagged = rows.filter((r) => r.issued_vs_measured_flagged).length;

  const columns: Array<Column<BudgetVsActualRow>> = [
    {
      key: "item",
      header: "Item",
      cell: (r) => (
        <button
          onClick={() => setSelected(r)}
          className="font-mono text-xs underline decoration-border underline-offset-4 hover:decoration-foreground"
        >
          {r.item_code}
        </button>
      ),
    },
    {
      key: "desc",
      header: "Description",
      primary: true,
      cell: (r) => r.description,
    },
    {
      key: "trade",
      header: "Trade",
      secondary: true,
      cell: (r) => <span className="capitalize">{r.trade}</span>,
    },
    {
      key: "qty",
      header: "BOQ qty",
      align: "right",
      cell: (r) => `${formatNumber(r.budget_quantity, 0)} ${r.unit}`,
    },
    {
      key: "budget",
      header: "Material budget",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.material_budget_value),
    },
    {
      key: "issued",
      header: "Material issued",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.material_issued_value),
    },
    {
      key: "variance",
      header: "Variance",
      align: "right",
      money: true,
      cell: (r) => (
        <span className={cn(r.material_variance < 0 && BAND_CLASS.red)}>
          {formatInr(r.material_variance)}
        </span>
      ),
    },
    {
      key: "consumed",
      header: "% consumed",
      align: "right",
      money: true,
      cell: (r) => (
        <span
          className={BAND_CLASS[consumptionBand(r.material_percent_consumed)]}
        >
          {formatPercent(r.material_percent_consumed, 1)}
        </span>
      ),
    },
    {
      key: "woValue",
      header: "Work order value",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.work_order_value),
    },
    {
      key: "certified",
      header: "Contractor certified",
      align: "right",
      money: true,
      cell: (r) => (
        <span className={BAND_CLASS[consumptionBand(r.certified_percent)]}>
          {formatInr(r.certified_amount)}
          <span className="block text-[10px] font-normal text-muted-foreground">
            {formatPercent(r.certified_percent, 1)} of the order
          </span>
        </span>
      ),
    },
    {
      key: "totalActual",
      header: "Total actual",
      align: "right",
      money: true,
      cell: (r) => (
        <span className={BAND_CLASS[consumptionBand(r.total_percent_consumed)]}>
          {formatInr(r.total_actual)}
          <span className="block text-[10px] font-normal text-muted-foreground">
            of {formatInr(r.total_budget)}
          </span>
        </span>
      ),
    },
    {
      key: "ivm",
      header: "Issued vs measured",
      align: "right",
      cell: (r) =>
        r.issued_vs_measured_percent === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span
            className={cn(
              "inline-flex items-center gap-1 tabular-nums",
              r.issued_vs_measured_flagged && "font-semibold text-destructive",
            )}
          >
            {r.issued_vs_measured_flagged ? (
              <TriangleAlert className="size-3.5" />
            ) : null}
            {formatPercent(r.issued_vs_measured_percent, 1)}
          </span>
        ),
    },
    {
      key: "open",
      header: "",
      cell: (r) => (
        <Button variant="ghost" size="xs" onClick={() => setSelected(r)}>
          Issues
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        resource="budget_vs_actual"
        title={access.meta.label}
        description="Material allowance inside each BOQ line against what has actually been issued from site stock."
        team={access.ownerTeam}
        outsideNav={access.outsideNav}
        stepCodes={access.meta.step_codes}
        owned={access.owned}
      />
      <HydrationGate>
        <div className="space-y-6">
          {access.showValues ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile
                label="Total budget"
                value={formatInr(totals.budget)}
                hint={`Material ${formatInr(totals.materialBudget)} + work orders ${formatInr(totals.woValue)}`}
                team="project_budget"
              />
              <StatTile
                label="Material issued"
                value={formatInr(totals.materialIssued)}
                hint="Valued at weighted average cost"
                team="site_execution"
              />
              <StatTile
                label="Contractor certified"
                value={formatInr(totals.certified)}
                hint="Gross on bills that cleared C3–C4"
                team="billing_certification"
              />
              <StatTile
                label="Total actual"
                value={formatInr(totals.actual)}
                hint={`${overrun} lines over budget · ${flagged} flagged on issued vs measured`}
                team="purchase_stores"
              />
            </div>
          ) : null}

          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.boq_line_id}
            showValues={access.showValues}
            emptyMessage="Nothing to compare yet."
            caption="Under 80% neutral · 80–100% amber · over 100% red. Total actual is material issued plus contractor certified; issued vs measured flags material drawn more than 5% above what the measured work should have used."
          />
        </div>

        <BudgetDrilldownSheet
          row={selected}
          open={selected !== null}
          onOpenChange={(v) => !v && setSelected(null)}
          projectId={projectId}
          showValues={access.showValues}
        />
      </HydrationGate>
    </div>
  );
}
