"use client";

import { DataTable, HydrationGate, PageHeader, RecordLink, StatusPill, statusLabel, type Column } from "@/components/common";
import {
  useAccess,
  useActor,
  useLookups,
  useProjectId,
  useProjectRows,
  useServiceAction,
} from "@/lib/hooks";
import { updateSiteTaskStatus } from "@/lib/services/site-service";
import { formatDate, formatNumber, formatPercent } from "@/lib/format";
import { SiteTaskDialog } from "@/components/billing/site-task-dialog";
import { Button } from "@/components/ui/button";
import type { SiteTask, SiteTaskStatus, WorkOrderLine } from "@/lib/domain";

const NEXT_STATUS: Partial<
  Record<SiteTaskStatus, { to: SiteTaskStatus; label: string }>
> = {
  planned: { to: "in_progress", label: "Start" },
  in_progress: { to: "completed", label: "Complete" },
};

/** A1 — planned site tasks, grouped by work order. */
export default function SiteTasksPage() {
  const projectId = useProjectId();
  const access = useAccess("site_tasks");
  const rows = useProjectRows("site_tasks", projectId) as SiteTask[];
  const woLines = useProjectRows(
    "work_order_lines",
    projectId,
  ) as WorkOrderLine[];
  const lookup = useLookups();
  const actor = useActor();
  const { run, pending } = useServiceAction();

  const lineById = new Map(woLines.map((l) => [l.id, l]));

  async function advance(task: SiteTask) {
    const next = NEXT_STATUS[task.status];
    if (!next) return;
    await run(() => updateSiteTaskStatus(task.id, next.to, actor), {
      success: `${task.task_code} marked ${statusLabel(next.to).toLowerCase()}`,
    });
  }

  const columns: Array<Column<SiteTask>> = [
    {
      key: "code",
      header: "Task",
      cell: (r) => <span className="font-mono text-xs">{r.task_code}</span>,
    },
    { key: "title", header: "Activity", primary: true, cell: (r) => r.title },
    {
      key: "wo",
      header: "Work order",
      secondary: true,
      cell: (r) =>
        r.work_order_id ? (
          <RecordLink
            href={`/projects/${projectId}/budget/work-orders`}
            label={lookup.workOrder(r.work_order_id)}
          />
        ) : (
          "—"
        ),
    },
    {
      key: "line",
      header: "BOQ line",
      cell: (r) => (r.boq_line_id ? lookup.boqItem(r.boq_line_id) : "—"),
    },
    { key: "block", header: "Location", cell: (r) => r.location_block },
    {
      key: "contractor",
      header: "Contractor",
      cell: (r) => lookup.contractor(r.assigned_contractor_id),
    },
    {
      key: "start",
      header: "Planned start",
      cell: (r) => formatDate(r.planned_start),
    },
    {
      key: "end",
      header: "Planned end",
      cell: (r) => formatDate(r.planned_end),
    },
    {
      key: "done",
      header: "Done to date",
      align: "right",
      cell: (r) => {
        const line = r.work_order_line_id
          ? lineById.get(r.work_order_line_id)
          : undefined;
        return line
          ? `${formatNumber(line.done_qty, 2)} / ${formatNumber(line.quantity, 2)} ${line.unit}`
          : "—";
      },
    },
    {
      key: "progress",
      header: "Progress",
      align: "right",
      cell: (r) => formatPercent(r.progress_percent),
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => <StatusPill status={r.status} />,
    },
    {
      key: "action",
      header: "",
      cell: (r) => {
        if (!access.canEdit) return null;
        const next = NEXT_STATUS[r.status];
        return (
          <span className="flex items-center gap-1">
            {next ? (
              <Button
                size="xs"
                variant="outline"
                onClick={() => advance(r)}
                disabled={pending}
              >
                {next.label}
              </Button>
            ) : null}
            <SiteTaskDialog projectId={projectId} task={r} />
          </span>
        );
      },
    },
  ];

  const byWorkOrder = [...rows].sort(
    (a, b) =>
      (a.work_order_id ?? "").localeCompare(b.work_order_id ?? "") ||
      a.planned_start.localeCompare(b.planned_start),
  );

  return (
    <div>
      <PageHeader
        resource="site_tasks"
        title={access.meta.label}
        description="Upcoming work-order activities turned into planned tasks on the ground."
        team={access.ownerTeam}
        outsideNav={access.outsideNav}
        stepCodes={access.meta.step_codes}
        owned={access.owned}
        actions={
          access.canCreate ? <SiteTaskDialog projectId={projectId} /> : null
        }
      />
      <HydrationGate>
        <DataTable
          columns={columns}
          rows={byWorkOrder}
          rowKey={(r) => r.id}
          showValues={access.showValues}
          emptyMessage="No site tasks planned yet."
          caption={`${rows.filter((r) => r.status === "in_progress").length} in progress, ${rows.filter((r) => r.status === "completed").length} completed.`}
        />
      </HydrationGate>
    </div>
  );
}
