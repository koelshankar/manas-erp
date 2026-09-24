"use client";

import {
  PageHeader,
  DataTable,
  SectionHeading,
  HydrationGate,
  type Column,
} from "@/components/common";
import { useAccess, useAllRows, useLookups } from "@/lib/hooks";
import { formatDate, formatInr } from "@/lib/format";
import { SupplierDialog } from "@/components/material/master-dialogs";
import { Card } from "@/components/ui/card";
import type { Supplier, SupplierRate } from "@/lib/domain";

export default function SuppliersPage() {
  const access = useAccess("suppliers");
  const rows = useAllRows("suppliers") as Supplier[];
  const rates = useAllRows("supplier_rates") as SupplierRate[];
  const purchaseOrders = useAllRows("purchase_orders");
  const lookup = useLookups();

  const supplierColumns: Array<Column<Supplier>> = [
    {
      key: "code",
      header: "Code",
      cell: (r) => <span className="font-mono text-xs">{r.code}</span>,
    },
    { key: "name", header: "Supplier", primary: true, cell: (r) => r.name },
    {
      key: "city",
      header: "City",
      secondary: true,
      cell: (r) => `${r.city}, ${r.state}`,
    },
    {
      key: "tax",
      header: "Tax on PO",
      cell: (r) => (
        <span className="text-xs">
          {r.state === "Goa" ? "CGST + SGST" : "IGST"}
        </span>
      ),
    },
    { key: "contact", header: "Contact", cell: (r) => r.contact_person },
    { key: "phone", header: "Phone", cell: (r) => r.phone },
    {
      key: "gstin",
      header: "GSTIN",
      cell: (r) => <span className="font-mono text-xs">{r.gstin}</span>,
    },
    {
      key: "terms",
      header: "Credit",
      align: "right",
      cell: (r) => `${r.payment_terms_days} days`,
    },
    {
      key: "rates",
      header: "Rate cards",
      align: "right",
      cell: (r) => rates.filter((x) => x.supplier_id === r.id).length,
    },
    {
      key: "pos",
      header: "POs",
      align: "right",
      cell: (r) => purchaseOrders.filter((p) => p.supplier_id === r.id).length,
    },
    {
      key: "edit",
      header: "",
      cell: (r) => (access.canEdit ? <SupplierDialog supplier={r} /> : null),
    },
  ];

  const rateColumns: Array<Column<SupplierRate>> = [
    {
      key: "supplier",
      header: "Supplier",
      primary: true,
      cell: (r) => lookup.supplier(r.supplier_id),
    },
    {
      key: "material",
      header: "Material",
      secondary: true,
      cell: (r) => lookup.material(r.material_id),
    },
    { key: "unit", header: "Unit", cell: (r) => r.unit },
    {
      key: "rate",
      header: "Rate",
      align: "right",
      money: true,
      cell: (r) => formatInr(r.rate),
    },
    {
      key: "lead",
      header: "Lead time",
      align: "right",
      cell: (r) => `${r.lead_time_days} days`,
    },
    {
      key: "from",
      header: "Valid from",
      cell: (r) => formatDate(r.valid_from),
    },
  ];

  return (
    <div>
      <PageHeader
        title={access.meta.label}
        description="Supplier master and standing rates. Rates prefill the comparative and are hidden from Site Execution."
        team={access.ownerTeam}
        outsideNav={access.outsideNav}
        owned={access.owned}
        actions={access.canCreate ? <SupplierDialog /> : null}
      />
      <HydrationGate>
        <div className="space-y-8">
          <section>
            <SectionHeading title="Suppliers" />
            <DataTable
              columns={supplierColumns}
              rows={rows}
              rowKey={(r) => r.id}
              showValues={access.showValues}
              emptyMessage="No suppliers on the master."
              caption={`${rows.length} suppliers across Goa, Maharashtra and Karnataka.`}
            />
          </section>

          <section>
            <SectionHeading
              title="Standing rates"
              description="What each supplier quotes for each material."
            />
            {access.showValues ? (
              <DataTable
                columns={rateColumns}
                rows={rates}
                rowKey={(r) => r.id}
                showValues
                emptyMessage="No rates recorded."
                caption={`${rates.length} supplier–material rates.`}
              />
            ) : (
              <Card className="px-6 py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  Supplier rates are not visible to your role.
                </p>
              </Card>
            )}
          </section>
        </div>
      </HydrationGate>
    </div>
  );
}
