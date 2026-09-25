"use client";

import Link from "next/link";
import { useState } from "react";
import { Plus } from "lucide-react";
import {
  PageHeader,
  DataTable,
  StatusPill,
  HydrationGate,
  RecordLink,
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
import {
  formatDate,
  formatInr,
  formatPercent,
} from "@/lib/format";
import { RaBillSheet } from "@/components/billing/ra-bill-sheet";
import { Button } from "@/components/ui/button";
import { ROLE_LABEL, APPROVAL_CHAINS } from "@/config/permissions";
import type {
  RaBill,
  RaBillLine,
} from "@/lib/domain";

/** C2 — running-account bills per work order. */
export default function RaBillsPage() {
  const projectId = useProjectId();
  const access = useAccess("ra_bills");
  const handover = useAccess("handed_over");
  // "All my projects" widens this list; one project narrows it (audit QH3).
  const rows = useScopedRows("ra_bills") as RaBill[];
  const projectColumn = useProjectColumn<RaBill>();
  const lines = useProjectRows("ra_bill_lines", projectId) as RaBillLine[];
  const lookup = useLookups();
  const [selected, setSelected] = useState<RaBill | null>(null);

  const columns: Array<Column<RaBill>> = [
    {
      key: "no",
      header: "Bill",
      primary: true,
      cell: (r) => (
        <button
          onClick={() => setSelected(r)}
          className="font-mono text-xs underline decoration-border underline-offset-4 hover:decoration-foreground"
        >
          {r.bill_number}
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
    { key: "date", header: "Bill date", cell: (r) => formatDate(r.bill_date) },
    {
      key: "lines",
      header: "Lines",
      align: "right",
      cell: (r) => lines.filter((l) => l.ra_bill_id === r.id).length,
    },
    {
      key: "previous",
      header: "Previous",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.previous_gross_amount),
    },
    {
      key: "gross",
      header: "This bill",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.gross_amount),
    },
    {
      key: "cumulative",
      header: "Cumulative",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.cumulative_gross_amount),
    },
    {
      key: "deductions",
      header: "Deductions",
      align: "right",
      money: true,
      cell: (r) => (
        <span>
          {formatInr(r.total_deductions)}
          <span className="block text-[10px] text-muted-foreground">
            retention {formatPercent(r.retention_percent)} · TDS{" "}
            {formatPercent(r.tds_percent)}
          </span>
        </span>
      ),
    },
    {
      key: "net",
      header: "Net payable",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.net_payable_amount),
    },
    {
      key: "step",
      header: "Chain step",
      cell: (r) => {
        if (r.status !== "in_certification" || !r.current_sequence) {
          return <span className="text-muted-foreground">—</span>;
        }
        const step = APPROVAL_CHAINS.ra_bill.find(
          (s) => s.sequence === r.current_sequence,
        );
        return (
          <span className="text-xs whitespace-nowrap">
            <span className="font-mono text-muted-foreground">
              {r.current_step_code}
            </span>{" "}
            {step ? ROLE_LABEL[step.required_role] : ""}
          </span>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => <StatusPill status={r.status} />,
    },
    {
      key: "open",
      header: "",
      cell: (r) => (
        <Button variant="ghost" size="xs" onClick={() => setSelected(r)}>
          Open
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        resource="ra_bills"
        title={access.meta.label}
        description="Built from signed measurements at the work-order rates: previous, this bill, cumulative, and what is deducted."
        team={access.ownerTeam}
        outsideNav={access.outsideNav}
        stepCodes={access.meta.step_codes}
        owned={access.owned}
        actions={
          access.canCreate ? (
            <Button size="sm" nativeButton={false} render={<Link href={`/projects/${projectId}/billing/ra-bills/new`} />}>
              <Plus className="size-3.5" /> Prepare RA bill
            </Button>
          ) : null
        }
      />
      <HydrationGate>
        <DataTable
          columns={withProjectColumn(columns, projectColumn)}
          rows={[...rows].sort((a, b) =>
            b.bill_date.localeCompare(a.bill_date),
          )}
          rowKey={(r) => r.id}
          showValues={access.showValues}
          emptyMessage="No RA bills raised on this project yet."
          caption={`${rows.filter((r) => r.status === "in_certification").length} inside the C3–C4 chain · ${rows.filter((r) => r.status === "draft").length} drafts.`}
        />

        <RaBillSheet
          bill={selected}
          open={selected !== null}
          onOpenChange={(v) => !v && setSelected(null)}
          projectId={projectId}
          canSubmit={access.canEdit}
          canHandOver={handover.canEdit}
          showValues={access.showValues}
        />
      </HydrationGate>
    </div>
  );
}

/** C2 — pick the signed, unbilled measurements on one work order. */
