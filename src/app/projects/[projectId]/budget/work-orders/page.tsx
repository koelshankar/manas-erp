"use client";

import { ResourcePage, DataTable, type Column } from "@/components/common";
import {
  useAccess,
  useLookups,
  useProjectId,
  useProjectRows,
} from "@/lib/hooks";
import { formatDate, formatInr, formatPercent } from "@/lib/format";
import { WorkOrderDialog } from "@/components/budget/work-order-dialog";
import type { WorkOrder } from "@/lib/domain";

export default function WorkOrdersPage() {
  const projectId = useProjectId();
  const rows = useProjectRows("work_orders", projectId) as WorkOrder[];
  const lines = useProjectRows("work_order_lines", projectId);
  const lookup = useLookups();
  const { showValues } = useAccess("work_orders");

  const columns: Array<Column<WorkOrder>> = [
    {
      key: "no",
      header: "WO No.",
      primary: true,
      cell: (r) => <span className="font-mono text-xs">{r.wo_number}</span>,
    },
    {
      key: "contractor",
      header: "Contractor",
      secondary: true,
      cell: (r) => lookup.contractor(r.contractor_id),
    },
    { key: "title", header: "Scope", cell: (r) => r.title },
    {
      key: "lines",
      header: "Lines",
      align: "right",
      cell: (r) => lines.filter((l) => l.work_order_id === r.id).length,
    },
    { key: "issued", header: "Issued", cell: (r) => formatDate(r.issued_date) },
    { key: "end", header: "Ends", cell: (r) => formatDate(r.end_date) },
    {
      key: "retention",
      header: "Retention",
      align: "right",
      cell: (r) => formatPercent(r.retention_percent),
    },
    {
      key: "value",
      header: "Order value",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.order_value),
    },
  ];

  return (
    <ResourcePage
      resource="work_orders"
      description="Contractor orders carrying the agreed rate per BOQ line and the retention percentage."
      actions={<WorkOrderDialog projectId={projectId} />}
    >
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        showValues={showValues}
        emptyMessage="No work orders issued on this project yet."
        caption={`${rows.length} work orders, ${lines.length} priced lines.`}
      />
    </ResourcePage>
  );
}
