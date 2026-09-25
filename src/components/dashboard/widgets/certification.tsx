"use client";

import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { MiniBar, WidgetCard, WidgetRow } from "../primitives";
import { TEAM_STYLES } from "@/config/team-styles";
import { countOf, formatInrCompact, formatPercent } from "@/lib/format";
import type {
  CertificationStage,
  ContractorSummary,
  PortfolioRow,
  StuckBill,
} from "@/lib/services/queries";
import { cn } from "cn";

/** The C3–C4 chain as a stepper: how many bills, and how much, at each link. */
export function CertificationPipelineWidget({
  stages,
}: {
  stages: CertificationStage[];
}) {
  const total = stages.reduce((s, x) => s + x.count, 0);
  return (
    <WidgetCard
      title="Certification pipeline"
      subtitle="Where every bill in the chain is sitting"
      isEmpty={total === 0}
      empty="No bill is inside the certification chain."
    >
      <ol className="flex flex-col gap-2 sm:flex-row">
        {stages.map((stage) => (
          <li key={stage.sequence} className="min-w-0 flex-1">
            <Link
              href={stage.href}
              className={cn(
                "flex h-full flex-col gap-1 rounded-xl border-l-[3px] px-3.5 py-3 ring-1 ring-border transition-shadow hover:shadow-card",
                stage.count > 0
                  ? "bg-card"
                  : "border-l-transparent bg-muted/40",
                stage.count > 0 &&
                  (stage.cross_team
                    ? TEAM_STYLES.project_budget.line
                    : TEAM_STYLES.billing_certification.line),
              )}
            >
              <span className="flex items-center gap-1.5 text-[11px] font-medium">
                <span className="font-mono">{stage.step_code}</span>
                <span className="opacity-70">Step {stage.sequence}</span>
              </span>
              <span className="text-sm font-medium">{stage.role_label}</span>
              {stage.cross_team ? (
                <span className="text-[10px] opacity-75">
                  Cross-team verification
                </span>
              ) : null}
              <span className="mt-1 text-2xl leading-none font-semibold tabular-nums">
                {stage.count}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {formatInrCompact(stage.value)}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </WidgetCard>
  );
}

/** Bills that have been stuck at one step longer than they should be. */
export function StuckBillsWidget({
  rows,
  days = 7,
}: {
  rows: StuckBill[];
  days?: number;
}) {
  return (
    <WidgetCard
      title={`Stuck over ${days} days`}
      subtitle="Bills waiting at one step for too long"
      isEmpty={rows.length === 0}
      empty="Nothing has been sitting in the chain for more than a week."
    >
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={row.ra_bill_id}>
            <WidgetRow href={row.href}>
              <TriangleAlert className="size-3.5 shrink-0 text-destructive" />
              <span className="font-mono text-xs">{row.bill_number}</span>
              <span className="min-w-0 flex-1 truncate text-sm">
                {row.contractor_name}
                <span className="ml-2 text-xs text-muted-foreground">
                  {row.project_name}
                </span>
              </span>
              <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                waiting on {row.waiting_on}
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-sm font-medium tabular-nums text-destructive">
                  {countOf(row.age_days, "day")}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  {formatInrCompact(row.value)}
                </span>
              </span>
            </WidgetRow>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}

/** Work-order value against certified, per contractor. */
export function ContractorSummaryWidget({
  rows,
}: {
  rows: ContractorSummary[];
}) {
  return (
    <WidgetCard
      title="Contractors"
      subtitle="Order value against what has been certified"
      action={{ label: "Contractor ledger", href: "/ledgers/contractors" }}
      isEmpty={rows.length === 0}
      empty="No contractor has a work order on this project yet."
    >
      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.contractor_id}>
            <Link href={row.href} className="group block">
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <span className="truncate text-sm group-hover:underline">
                  {row.contractor_name}
                </span>
                <span className="shrink-0 text-sm tabular-nums">
                  {formatInrCompact(row.certified)}
                  <span className="text-muted-foreground">
                    {" "}
                    / {formatInrCompact(row.order_value)}
                  </span>
                </span>
              </div>
              <MiniBar
                percent={row.percent}
                team="billing_certification"
                tone={
                  row.percent >= 100
                    ? "bad"
                    : row.percent >= 85
                      ? "warn"
                      : undefined
                }
              />
              <p className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                <span>{formatPercent(row.percent, 0)} certified</span>
                <span className="text-border">·</span>
                <span>
                  {formatInrCompact(row.retention_held)} retention held
                </span>
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}

/**
 * Budget against material and contractor spend across the portfolio, as a
 * grouped bar per project.
 */
export function PortfolioBudgetWidget({ rows }: { rows: PortfolioRow[] }) {
  return (
    <WidgetCard
      title="Portfolio budget vs actual"
      subtitle="How much of each project's budget has been consumed"
      team="billing_certification"
      emphasis
      action={{ label: "Full report", href: "/reports/budget-vs-actual" }}
      isEmpty={rows.length === 0}
      empty="No projects to report on."
    >
      <div className="space-y-5">
        {rows.map((row) => (
          <ProjectProgress key={row.project_id} row={row} />
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
        <Legend className="bg-chart-2" label="Material issued" />
        <Legend className="bg-chart-1" label="Contractor certified" />
        <Legend className="bg-muted" label="Budget remaining" />
      </div>
    </WidgetCard>
  );
}

/**
 * One project, one bar: spend against its own budget.
 *
 * The old chart put budget, material and certified on a shared axis, where
 * ₹4.88 L beside ₹7.45 Cr is a one-pixel stub and the figures alongside did
 * all the work (audit H1). Each project is now measured against itself, so a
 * 3%-consumed project and a 65%-consumed one are immediately different
 * shapes, and the two spend components stack inside the one bar.
 */
function ProjectProgress({ row }: { row: PortfolioRow }) {
  const spent = row.material + row.certified;
  const percent = row.budget > 0 ? (spent / row.budget) * 100 : 0;
  const materialPercent = row.budget > 0 ? (row.material / row.budget) * 100 : 0;
  const certifiedPercent = row.budget > 0 ? (row.certified / row.budget) * 100 : 0;

  // The app's one variance rule: warning from 80%, destructive past 100%.
  const tone =
    percent > 100 ? "text-destructive" : percent >= 80 ? "text-warning" : "text-foreground";

  return (
    <Link href={row.href} className="group block">
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="truncate text-sm font-medium group-hover:underline">{row.name}</span>
        <span className="num shrink-0 text-xs text-muted-foreground">
          {formatInrCompact(spent)} of {formatInrCompact(row.budget)}
          <span className={cn("ml-2 font-semibold", tone)}>{formatPercent(percent, 1)}</span>
        </span>
      </div>

      <div className="flex h-3 overflow-hidden rounded-full bg-muted" role="presentation">
        <span
          className="block h-full bg-chart-2"
          style={{ width: `${Math.min(materialPercent, 100)}%` }}
        />
        <span
          className="block h-full bg-chart-1"
          style={{ width: `${Math.min(certifiedPercent, Math.max(100 - materialPercent, 0))}%` }}
        />
      </div>

      <div className="mt-1 flex flex-wrap gap-x-4 text-[11px] text-muted-foreground">
        <span className="num">Material {formatInrCompact(row.material)}</span>
        <span className="num">Certified {formatInrCompact(row.certified)}</span>
        <span className="num">
          Remaining {formatInrCompact(Math.max(row.budget - spent, 0))}
        </span>
      </div>
    </Link>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-2 rounded-full", className)} />
      {label}
    </span>
  );
}
