"use client";

import { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "cn";
import { today } from "@/lib/clock";
import { formatDate } from "@/lib/format";
import type { ProgrammeTask } from "@/lib/domain";
import {
  buildProgrammeTree,
  flattenProgrammeTree,
  programmeTaskState,
} from "@/lib/services/programme-service";
import { StatusChip, EmptyState } from "@/components/common";
import { CalendarRange } from "lucide-react";

/**
 * The 390px fallback — a Gantt timeline has no meaning at phone width. Same
 * depth-first order and collapse state as the desktop chart, so switching
 * views never reshuffles what the person was looking at.
 */
export function ProgrammeList({
  tasks,
  collapsedIds,
  onToggleCollapse,
}: {
  tasks: ProgrammeTask[];
  collapsedIds: ReadonlySet<string>;
  onToggleCollapse: (id: string) => void;
}) {
  const todayStr = today();
  const flatRows = useMemo(
    () => flattenProgrammeTree(buildProgrammeTree(tasks), collapsedIds),
    [tasks, collapsedIds],
  );

  if (flatRows.length === 0) {
    return (
      <EmptyState
        icon={CalendarRange}
        message="Nothing is programmed yet. Import the construction programme to see it here."
      />
    );
  }

  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-card">
      {flatRows.map(({ task, depth, has_children, collapsed }) => {
        const state = programmeTaskState(task, todayStr);
        return (
          <li
            key={task.id}
            className="flex min-h-11 items-center gap-2 px-3 py-2"
            style={{ paddingLeft: 12 + depth * 16 }}
          >
            {has_children ? (
              <button
                type="button"
                onClick={() => onToggleCollapse(task.id)}
                className="flex size-8 shrink-0 items-center justify-center rounded hover:bg-muted"
                aria-label={collapsed ? "Expand" : "Collapse"}
              >
                <ChevronRight
                  className={cn("size-4 transition-transform", !collapsed && "rotate-90")}
                />
              </button>
            ) : (
              <span className="size-8 shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{task.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {formatDate(task.start_date)} – {formatDate(task.end_date)} ·{" "}
                {task.duration_days} days
              </p>
            </div>
            <StatusChip status={state} />
          </li>
        );
      })}
    </ul>
  );
}
