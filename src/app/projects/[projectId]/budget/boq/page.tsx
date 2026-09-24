"use client";

import { ResourcePage, DataTable, type Column } from "@/components/common";
import { useAccess, useProjectId, useProjectRows } from "@/lib/hooks";
import { formatInr, formatNumber } from "@/lib/format";
import { BoqLineDialog } from "@/components/budget/boq-line-dialog";
import type { BoqLine } from "@/lib/domain";

export default function BoqPage() {
  const projectId = useProjectId();
  const rows = useProjectRows("boq_lines", projectId) as BoqLine[];
  const { showValues } = useAccess("boq");

  const columns: Array<Column<BoqLine>> = [
    {
      key: "item",
      header: "Item",
      cell: (r) => <span className="font-mono text-xs">{r.item_code}</span>,
    },
    {
      key: "desc",
      header: "Description",
      primary: true,
      cell: (r) => r.description,
    },
    {
      key: "trade",
      header: "Trade",
      secondary: true,
      cell: (r) => <span className="capitalize">{r.trade}</span>,
    },
    { key: "unit", header: "Unit", cell: (r) => r.unit },
    {
      key: "qty",
      header: "Quantity",
      align: "right",
      cell: (r) => formatNumber(r.quantity),
    },
    {
      key: "rate",
      header: "Rate",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.rate),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.amount),
    },
    {
      key: "exec",
      header: "Executed",
      align: "right",
      cell: (r) => formatNumber(r.executed_quantity),
    },
    {
      key: "certified",
      header: "Certified",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.certified_amount),
    },
  ];

  return (
    <ResourcePage
      resource="boq"
      description="The priced bill of quantities. Budget vs actual reads straight off these lines."
      actions={<BoqLineDialog projectId={projectId} />}
    >
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        showValues={showValues}
        emptyMessage="No BOQ lines on this project yet."
        caption={`${rows.length} BOQ lines.`}
      />
    </ResourcePage>
  );
}
