"use client";

import Link from "next/link";
import { useMemo } from "react";
import { addMonths, differenceInCalendarDays, endOfMonth, format, startOfMonth } from "date-fns";
import { ArrowRight, CalendarRange } from "lucide-react";
import { cn } from "cn";
import { Card } from "@/components/ui/card";
import { EmptyState, StatusChip } from "@/components/common";
import { formatDate } from "@/lib/format";
import { useRepositoryQuery } from "@/lib/hooks/use-repository";
import { getScheduleSummary, scopeFor, type ScheduleRow } from "@/lib/services/queries";
import { useSession } from "@/lib/session";
import type { ProgrammeTaskState } from "@/lib/domain";

/** Months shown before and after the current one. The current month is always in view. */
const MONTHS_BEFORE = 2;
const MONTHS_AFTER = 9;

/** Status colour is the only colour a bar may carry — never a team colour. */
const BAR_CLASS: Record<ProgrammeTaskState, string> = {
  not_started: "bg-muted-foreground/35",
  in_progress: "bg-info",
  completed: "bg-success",
};

/** The unelapsed remainder of a bar: the same hue, paler. */
const TRACK_CLASS: Record<ProgrammeTaskState, string> = {
  not_started: "bg-muted-foreground/20",
  in_progress: "bg-info/30",
  completed: "bg-success/30",
};

const parse = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);

/**
 * The programme on the project Overview: top-level rows only, collapsed, with a
 * today marker and the current month inside a twelve-month window.
 *
 * It is a window, not the whole span — a two-year programme squeezed into the
 * width of a page is a row of slivers. Bars that run off either edge carry an
 * arrow. Click anywhere and the full programme opens under Progress. Below `md`
 * a timeline has no meaning, so the same rows come as a list.
 */
export function ScheduleSummary({ projectId }: { projectId: string }) {
  const { user } = useSession();
  const { data, loading } = useRepositoryQuery(
    async () => (user ? getScheduleSummary(scopeFor(user, projectId)) : null),
    [user?.id, projectId],
  );

  const href = `/projects/${projectId}/progress/programme`;
  const rows = data?.rows ?? [];

  if (!data && loading) {
    return <Card className="h-40 animate-pulse bg-muted/50" aria-hidden />;
  }
  if (!data || rows.length === 0) {
    return (
      <EmptyState
        icon={CalendarRange}
        message="No programme has been loaded for this project. Import one under Progress and its towers appear here."
        action={
          <Link href={href} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
            Open the programme
          </Link>
        }
      />
    );
  }

  return (
    <Card className="gap-0 py-0">
      {/* Timeline — md and up. */}
      <Link
        href={href}
        aria-label="Open the full programme"
        className="group hidden rounded-xl p-4 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none md:block"
      >
        <Timeline rows={rows} today={data.today} />
        <Footer count={data.task_count} />
      </Link>

      {/* List fallback — a phone. */}
      <div className="md:hidden">
        <ul className="divide-y divide-border/60">
          {rows.map((row) => (
            <li key={row.id}>
              <Link href={href} className="flex min-h-11 items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{row.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatDate(row.start_date)} – {formatDate(row.end_date)}
                  </p>
                </div>
                <StatusChip status={row.state} />
              </Link>
            </li>
          ))}
        </ul>
        <div className="border-t border-border/60 px-4 py-3">
          <Footer count={data.task_count} />
        </div>
      </div>
    </Card>
  );
}

function Footer({ count }: { count: number }) {
  return (
    <p className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>{count} activities in the programme</span>
      <span className="inline-flex items-center gap-1 font-medium text-foreground group-hover:underline">
        Open full programme <ArrowRight className="size-3" />
      </span>
    </p>
  );
}

function Timeline({ rows, today }: { rows: ScheduleRow[]; today: string }) {
  const { start, end, months, days } = useMemo(() => {
    const t = parse(today);
    const start = startOfMonth(addMonths(t, -MONTHS_BEFORE));
    const end = endOfMonth(addMonths(t, MONTHS_AFTER));
    const months = Array.from({ length: MONTHS_BEFORE + MONTHS_AFTER + 1 }, (_, i) =>
      addMonths(start, i),
    );
    return { start, end, months, days: differenceInCalendarDays(end, start) + 1 };
  }, [today]);

  const pct = (d: Date) => (differenceInCalendarDays(d, start) / days) * 100;
  const todayPct = pct(parse(today));
  const currentMonth = format(parse(today), "yyyy-MM");

  return (
    <div className="grid grid-cols-[12.5rem_minmax(0,1fr)] gap-x-3">
      {/* Today pill, above the months so it never sits on a label. */}
      <div />
      <div className="relative h-6">
        <span
          style={{ left: `${todayPct}%` }}
          className="absolute top-0 z-10 -translate-x-1/2 rounded-full bg-primary px-2 text-xs leading-5 font-semibold text-primary-foreground"
        >
          Today
        </span>
      </div>
      {/* Month header */}
      <div />
      <div className="relative flex h-7 border-b border-border text-xs text-muted-foreground">
        {months.map((m) => {
          const left = pct(m);
          const width = pct(endOfMonth(m)) - left + 100 / days;
          const isCurrent = format(m, "yyyy-MM") === currentMonth;
          return (
            <span
              key={m.toISOString()}
              style={{ left: `${left}%`, width: `${width}%` }}
              className={cn(
                "absolute top-0 truncate border-l border-border/60 pl-1.5 leading-7",
                isCurrent && "font-semibold text-foreground",
              )}
            >
              {format(m, "MMM")}
              {format(m, "M") === "1" || m === months[0] ? ` ${format(m, "yy")}` : ""}
            </span>
          );
        })}
        <span
          style={{ left: `${todayPct}%` }}
          className="absolute inset-y-0 w-0.5 bg-primary/70"
          aria-hidden
        />
      </div>

      {rows.map((row) => {
        const s = parse(row.start_date);
        const e = parse(row.end_date);
        const clippedLeft = s < start;
        const clippedRight = e > end;
        const left = Math.max(0, pct(s));
        const right = Math.min(100, pct(e) + 100 / days);
        const visible = right > left;
        return (
          <div key={row.id} className="contents">
            <div className="flex h-11 min-w-0 flex-col justify-center">
              <span className="truncate text-sm font-medium">{row.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {formatDate(row.start_date)} – {formatDate(row.end_date)}
              </span>
            </div>
            <div className="relative h-11 border-b border-border/40">
              <span
                style={{ left: `${todayPct}%` }}
                className="absolute inset-y-0 w-0.5 bg-primary/70"
                aria-hidden
              />
              {visible ? (
                <span
                  role="img"
                  aria-label={`${row.name}, ${formatDate(row.start_date)} to ${formatDate(row.end_date)}, ${
                    row.state === "in_progress" ? "in progress" : row.state === "completed" ? "completed" : "not started"
                  }`}
                  style={{ left: `${left}%`, width: `${right - left}%` }}
                  className={cn(
                    "absolute top-3 flex h-5 items-center justify-between overflow-hidden px-1 text-xs text-background",
                    TRACK_CLASS[row.state],
                    clippedLeft ? "rounded-l-none" : "rounded-l-md",
                    clippedRight ? "rounded-r-none" : "rounded-r-md",
                  )}
                >
                  {/* How far today has got along the bar. */}
                  <span
                    aria-hidden
                    style={{ width: `${Math.min(100, Math.max(0, ((todayPct - left) / (right - left)) * 100))}%` }}
                    className={cn("absolute inset-y-0 left-0", BAR_CLASS[row.state])}
                  />
                  <span className="relative">{clippedLeft ? "‹" : ""}</span>
                  <span className="relative">{clippedRight ? "›" : ""}</span>
                </span>
              ) : null}
            </div>
          </div>
        );
      })}

    </div>
  );
}
