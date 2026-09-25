"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Clock, Plus, TriangleAlert } from "lucide-react";
import {
  HydrationGate,
  LineCount,
  ListPage,
  PageHeader,
  RecordLink,
  StatusChip,
  formatUnitTotals,
  totalsByUnit,
  type Column,
} from "@/components/common";
import {
  useAccess,
  useLookups,
  useProjectColumn,
  useProjectId,
  useProjectRows,
  useScopedRows,
  withProjectColumn,
} from "@/lib/hooks";
import { countOf, formatDate, formatInr } from "@/lib/format";
import { MeasurementSheet } from "@/components/billing/measurement-sheet";
import { IssuedVsMeasuredPanel } from "@/components/billing/issued-vs-measured-panel";
import { Button } from "@/components/ui/button";
import { today as todayDate } from "@/lib/clock";
import type { JointMeasurement, JointMeasurementLine } from "@/lib/domain";

function SignMark({ signed, label }: { signed: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs whitespace-nowrap">
      {signed ? (
        <Check className="size-3.5 text-success" />
      ) : (
        <Clock className="size-3.5 text-warning" />
      )}
      {label}
    </span>
  );
}

/** C1 — joint measurements against the work order. */
export default function MeasurementsPage() {
  const projectId = useProjectId();
  const access = useAccess("measurements");
  // "All my projects" widens this list; one project narrows it (audit QH3).
  const rows = useScopedRows("joint_measurements") as JointMeasurement[];
  const projectColumn = useProjectColumn<JointMeasurement>();
  const lines = useProjectRows(
    "joint_measurement_lines",
    projectId,
  ) as JointMeasurementLine[];
  const lookup = useLookups();
  const [selected, setSelected] = useState<JointMeasurement | null>(null);
  const today = todayDate();

  const columns: Array<Column<JointMeasurement>> = [
    {
      key: "no",
      header: "Measurement",
      primary: true,
      cell: (r) => (
        <button
          onClick={() => setSelected(r)}
          className="font-mono text-xs underline decoration-border underline-offset-4 hover:decoration-foreground"
        >
          {r.measurement_number}
        </button>
      ),
    },
    {
      key: "contractor",
      header: "Contractor",
      secondary: true,
      cell: (r) => lookup.contractor(r.contractor_id),
    },
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
    {
      key: "date",
      header: "Measured",
      cell: (r) => formatDate(r.measurement_date),
    },
    {
      key: "period",
      header: "Period",
      cell: (r) => `${formatDate(r.period_from)} – ${formatDate(r.period_to)}`,
    },
    {
      key: "lines",
      header: "Measured",
      align: "right",
      // cum, sqm and rmt do not add up: a line count, with the per-unit
      // breakdown on hover (audit C2).
      cell: (r) => {
        const own = lines.filter((l) => l.joint_measurement_id === r.id);
        return (
          <LineCount
            lines={own.length}
            totals={totalsByUnit(own.map((l) => ({ unit: l.unit, qty: l.measured_qty })))}
          />
        );
      },
    },
    {
      key: "excess",
      header: "Excess",
      align: "right",
      // "Yes" told the reader nothing — how far past the order is the point
      // (audit, Q3 / group 11).
      cell: (r) => {
        if (!r.has_excess) return <span className="text-muted-foreground">—</span>;
        const own = lines.filter((l) => l.joint_measurement_id === r.id && l.is_excess);
        const over = own.reduce(
          (worst, l) =>
            Math.max(
              worst,
              l.cumulative_measured_qty > 0 && l.previous_measured_qty >= 0
                ? Math.round(
                    ((l.cumulative_measured_qty - l.previous_measured_qty - l.measured_qty) /
                      Math.max(l.measured_qty, 1)) *
                      -100,
                  )
                : 0,
            ),
          0,
        );
        return (
          <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-warning">
            <TriangleAlert className="size-3.5" />
            {over > 0 ? `+${over}%` : `${own.length} ${own.length === 1 ? "line" : "lines"}`}
          </span>
        );
      },
    },
    {
      key: "signatures",
      header: "Signatures",
      cell: (r) => (
        <span className="flex flex-col gap-0.5">
          <SignMark
            signed={Boolean(r.signed_by_contractor_at)}
            label="Contractor"
          />
          <SignMark signed={Boolean(r.signed_by_qs_at)} label="QS" />
        </span>
      ),
    },
    {
      key: "value",
      header: "Value",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.total_value),
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => <StatusChip status={r.status} />,
    },
    {
      key: "bill",
      header: "RA bill no.",
      className: "whitespace-nowrap",
      cell: (r) =>
        r.ra_bill_id ? (
          <RecordLink
            href={`/projects/${projectId}/billing/ra-bills`}
            label={lookup.raBillNumber(r.ra_bill_id)}
          />
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];

  const measuredTotals = formatUnitTotals(
    totalsByUnit(lines.map((l) => ({ unit: l.unit, qty: l.measured_qty }))),
  );

  return (
    <div>
      <PageHeader
        resource="measurements"
        title={access.meta.label}
        description="Quantities measured jointly with the contractor, against the BOQ lines in the work order."
        team={access.ownerTeam}
        outsideNav={access.outsideNav}
        stepCodes={access.meta.step_codes}
        owned={access.owned}
        actions={
          access.canCreate ? (
            <Button size="sm" nativeButton={false} render={<Link href={`/projects/${projectId}/billing/measurements/new`} />}>
              <Plus className="size-3.5" /> New joint measurement
            </Button>
          ) : null
        }
      />
      <HydrationGate>
        <div className="space-y-6">
          <ListPage
            columns={withProjectColumn(columns, projectColumn)}
            onRowClick={setSelected}
            rowActions={(r) =>
              r.status === "draft" && access.canEdit ? (
                <Button variant="default" size="xs" onClick={() => setSelected(r)}>
                  Sign
                </Button>
              ) : (
                <Button variant="ghost" size="xs" onClick={() => setSelected(r)}>
                  Open
                </Button>
              )
            }
            rows={[...rows].sort((a, b) =>
              b.measurement_date.localeCompare(a.measurement_date),
            )}
            rowKey={(r) => r.id}
            showValues={access.showValues}
            caption={`${countOf(rows.filter((r) => r.status === "draft").length, "sheet")} awaiting signature · ${countOf(rows.filter((r) => r.status === "signed").length, "sheet")} signed and not yet billed · measured to date ${measuredTotals}.`}
            tabs={[{ key: "draft", label: "Draft", tone: "neutral" as const },{ key: "signed", label: "Signed", tone: "success" as const },{ key: "billed", label: "Billed", tone: "neutral" as const }]}
            tabOf={(r) => r.status}
            searchIn={(r) => [r.measurement_number]}
            searchPlaceholder={"Measurement number"}
            emptyMessage={"Nothing has been measured with a contractor on this project yet."}
          />

          <IssuedVsMeasuredPanel
            projectId={projectId}
            title="Issued vs measured — every BOQ line on this project"
          />
        </div>

        <MeasurementSheet
          measurement={selected}
          open={selected !== null}
          onOpenChange={(v) => !v && setSelected(null)}
          projectId={projectId}
          canSign={access.canEdit}
          showValues={access.showValues}
          defaultDate={today}
        />
      </HydrationGate>
    </div>
  );
}
