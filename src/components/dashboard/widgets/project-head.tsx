"use client";

import Link from "next/link";
import { ArrowRight, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Figure, MiniBar, WidgetCard, WidgetRow } from "../primitives";
import { formatInrCompact, formatNumber, formatPercent } from "@/lib/format";
import type {
  IssuedVsMeasuredFlag,
  OverBudgetLine,
  ProjectCard,
  WorkOrderNearLimit,
} from "@/lib/services/queries";
import { cn } from "cn";

/** Budget against actual per project, with a bar for how far spent it is. */
export function ProjectCardsWidget({ cards }: { cards: ProjectCard[] }) {
  return (
    <WidgetCard
      title="Your projects"
      subtitle="Budget against material issued plus contractor certified"
      action={{ label: "All projects", href: "/projects" }}
      isEmpty={cards.length === 0}
      empty="You are not posted to a project yet."
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => {
          const spent =
            card.budget > 0 ? (card.total_actual / card.budget) * 100 : 0;
          const over = card.variance < 0;
          return (
            <Link
              key={card.project_id}
              href={card.href}
              className="group block"
            >
              <Card className="h-full px-4 py-4 transition-shadow group-hover:shadow-md">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {card.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {card.location}
                    </p>
                  </div>
                  <ArrowRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>

                <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <Figure
                    label="Budget"
                    value={formatInrCompact(card.budget)}
                  />
                  <Figure
                    label="Actual"
                    value={formatInrCompact(card.total_actual)}
                  />
                  <Figure
                    label="Material"
                    value={formatInrCompact(card.material_actual)}
                  />
                  <Figure
                    label="Certified"
                    value={formatInrCompact(card.certified_actual)}
                  />
                </dl>

                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{formatPercent(spent, 0)} of budget used</span>
                    <span
                      className={cn(over && "font-medium text-destructive")}
                    >
                      {over ? "over by " : ""}
                      {formatInrCompact(Math.abs(card.variance))}
                    </span>
                  </div>
                  <MiniBar
                    percent={spent}
                    tone={over ? "bad" : spent >= 80 ? "warn" : undefined}
                  />
                </div>

                <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>
                    {formatPercent(card.percent_complete, 0)} complete
                  </span>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </WidgetCard>
  );
}

/** BOQ lines consuming more than they were budgeted. */
export function OverBudgetLinesWidget({ rows }: { rows: OverBudgetLine[] }) {
  return (
    <WidgetCard
      title="BOQ lines over budget"
      subtitle="Worst overrun first"
      isEmpty={rows.length === 0}
      empty="Every BOQ line is inside its budget."
    >
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={`${row.project_id}:${row.boq_line_id}`}>
            <WidgetRow href={row.href}>
              <span className="font-mono text-xs">{row.item_code}</span>
              <span className="min-w-0 flex-1 truncate text-sm">
                {row.description}
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-sm font-medium tabular-nums text-destructive">
                  +{formatInrCompact(row.overrun)}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  {formatPercent(row.percent_consumed, 0)} used
                </span>
              </span>
            </WidgetRow>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}

/** Work orders whose certified value is closing on the order value. */
export function WorkOrdersNearLimitWidget({
  rows,
}: {
  rows: WorkOrderNearLimit[];
}) {
  return (
    <WidgetCard
      title="Work orders near their limit"
      subtitle="Certified at 85% of the order or more"
      isEmpty={rows.length === 0}
      empty="No work order is close to its value limit."
    >
      <ul className="space-y-2.5">
        {rows.map((row) => (
          <li key={row.work_order_id}>
            <Link href={row.href} className="group block">
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <span className="truncate text-sm group-hover:underline">
                  <span className="font-mono text-xs">{row.wo_number}</span>
                  <span className="ml-2 text-muted-foreground">
                    {row.contractor_name}
                  </span>
                </span>
                <span
                  className={cn(
                    "shrink-0 text-sm font-medium tabular-nums",
                    row.percent_used >= 100 && "text-destructive",
                  )}
                >
                  {formatPercent(row.percent_used, 0)}
                </span>
              </div>
              <MiniBar
                percent={row.percent_used}
                tone={row.percent_used >= 100 ? "bad" : "warn"}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                {formatInrCompact(row.certified)} of{" "}
                {formatInrCompact(row.order_value)}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}

/** The dashed line on the chart, wherever it is out of tolerance. */
export function IssuedVsMeasuredWidget({
  rows,
  materialName,
}: {
  rows: IssuedVsMeasuredFlag[];
  materialName: (id: string) => string;
}) {
  return (
    <WidgetCard
      title="Issued vs measured"
      subtitle="Material drawn more than 5% above what the measured work should have used"
      isEmpty={rows.length === 0}
      empty="Every material is within tolerance of the measured work."
    >
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={`${row.boq_line_id}:${row.material_id}`}>
            <WidgetRow href={row.href}>
              <TriangleAlert className="size-3.5 shrink-0 text-destructive" />
              <span className="font-mono text-xs">{row.item_code}</span>
              <span className="min-w-0 flex-1 truncate text-sm">
                {materialName(row.material_id)}
                <span className="ml-2 text-xs text-muted-foreground">
                  {row.description}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-sm font-medium tabular-nums text-destructive">
                  {formatPercent(row.variance_percent, 0)}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  {formatNumber(row.issued_qty, 0)} vs{" "}
                  {formatNumber(row.theoretical_qty, 0)} {row.unit}
                </span>
              </span>
            </WidgetRow>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}
