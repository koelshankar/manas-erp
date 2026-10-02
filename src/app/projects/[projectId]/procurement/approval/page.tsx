"use client";

import { useState } from "react";
import {
  PageHeader,
  DataTable,
  StatusPill,
  HydrationGate,
  SectionHeading,
  type Column,
} from "@/components/common";
import {
  useAccess,
  useAllRows,
  useLookups,
  useProjectId,
  useProjectRows,
} from "@/lib/hooks";
import { formatDate, formatInr } from "@/lib/format";
import { ComparativeSheet } from "@/components/material/comparative-sheet";
import { Button } from "@/components/ui/button";
import type { Approval, Comparative, ComparativeLine } from "@/lib/domain";

/** B2 — approval to purchase. */
export default function PurchaseApprovalPage() {
  const projectId = useProjectId();
  const access = useAccess("purchase_approval");
  const comparatives = useProjectRows(
    "comparatives",
    projectId,
  ) as Comparative[];
  const lines = useProjectRows(
    "comparative_lines",
    projectId,
  ) as ComparativeLine[];
  const approvals = useAllRows("approvals") as Approval[];
  const lookup = useLookups();
  const [selected, setSelected] = useState<Comparative | null>(null);

  const queue = comparatives.filter((c) => c.status === "pending_approval");
  const decided = comparatives
    .filter(
      (c) =>
        c.status === "approved" ||
        c.status === "sent_back" ||
        c.status === "rejected",
    )
    .sort((a, b) => (b.decided_at ?? "").localeCompare(a.decided_at ?? ""));

  function columns(isQueue: boolean): Array<Column<Comparative>> {
    return [
      {
        key: "no",
        header: "Comparative",
        primary: true,
        cell: (r) => (
          <button
            onClick={() => setSelected(r)}
            className="font-mono text-xs underline decoration-border underline-offset-4 hover:decoration-foreground"
          >
            {r.comparative_number}
          </button>
        ),
      },
      {
        key: "indents",
        header: "From indents",
        secondary: true,
        cell: (r) =>
          r.indent_ids.map((id) => lookup.indentNumber(id)).join(", "),
      },
      {
        key: "suppliers",
        header: "Recommended",
        cell: (r) =>
          [
            ...new Set(
              lines
                .filter((l) => l.comparative_id === r.id)
                .map((l) => lookup.supplier(l.selected_supplier_id)),
            ),
          ].join(", ") || "—",
      },
      {
        key: "nonL1",
        header: "Not L1",
        align: "right",
        cell: (r) => {
          const count = lines.filter(
            (l) => l.comparative_id === r.id && !l.is_l1_selected,
          ).length;
          return count > 0 ? (
            <span className="text-warning">{count} justified</span>
          ) : (
            "—"
          );
        },
      },
      {
        key: "value",
        header: "Value",
        align: "right",
        money: true,
        cell: (r) => formatInr(r.total_selected_value),
      },
      {
        key: "date",
        header: "Prepared",
        cell: (r) => formatDate(r.prepared_date),
      },
      {
        key: "status",
        header: "Status",
        cell: (r) => <StatusPill status={r.status} />,
      },
      {
        key: "gate",
        header: "B2 gate",
        cell: (r) => {
          const a = approvals.find(
            (x) => x.entity_type === "comparative" && x.entity_id === r.id,
          );
          return a ? <StatusPill status={a.status} /> : "—";
        },
      },
      {
        key: "action",
        header: "",
        cell: (r) => (
          <Button
            variant={isQueue && access.canApprove ? "default" : "ghost"}
            size="xs"
            onClick={() => setSelected(r)}
          >
            {isQueue && access.canApprove ? "Review" : "Open"}
          </Button>
        ),
      },
    ];
  }

  return (
    <div>
      <PageHeader
        resource="purchase_approval"
        title={access.meta.label}
        description="Once the vendor rate is fixed, the Purchase Head approves before any PO is raised."
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
                  ? "Approve to fix the rates, send back for rework, or reject."
                  : "Only the Purchase Head can decide these."
              }
            />
            <DataTable
              columns={columns(true)}
              rows={queue}
              rowKey={(r) => r.id}
              showValues={access.showValues}
              emptyMessage="Nothing waiting on the Purchase Head."
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

        <ComparativeSheet
          comparative={selected}
          open={selected !== null}
          onOpenChange={(v) => !v && setSelected(null)}
          projectId={projectId}
          canDecide={access.canApprove}
          showValues={access.showValues}
        />
      </HydrationGate>
    </div>
  );
}
