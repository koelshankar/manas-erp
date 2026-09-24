"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { TEAM_STYLES } from "@/config/team-styles";
import type { Team } from "@/lib/domain";
import { formatNumber } from "@/lib/format";
import { cn } from "cn";

/** The shell every dashboard widget sits in. */
export function WidgetCard({
  title,
  subtitle,
  team,
  emphasis,
  action,
  children,
  empty,
  isEmpty,
}: {
  title: string;
  subtitle?: string;
  team?: Team;
  emphasis?: boolean;
  action?: { label: string; href: string };
  children: ReactNode;
  /** Shown instead of the children when there is nothing to show. */
  empty?: string;
  isEmpty?: boolean;
}) {
  return (
    <Card
      className={cn(
        "h-full px-5 py-5",
        // Emphasis is a 3px team rule down the edge, never a tinted card.
        emphasis && team && "border-l-[3px]",
        emphasis && team && TEAM_STYLES[team].line,
        emphasis && "shadow-card",
      )}
    >
      <header className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-semibold tracking-tight">{title}</h3>
          {subtitle ? (
            <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        {action ? (
          <Link
            href={action.href}
            className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {action.label}
            <ArrowRight className="size-3" />
          </Link>
        ) : null}
      </header>
      {isEmpty ? <EmptyNote>{empty ?? "Nothing here."}</EmptyNote> : children}
    </Card>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

/** A clickable row inside a widget. */
export function WidgetRow({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60",
        className,
      )}
    >
      {children}
    </Link>
  );
}

/** A thin proportional bar, used for progress and for the bar charts. */
export function MiniBar({
  percent,
  team = "project_budget",
  tone,
  className,
}: {
  percent: number;
  team?: Team;
  tone?: "good" | "warn" | "bad";
  className?: string;
}) {
  const width = Math.max(0, Math.min(100, percent));
  return (
    <span
      className={cn(
        "block h-1.5 overflow-hidden rounded-full bg-muted",
        className,
      )}
    >
      <span
        className={cn(
          "block h-full rounded-full",
          tone === "bad"
            ? "bg-destructive"
            : tone === "warn"
              ? "bg-warning"
              : tone === "good"
                ? "bg-success"
                : TEAM_STYLES[team].bar,
        )}
        style={{ width: `${width}%` }}
      />
    </span>
  );
}

/** Horizontal bar chart. Rendered as sized rows — no chart library needed. */
export function BarList({
  rows,
  team = "purchase_stores",
}: {
  rows: Array<{
    key: string;
    label: string;
    sublabel?: string;
    value: number;
    display: string;
    href: string;
  }>;
  team?: Team;
}) {
  const max = rows.reduce((m, r) => Math.max(m, Math.abs(r.value)), 0) || 1;
  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.key}>
          <Link href={row.href} className="group block">
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="truncate text-sm group-hover:underline">
                {row.label}
                {row.sublabel ? (
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    {row.sublabel}
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 text-sm font-medium tabular-nums">
                {row.display}
              </span>
            </div>
            <MiniBar percent={(Math.abs(row.value) / max) * 100} team={team} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Small label / number pair. */
export function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: ReactNode;
  tone?: "good" | "warn" | "bad";
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-0.5 truncate text-sm font-medium tabular-nums",
          tone === "bad" && "text-destructive",
          tone === "warn" && "text-warning",
          tone === "good" && "text-success",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/** Quantity with its unit, for the value-blind screens. */
export function Qty({ value, unit }: { value: number; unit?: string }) {
  return (
    <span className="tabular-nums">
      {formatNumber(value, 2)}
      {unit ? (
        <span className="ml-1 text-xs text-muted-foreground">{unit}</span>
      ) : null}
    </span>
  );
}
