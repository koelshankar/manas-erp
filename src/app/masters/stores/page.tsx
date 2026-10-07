"use client";

import { useMemo } from "react";
import {
  DataTable,
  HydrationGate,
  PageHeader,
  SectionHeading,
  type Column,
} from "@/components/common";
import { StoreDialog } from "@/components/stores/store-dialog";
import { useAccess, useAllRows, useLookups } from "@/lib/hooks";
import { formatNumber } from "@/lib/format";
import type { Project, StockLedgerEntry, Store } from "@/lib/domain";
import { Card } from "@/components/ui/card";
import { cn } from "cn";

/**
 * The store master.
 *
 * Stores belong to projects, but the list of them reads across the portfolio:
 * a project may have more than one and a transfer crosses projects, so the
 * question "where is our stock kept" is not a question about one site.
 *
 * Whether Manas run one store per project or share one across projects is still
 * open. This screen answers either way and says nothing about which, which is
 * the point of building it as an entity rather than a field on the project.
 */
export default function StoreMasterPage() {
  const access = useAccess("stores");
  const stores = useAllRows("stores") as Store[];
  const projects = useAllRows("projects") as Project[];
  const ledger = useAllRows("stock_ledger_entries") as StockLedgerEntry[];
  const lookup = useLookups();

  /**
   * How much each store is actually holding, so the master says which stores
   * are real and which are open on paper only. Quantities, never a value —
   * nothing in Stores carries money.
   */
  const activity = useMemo(() => {
    const byStore = new Map<string, { materials: Set<string>; movements: number }>();
    const balances = new Map<string, number>();
    ledger.forEach((e) => {
      const row = byStore.get(e.store_id) ?? { materials: new Set<string>(), movements: 0 };
      row.movements += 1;
      byStore.set(e.store_id, row);
      // Only a material with something left on hand counts as "held".
      const key = `${e.store_id}:${e.material_id}`;
      balances.set(key, (balances.get(key) ?? 0) + e.quantity_in - e.quantity_out);
    });
    balances.forEach((balance, key) => {
      if (balance <= 0) return;
      const [store_id, material_id] = key.split(":");
      byStore.get(store_id)?.materials.add(material_id);
    });
    return byStore;
  }, [ledger]);

  const columns: Array<Column<Store>> = [
    {
      key: "code",
      header: "Code",
      cell: (r) => <span className="font-mono text-xs">{r.code}</span>,
    },
    { key: "name", header: "Store", primary: true, cell: (r) => r.name },
    {
      key: "project",
      header: "Project",
      secondary: true,
      cell: (r) => lookup.project(r.project_id),
    },
    { key: "location", header: "Where", cell: (r) => r.location || "—" },
    { key: "keeper", header: "Keys held by", cell: (r) => r.keeper_name || "—" },
    {
      key: "primary",
      header: "Main store",
      cell: (r) =>
        r.is_primary ? (
          <span className="text-xs font-medium">Yes — GRNs land here</span>
        ) : (
          <span className="text-xs text-muted-foreground">No</span>
        ),
    },
    {
      key: "holding",
      header: "Materials held",
      align: "right",
      cell: (r) => {
        const held = activity.get(r.id)?.materials.size ?? 0;
        return (
          <span className={cn("num", held === 0 && "text-muted-foreground")}>
            {formatNumber(held, 0)}
          </span>
        );
      },
    },
    {
      key: "movements",
      header: "Movements",
      align: "right",
      cell: (r) => {
        const count = activity.get(r.id)?.movements ?? 0;
        return (
          <span className={cn("num", count === 0 && "text-muted-foreground")}>
            {formatNumber(count, 0)}
          </span>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      cell: (r) =>
        r.is_active ? (
          <span className="text-xs">Open</span>
        ) : (
          <span className="text-xs text-muted-foreground">Closed</span>
        ),
    },
    {
      key: "action",
      header: "",
      cell: (r) => (access.canEdit ? <StoreDialog editing={r} /> : null),
    },
  ];

  const multiStore = projects.filter(
    (p) => stores.filter((s) => s.project_id === p.id).length > 1,
  ).length;

  return (
    <div>
      <PageHeader
        resource="stores"
        title={access.meta.label}
        description="Where stock is held. A store belongs to a project, and a project may have more than one."
        team={access.ownerTeam}
        owned={access.owned}
        actions={access.canCreate ? <StoreDialog /> : null}
      />
      <HydrationGate>
        <div className="space-y-8">
          <DataTable
            columns={columns}
            rows={[...stores].sort(
              (a, b) =>
                lookup.project(a.project_id).localeCompare(lookup.project(b.project_id)) ||
                Number(b.is_primary) - Number(a.is_primary) ||
                a.name.localeCompare(b.name),
            )}
            rowKey={(r) => r.id}
            caption={
              multiStore > 0
                ? `${multiStore} ${multiStore === 1 ? "project keeps" : "projects keep"} more than one store.`
                : "Every project keeps one store."
            }
            emptyMessage="No stores yet. A project needs one before a GRN has anywhere to land."
          />

          <section>
            <SectionHeading
              title="One store or many?"
              description="What is still open, and why it does not block anything."
            />
            <Card className="px-4 py-3">
              <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
                Each store belongs to one project, and a project can have more than one
                store. Stock is counted per store, and a transfer order can move material
                between stores on different projects.
              </p>
            </Card>
          </section>
        </div>
      </HydrationGate>
    </div>
  );
}
