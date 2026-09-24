"use client";

import { useState } from "react";
import {
  PageHeader,
  DataTable,
  HydrationGate,
  RecordLink,
  type Column,
} from "@/components/common";
import {
  useAccess,
  useLookups,
  useProjectId,
  useProjectRows,
} from "@/lib/hooks";
import {
  formatDate,
  formatDateTime,
  formatInr,
  formatPercent,
} from "@/lib/format";
import { RaBillSheet } from "@/components/billing/ra-bill-sheet";
import { Button } from "@/components/ui/button";
import type { RaBill } from "@/lib/domain";

/** C5 — certified bills released to Accounts. Read-only from here on. */
export default function HandedOverPage() {
  const projectId = useProjectId();
  const access = useAccess("handed_over");
  const all = useProjectRows("ra_bills", projectId) as RaBill[];
  const bills = all.filter((b) => b.status === "handed_over");
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
      key: "gross",
      header: "Gross",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.gross_amount),
    },
    {
      key: "retention",
      header: "Retention",
      align: "right",
      money: true,
      cell: (r) => (
        <span>
          {formatInr(r.retention_amount)}
          <span className="block text-[10px] text-muted-foreground">
            {formatPercent(r.retention_percent)}
          </span>
        </span>
      ),
    },
    {
      key: "tds",
      header: "TDS",
      align: "right",
      money: true,
      cell: (r) => (
        <span>
          {formatInr(r.tds_amount)}
          <span className="block text-[10px] text-muted-foreground">
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
      key: "certified",
      header: "Certified",
      cell: (r) => formatDateTime(r.certified_at),
    },
    {
      key: "handed",
      header: "Handed over",
      cell: (r) => formatDateTime(r.handed_over_at),
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

  const certified = all.filter((b) => b.status === "certified");

  return (
    <div>
      <PageHeader
        resource="handed_over"
        title={access.meta.label}
        description="Certified bills released to Accounts for payment. Nothing here is editable in this ERP."
        team={access.ownerTeam}
        outsideNav={access.outsideNav}
        stepCodes={access.meta.step_codes}
        owned={access.owned}
      />
      <HydrationGate>
        <DataTable
          columns={columns}
          rows={[...bills].sort((a, b) =>
            (b.handed_over_at ?? "").localeCompare(a.handed_over_at ?? ""),
          )}
          rowKey={(r) => r.id}
          showValues={access.showValues}
          emptyMessage="Nothing handed over to Accounts on this project yet."
          caption={
            certified.length > 0
              ? `${bills.length} handed over · ${certified.length} certified and still to be released.`
              : `${bills.length} bills handed over.`
          }
        />
        <RaBillSheet
          bill={selected}
          open={selected !== null}
          onOpenChange={(v) => !v && setSelected(null)}
          projectId={projectId}
          canSubmit={false}
          canHandOver={false}
          showValues={access.showValues}
        />
      </HydrationGate>
    </div>
  );
}
