import {
  addMonths,
  addQuarters,
  addWeeks,
  differenceInCalendarDays,
  format,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
} from "date-fns";
import type { ProgrammeTask } from "@/lib/domain";

/**
 * Pure date-to-pixel geometry for the Gantt timeline. No React, no DOM — the
 * component only turns these numbers into `style` props.
 */

export const TIMELINE_SCALES = ["week", "month", "quarter"] as const;
export type TimelineScale = (typeof TIMELINE_SCALES)[number];

export type TimelineRange = { start: Date; end: Date };

const PADDING_DAYS = 7;

/** The span to draw, padded a week either side of the earliest/latest task. */
export function timelineRange(tasks: ProgrammeTask[]): TimelineRange {
  if (tasks.length === 0) {
    const start = new Date();
    return { start, end: addMonths(start, 3) };
  }
  const starts = tasks.map((t) => new Date(t.start_date).getTime());
  const ends = tasks.map((t) => new Date(t.end_date).getTime());
  const start = new Date(Math.min(...starts));
  const end = new Date(Math.max(...ends));
  return {
    start: addDaysDate(start, -PADDING_DAYS),
    end: addDaysDate(end, PADDING_DAYS),
  };
}

function addDaysDate(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

/** Pixels-per-day at each scale — chosen so a 2-year programme stays scrollable, not absurd. */
export function pxPerDay(scale: TimelineScale): number {
  switch (scale) {
    case "week":
      return 16;
    case "month":
      return 6;
    case "quarter":
      return 2.4;
  }
}

export function timelineWidth(range: TimelineRange, scale: TimelineScale): number {
  const days = Math.max(1, differenceInCalendarDays(range.end, range.start));
  return Math.round(days * pxPerDay(scale));
}

/** x-offset in pixels of a calendar date from the start of the range. */
export function xForDate(range: TimelineRange, scale: TimelineScale, date: Date): number {
  return differenceInCalendarDays(date, range.start) * pxPerDay(scale);
}

export type TimelineTick = { x: number; label: string };

/** Column boundaries + labels for the sticky timeline header, at the given scale. */
export function timelineTicks(range: TimelineRange, scale: TimelineScale): TimelineTick[] {
  const ticks: TimelineTick[] = [];
  const step = scale === "week" ? addWeeks : scale === "month" ? addMonths : addQuarters;
  const stepArg = 1;
  let cursor =
    scale === "week"
      ? startOfWeek(range.start, { weekStartsOn: 1 })
      : scale === "month"
        ? startOfMonth(range.start)
        : startOfQuarter(range.start);

  const labelFmt = scale === "week" ? "d MMM" : scale === "month" ? "MMM yyyy" : "QQQ yyyy";

  while (cursor <= range.end) {
    ticks.push({ x: xForDate(range, scale, cursor), label: format(cursor, labelFmt) });
    cursor = step(cursor, stepArg);
  }
  return ticks;
}

/** A task's bar geometry on the timeline, in pixels. */
export function barGeometry(
  range: TimelineRange,
  scale: TimelineScale,
  task: Pick<ProgrammeTask, "start_date" | "end_date">,
): { left: number; width: number } {
  const start = new Date(task.start_date);
  const end = new Date(task.end_date);
  const left = xForDate(range, scale, start);
  const width = Math.max(pxPerDay(scale), (differenceInCalendarDays(end, start) + 1) * pxPerDay(scale));
  return { left, width };
}
