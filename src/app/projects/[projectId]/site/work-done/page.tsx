"use client";

import { useState } from "react";
import { Ruler } from "lucide-react";
import {
  PageHeader,
  DataTable,
  HydrationGate,
  Field,
  RecordLink,
  type Column,
} from "@/components/common";
import {
  useAccess,
  useActor,
  useLookups,
  useProjectId,
  useRepositoryQuery,
  useServiceAction,
} from "@/lib/hooks";
import {
  markReadyToMeasure,
  workDoneVsBalance,
  type WorkDoneRow,
} from "@/lib/services/site-service";
import { formatInr, formatNumber, formatPercent } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "cn";
import {
  AppDialog,
  AppDialogBody,
  AppDialogDescription,
  AppDialogFooter,
  AppDialogHeader,
  AppDialogTitle,
} from "@/components/ui-app";

/**
 * A4 — work-order quantity against what has been done, measured and billed.
 *
 * The Site Engineer is denied `view` on rates, so the rate and value columns
 * are dropped entirely for that role rather than blanked.
 */
export default function WorkDonePage() {
  const projectId = useProjectId();
  const access = useAccess("work_done");
  const lookup = useLookups();
  const [readyFor, setReadyFor] = useState<WorkDoneRow | null>(null);

  const { data } = useRepositoryQuery<WorkDoneRow[]>(
    async () => (projectId ? workDoneVsBalance(projectId) : []),
    [projectId],
  );
  const rows = data ?? [];

  const columns: Array<Column<WorkDoneRow>> = [
    {
      key: "wo",
      header: "Work order",
      cell: (r) => (
        <RecordLink
          href={`/projects/${projectId}/budget/work-orders`}
          label={lookup.workOrder(r.work_order_id)}
        />
      ),
    },
    { key: "boq", header: "BOQ", cell: (r) => lookup.boqItem(r.boq_line_id) },
    {
      key: "desc",
      header: "Description",
      primary: true,
      cell: (r) => r.description,
    },
    {
      key: "wo_qty",
      header: "WO qty",
      align: "right",
      secondary: true,
      cell: (r) => `${formatNumber(r.wo_qty, 2)} ${r.unit}`,
    },
    {
      key: "done",
      header: "Done to date",
      align: "right",
      cell: (r) => formatNumber(r.done_qty, 2),
    },
    {
      key: "measured",
      header: "Measured to date",
      align: "right",
      cell: (r) => formatNumber(r.measured_qty, 2),
    },
    {
      key: "billed",
      header: "Billed to date",
      align: "right",
      cell: (r) => formatNumber(r.billed_qty, 2),
    },
    {
      key: "balance",
      header: "Balance",
      align: "right",
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
    {
      key: "action",
      header: "",
      cell: (r) =>
        access.canEdit && r.awaiting_measurement_qty > 0 ? (
          <Button variant="outline" size="xs" onClick={() => setReadyFor(r)}>
            <Ruler className="size-3" />{" "}
            {r.ready_to_measure ? "Update" : "Mark ready"}
          </Button>
        ) : null,
    },
  ];

  const readyCount = rows.filter((r) => r.ready_to_measure).length;
  const awaiting = rows.filter((r) => r.awaiting_measurement_qty > 0).length;

  return (
    <div>
      <PageHeader
        resource="work_done"
        title={access.meta.label}
        description="What the daily reports add up to, against the work order — and what is ready for the QS to measure."
        team={access.ownerTeam}
        outsideNav={access.outsideNav}
        stepCodes={access.meta.step_codes}
        owned={access.owned}
      />
      <HydrationGate>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.work_order_line_id}
          showValues={access.showValues}
          emptyMessage="No work-order lines on this project yet."
          caption={
            access.showValues
              ? `${readyCount} lines flagged ready, ${awaiting} with work done but not measured.`
              : `${readyCount} lines flagged ready. Rates and values are not shown for your role.`
          }
        />
        <ReadyDialog row={readyFor} onClose={() => setReadyFor(null)} />
      </HydrationGate>
    </div>
  );
}

function ReadyDialog({
  row,
  onClose,
}: {
  row: WorkDoneRow | null;
  onClose: () => void;
}) {
  const actor = useActor();
  const { run, pending } = useServiceAction();
  const [value, setValue] = useState("");

  const max = row?.awaiting_measurement_qty ?? 0;
  const over = value !== "" && Number(value) > max;

  async function submit() {
    if (!row) return;
    await run(
      () =>
        markReadyToMeasure(
          {
            work_order_line_id: row.work_order_line_id,
            ready_qty: Number(value),
          },
          actor,
        ),
      {
        success: "Flagged ready for the QS to measure",
        onDone: () => {
          setValue("");
          onClose();
        },
      },
    );
  }

  return (
    <AppDialog
      open={row !== null}
      size="md"
      dirty={value !== ""}
      onOpenChange={(v) => {
        if (!v) {
          setValue("");
          onClose();
        }
      }}
    >
      <AppDialogHeader>
        <AppDialogTitle>Mark ready to measure</AppDialogTitle>
        <AppDialogDescription>
          A4 → C1. The quantity you claim here is what the QS sees when
          preparing the joint measurement.
        </AppDialogDescription>
      </AppDialogHeader>

      <AppDialogBody>
        {row ? (
          <div className="space-y-3">
            <p className="text-sm">{row.description}</p>
            <dl className="grid grid-cols-3 gap-4 rounded-lg bg-muted/50 px-3 py-2.5">
              <Stat label="Done to date" value={row.done_qty} unit={row.unit} />
              <Stat label="Measured" value={row.measured_qty} unit={row.unit} />
              <Stat label="Available" value={max} unit={row.unit} />
            </dl>
            <Field
              label={`Quantity ready (${row.unit})`}
              required
              error={
                over
                  ? `Only ${formatNumber(max, 2)} is done but not yet measured`
                  : undefined
              }
            >
              <Input
                type="number"
                step="any"
                min={0}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={String(max)}
                aria-invalid={over || undefined}
              />
            </Field>
          </div>
        ) : null}
      </AppDialogBody>

      <AppDialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={pending || !value || over}>
          {pending ? "Flagging…" : "Mark ready"}
        </Button>
      </AppDialogFooter>
    </AppDialog>
  );
}

function Stat({
  label,
  value,
  unit,
}: {
  label: string;
  value: number;
  unit: string;
}) {
  return (
    <div>
      <dt className="text-[10px] tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="text-sm font-medium tabular-nums">
        {formatNumber(value, 2)}
        <span className="ml-1 text-[10px] text-muted-foreground">{unit}</span>
      </dd>
    </div>
  );
}
