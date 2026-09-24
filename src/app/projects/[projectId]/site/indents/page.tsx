"use client";

import { useState } from "react";
import { PackagePlus } from "lucide-react";
import {
  AgeChip,
  EmptyState,
  LineCount,
  ListPage,
  PositionChip,
  ResourcePage,
  totalsByUnit,
  type Column,
} from "@/components/common";
import {
  useAccess,
  useAllRows,
  useLookups,
  useProjectColumn,
  useProjectId,
  useScopedRows,
  withProjectColumn,
} from "@/lib/hooks";
import { ageInDays } from "@/lib/clock";
import { formatDate } from "@/lib/format";
import { ROLE_LABEL } from "@/config/permissions";
import { RaiseIndentDialog } from "@/components/material/raise-indent-dialog";
import { IndentDetailSheet } from "@/components/material/indent-detail-sheet";
import type { Approval, Indent, IndentLine, Material } from "@/lib/domain";

/** The tabs are the indent's own lifecycle, collapsed to what a person asks. */
const TABS = [
  { key: "submitted", label: "Awaiting approval", tone: "warning" as const },
  { key: "approved", label: "Approved", tone: "success" as const },
  { key: "with_purchase", label: "With purchase", tone: "info" as const },
  { key: "received", label: "Received", tone: "success" as const },
  { key: "rejected", label: "Rejected", tone: "destructive" as const },
];

function tabOf(indent: Indent): string {
  switch (indent.status) {
    case "submitted":
      return "submitted";
    case "approved":
    case "partially_approved":
      return "approved";
    case "in_comparative":
    case "po_raised":
    case "partially_received":
      return "with_purchase";
    case "received":
    case "closed":
      return "received";
    default:
      return "rejected";
  }
}

/** A2 — material requests raised on site. */
export default function IndentsPage() {
  const projectId = useProjectId();
  const access = useAccess("indents");
  // "All my projects" widens these; a single-project role sees one (audit QH3).
  const rows = useScopedRows("indents") as Indent[];
  const lines = useScopedRows("indent_lines") as IndentLine[];
  const projectColumn = useProjectColumn<Indent>();
  const approvals = useAllRows("approvals") as Approval[];
  const materials = useAllRows("materials") as Material[];
  const lookup = useLookups();
  const [selected, setSelected] = useState<Indent | null>(null);

  const columns: Array<Column<Indent>> = [
    {
      key: "no",
      header: "Indent",
      primary: true,
      cell: (r) => <span className="font-mono text-xs">{r.indent_number}</span>,
    },
    {
      key: "wo",
      header: "Against WO",
      secondary: true,
      cell: (r) => (r.work_order_id ? lookup.workOrder(r.work_order_id) : "—"),
    },
    {
      key: "raised",
      header: "Raised",
      // Every queue row says how long it has been sitting (audit H3 / group 5).
      cell: (r) => <AgeChip days={ageInDays(r.raised_date)} verb="raised" />,
    },
    { key: "needed", header: "Needed by", cell: (r) => formatDate(r.required_by_date) },
    {
      key: "qty",
      header: "Requested",
      align: "right",
      // Never a sum across units: a line count, with the real per-unit
      // breakdown on hover (audit C2).
      cell: (r) => {
        const own = lines.filter((l) => l.indent_id === r.id);
        return (
          <LineCount
            lines={own.length}
            totals={totalsByUnit(own.map((l) => ({ unit: l.unit, qty: l.requested_qty })))}
          />
        );
      },
    },
    { key: "by", header: "Raised by", cell: (r) => lookup.user(r.raised_by_user_id) },
    {
      key: "status",
      header: "Where it is",
      // One chip, not a Status chip plus an identical "A2 gate" chip two
      // columns later (audit C8).
      cell: (r) => {
        const gate = approvals.find((x) => x.entity_type === "indent" && x.entity_id === r.id);
        return (
          <PositionChip
            status={r.status}
            stepCode={gate && gate.status === "pending" ? gate.step_code : null}
            waitingOn={
              gate && gate.status === "pending" ? ROLE_LABEL[gate.required_role] : null
            }
          />
        );
      },
    },
  ];

  const sorted = [...rows].sort((a, b) => b.raised_date.localeCompare(a.raised_date));
  const allColumns = withProjectColumn(columns, projectColumn);

  return (
    <ResourcePage
      resource="indents"
      description="Material the site has asked for, against a work order. Each one goes to the Project Head for approval before purchase can act on it."
      actions={
        access.canCreate ? <RaiseIndentDialog projectId={projectId} materials={materials} /> : null
      }
    >
      <ListPage
        rows={sorted}
        columns={allColumns}
        rowKey={(r) => r.id}
        tabs={TABS}
        tabOf={tabOf}
        searchIn={(r) => [r.indent_number, r.remarks, lookup.user(r.raised_by_user_id)]}
        searchPlaceholder="Indent number or who raised it"
        showValues={access.showValues}
        onRowClick={setSelected}
        empty={
          <EmptyState
            icon={PackagePlus}
            message="No material has been asked for on this project yet. Raising an indent is how cement, steel or anything else gets ordered."
            action={
              access.canCreate ? (
                <RaiseIndentDialog projectId={projectId} materials={materials} />
              ) : null
            }
          />
        }
      />
      <IndentDetailSheet
        indent={selected}
        open={selected !== null}
        onOpenChange={(v) => !v && setSelected(null)}
        projectId={projectId}
      />
    </ResourcePage>
  );
}
