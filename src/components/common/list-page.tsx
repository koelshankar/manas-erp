"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import { cn } from "cn";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "./data-table";
import { ToneChip, type Tone } from "./status-chip";
import { ScrollStrip } from "./scroll-strip";

export type StatusTab = {
  key: string;
  label: string;
  tone?: Tone;
  /** Which rows belong to this tab. Omit on the "All" tab. */
  match?: (row: never) => boolean;
};

export type FilterChip = {
  key: string;
  label: string;
  /** Options shown when the chip is opened. `null` value clears the filter. */
  options: Array<{ value: string; label: string }>;
  value: string | null;
  onChange: (value: string | null) => void;
};

const PAGE_SIZE = 25;

/**
 * The shape every list in the app takes: status tabs with counts, a search
 * box, the filters that matter for this list, then the table.
 *
 * The tabs carry counts because the first question anyone asks a queue is "how
 * many are waiting on me", and reading that off a filtered table is work.
 */
export function ListPage<T>({
  rows,
  columns,
  rowKey,
  tabs,
  tabOf,
  searchIn,
  searchPlaceholder = "Search",
  filters,
  showValues = true,
  onRowClick,
  rowActions,
  empty,
  emptyMessage,
  caption,
}: {
  rows: T[];
  columns: Array<Column<T>>;
  rowKey: (row: T) => string;
  /** Status tabs, in workflow order. Omit for a list with no states. */
  tabs?: Array<{ key: string; label: string; tone?: Tone }>;
  /** Which tab a row belongs to. Required when `tabs` is given. */
  tabOf?: (row: T) => string;
  /** Fields the search box looks at. */
  searchIn?: (row: T) => Array<string | null | undefined>;
  searchPlaceholder?: string;
  filters?: FilterChip[];
  showValues?: boolean;
  onRowClick?: (row: T) => void;
  rowActions?: (row: T) => ReactNode;
  empty?: ReactNode;
  emptyMessage?: string;
  caption?: string;
}) {
  const [tab, setTab] = useState("all");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(0);

  const activeFilters = filters?.filter((f) => f.value !== null) ?? [];
  const filterKey = filters?.map((f) => f.value ?? "").join("|") ?? "";

  // Filtering that empties the current page must not leave the reader staring
  // at an empty table they cannot get out of.
  useEffect(() => setPage(0), [tab, term, filterKey]);

  const searched = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q || !searchIn) return rows;
    return rows.filter((r) =>
      searchIn(r).some((f) => (f ?? "").toLowerCase().includes(q)),
    );
  }, [rows, term, searchIn]);

  const counts = useMemo(() => {
    const out: Record<string, number> = { all: searched.length };
    if (tabs && tabOf) {
      tabs.forEach((t) => {
        out[t.key] = searched.filter((r) => tabOf(r) === t.key).length;
      });
    }
    return out;
  }, [searched, tabs, tabOf]);

  const filtered = useMemo(() => {
    if (!tabs || !tabOf || tab === "all") return searched;
    return searched.filter((r) => tabOf(r) === tab);
  }, [searched, tab, tabs, tabOf]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(
    page * PAGE_SIZE,
    page * PAGE_SIZE + PAGE_SIZE,
  );

  return (
    <div className="space-y-4">
      {tabs && tabOf ? (
        // One scrolling row, never a wrapping block: three rows of tabs pushed
        // the first datum off a phone screen (audit S1).
        <ScrollStrip className="-mb-px items-center gap-1 border-b border-border">
          <TabButton
            label="All"
            count={counts.all}
            active={tab === "all"}
            onClick={() => setTab("all")}
          />
          {tabs.map((t) => (
            <TabButton
              key={t.key}
              label={t.label}
              count={counts[t.key] ?? 0}
              tone={t.tone}
              active={tab === t.key}
              onClick={() => setTab(t.key)}
            />
          ))}
        </ScrollStrip>
      ) : null}

      {searchIn || (filters && filters.length > 0) ? (
        <div className="flex flex-wrap items-center gap-2">
          {searchIn ? (
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder={searchPlaceholder}
                className="pl-8"
                aria-label={searchPlaceholder}
              />
            </div>
          ) : null}
          {filters?.map((f) => (
            <FilterChipControl key={f.key} chip={f} />
          ))}
          {activeFilters.length > 0 || term ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setTerm("");
                filters?.forEach((f) => f.onChange(null));
              }}
            >
              Clear
            </Button>
          ) : null}
        </div>
      ) : null}

      <DataTable
        columns={columns}
        rows={pageRows}
        rowKey={rowKey}
        showValues={showValues}
        onRowClick={onRowClick}
        rowActions={rowActions}
        empty={filtered.length === 0 ? empty : undefined}
        emptyMessage={
          emptyMessage ??
          (term || activeFilters.length > 0
            ? "Nothing matches the filters you have set."
            : "Nothing here yet.")
        }
        caption={caption}
      />

      {pageCount > 1 ? (
        <div className="flex items-center justify-between gap-3">
          <p className="num text-xs text-muted-foreground">
            {page * PAGE_SIZE + 1}–
            {Math.min((page + 1) * PAGE_SIZE, filtered.length)} of{" "}
            {filtered.length}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pageCount - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TabButton({
  label,
  count,
  tone,
  active,
  onClick,
}: {
  label: string;
  count: number;
  tone?: Tone;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      <ToneChip tone={count > 0 ? (tone ?? "neutral") : "neutral"}>
        {count}
      </ToneChip>
    </button>
  );
}

/** A filter as a chip: label when clear, label + value when set. */
function FilterChipControl({ chip }: { chip: FilterChip }) {
  const selected = chip.options.find((o) => o.value === chip.value);
  return (
    <div className="flex items-center">
      <select
        value={chip.value ?? ""}
        onChange={(e) => chip.onChange(e.target.value || null)}
        aria-label={chip.label}
        className={cn(
          "h-8 rounded-lg border px-2.5 text-sm transition-colors",
          selected
            ? "border-primary/40 bg-secondary font-medium text-secondary-foreground"
            : "border-border bg-transparent text-muted-foreground hover:bg-muted",
        )}
      >
        <option value="">{chip.label}: all</option>
        {chip.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {selected ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Clear ${chip.label}`}
          onClick={() => chip.onChange(null)}
        >
          <X className="size-3.5" />
        </Button>
      ) : null}
    </div>
  );
}
