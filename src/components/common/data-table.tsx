"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "cn";
import { Card } from "@/components/ui/card";
import { EmptyRows } from "./empty-state";

/**
 * How many data columns a table shows before the rest go behind the row
 * expander.
 *
 * Thirteen columns of contractor master is not a table anyone reads; it is a
 * spreadsheet someone pasted into a page, and the two columns that matter are
 * lost among the eleven that do not. Columns are already written in order of
 * importance, so the cut is simply the first ten — and nothing is removed,
 * it moves one tap away.
 *
 * Chrome columns (the expander, the row actions) are not data and do not
 * count against it.
 */
const VISIBLE_COLUMNS = 10;

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  align?: "left" | "right";
  /** Used as the card title on mobile. Exactly one column should set this. */
  primary?: boolean;
  /** Secondary line under the title on mobile. */
  secondary?: boolean;
  /** Monetary column — suppressed entirely when the role cannot see values. */
  money?: boolean;
  className?: string;
};

/**
 * Read-only table. A real table from `md` up; stacked cards below, so nothing
 * ever scrolls horizontally on a phone.
 *
 * Past ten data columns the remainder moves behind a per-row expander. The
 * mobile card is unaffected — it was already a two-column list of every
 * field, which is the right shape on a phone whatever the count.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyMessage = "Nothing here yet.",
  showValues = true,
  caption,
  onRowClick,
  rowActions,
  empty,
}: {
  columns: Array<Column<T>>;
  rows: T[];
  rowKey: (row: T) => string;
  emptyMessage?: string;
  /** False hides every column flagged `money` (see can(role,'view_values',…)). */
  showValues?: boolean;
  caption?: string;
  /** Opens the row's record. Makes the whole row a button. */
  onRowClick?: (row: T) => void;
  /** Shown on hover at the right of a row — the one or two things done most. */
  rowActions?: (row: T) => ReactNode;
  /** Replaces the plain "nothing here" line with an EmptyState + action. */
  empty?: ReactNode;
}) {
  const cols = columns.filter((c) => showValues || !c.money);
  const primary = cols.find((c) => c.primary) ?? cols[0];
  const secondary = cols.find((c) => c.secondary);
  const rest = cols.filter(
    (c) => c !== primary && c !== secondary && c.header !== "",
  );

  /*
   * The desktop cut. Order is priority, so the first ten data columns stay on
   * the row and the rest fold away.
   *
   * A column with no header is not data — it is the row's action cell, which
   * several pages declare as a trailing Column rather than through
   * `rowActions`. Those are pinned to the row and never counted: folding the
   * Edit button into an expander would hide the one control the row is for.
   */
  const dataCols = cols.filter((c) => c.header !== "");
  const actionCols = cols.filter((c) => c.header === "");
  const shown = dataCols.slice(0, VISIBLE_COLUMNS);
  const folded = dataCols.slice(VISIBLE_COLUMNS);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const span =
    shown.length + actionCols.length + (folded.length > 0 ? 1 : 0) + (rowActions ? 1 : 0);

  if (rows.length === 0) {
    if (empty) return <>{empty}</>;
    return (
      <Card className="overflow-hidden">
        <EmptyRows message={emptyMessage} />
      </Card>
    );
  }

  return (
    <>
      {/* Desktop */}
      <Card className="hidden overflow-hidden py-0 md:block">
        {/*
          The scroll box. Horizontal scrolling is contained here rather than
          on the page body, and making it the vertical scroll box too is what
          gives the sticky header something to stick to — a thead cannot stick
          to the viewport from inside a horizontally scrolling container. Most
          tables are shorter than this and never engage it.
        */}
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full caption-bottom text-sm">
            <thead>
              <tr className="border-b border-border/70">
                {folded.length > 0 ? (
                  <th data-chrome scope="col" className="sticky top-0 z-10 w-0 bg-muted px-2" />
                ) : null}
                {shown.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    className={cn(
                      "sticky top-0 z-10 bg-muted px-4 py-3 text-xs font-medium tracking-wide whitespace-nowrap text-muted-foreground uppercase",
                      c.align === "right" ? "text-right" : "text-left",
                    )}
                  >
                    {c.header}
                  </th>
                ))}
                {actionCols.map((c) => (
                  <th
                    key={c.key}
                    data-chrome
                    scope="col"
                    className="sticky top-0 z-10 w-0 bg-muted px-4"
                  />
                ))}
                {rowActions ? (
                  <th data-chrome scope="col" className="sticky top-0 z-10 w-0 bg-muted px-4" />
                ) : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const id = rowKey(row);
                const isOpen = expanded.has(id);
                return (
                <>
                <tr
                  key={id}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onRowClick(row);
                          }
                        }
                      : undefined
                  }
                  className={cn(
                    // 48px minimum row height: a row you have to aim at is a
                    // row you mis-tap on a phone.
                    "group/row h-12 border-b border-border/50 transition-colors last:border-0 hover:bg-muted/40",
                    onRowClick &&
                      "cursor-pointer focus-visible:bg-muted focus-visible:outline-none",
                  )}
                >
                  {folded.length > 0 ? (
                    <td className="w-0 px-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-label={isOpen ? "Hide the other columns" : "Show the other columns"}
                        onClick={() => toggle(id)}
                        className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                      >
                        <ChevronDown
                          className={cn("size-4 transition-transform", isOpen && "rotate-180")}
                        />
                      </button>
                    </td>
                  ) : null}
                  {shown.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        "px-4 py-3 align-middle",
                        c.align === "right"
                          ? "text-right tabular-nums"
                          : "text-left",
                        c.className,
                      )}
                    >
                      {c.cell(row)}
                    </td>
                  ))}
                  {actionCols.map((c) => (
                    <td
                      key={c.key}
                      className="px-4 py-3 text-right whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {c.cell(row)}
                    </td>
                  ))}
                  {rowActions ? (
                    <td
                      className="px-4 py-3 text-right whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/*
                        Always visible, never hover-only: a hover-revealed
                        action is invisible on a touch screen and invisible in
                        a screenshot (audit, group 11). One pattern everywhere —
                        a primary quick action where the row is actionable, a
                        ghost "Open" otherwise.
                      */}
                      <span className="inline-flex items-center gap-1">{rowActions(row)}</span>
                    </td>
                  ) : null}
                </tr>
                {isOpen && folded.length > 0 ? (
                  <tr key={`${id}-more`} className="border-b border-border/50 bg-muted/20">
                    <td colSpan={span} className="px-4 py-3">
                      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 lg:grid-cols-4">
                        {folded.map((c) => (
                          <div key={c.key} className="min-w-0">
                            <dt className="text-xs tracking-wide text-muted-foreground uppercase">
                              {c.header}
                            </dt>
                            <dd className="mt-0.5 truncate text-sm">{c.cell(row)}</dd>
                          </div>
                        ))}
                      </dl>
                    </td>
                  </tr>
                ) : null}
                </>
                );
              })}
            </tbody>
          </table>
        </div>
        {caption ? (
          <p className="border-t border-border/60 px-4 py-2.5 text-xs text-muted-foreground">
            {caption}
          </p>
        ) : null}
      </Card>

      {/* Mobile */}
      <div className="grid gap-3 md:hidden">
        {rows.map((row) => (
          <Card
            key={rowKey(row)}
            size="sm"
            className={cn("px-4", onRowClick && "cursor-pointer")}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
          >
            <div className="mb-3">
              <div className="text-sm font-semibold text-foreground">
                {primary.cell(row)}
              </div>
              {secondary ? (
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {secondary.cell(row)}
                </div>
              ) : null}
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
              {rest.map((c) => (
                <div key={c.key} className="min-w-0">
                  <dt className="text-xs tracking-wide text-muted-foreground uppercase">
                    {c.header}
                  </dt>
                  <dd className="mt-0.5 truncate text-sm text-foreground">
                    {c.cell(row)}
                  </dd>
                </div>
              ))}
            </dl>
            {rowActions || actionCols.length > 0 ? (
              <div
                className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/50 pt-3"
                onClick={(e) => e.stopPropagation()}
              >
                {actionCols.map((c) => (
                  <span key={c.key}>{c.cell(row)}</span>
                ))}
                {rowActions?.(row)}
              </div>
            ) : null}
          </Card>
        ))}
        {caption ? (
          <p className="px-1 text-xs text-muted-foreground">{caption}</p>
        ) : null}
      </div>
    </>
  );
}
