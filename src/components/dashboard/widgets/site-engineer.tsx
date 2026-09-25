"use client";

import Link from "next/link";
import {
  AlertTriangle,
  CircleCheck,
  CircleDashed,
  CircleX,
} from "lucide-react";
import { MiniBar, Qty, WidgetCard, WidgetRow } from "../primitives";
import { LineCount, StatusPill } from "@/components/common";
import { countOf, formatDate, formatNumber } from "@/lib/format";
import type {
  DprDay,
  ExpectedDelivery,
  IndentPipelineStage,
  LowStockMaterial,
  TodayTask,
} from "@/lib/services/queries";
import { cn } from "cn";

/*
 * Site Execution widgets. Nothing here shows a rupee figure — the queries do
 * not return one, so there is nothing for the screen to leak.
 */

export function TodaysTasksWidget({ tasks }: { tasks: TodayTask[] }) {
  return (
    <WidgetCard
      title="Today's tasks"
      subtitle="Running now, or planned to have started"
      isEmpty={tasks.length === 0}
      empty="Nothing is scheduled to be under way today."
    >
      <ul className="space-y-1">
        {tasks.map((task) => (
          <li key={task.site_task_id}>
            <WidgetRow href={task.href}>
              <span className="font-mono text-xs">{task.task_code}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{task.title}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {task.location_block}
                  {task.contractor_name ? ` · ${task.contractor_name}` : ""}
                </span>
              </span>
              <span className="w-28 shrink-0">
                <span className="mb-1 block text-right text-xs text-muted-foreground">
                  <Qty value={task.done_qty} /> / {formatNumber(task.wo_qty, 0)}{" "}
                  {task.unit}
                </span>
                <MiniBar percent={task.percent} team="site_execution" />
              </span>
              <StatusPill status={task.status} />
            </WidgetRow>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}

/** Fourteen days of reporting, so a gap is impossible to miss. */
export function DprStreakWidget({
  days,
  href,
}: {
  days: DprDay[];
  href: string;
}) {
  const missing = days.filter((d) => !d.filed && !d.is_today).length;
  const todayMissing = days.some((d) => d.is_today && !d.filed);

  return (
    <WidgetCard
      title="DPR streak"
      subtitle={
        todayMissing
          ? "Today's report is still to be filed"
          : missing > 0
            ? `${missing} day${missing === 1 ? "" : "s"} missed in the last fortnight`
            : "Every day reported"
      }
      action={{ label: "Open DPR", href }}
    >
      <ol className="flex flex-wrap gap-1.5">
        {days.map((day) => (
          <li key={day.date}>
            <Link
              href={href}
              title={`${formatDate(day.date)} — ${day.filed ? `${day.lines} lines, ${day.labour} labour` : "not filed"}`}
              className={cn(
                "flex size-9 flex-col items-center justify-center rounded-lg text-[10px] font-medium ring-1 transition-colors",
                day.filed
                  ? "bg-success-soft text-success ring-success/30"
                  : day.is_today
                    ? "bg-warning-soft text-warning ring-warning/30"
                    : "bg-danger-soft text-destructive ring-destructive/30",
              )}
            >
              {day.filed ? (
                <CircleCheck className="size-3" />
              ) : day.is_today ? (
                <CircleDashed className="size-3" />
              ) : (
                <CircleX className="size-3" />
              )}
              {day.date.slice(8)}
            </Link>
          </li>
        ))}
      </ol>
    </WidgetCard>
  );
}

/** Where this site's indents have got to. */
export function IndentPipelineWidget({
  stages,
}: {
  stages: IndentPipelineStage[];
}) {
  const total = stages.reduce((s, x) => s + x.count, 0);
  return (
    <WidgetCard
      title="My indents"
      subtitle="Submitted through to received"
      isEmpty={total === 0}
      empty="No indents raised on this site yet."
    >
      <ol className="space-y-2">
        {stages.map((stage, i) => (
          <li key={stage.key}>
            <Link href={stage.href} className="group flex items-center gap-3">
              <span className="num flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground ring-1 ring-border">
                {i + 1}
              </span>
              <span className="flex-1 text-sm group-hover:underline">
                {stage.label}
              </span>
              <span className="w-24">
                <MiniBar
                  percent={total > 0 ? (stage.count / total) * 100 : 0}
                  team="site_execution"
                />
              </span>
              <span className="w-6 text-right text-sm font-medium tabular-nums">
                {stage.count}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </WidgetCard>
  );
}

/** Open POs by expected date. Quantities only. */
export function ExpectedDeliveriesWidget({
  rows,
}: {
  rows: ExpectedDelivery[];
}) {
  return (
    <WidgetCard
      title="Expected deliveries"
      subtitle="Open purchase orders, by the date they are due"
      isEmpty={rows.length === 0}
      empty="Nothing is out with a vendor."
    >
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={row.purchase_order_id}>
            <WidgetRow href={row.href}>
              <span className="font-mono text-xs">{row.po_number}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">
                  {row.supplier_name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {row.materials}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span
                  className={cn(
                    "block text-xs",
                    row.is_overdue
                      ? "font-medium text-destructive"
                      : "text-muted-foreground",
                  )}
                >
                  {row.is_overdue
                    ? `${countOf(row.days_until * -1, "day")} overdue`
                    : row.days_until === 0
                      ? "due today"
                      : `in ${countOf(row.days_until, "day")}`}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  {formatDate(row.expected_date)}
                </span>
              </span>
              <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
                <LineCount lines={row.pending_lines} totals={row.pending} /> to come
              </span>
            </WidgetRow>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}

export function LowStockWidget({ rows }: { rows: LowStockMaterial[] }) {
  return (
    <WidgetCard
      title="Low stock"
      subtitle="Below the reorder level"
      isEmpty={rows.length === 0}
      empty="Every material is above its reorder level."
    >
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={`${row.project_id}:${row.material_id}`}>
            <WidgetRow href={row.href}>
              <AlertTriangle className="size-3.5 shrink-0 text-warning" />
              <span className="min-w-0 flex-1 truncate text-sm">
                {row.name}
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-sm font-medium tabular-nums text-warning">
                  <Qty value={row.balance} unit={row.unit} />
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  reorder at {formatNumber(row.reorder_level, 0)}
                </span>
              </span>
            </WidgetRow>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}
