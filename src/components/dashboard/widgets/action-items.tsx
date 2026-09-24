"use client";

import Link from "next/link";
import { ArrowRight, CheckCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StepCodeBadge } from "@/components/common";
import { TEAM_STYLES } from "@/config/team-styles";
import { countOf, formatInrCompact } from "@/lib/format";
import { ageBand, type ActionItem } from "@/lib/services/queries";
import type { Team } from "@/lib/domain";
import { cn } from "cn";

const AGE_CLASS = {
  fresh: "text-muted-foreground",
  warn: "text-warning",
  late: "text-destructive font-semibold",
} as const;

function ageLabel(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

/**
 * "Needs your action" — every queue this role owns, in one list, oldest first.
 * Amber past three days, red past seven.
 */
export function ActionItemsWidget({
  items,
  team,
  emphasis,
}: {
  items: ActionItem[];
  team: Team;
  emphasis?: boolean;
}) {
  const live = items.filter((i) => !i.read_only);
  const watching = items.filter((i) => i.read_only);
  const late = live.filter((i) => ageBand(i.age_days) === "late").length;

  return (
    <Card
      className={cn(
        "px-5 py-5",
        emphasis && "border-l-[3px]",
        emphasis && TEAM_STYLES[team].line,
        emphasis && "shadow-card",
      )}
    >
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold tracking-tight text-foreground">
            Needs your action
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {live.length === 0
              ? "You are clear."
              : `${live.length} item${live.length === 1 ? "" : "s"} across your queues${late > 0 ? ` · ${late} over a week old` : ""}`}
          </p>
        </div>
        <Link
          href="/approvals"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Approvals inbox
          <ArrowRight className="size-3" />
        </Link>
      </header>

      {live.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg bg-background/60 px-4 py-8 text-center">
          <CheckCheck className="size-5 text-success" />
          <p className="text-sm text-muted-foreground">
            Nothing is waiting on you right now.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border/60">
          {live.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                className="-mx-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-2.5 transition-colors hover:bg-background/70"
              >
                {item.step_code ? (
                  <StepCodeBadge codes={[item.step_code]} team={item.team} />
                ) : (
                  <span className="w-10" />
                )}
                <span className="font-mono text-xs">
                  {item.document_number}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {item.label}
                  {item.context ? (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {item.context}
                    </span>
                  ) : null}
                </span>
                <span className="hidden text-xs text-muted-foreground sm:block">
                  {item.project_name}
                </span>
                {item.value !== undefined ? (
                  <span className="num text-xs text-muted-foreground">
                    {formatInrCompact(item.value)}
                  </span>
                ) : null}
                <span
                  className={cn(
                    "w-16 text-right text-xs",
                    AGE_CLASS[ageBand(item.age_days)],
                  )}
                >
                  {ageLabel(item.age_days)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {watching.length > 0 ? (
        <details className="mt-4 border-t border-border/60 pt-3">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            {countOf(watching.length, "item")} with the Purchase Officer
          </summary>
          <ul className="mt-2 divide-y divide-border/40">
            {watching.slice(0, 8).map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-background/70"
                >
                  <span className="font-mono">{item.document_number}</span>
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  <span className={AGE_CLASS[ageBand(item.age_days)]}>
                    {ageLabel(item.age_days)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Card>
  );
}
