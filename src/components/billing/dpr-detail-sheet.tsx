"use client";

import {
  Attachments,
  DataTable,
  DetailRow,
  type Column,
} from "@/components/common";
import { useAccess, useLookups, useProjectRows } from "@/lib/hooks";
import { formatDate, formatNumber } from "@/lib/format";
import type { Dpr, DprLabourEntry, DprProgressEntry } from "@/lib/domain";
import {
  AppDialog,
  AppDialogBody,
  AppDialogDescription,
  AppDialogHeader,
  AppDialogTitle,
} from "@/components/ui-app";
import { labourTradeLabel } from "@/config/labels";

/** A3 — what one day's report recorded. */
export function DprDetailSheet({
  dpr,
  open,
  onOpenChange,
  projectId,
}: {
  dpr: Dpr | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
}) {
  const allProgress = useProjectRows(
    "dpr_progress_entries",
    projectId,
  ) as DprProgressEntry[];
  const allLabour = useProjectRows(
    "dpr_labour_entries",
    projectId,
  ) as DprLabourEntry[];
  const woLines = useProjectRows("work_order_lines", projectId);
  const lookup = useLookups();
  const access = useAccess("dpr");

  if (!dpr) return null;

  const progress = allProgress.filter((p) => p.dpr_id === dpr.id);
  const labour = allLabour.filter((l) => l.dpr_id === dpr.id);
  const lineById = new Map(woLines.map((l) => [l.id, l]));

  const progressColumns: Array<Column<DprProgressEntry>> = [
    {
      key: "boq",
      header: "BOQ",
      cell: (p) =>
        lookup.boqItem(lineById.get(p.work_order_line_id)?.boq_line_id ?? null),
    },
    {
      key: "line",
      header: "Work-order line",
      primary: true,
      cell: (p) => lineById.get(p.work_order_line_id)?.description ?? "—",
    },
    {
      key: "wo",
      header: "Work order",
      secondary: true,
      cell: (p) =>
        lookup.workOrder(
          lineById.get(p.work_order_line_id)?.work_order_id ?? null,
        ),
    },
    {
      key: "qty",
      header: "Done today",
      align: "right",
      cell: (p) =>
        `${formatNumber(p.qty_done_today, 2)} ${lineById.get(p.work_order_line_id)?.unit ?? ""}`,
    },
    { key: "remarks", header: "Remarks", cell: (p) => p.remarks || "—" },
  ];

  const labourColumns: Array<Column<DprLabourEntry>> = [
    {
      key: "contractor",
      header: "Contractor",
      primary: true,
      cell: (l) => lookup.contractor(l.contractor_id),
    },
    {
      key: "trade",
      header: "Trade",
      secondary: true,
      cell: (l) => labourTradeLabel(l.trade),
    },
    {
      key: "count",
      header: "Head count",
      align: "right",
      cell: (l) => formatNumber(l.count, 0),
    },
  ];

  return (
    <AppDialog open={open} onOpenChange={onOpenChange} size="lg">
      <AppDialogHeader>
        <AppDialogTitle>{formatDate(dpr.report_date)}</AppDialogTitle>
        <AppDialogDescription>
          Filed by {lookup.user(dpr.prepared_by_user_id)} · {dpr.weather}
        </AppDialogDescription>
      </AppDialogHeader>

      <AppDialogBody className="space-y-6">
        <Attachments
          entityType="dpr"
          entityId={dpr.id}
          projectId={dpr.project_id}
          canEdit={access.canEdit}
        />

        <dl className="divide-y divide-border/60">
          <DetailRow label="Weather">{dpr.weather || "—"}</DetailRow>
          <DetailRow label="Total labour">
            {formatNumber(dpr.total_labour_count, 0)}
          </DetailRow>
          <DetailRow label="Lines reported">
            {dpr.total_progress_entries}
          </DetailRow>
          {dpr.remarks ? (
            <DetailRow label="Remarks">{dpr.remarks}</DetailRow>
          ) : null}
        </dl>

        <section>
          <h3 className="mb-3 text-sm font-semibold">Progress</h3>
          <DataTable
            columns={progressColumns}
            rows={progress}
            rowKey={(p) => p.id}
            emptyMessage="No progress was reported on this day."
          />
        </section>

        <section>
          <h3 className="mb-3 text-sm font-semibold">Labour</h3>
          <DataTable
            columns={labourColumns}
            rows={labour}
            rowKey={(l) => l.id}
            emptyMessage="No labour was recorded on this day."
            caption={`${formatNumber(dpr.total_labour_count, 0)} on site.`}
          />
        </section>
      </AppDialogBody>
    </AppDialog>
  );
}
