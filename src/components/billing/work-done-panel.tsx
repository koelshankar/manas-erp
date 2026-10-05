"use client";

import {
  DataTable,
  RecordLink,
  SectionHeading,
  type Column,
} from "@/components/common";
import { useAccess, useLookups, useRepositoryQuery } from "@/lib/hooks";
import { workDoneVsBalance, type WorkDoneRow } from "@/lib/services/site-service";
import { formatInr, formatNumber, formatPercent } from "@/lib/format";
import { cn } from "cn";

/**
 * A4, read-only, inside Billing — the QS measures against what the site has
 * reported done, so the figure has to be visible here too. This is a panel
 * over the same `workDoneVsBalance` query the Progress tab renders, not a
 * second page: there is exactly one place the roll-up is computed.
 */
export function WorkDonePanel({ projectId }: { projectId: string }) {
  const access = useAccess("work_done");
  const lookup = useLookups();
  const { data } = useRepositoryQuery<WorkDoneRow[]>(
    async () => (projectId ? workDoneVsBalance(projectId) : []),
    [projectId],
  );
  const rows = data ?? [];
  if (rows.length === 0) return null;

  const columns: Array<Column<WorkDoneRow>> = [
    {
      key: "wo",
      header: "Work order",
      cell: (r) => (
        <RecordLink
          href={`/projects/${projectId}/contracts/work-orders`}
          label={lookup.workOrder(r.work_order_id)}
        />
      ),
    },
    { key: "boq", header: "BOQ", cell: (r) => lookup.boqItem(r.boq_line_id) },
    { key: "desc", header: "Description", primary: true, cell: (r) => r.description },
    {
      key: "done",
      header: "Done to date",
      align: "right",
      cell: (r) => `${formatNumber(r.done_qty, 2)} ${r.unit}`,
    },
    {
      key: "measured",
      header: "Measured to date",
      align: "right",
      cell: (r) => formatNumber(r.measured_qty, 2),
    },
    {
      key: "balance",
      header: "Balance",
      align: "right",
      secondary: true,
      cell: (r) => (
        <span className={cn(r.balance_qty < 0 && "text-destructive")}>
          {formatNumber(r.balance_qty, 2)}
        </span>
      ),
    },
    {
      key: "percent",
      header: "% done",
      align: "right",
      cell: (r) => formatPercent(r.percent_done, 1),
    },
    {
      key: "rate",
      header: "Agreed rate",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.agreed_rate),
    },
    {
      key: "value",
      header: "Done value",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.done_qty * r.agreed_rate),
    },
    {
      key: "ready",
      header: "Ready to measure",
      cell: (r) =>
        r.ready_to_measure ? (
          <span className="num rounded-full bg-info-soft px-2 py-0.5 text-xs font-medium text-info ring-1 ring-info/30">
            {formatNumber(r.ready_qty, 2)} {r.unit}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];

  const readyCount = rows.filter((r) => r.ready_to_measure).length;

  return (
    <section>
      <SectionHeading
        title="Work done vs balance"
        description="What the daily reports add up to, against the work order — owned by Site Execution, shown here against what has been measured."
      />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.work_order_line_id}
        showValues={access.showValues}
        emptyMessage="No work-order lines on this project yet."
        caption={`${readyCount} line${readyCount === 1 ? "" : "s"} flagged ready for measurement.`}
      />
    </section>
  );
}
