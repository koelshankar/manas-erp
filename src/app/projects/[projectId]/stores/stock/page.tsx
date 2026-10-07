"use client";

import { useState } from "react";
import {
  AgeChip,
  HydrationGate,
  LineCount,
  ListPage,
  PageHeader,
  RecordLink,
  StatusPill,
  totalsByUnit,
  type Column,
} from "@/components/common";
import { Button } from "@/components/ui/button";
import { IssueMaterialDialog } from "@/components/stores/issue-material-dialog";
import { IssueNoteSheet } from "@/components/stores/issue-note-sheet";
import {
  useAccess,
  useAllRows,
  useLookups,
  useProjectId,
  useProjectRows,
} from "@/lib/hooks";
import { ageInDays, today } from "@/lib/clock";
import { formatDate } from "@/lib/format";
import type { MaterialIssue, MaterialIssueLine, Store } from "@/lib/domain";

/**
 * A5 — the material issue register.
 *
 * One row per issue note, which is what their form is: one contractor, one
 * work order, as many materials as went over the counter. The quantity column
 * is a `<LineCount>` rather than a sum, because a note holding bags, brass and
 * rmt has no total — the per-unit breakdown is on hover.
 *
 * **No rupee figure, for any role.** The issue carries a weighted-average value
 * and Budget vs Actual consumes it; the Stores tab is a quantities screen and
 * Manas were explicit about that. There is no `showValues` on this page because
 * there is nothing for it to decide.
 */
export default function MaterialIssuePage() {
  const projectId = useProjectId();
  const access = useAccess("site_stock");
  const issues = useProjectRows("material_issues", projectId) as MaterialIssue[];
  const lines = useProjectRows("material_issue_lines", projectId) as MaterialIssueLine[];
  const stores = useAllRows("stores") as Store[];
  const lookup = useLookups();

  const [open, setOpen] = useState<MaterialIssue | null>(null);

  const linesOf = (issue: MaterialIssue) =>
    lines.filter((l) => l.material_issue_id === issue.id);

  const columns: Array<Column<MaterialIssue>> = [
    {
      key: "no",
      header: "Material issue",
      primary: true,
      cell: (r) => <span className="font-mono text-xs">{r.issue_number}</span>,
    },
    {
      key: "contractor",
      header: "Issued to",
      secondary: true,
      cell: (r) => lookup.contractor(r.issued_to_contractor_id),
    },
    { key: "date", header: "Date", cell: (r) => formatDate(r.issue_date) },
    {
      key: "materials",
      header: "Materials",
      cell: (r) => {
        const mine = linesOf(r);
        return (
          <LineCount
            lines={mine.length}
            totals={totalsByUnit(mine.map((l) => ({ unit: l.unit, qty: l.quantity })))}
          />
        );
      },
    },
    {
      key: "store",
      header: "From store",
      cell: (r) => stores.find((s) => s.id === r.store_id)?.name ?? "—",
    },
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
    {
      key: "signed",
      header: "Signed for by",
      cell: (r) => r.acknowledged_by_name || "—",
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => <StatusPill status={r.status} />,
    },
    {
      key: "age",
      header: "Age",
      cell: (r) => <AgeChip days={ageInDays(r.issue_date)} verb="issued" />,
    },
    {
      key: "action",
      header: "",
      cell: (r) => (
        <Button
          size="xs"
          variant={r.status === "issued" && access.canEdit ? "default" : "ghost"}
          onClick={() => setOpen(r)}
        >
          {r.status === "issued" && access.canEdit ? "Sign off" : "Open"}
        </Button>
      ),
    },
  ];

  const unsigned = issues.filter((i) => i.status === "issued").length;

  return (
    <div>
      <PageHeader
        resource="site_stock"
        title={access.meta.label}
        description="Material handed from a store to a contractor against a work order, with the cumulative quantity issued to date."
        team={access.ownerTeam}
        outsideNav={access.outsideNav}
        stepCodes={access.meta.step_codes}
        owned={access.owned}
        actions={
          access.canCreate ? (
            <IssueMaterialDialog projectId={projectId} today={today()} />
          ) : null
        }
      />
      <HydrationGate>
        <ListPage
          columns={columns}
          rows={[...issues].sort((a, b) => b.issue_date.localeCompare(a.issue_date))}
          rowKey={(r) => r.id}
          onRowClick={(r) => setOpen(r)}
          caption={
            unsigned > 0
              ? `${unsigned} not yet signed for by the contractor.`
              : "Every note has been signed for."
          }
          tabs={[
            { key: "issued", label: "Issued", tone: "warning" as const },
            { key: "acknowledged", label: "Acknowledged", tone: "success" as const },
          ]}
          tabOf={(r) => r.status}
          searchIn={(r) => [
            r.issue_number,
            lookup.contractor(r.issued_to_contractor_id),
            lookup.workOrder(r.work_order_id),
          ]}
          searchPlaceholder="Issue number or contractor"
          emptyMessage="No material has been issued on this project yet. Issue material to a contractor and it will appear here."
        />
      </HydrationGate>

      <IssueNoteSheet
        issue={open}
        open={open !== null}
        onOpenChange={(v) => !v && setOpen(null)}
        projectId={projectId}
        canEdit={access.canEdit}
      />
    </div>
  );
}
