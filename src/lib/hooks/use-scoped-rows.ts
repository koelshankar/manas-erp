"use client";

import { useMemo } from "react";
import type { Column } from "@/components/common/data-table";
import type { DemoDatabase, TableName } from "@/lib/data/database";
import type { Project } from "@/lib/domain";
import { useActiveProject } from "./use-active-project";
import { useAllRows } from "./use-repository";

/**
 * The rows a project list should show right now.
 *
 * One project for a role posted to one site, or every assigned project when
 * the switcher is on "All my projects" — which is the default for a portfolio
 * role. A QS Head covering three sites used to open the bill list and see one
 * of them, with nothing saying the other two existed (audit QH3).
 */
export function useScopedRows<K extends TableName>(table: K): DemoDatabase[K] {
  const rows = useAllRows(table);
  const { scopeProjectIds } = useActiveProject();
  const key = scopeProjectIds.join(",");

  return useMemo(() => {
    const ids = new Set(key ? key.split(",") : []);
    return (rows as unknown as Array<{ project_id?: string }>).filter((r) =>
      ids.has(r.project_id ?? ""),
    ) as unknown as DemoDatabase[K];
    // `key` is the stable stringification of scopeProjectIds.
  }, [rows, key]);
}

/**
 * The Project column a portfolio list needs, or null when there is only one
 * project in view and the column would repeat itself down the page.
 */
export function useProjectColumn<T extends { project_id: string }>(): Column<T> | null {
  const { isAll } = useActiveProject();
  const projects = useAllRows("projects") as Project[];
  const byId = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);

  return useMemo(() => {
    if (!isAll) return null;
    return {
      key: "project",
      header: "Project",
      secondary: true,
      className: "whitespace-nowrap",
      cell: (row: T) => byId.get(row.project_id) ?? "—",
    };
  }, [isAll, byId]);
}

/** Splices the Project column in after the document number, when there is one. */
export function withProjectColumn<T extends { project_id: string }>(
  columns: Array<Column<T>>,
  projectColumn: Column<T> | null,
  at = 1,
): Array<Column<T>> {
  if (!projectColumn) return columns;
  return [...columns.slice(0, at), projectColumn, ...columns.slice(at)];
}
