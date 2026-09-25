"use client";

import { useState } from "react";
import {
  PageHeader,
  DataTable,
  StatusPill,
  HydrationGate,
  type Column,
} from "@/components/common";
import {
  useAccess,
  useAllRows,
  useLookups,
  useProjectId,
  useProjectRows,
} from "@/lib/hooks";
import { formatDate } from "@/lib/format";
import { IndentApprovalSheet } from "@/components/material/indent-approval-sheet";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/common";
import type { Approval, Indent, IndentLine } from "@/lib/domain";

/** A2 — the Project Head's queue. */
export default function IndentApprovalPage() {
  const projectId = useProjectId();
  const access = useAccess("indent_approval");
  const indents = useProjectRows("indents", projectId) as Indent[];
  const indentLines = useProjectRows("indent_lines", projectId) as IndentLine[];
  const approvals = useAllRows("approvals") as Approval[];
  const lookup = useLookups();
  const [selected, setSelected] = useState<Indent | null>(null);

  const queue = indents
    .filter((i) => i.status === "submitted")
    .sort((a, b) => a.raised_date.localeCompare(b.raised_date));
  const decided = indents
    .filter((i) => i.status !== "submitted")
    .sort((a, b) => (b.approved_at ?? "").localeCompare(a.approved_at ?? ""));

  function columns(showAction: boolean): Array<Column<Indent>> {
    return [
      {
        key: "no",
        header: "Indent",
        primary: true,
        cell: (r) => (
          <button
            onClick={() => setSelected(r)}
            className="font-mono text-xs underline decoration-border underline-offset-4 hover:decoration-foreground"
          >
            {r.indent_number}
          </button>
        ),
      },
      {
        key: "wo",
        header: "Against WO",
        secondary: true,
        cell: (r) =>
          r.work_order_id ? (
            <span className="font-mono text-xs">{lookup.workOrder(r.work_order_id)}</span>
          ) : (
            "—"
          ),
      },
      {
        key: "by",
        header: "Raised by",
        cell: (r) => lookup.user(r.raised_by_user_id),
      },
      {
        key: "raised",
        header: "Raised",
        cell: (r) => formatDate(r.raised_date),
      },
      {
        key: "needed",
        header: "Needed by",
        cell: (r) => formatDate(r.required_by_date),
      },
      {
        key: "lines",
        header: "Lines",
        align: "right",
        cell: (r) => indentLines.filter((l) => l.indent_id === r.id).length,
      },
      {
        key: "status",
        header: "Status",
        cell: (r) => <StatusPill status={r.status} />,
      },
      {
        key: "gate",
        header: "A2 gate",
        cell: (r) => {
          const a = approvals.find(
            (x) => x.entity_type === "indent" && x.entity_id === r.id,
          );
          return a ? <StatusPill status={a.status} /> : "—";
        },
      },
      {
        key: "action",
        header: "",
        cell: (r) => (
          <Button
            variant={showAction ? "default" : "ghost"}
            size="xs"
            onClick={() => setSelected(r)}
          >
            {showAction && access.canApprove ? "Review" : "Open"}
          </Button>
        ),
      },
    ];
  }

  return (
    <div>
      <PageHeader
        resource="indent_approval"
        title={access.meta.label}
        description="Every site indent is checked against the BOQ material budget and the work order before Purchase sees it."
        team={access.ownerTeam}
        outsideNav={access.outsideNav}
        stepCodes={access.meta.step_codes}
        owned={access.owned}
      />
      <HydrationGate>
        <div className="space-y-8">
          <section>
            <SectionHeading
              title="Awaiting decision"
              description={
                access.canApprove
                  ? "Approve in full, approve a reduced quantity, or reject with a reason — per line."
                  : "Only the Project Head can decide these."
              }
            />
            <DataTable
              columns={columns(true)}
              rows={queue}
              rowKey={(r) => r.id}
              showValues={access.showValues}
              emptyMessage="Nothing is waiting on the Project Head."
              caption={`${queue.length} pending.`}
            />
          </section>

          <section>
            <SectionHeading title="Decided" />
            <DataTable
              columns={columns(false)}
              rows={decided}
              rowKey={(r) => r.id}
              showValues={access.showValues}
              emptyMessage="No decisions recorded yet."
            />
          </section>
        </div>

        <IndentApprovalSheet
          indent={selected}
          open={selected !== null}
          onOpenChange={(v) => !v && setSelected(null)}
          projectId={projectId}
          canApprove={access.canApprove}
        />
      </HydrationGate>
    </div>
  );
}
