"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AgeChip,
  HydrationGate,
  ListPage,
  PageHeader,
  StatusPill,
  type Column,
} from "@/components/common";
import { TransmittalDialog } from "@/components/drawings/transmittal-dialog";
import { TransmittalSheet } from "@/components/drawings/transmittal-sheet";
import { useAccess, useProjectId, useProjectRows } from "@/lib/hooks";
import { ageInDays, today } from "@/lib/clock";
import { formatDate } from "@/lib/format";
import { transmittalPurposeLabel } from "@/config/labels";
import type { Transmittal, TransmittalLine } from "@/lib/domain";

/** Drawing issue records — who was sent which revision, and when. */
export default function TransmittalsPage() {
  const projectId = useProjectId();
  const access = useAccess("transmittals");
  const transmittals = useProjectRows("transmittals", projectId) as Transmittal[];
  const lines = useProjectRows("transmittal_lines", projectId) as TransmittalLine[];

  const [open, setOpen] = useState<Transmittal | null>(null);

  const linesOf = (t: Transmittal) => lines.filter((l) => l.transmittal_id === t.id);
  const outstandingCount = transmittals.filter((t) => t.status === "issued").length;

  const columns: Array<Column<Transmittal>> = [
    {
      key: "no",
      header: "Transmittal",
      primary: true,
      cell: (r) => <span className="font-mono text-xs">{r.transmittal_number}</span>,
    },
    { key: "date", header: "Date", cell: (r) => formatDate(r.transmittal_date) },
    { key: "to", header: "To", secondary: true, cell: (r) => r.to_company || r.to_name },
    { key: "purpose", header: "Purpose", cell: (r) => transmittalPurposeLabel(r.purpose_of_issue) },
    {
      key: "drawings",
      header: "Drawings",
      cell: (r) => {
        const mine = linesOf(r);
        return `${mine.length} ${mine.length === 1 ? "drawing" : "drawings"}`;
      },
    },
    { key: "status", header: "Status", cell: (r) => <StatusPill status={r.status} /> },
    {
      key: "age",
      header: "Age",
      cell: (r) => <AgeChip days={ageInDays(r.transmittal_date)} verb="raised" />,
    },
    {
      key: "action",
      header: "",
      cell: (r) => (
        <Button
          size="xs"
          variant={actionableBy(r, access.canEdit) ? "default" : "ghost"}
          onClick={() => setOpen(r)}
        >
          {quickLabel(r, access.canEdit)}
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        resource="transmittals"
        title={access.meta.label}
        description="Who was issued which revision, when, and what they acknowledged."
        team={access.ownerTeam}
        outsideNav={access.outsideNav}
        stepCodes={access.meta.step_codes}
        owned={access.owned}
        actions={
          access.canCreate ? <TransmittalDialog projectId={projectId} today={today()} /> : null
        }
      />
      <HydrationGate>
        <ListPage
          columns={columns}
          rows={transmittals.sort((a, b) => b.transmittal_date.localeCompare(a.transmittal_date))}
          rowKey={(r) => r.id}
          onRowClick={(r) => setOpen(r)}
          caption={
            outstandingCount > 0
              ? `${outstandingCount} ${outstandingCount === 1 ? "transmittal is" : "transmittals are"} issued and not yet acknowledged.`
              : "Nothing is outstanding."
          }
          tabs={[
            { key: "draft", label: "Draft", tone: "neutral" as const },
            { key: "issued", label: "Outstanding", tone: "warning" as const },
            { key: "acknowledged", label: "Acknowledged", tone: "success" as const },
          ]}
          tabOf={(r) => r.status}
          searchIn={(r) => [r.transmittal_number, r.to_name, r.to_company]}
          searchPlaceholder="Transmittal number, name or company"
          emptyMessage="Nothing issued yet. A transmittal records a set of drawings going out to a contractor or consultant, so a superseded revision on site can always be traced back."
        />
      </HydrationGate>

      <TransmittalSheet
        transmittal={open}
        open={open !== null}
        onOpenChange={(v) => !v && setOpen(null)}
        projectId={projectId}
        canEdit={access.canEdit}
      />
    </div>
  );
}

function actionableBy(t: Transmittal, canEdit: boolean): boolean {
  if (!canEdit) return false;
  return t.status === "draft" || t.status === "issued";
}

function quickLabel(t: Transmittal, canEdit: boolean): string {
  if (canEdit) {
    if (t.status === "draft") return "Issue";
    if (t.status === "issued") return "Record receipt";
  }
  return "Open";
}
