"use client";

import { MapPin } from "lucide-react";
import { formatInrCompact, formatDate } from "@/lib/format";
import { Stat, StatusChip } from "@/components/common";
import { Card } from "@/components/ui/card";
import type { ProjectHeaderStats } from "@/lib/services/queries";
import { cn } from "cn";
import { WorkspaceBreadcrumb } from "./workspace-breadcrumb";
import { WorkspaceProjectSwitcher } from "./workspace-project-switcher";

/**
 * Pinned project header — stays above the eight workspace tabs.
 *
 * It carries the breadcrumb and the project switcher, so both are reachable
 * from every tab without going back out to the project list.
 *
 * The figures come from `getProjectHeaderStats`, which decides what this role
 * may see. A value-blind role's payload has no budget or spend in it at all,
 * so this component gets four different numbers rather than hiding two
 * (audit C1).
 *
 * `compact` is the 48px bar the page collapses to on scroll.
 */
export function ProjectHeader({
  stats,
  compact = false,
}: {
  stats: ProjectHeaderStats;
  compact?: boolean;
}) {
  const showsMoney = stats.budget_amount !== undefined;

  if (compact) {
    return (
      <div className="flex h-12 items-center gap-3 px-1">
        <span className="min-w-0 truncate text-sm font-semibold text-foreground">
          <WorkspaceProjectSwitcher name={stats.name} />
        </span>
        <StatusChip status={stats.status} />
        <span className="num ml-auto shrink-0 text-sm text-muted-foreground">
          {showsMoney
            ? `${formatInrCompact(stats.spent_amount)} of ${formatInrCompact(stats.budget_amount)}`
            : `${stats.percent_complete}% complete`}
        </span>
      </div>
    );
  }

  return (
    <Card className="mb-5 px-5 py-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <WorkspaceBreadcrumb projectId={stats.project_id} projectName={stats.name} />
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl leading-tight font-semibold tracking-tight">
              <WorkspaceProjectSwitcher name={stats.name} />
            </h1>
            <StatusChip status={stats.status} />
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-3.5" />
            {stats.location}
            <span className="text-border">·</span>
            <span className="font-mono text-xs">{stats.code}</span>
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4 lg:shrink-0">
          {showsMoney ? (
            <>
              <Stat label="Budget" value={formatInrCompact(stats.budget_amount)} />
              <Stat
                label="Actual"
                value={
                  <span>
                    {formatInrCompact(stats.spent_amount)}
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                      {stats.spent_percent}%
                    </span>
                  </span>
                }
              />
            </>
          ) : (
            <>
              <Stat label="Open indents" value={String(stats.open_indents ?? 0)} />
              <Stat
                label="Deliveries due"
                value={
                  <span
                    className={cn((stats.deliveries_due ?? 0) > 0 && "text-warning")}
                  >
                    {stats.deliveries_due ?? 0}
                  </span>
                }
              />
            </>
          )}
          <Stat
            label="Complete"
            value={
              <span className="flex items-center gap-2">
                {stats.percent_complete}%
                <span className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-foreground/70"
                    style={{ width: `${stats.percent_complete}%` }}
                  />
                </span>
              </span>
            }
          />
          <Stat
            label={stats.days_to_target < 0 ? "Overdue since" : "Target"}
            value={
              <span className={cn(stats.days_to_target < 0 && "text-destructive")}>
                {formatDate(stats.target_completion_date)}
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  {stats.days_to_target < 0
                    ? `${Math.abs(stats.days_to_target)}d late`
                    : `${stats.days_to_target}d`}
                </span>
              </span>
            }
          />
        </dl>
      </div>
    </Card>
  );
}
