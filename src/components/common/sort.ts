import type { Column } from "./data-table";

/** The column a reader chose to sort by. Null means "the default order". */
export type SortState = { key: string; dir: "asc" | "desc" } | null;

type Stamped = { created_at?: string };

/** True when the rows carry a creation timestamp to order by. */
export function hasCreatedAt(rows: readonly unknown[]): boolean {
  return rows.length > 0 && typeof (rows[0] as Stamped).created_at === "string";
}

/**
 * The one ordering rule for lists: newest created first.
 *
 * Document numbers are sequences per project or per work order, so they cannot
 * order a list that spans projects — and they say nothing about which record
 * someone has just made. `created_at` does. A column the reader has clicked
 * overrides this; the default is not a lock.
 */
export function sortRows<T>(
  rows: T[],
  columns: Array<Column<T>>,
  sort: SortState,
  newestFirst: boolean,
): T[] {
  if (sort) {
    const col = columns.find((c) => c.key === sort.key);
    if (col?.sort) {
      const get = col.sort;
      const sign = sort.dir === "asc" ? 1 : -1;
      return [...rows].sort((a, b) => {
        const x = get(a);
        const y = get(b);
        if (x === y) return 0;
        if (x === null || x === undefined) return 1;
        if (y === null || y === undefined) return -1;
        return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "en", { numeric: true })) * sign;
      });
    }
  }
  if (newestFirst && hasCreatedAt(rows)) {
    return [...rows].sort((a, b) =>
      ((b as Stamped).created_at ?? "").localeCompare((a as Stamped).created_at ?? ""),
    );
  }
  return rows;
}
