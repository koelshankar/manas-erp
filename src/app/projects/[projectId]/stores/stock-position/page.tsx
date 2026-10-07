"use client";

import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  HydrationGate,
  PageHeader,
  Qty,
  ScrollStrip,
  SectionHeading,
  type Column,
} from "@/components/common";
import {
  useAccess,
  useLookups,
  useProjectId,
  useProjectRows,
  useRepositoryQuery,
} from "@/lib/hooks";
import { stockPositions, type StockPositionRow } from "@/lib/services/stock-position";
import { formatDate } from "@/lib/format";
import { movementLabel } from "@/config/labels";
import type { StockLedgerEntry, Store } from "@/lib/domain";
import { cn } from "cn";

/**
 * A5 — the stock position, per store.
 *
 * Derived, never stored: every figure is the sum of the movements the documents
 * already wrote — a GRN receipt, an issue to a contractor, both ends of a
 * transfer order, both directions of a gate pass. There is no stock master and
 * no second ledger to keep in step, which is why nothing has to be rebuilt when
 * a document is written.
 *
 * **Quantities only, for every role.** `stockPositions` does not compute a
 * value, so there is no money for the screen to decide about — which is the
 * only way a rule like "no rupees in Stores" survives the next column somebody
 * adds.
 */
export default function StockPositionPage() {
  const projectId = useProjectId();
  const access = useAccess("stock_position");
  const stores = (useProjectRows("stores", projectId) as Store[]).filter((s) => s.is_active);
  const ledger = useProjectRows("stock_ledger_entries", projectId) as StockLedgerEntry[];
  const lookup = useLookups();

  /** "" is every store on the project, which is the default. */
  const [storeId, setStoreId] = useState("");

  const { data: rows } = useRepositoryQuery<StockPositionRow[]>(
    async () => (projectId ? stockPositions(projectId, storeId || null) : []),
    [projectId, storeId],
  );
  const position = rows ?? [];

  const lowCount = position.filter((r) => r.low).length;
  const outOnPass = position.filter((r) => r.on_gate_pass > 0).length;
  const multiStore = stores.length > 1;

  const movements = useMemo(
    () =>
      ledger
        .filter((e) => !storeId || e.store_id === storeId)
        .sort(
          (a, b) =>
            b.movement_date.localeCompare(a.movement_date) ||
            b.created_at.localeCompare(a.created_at),
        ),
    [ledger, storeId],
  );

  /*
   * Eight data columns plus the store, which only appears when there is more
   * than one to tell apart — ten is the table ceiling, and a column of the
   * same name on every row is the first one to go.
   */
  const columns: Array<Column<StockPositionRow>> = [
    ...(multiStore && !storeId
      ? [
          {
            key: "store",
            header: "Store",
            cell: (r: StockPositionRow) => r.store_name,
          },
        ]
      : []),
    {
      key: "code",
      header: "Code",
      cell: (r) => <span className="font-mono text-xs">{lookup.materialCode(r.material_id)}</span>,
    },
    {
      key: "material",
      header: "Material",
      primary: true,
      cell: (r) => (
        <span className="flex items-center gap-2">
          {lookup.material(r.material_id)}
          {r.low ? <AlertTriangle className="size-3.5 shrink-0 text-warning" /> : null}
        </span>
      ),
    },
    {
      key: "balance",
      header: "Balance",
      align: "right",
      secondary: true,
      cell: (r) => (
        <Qty
          value={r.balance}
          unit={r.unit}
          className={cn("font-medium", r.low && "text-warning")}
        />
      ),
    },
    {
      key: "received",
      header: "Received",
      align: "right",
      cell: (r) => <Qty value={r.received} unit={r.unit} dashIfZero />,
    },
    {
      key: "issued",
      header: "Issued",
      align: "right",
      cell: (r) => <Qty value={r.issued} unit={r.unit} dashIfZero />,
    },
    {
      key: "in",
      header: "Transferred in",
      align: "right",
      cell: (r) => <Qty value={r.transferred_in} unit={r.unit} dashIfZero />,
    },
    {
      key: "out",
      header: "Transferred out",
      align: "right",
      cell: (r) => <Qty value={r.transferred_out} unit={r.unit} dashIfZero />,
    },
    {
      key: "gate",
      header: "Out on gate pass",
      align: "right",
      cell: (r) => (
        <Qty
          value={r.on_gate_pass}
          unit={r.unit}
          dashIfZero
          className={r.on_gate_pass > 0 ? "text-warning" : undefined}
        />
      ),
    },
    {
      key: "reorder",
      header: "Reorder level",
      align: "right",
      cell: (r) => <Qty value={r.reorder_level} unit={r.unit} dashIfZero />,
    },
  ];

  const ledgerColumns: Array<Column<StockLedgerEntry>> = [
    { key: "date", header: "Date", cell: (r) => formatDate(r.movement_date) },
    {
      key: "material",
      header: "Material",
      primary: true,
      cell: (r) => lookup.material(r.material_id),
    },
    {
      key: "type",
      header: "Movement",
      secondary: true,
      cell: (r) => movementLabel(r.movement_type),
    },
    ...(multiStore && !storeId
      ? [
          {
            key: "store",
            header: "Store",
            cell: (r: StockLedgerEntry) =>
              stores.find((s) => s.id === r.store_id)?.name ?? "—",
          },
        ]
      : []),
    {
      key: "in",
      header: "In",
      align: "right" as const,
      cell: (r: StockLedgerEntry) => (
        <Qty value={r.quantity_in} unit={lookup.materialUnit(r.material_id)} dashIfZero />
      ),
    },
    {
      key: "out",
      header: "Out",
      align: "right" as const,
      cell: (r: StockLedgerEntry) => (
        <Qty value={r.quantity_out} unit={lookup.materialUnit(r.material_id)} dashIfZero />
      ),
    },
    {
      key: "balance",
      header: "Balance",
      align: "right" as const,
      cell: (r: StockLedgerEntry) => (
        <Qty value={r.balance_quantity} unit={lookup.materialUnit(r.material_id)} />
      ),
    },
    {
      key: "ref",
      header: "Against",
      cell: (r: StockLedgerEntry) => r.remarks || "—",
    },
  ];

  return (
    <div>
      <PageHeader
        resource="stock_position"
        title={access.meta.label}
        description="What each store holds, worked out from its GRNs, issues, transfers and gate passes. Quantities only."
        team={access.ownerTeam}
        outsideNav={access.outsideNav}
        stepCodes={access.meta.step_codes}
        owned={access.owned}
      />
      <HydrationGate>
        <div className="space-y-8">
          {multiStore ? (
            // One scrolling row, never a wrapping block: the strip owns both the
            // no-wrap and the no-shrink.
            <ScrollStrip className="-mb-px items-center gap-1 border-b border-border">
              <StoreTab
                label="All stores"
                active={storeId === ""}
                onClick={() => setStoreId("")}
              />
              {stores.map((s) => (
                <StoreTab
                  key={s.id}
                  label={s.name}
                  active={storeId === s.id}
                  onClick={() => setStoreId(s.id)}
                />
              ))}
            </ScrollStrip>
          ) : null}

          <section>
            <SectionHeading
              title="Position"
              description={
                lowCount > 0
                  ? `${lowCount} material${lowCount > 1 ? "s are" : " is"} below its reorder level${outOnPass > 0 ? `, and ${outOnPass} ${outOnPass > 1 ? "are" : "is"} partly out on a gate pass` : ""}.`
                  : outOnPass > 0
                    ? `Everything is above its reorder level; ${outOnPass} material${outOnPass > 1 ? "s are" : " is"} partly out on a gate pass.`
                    : "Everything is above its reorder level."
              }
            />
            <DataTable
              columns={columns}
              rows={position}
              rowKey={(r) => `${r.store_id}:${r.material_id}`}
              emptyMessage="Nothing has moved through this store yet. A GRN is what puts the first row here."
            />
          </section>

          <section>
            <SectionHeading
              title="Movements"
              description="Every receipt, issue, transfer and gate pass behind the position above, in date order."
            />
            <Latest rows={movements} noun="movements">
              {(shown) => (
                <DataTable
                  columns={ledgerColumns}
                  rows={shown}
                  rowKey={(r) => r.id}
                  emptyMessage="No stock movements yet. Post a GRN or issue material to see them here."
                />
              )}
            </Latest>
          </section>
        </div>
      </HydrationGate>
    </div>
  );
}

function StoreTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

const LATEST = 25;

/** A long register shows its latest rows, with the rest one tap away. */
function Latest<T>({
  rows,
  noun,
  children,
}: {
  rows: T[];
  noun: string;
  children: (rows: T[]) => React.ReactNode;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, LATEST);
  return (
    <>
      {children(shown)}
      {rows.length > LATEST ? (
        <div className="mt-2 flex justify-center">
          <Button variant="ghost" size="sm" onClick={() => setAll((v) => !v)}>
            {all ? `Show the latest ${LATEST}` : `Show all ${rows.length} ${noun}`}
          </Button>
        </div>
      ) : null}
    </>
  );
}
