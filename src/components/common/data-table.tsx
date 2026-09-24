import type { ReactNode } from "react";
import { cn } from "cn";
import { Card } from "@/components/ui/card";
import { EmptyRows } from "./empty-state";

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
  const rest = cols.filter((c) => c !== primary && c !== secondary);

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
        <div className="overflow-x-auto">
          <table className="w-full caption-bottom text-sm">
            <thead>
              <tr className="border-b border-border/70 bg-muted/40">
                {cols.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    className={cn(
                      "px-4 py-3 text-xs font-medium tracking-wide whitespace-nowrap text-muted-foreground uppercase",
                      c.align === "right" ? "text-right" : "text-left",
                    )}
                  >
                    {c.header}
                  </th>
                ))}
                {rowActions ? <th scope="col" className="w-0 px-4" /> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={rowKey(row)}
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
                    "group/row border-b border-border/50 transition-colors last:border-0 hover:bg-muted/40",
                    onRowClick &&
                      "cursor-pointer focus-visible:bg-muted focus-visible:outline-none",
                  )}
                >
                  {cols.map((c) => (
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
              ))}
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
                  <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">
                    {c.header}
                  </dt>
                  <dd className="mt-0.5 truncate text-sm text-foreground">
                    {c.cell(row)}
                  </dd>
                </div>
              ))}
            </dl>
            {rowActions ? (
              <div
                className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/50 pt-3"
                onClick={(e) => e.stopPropagation()}
              >
                {rowActions(row)}
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
