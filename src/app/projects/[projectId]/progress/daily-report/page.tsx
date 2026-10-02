"use client";

import { useMemo, useState } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";
import {
  PageHeader,
  DataTable,
  HydrationGate,
  SectionHeading,
  type Column,
} from "@/components/common";
import {
  useAccess,
  useLookups,
  useProjectId,
  useProjectRows,
} from "@/lib/hooks";
import { formatDate, formatNumber } from "@/lib/format";
import { DprFormSheet } from "@/components/billing/dpr-form-sheet";
import { DprDetailSheet } from "@/components/billing/dpr-detail-sheet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { today as todayDate, todayUtc } from "@/lib/clock";
import type { Dpr, DprLabourEntry, DprProgressEntry } from "@/lib/domain";
import { cn } from "cn";

/** One calendar row: either a filed report or a date that was missed. */
type DayRow = {
  date: string;
  dpr: Dpr | null;
  labour: number;
  lines: number;
};

function lastDays(count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const d = todayUtc();
    d.setUTCDate(d.getUTCDate() - i);
    return d.toISOString().slice(0, 10);
  });
}

/** A3 — the reporting calendar, with missing days called out. */
export default function DprPage() {
  const projectId = useProjectId();
  const access = useAccess("dpr");
  const dprs = useProjectRows("dprs", projectId) as Dpr[];
  const progress = useProjectRows(
    "dpr_progress_entries",
    projectId,
  ) as DprProgressEntry[];
  const labour = useProjectRows(
    "dpr_labour_entries",
    projectId,
  ) as DprLabourEntry[];
  const lookup = useLookups();
  const [selected, setSelected] = useState<Dpr | null>(null);

  const today = todayDate();

  const days: DayRow[] = useMemo(() => {
    const byDate = new Map(dprs.map((d) => [d.report_date, d]));
    return lastDays(14).map((date) => {
      const dpr = byDate.get(date) ?? null;
      return {
        date,
        dpr,
        labour: dpr ? dpr.total_labour_count : 0,
        lines: dpr ? progress.filter((p) => p.dpr_id === dpr.id).length : 0,
      };
    });
  }, [dprs, progress]);

  const missing = days.filter((d) => !d.dpr && d.date < today);

  const columns: Array<Column<DayRow>> = [
    {
      key: "date",
      header: "Date",
      primary: true,
      cell: (r) => (
        <span className="flex items-center gap-2">
          {r.dpr ? (
            <CircleCheck className="size-3.5 text-success" />
          ) : (
            <CircleAlert
              className={cn(
                "size-3.5",
                r.date < today ? "text-warning" : "text-muted-foreground/50",
              )}
            />
          )}
          {formatDate(r.date)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Report",
      secondary: true,
      cell: (r) =>
        r.dpr ? (
          <span className="text-success">Filed</span>
        ) : r.date < today ? (
          <span className="text-warning">Not filed</span>
        ) : (
          // Only today can be unfiled and not yet late.
          <span className="text-muted-foreground">Due today</span>
        ),
    },
    { key: "weather", header: "Weather", cell: (r) => r.dpr?.weather ?? "—" },
    {
      key: "lines",
      header: "Lines reported",
      align: "right",
      cell: (r) => (r.dpr ? r.lines : "—"),
    },
    {
      key: "labour",
      header: "Labour",
      align: "right",
      cell: (r) => (r.dpr ? formatNumber(r.labour, 0) : "—"),
    },
    {
      key: "by",
      header: "Filed by",
      cell: (r) => (r.dpr ? lookup.user(r.dpr.prepared_by_user_id) : "—"),
    },
    {
      key: "open",
      header: "",
      cell: (r) =>
        r.dpr ? (
          <Button variant="ghost" size="xs" onClick={() => setSelected(r.dpr)}>
            Open
          </Button>
        ) : null,
    },
  ];

  return (
    <div>
      <PageHeader
        resource="dpr"
        title={access.meta.label}
        description="One report per day: quantity done against each work-order line, and the labour on site."
        team={access.ownerTeam}
        outsideNav={access.outsideNav}
        stepCodes={access.meta.step_codes}
        owned={access.owned}
        actions={
          access.canCreate ? (
            <DprFormSheet projectId={projectId} defaultDate={today} />
          ) : null
        }
      />
      <HydrationGate>
        <div className="space-y-6">
          {missing.length > 0 ? (
            <Card className="flex flex-row items-start gap-3 bg-warning-soft px-5 py-4 ring-warning/30">
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
              <p className="text-sm leading-relaxed text-warning">
                {missing.length} day{missing.length > 1 ? "s have" : " has"} no
                report:{" "}
                {missing
                  .slice(0, 4)
                  .map((d) => formatDate(d.date))
                  .join(", ")}
                {missing.length > 4 ? ` and ${missing.length - 4} more` : ""}.
                Work done on those days is not counted anywhere until a report
                is filed.
              </p>
            </Card>
          ) : null}

          <section>
            <SectionHeading
              title="Last 14 days"
              description={`${dprs.length} reports on file, ${progress.length} progress entries, ${labour.length} labour entries.`}
            />
            <DataTable
              columns={columns}
              rows={days}
              rowKey={(r) => r.date}
              showValues={access.showValues}
              emptyMessage="No reports yet."
            />
          </section>
        </div>

        <DprDetailSheet
          dpr={selected}
          open={selected !== null}
          onOpenChange={(v) => !v && setSelected(null)}
          projectId={projectId}
        />
      </HydrationGate>
    </div>
  );
}
