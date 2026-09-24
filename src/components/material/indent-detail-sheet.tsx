"use client";

import { useMemo } from "react";
import { Check, Clock, X } from "lucide-react";

import { DataTable, DetailRow, RecordTrail, StatusPill, statusLabel, type Column } from "@/components/common";
import { useAllRows, useLookups, useProjectRows } from "@/lib/hooks";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import type { Approval, Indent, IndentLine } from "@/lib/domain";
import { cn } from "cn";
import {
  AppDialog,
  AppDialogBody,
  AppDialogDescription,
  AppDialogHeader,
  AppDialogTitle,
} from "@/components/ui-app";

/**
 * Everything that happened to one indent: the lines with their decisions, the
 * A2 approval, and the comparative / PO / GRN it turned into.
 */
export function IndentDetailSheet({
  indent,
  open,
  onOpenChange,
  projectId,
}: {
  indent: Indent | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
}) {
  const allLines = useProjectRows("indent_lines", projectId) as IndentLine[];
  const allIndents = useProjectRows("indents", projectId) as Indent[];
  const approvals = useAllRows("approvals") as Approval[];
  const comparatives = useProjectRows("comparatives", projectId);
  const purchaseOrders = useProjectRows("purchase_orders", projectId);
  const grns = useProjectRows("grns", projectId);
  const lookup = useLookups();

  const lines = useMemo(
    () => (indent ? allLines.filter((l) => l.indent_id === indent.id) : []),
    [allLines, indent],
  );

  // The live row, so a decision taken here updates this sheet immediately.
  const live = indent
    ? (allIndents.find((i) => i.id === indent.id) ?? indent)
    : null;
  if (!live) return null;

  const gate = approvals.find(
    (a) => a.entity_type === "indent" && a.entity_id === live.id,
  );
  const linkedComparatives = comparatives.filter((c) =>
    c.indent_ids.includes(live.id),
  );
  const linkedPos = purchaseOrders.filter((p) =>
    p.indent_ids.includes(live.id),
  );
  const linkedGrns = grns.filter((g) =>
    linkedPos.some((p) => p.id === g.purchase_order_id),
  );

  const columns: Array<Column<IndentLine>> = [
    { key: "boq", header: "BOQ", cell: (l) => lookup.boqItem(l.boq_line_id) },
    {
      key: "material",
      header: "Material",
      primary: true,
      cell: (l) => lookup.material(l.material_id),
    },
    {
      key: "requested",
      header: "Requested",
      align: "right",
      cell: (l) => `${formatNumber(l.requested_qty, 2)} ${l.unit}`,
    },
    {
      key: "approved",
      header: "Approved",
      align: "right",
      cell: (l) =>
        l.approved_qty === null ? (
          <span className="text-muted-foreground">Pending</span>
        ) : l.approved_qty === 0 ? (
          <span className="text-destructive">Rejected</span>
        ) : (
          `${formatNumber(l.approved_qty, 2)} ${l.unit}`
        ),
    },
    {
      key: "ordered",
      header: "Ordered",
      align: "right",
      cell: (l) => formatNumber(l.ordered_qty, 2),
    },
    {
      key: "received",
      header: "Received",
      align: "right",
      cell: (l) => formatNumber(l.received_qty, 2),
    },
    {
      key: "needed",
      header: "Needed by",
      cell: (l) => formatDate(l.required_by),
    },
    { key: "reason", header: "Reason", cell: (l) => l.rejection_reason || "—" },
  ];

  return (
    <AppDialog open={open} onOpenChange={onOpenChange} size="lg">
      <AppDialogHeader>
        <AppDialogTitle className="font-mono">
          {live.indent_number}
        </AppDialogTitle>
        <AppDialogDescription>
          {live.remarks || "Material indent"}
        </AppDialogDescription>
      </AppDialogHeader>

      <AppDialogBody className="space-y-6">
        <RecordTrail entityType="indent" entityId={live.id} />

        <dl className="divide-y divide-border/60">
          <DetailRow label="Status">
            <StatusPill status={live.status} />
          </DetailRow>
          <DetailRow label="Raised by">
            {lookup.user(live.raised_by_user_id)}
          </DetailRow>
          <DetailRow label="Raised on">
            {formatDate(live.raised_date)}
          </DetailRow>
          <DetailRow label="Required by">
            {formatDate(live.required_by_date)}
          </DetailRow>
          <DetailRow label="Work order">
            {live.work_order_id ? lookup.workOrder(live.work_order_id) : "—"}
          </DetailRow>
        </dl>

        <section>
          <h3 className="mb-3 text-sm font-semibold">Lines</h3>
          <DataTable columns={columns} rows={lines} rowKey={(l) => l.id} />
        </section>

        <section>
          <h3 className="mb-3 text-sm font-semibold">Status timeline</h3>
          <ol className="space-y-3">
            <TimelineStep
              state="done"
              title="Indent raised"
              who={lookup.user(live.raised_by_user_id)}
              when={formatDate(live.raised_date)}
              code="A2"
            />
            <TimelineStep
              state={
                !gate || gate.status === "pending"
                  ? "waiting"
                  : gate.status === "approved"
                    ? "done"
                    : "failed"
              }
              title={
                !gate || gate.status === "pending"
                  ? "Awaiting Project Head approval"
                  : gate.status === "approved"
                    ? `Approved — ${statusLabel(live.status)}`
                    : "Rejected by the Project Head"
              }
              who={
                gate?.actor_user_id
                  ? lookup.user(gate.actor_user_id)
                  : "Project Head"
              }
              when={gate?.acted_at ? formatDateTime(gate.acted_at) : ""}
              note={gate?.comment}
              code="A2"
            />
            <TimelineStep
              state={linkedComparatives.length > 0 ? "done" : "waiting"}
              title={
                linkedComparatives.length > 0
                  ? `On comparative ${linkedComparatives.map((c) => c.comparative_number).join(", ")}`
                  : "Not yet quoted"
              }
              code="B1"
            />
            <TimelineStep
              state={linkedPos.length > 0 ? "done" : "waiting"}
              title={
                linkedPos.length > 0
                  ? `PO raised — ${linkedPos.map((p) => p.po_number).join(", ")}`
                  : "No purchase order yet"
              }
              code="B3–B4"
            />
            <TimelineStep
              state={linkedGrns.length > 0 ? "done" : "waiting"}
              title={
                linkedGrns.length > 0
                  ? `Received on ${linkedGrns.map((g) => g.grn_number).join(", ")}`
                  : "Nothing received yet"
              }
              code="B5–B6"
            />
          </ol>
        </section>
      </AppDialogBody>
    </AppDialog>
  );
}

function TimelineStep({
  state,
  title,
  who,
  when,
  note,
  code,
}: {
  state: "done" | "waiting" | "failed";
  title: string;
  who?: string;
  when?: string;
  note?: string;
  code: string;
}) {
  const Icon = state === "done" ? Check : state === "failed" ? X : Clock;
  return (
    <li className="flex gap-3">
      <span
        className={cn(
          "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ring-1",
          state === "done" && "bg-success-soft text-success ring-success/30",
          state === "waiting" && "bg-muted text-muted-foreground ring-border",
          state === "failed" &&
            "bg-danger-soft text-destructive ring-destructive/30",
        )}
      >
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          <span className="mr-2 font-mono text-xs text-muted-foreground">
            {code}
          </span>
          {title}
        </p>
        {who || when ? (
          <p className="text-xs text-muted-foreground">
            {[who, when].filter(Boolean).join(" · ")}
          </p>
        ) : null}
        {note ? (
          <p className="mt-0.5 text-xs text-muted-foreground italic">
            “{note}”
          </p>
        ) : null}
      </div>
    </li>
  );
}
