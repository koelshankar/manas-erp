"use client";

import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronRight } from "lucide-react";
import { cn } from "cn";
import { today } from "@/lib/clock";
import { formatDate } from "@/lib/format";
import type { ProgrammeTask, ProgrammeTaskState } from "@/lib/domain";
import {
  buildProgrammeTree,
  flattenProgrammeTree,
  programmeTaskState,
} from "@/lib/services/programme-service";
import {
  TIMELINE_SCALES,
  barGeometry,
  timelineRange,
  timelineTicks,
  timelineWidth,
  xForDate,
  type TimelineScale,
} from "@/lib/services/programme-timeline";
import { Button } from "@/components/ui/button";
import { RecordLink } from "@/components/common";
import { useLookups } from "@/lib/hooks";

const ROW_HEIGHT = 40;
const NAME_W = 220;
const DATE_W = 68;
const DUR_W = 56;
const BOQ_W = 64;
const LEFT_WIDTH = NAME_W + DATE_W * 2 + DUR_W + BOQ_W;
const CHART_HEIGHT = 540;

/** Status colour is the only colour a bar may carry — never a team colour. */
const BAR_CLASS: Record<ProgrammeTaskState, string> = {
  not_started: "bg-muted-foreground/35",
  in_progress: "bg-info",
  completed: "bg-success",
};

const SCALE_LABEL: Record<TimelineScale, string> = {
  week: "Week",
  month: "Month",
  quarter: "Quarter",
};

export function GanttChart({
  projectId,
  tasks,
  collapsedIds,
  onToggleCollapse,
}: {
  projectId: string;
  tasks: ProgrammeTask[];
  collapsedIds: ReadonlySet<string>;
  onToggleCollapse: (id: string) => void;
}) {
  const [scale, setScale] = useState<TimelineScale>("month");
  const parentRef = useRef<HTMLDivElement>(null);
  const lookup = useLookups();
  const todayStr = today();

  const flatRows = useMemo(
    () => flattenProgrammeTree(buildProgrammeTree(tasks), collapsedIds),
    [tasks, collapsedIds],
  );
  const range = useMemo(() => timelineRange(tasks), [tasks]);
  const ticks = useMemo(() => timelineTicks(range, scale), [range, scale]);
  const trackWidth = timelineWidth(range, scale);
  const todayX = xForDate(range, scale, new Date(`${todayStr}T00:00:00.000Z`));
  const totalWidth = LEFT_WIDTH + trackWidth;

  const rowVirtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end gap-1">
        {TIMELINE_SCALES.map((s) => (
          <Button
            key={s}
            type="button"
            size="sm"
            variant={s === scale ? "default" : "outline"}
            onClick={() => setScale(s)}
          >
            {SCALE_LABEL[s]}
          </Button>
        ))}
      </div>

      <div
        ref={parentRef}
        className="relative overflow-auto rounded-xl border border-border bg-card"
        style={{ height: CHART_HEIGHT }}
      >
        <div style={{ width: totalWidth, minWidth: totalWidth }}>
          {/* Header */}
          <div
            className="sticky top-0 z-20 flex border-b border-border bg-card"
            style={{ height: ROW_HEIGHT }}
          >
            <div
              className="sticky left-0 z-30 flex shrink-0 items-center border-r border-border bg-card text-xs font-medium text-muted-foreground"
              style={{ width: LEFT_WIDTH }}
            >
              <span style={{ width: NAME_W }} className="px-2">
                Task
              </span>
              <span style={{ width: DATE_W }} className="px-1 text-right">
                Start
              </span>
              <span style={{ width: DATE_W }} className="px-1 text-right">
                Finish
              </span>
              <span style={{ width: DUR_W }} className="px-1 text-right">
                Days
              </span>
              <span style={{ width: BOQ_W }} className="px-1 text-right">
                BOQ
              </span>
            </div>
            <div className="relative shrink-0" style={{ width: trackWidth }}>
              {ticks.map((t, i) => (
                <div
                  key={i}
                  className="absolute top-0 flex h-full items-center border-l border-border/60 pl-1 text-xs text-muted-foreground"
                  style={{ left: t.x }}
                >
                  {t.label}
                </div>
              ))}
            </div>
          </div>

          {/* Body */}
          <div
            className="relative"
            style={{ height: rowVirtualizer.getTotalSize() }}
          >
            {/* Grid lines, drawn once rather than per row */}
            <div
              className="pointer-events-none absolute top-0"
              style={{ left: LEFT_WIDTH, height: rowVirtualizer.getTotalSize(), width: trackWidth }}
            >
              {ticks.map((t, i) => (
                <div
                  key={i}
                  className="absolute top-0 h-full border-l border-border/40"
                  style={{ left: t.x }}
                />
              ))}
              <div
                className="absolute top-0 z-10 h-full w-px bg-primary"
                style={{ left: todayX }}
                title={`Today — ${formatDate(todayStr)}`}
              />
            </div>

            {rowVirtualizer.getVirtualItems().map((vi) => {
              const row = flatRows[vi.index];
              const { task, depth, has_children, collapsed } = row;
              const state = programmeTaskState(task, todayStr);
              const bar = barGeometry(range, scale, task);
              return (
                <div
                  key={task.id}
                  className="absolute left-0 flex w-full border-b border-border/50"
                  style={{ top: vi.start, height: vi.size }}
                >
                  <div
                    className="sticky left-0 z-10 flex shrink-0 items-center border-r border-border bg-card text-xs"
                    style={{ width: LEFT_WIDTH }}
                  >
                    <span
                      style={{ width: NAME_W, paddingLeft: 8 + depth * 16 }}
                      className="flex min-w-0 items-center gap-1 truncate pr-2"
                      title={task.name}
                    >
                      {has_children ? (
                        <button
                          type="button"
                          onClick={() => onToggleCollapse(task.id)}
                          className="flex size-5 shrink-0 items-center justify-center rounded hover:bg-muted"
                          aria-label={collapsed ? "Expand" : "Collapse"}
                        >
                          <ChevronRight
                            className={cn("size-3.5 transition-transform", !collapsed && "rotate-90")}
                          />
                        </button>
                      ) : (
                        <span className="size-5 shrink-0" />
                      )}
                      <span className="min-w-0 truncate">{task.name}</span>
                    </span>
                    <span style={{ width: DATE_W }} className="px-1 text-right text-muted-foreground">
                      {formatDate(task.start_date)}
                    </span>
                    <span style={{ width: DATE_W }} className="px-1 text-right text-muted-foreground">
                      {formatDate(task.end_date)}
                    </span>
                    <span style={{ width: DUR_W }} className="px-1 text-right text-muted-foreground">
                      {task.duration_days}
                    </span>
                    <span style={{ width: BOQ_W }} className="px-1 text-right">
                      {task.boq_line_id ? (
                        <RecordLink
                          href={`/projects/${projectId}/budget/boq`}
                          label={lookup.boqItem(task.boq_line_id)}
                        />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </span>
                  </div>
                  <div className="relative shrink-0" style={{ width: trackWidth }}>
                    <div
                      className={cn("absolute rounded-md", BAR_CLASS[state])}
                      style={{ left: bar.left, width: bar.width, top: 8, height: ROW_HEIGHT - 16 }}
                      title={`${task.name}: ${formatDate(task.start_date)} → ${formatDate(task.end_date)}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
