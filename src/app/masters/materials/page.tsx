"use client";

import {
  PageHeader,
  DataTable,
  HydrationGate,
  type Column,
} from "@/components/common";
import { useAccess, useAllRows } from "@/lib/hooks";
import { formatNumber } from "@/lib/format";
import { MaterialDialog } from "@/components/material/master-dialogs";
import type { Material } from "@/lib/domain";

export default function MaterialsPage() {
  const rows = useAllRows("materials") as Material[];
  const rates = useAllRows("supplier_rates");
  const access = useAccess("materials");

  const columns: Array<Column<Material>> = [
    {
      key: "code",
      header: "Code",
      cell: (r) => <span className="font-mono text-xs">{r.code}</span>,
    },
    { key: "name", header: "Material", primary: true, cell: (r) => r.name },
    {
      key: "category",
      header: "Category",
      secondary: true,
      cell: (r) => r.category,
    },
    { key: "unit", header: "Unit", cell: (r) => r.unit },
    {
      key: "hsn",
      header: "HSN",
      cell: (r) => <span className="font-mono text-xs">{r.hsn_code}</span>,
    },
    {
      key: "gst",
      header: "GST",
      align: "right",
      cell: (r) => `${r.gst_percent}%`,
    },
    {
      key: "reorder",
      header: "Reorder level",
      align: "right",
      cell: (r) => formatNumber(r.reorder_level),
    },
    {
      key: "suppliers",
      header: "Suppliers",
      align: "right",
      cell: (r) => rates.filter((x) => x.material_id === r.id).length,
    },
    {
      key: "edit",
      header: "",
      cell: (r) => (access.canEdit ? <MaterialDialog material={r} /> : null),
    },
  ];

  return (
    <div>
      <PageHeader
        title={access.meta.label}
        description="The material master every indent, PO, GRN and vendor bill line points at."
        team={access.ownerTeam}
        outsideNav={access.outsideNav}
        owned={access.owned}
        actions={access.canCreate ? <MaterialDialog /> : null}
      />
      <HydrationGate>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          showValues={access.showValues}
          emptyMessage="No materials on the master."
          caption={`${rows.length} materials.`}
        />
      </HydrationGate>
    </div>
  );
}
