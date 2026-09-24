"use client";

import { useMemo, useState } from "react";
import { TriangleAlert } from "lucide-react";
import {
  PageHeader,
  DataTable,
  HydrationGate,
  type Column,
} from "@/components/common";
import { KpiRow } from "@/components/dashboard/widgets/kpis";
import { MiniBar } from "@/components/dashboard/primitives";
import { BudgetDrilldownSheet } from "@/components/material/budget-drilldown-sheet";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { tradeLabel } from "@/config/labels";
import { useAccess, useProjectId, useRepositoryQuery } from "@/lib/hooks";
import {
  budgetVsActual,
  consumptionBand,
  needsAttention,
  type BudgetVsActualRow,
} from "@/lib/services/budget-service";
import { getProjectBudgetKpis, scopeFor, type Kpi } from "@/lib/services/queries";
import { useSession } from "@/lib/session";
import { formatInr, formatNumber, formatPercent } from "@/lib/format";
import { cn } from "cn";

type View = "total" | "material" | "contractor";

const BAND_CLASS = {
  neutral: "",
  amber: "text-warning",
  red: "text-destructive font-semibold",
} as const;

const BAR_TONE = { neutral: undefined, amber: "warn", red: "bad" } as const;

/** What each view compares, and the percentage the list is sorted by. */
const VIEW_PERCENT: Record<View, (r: BudgetVsActualRow) => number> = {
  total: (r) => r.total_percent_consumed,
  material: (r) => r.material_percent_consumed,
  contractor: (r) => r.certified_percent,
};

/**
 * Budget against actual, per BOQ line.
 *
 * One question drives the layout: which lines are in trouble, and is it the
 * material or the contractor? So the table shows one comparison at a time —
 * the whole line, its material, or its contractor scope — worst first, with a
 * filter down to the lines that need a look. The full breakdown of any line
 * is one click away in the drill-down.
 */
export default function BudgetVsActualPage() {
  const projectId = useProjectId();
  const access = useAccess("budget_vs_actual");
  const { user } = useSession();
  const [selected, setSelected] = useState<BudgetVsActualRow | null>(null);
  const [view, setView] = useState<View>("total");
  const [attentionOnly, setAttentionOnly] = useState(false);

  const { data } = useRepositoryQuery<BudgetVsActualRow[]>(
    async () => (projectId ? budgetVsActual(projectId) : []),
    [projectId],
  );
  const { data: kpis } = useRepositoryQuery<Kpi[]>(
    async () => (user && projectId ? getProjectBudgetKpis(scopeFor(user), projectId) : []),
    [user?.id, user?.role, projectId],
  );

  const all = useMemo(() => data ?? [], [data]);
  const attentionCount = all.filter(needsAttention).length;

  const rows = useMemo(() => {
    const filtered = attentionOnly ? all.filter(needsAttention) : all;
    // Worst first — but only for a role that can see what "worst" is measured in.
    if (!access.showValues) return filtered;
    const pct = VIEW_PERCENT[view];
    return [...filtered].sort((a, b) => pct(b) - pct(a));
  }, [all, attentionOnly, view, access.showValues]);

  const line: Column<BudgetVsActualRow> = {
    key: "line",
    header: "BOQ line",
    primary: true,
    cell: (r) => (
      <div className="min-w-0">
        <p className="flex items-start gap-1.5">
          <span className="shrink-0 pt-px font-mono text-xs text-muted-foreground">
            {r.item_code}
          </span>
          <span>{r.description}</span>
          {r.issued_vs_measured_flagged ? (
            <TriangleAlert
              className="mt-0.5 size-3.5 shrink-0 text-destructive"
              aria-label="Material drawn above what the measured work needs"
            />
          ) : null}
        </p>
        <p className="text-xs text-muted-foreground">{tradeLabel(r.trade)}</p>
      </div>
    ),
  };

  const done: Column<BudgetVsActualRow> = {
    key: "done",
    header: "Work done",
    align: "right",
    cell: (r) => (
      <span className="whitespace-nowrap">
        {formatPercent(r.budget_quantity > 0 ? (r.done_qty / r.budget_quantity) * 100 : 0)}
        <span className="block text-xs text-muted-foreground">
          {formatNumber(r.done_qty, 0)} of {formatNumber(r.budget_quantity, 0)} {r.unit}
        </span>
      </span>
    ),
  };

  const percent = (header: string, value: (r: BudgetVsActualRow) => number) =>
    ({
      key: "percent",
      header,
      align: "right",
      money: true,
      cell: (r) => {
        const band = consumptionBand(value(r));
        return (
          <span className="block min-w-20">
            <span className={cn("tabular-nums", BAND_CLASS[band])}>
              {formatPercent(value(r))}
            </span>
            <MiniBar percent={value(r)} tone={BAR_TONE[band]} className="mt-1" />
          </span>
        );
      },
    }) satisfies Column<BudgetVsActualRow>;

  const money = (
    key: string,
    header: string,
    value: (r: BudgetVsActualRow) => number,
    overIsBad = false,
  ): Column<BudgetVsActualRow> => ({
    key,
    header,
    align: "right",
    money: true,
    cell: (r) => (
      <span className={cn("whitespace-nowrap", overIsBad && value(r) < 0 && BAND_CLASS.red)}>
        {formatInr(value(r))}
      </span>
    ),
  });

  const ivm: Column<BudgetVsActualRow> = {
    key: "ivm",
    header: "Issued vs measured",
    align: "right",
    cell: (r) =>
      r.issued_vs_measured_percent === null ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <span
          className={cn(
            "tabular-nums",
            r.issued_vs_measured_flagged && "font-semibold text-destructive",
          )}
        >
          {r.issued_vs_measured_percent > 0 ? "+" : ""}
          {formatPercent(r.issued_vs_measured_percent, 1)}
        </span>
      ),
  };

  const open: Column<BudgetVsActualRow> = {
    key: "open",
    header: "",
    cell: (r) => (
      <Button
        variant="ghost"
        size="xs"
        onClick={(e) => {
          e.stopPropagation();
          setSelected(r);
        }}
      >
        Open
      </Button>
    ),
  };

  const columns: Record<View, Array<Column<BudgetVsActualRow>>> = {
    total: [
      line,
      done,
      money("budget", "Budget", (r) => r.total_budget),
      money("actual", "Actual", (r) => r.total_actual),
      percent("% spent", (r) => r.total_percent_consumed),
      money("balance", "Balance", (r) => r.total_variance, true),
      open,
    ],
    material: [
      line,
      money("budget", "Allowance", (r) => r.material_budget_value),
      money("actual", "Issued", (r) => r.material_issued_value),
      percent("% used", (r) => r.material_percent_consumed),
      money("balance", "Balance", (r) => r.material_variance, true),
      ivm,
      open,
    ],
    contractor: [
      line,
      done,
      money("budget", "Work order", (r) => r.work_order_value),
      money("actual", "Certified", (r) => r.certified_amount),
      percent("% certified", (r) => r.certified_percent),
      money("balance", "Left to certify", (r) => r.work_order_value - r.certified_amount, true),
      open,
    ],
  };

  const caption = {
    total:
      "Budget is the BOQ amount — material allowance plus labour; actual is material issued plus contractor work certified. Amber from 80%, red over budget.",
    material:
      "Material issued from site stock against the line's allowance, at weighted average cost. Issued vs measured compares it with what the measured work should have used; over 5% is flagged.",
    contractor:
      "Contractor work certified on RA bills that cleared C3–C4, against the work orders let on the line. A line with no work order has not been let yet.",
  }[view];

  return (
    <div>
      <PageHeader
        resource="budget_vs_actual"
        title={access.meta.label}
        description="Each BOQ line's budget — material allowance plus labour — against material issued and contractor work certified."
        team={access.ownerTeam}
        outsideNav={access.outsideNav}
        stepCodes={access.meta.step_codes}
        owned={access.owned}
      />
      <HydrationGate>
        <div className="space-y-6">
          {kpis && kpis.length > 0 ? <KpiRow kpis={kpis} team="project_budget" /> : null}

          {access.showValues ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Tabs value={view} onValueChange={(v) => setView(v as View)}>
                <TabsList>
                  <TabsTrigger value="total">Total</TabsTrigger>
                  <TabsTrigger value="material">Material</TabsTrigger>
                  <TabsTrigger value="contractor">Contractor</TabsTrigger>
                </TabsList>
              </Tabs>
              <Button
                variant={attentionOnly ? "secondary" : "outline"}
                size="sm"
                aria-pressed={attentionOnly}
                disabled={attentionCount === 0 && !attentionOnly}
                onClick={() => setAttentionOnly((v) => !v)}
              >
                <TriangleAlert className="size-3.5" />
                Needs attention ({attentionCount})
              </Button>
            </div>
          ) : null}

          <DataTable
            columns={access.showValues ? columns[view] : [line, done, ivm, open]}
            rows={rows}
            rowKey={(r) => r.boq_line_id}
            showValues={access.showValues}
            onRowClick={setSelected}
            emptyMessage={
              attentionOnly ? "No line needs attention." : "Nothing to compare yet."
            }
            caption={access.showValues ? caption : undefined}
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
