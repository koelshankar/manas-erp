"use client";

import { useMemo } from "react";
import { materialPositions, positionKey, type MaterialPosition } from "@/lib/services/budget-position";
import { useRepositoryQuery } from "./use-repository";

/**
 * Budget / indented / issued / balance / stock for every budgeted material on
 * a project, keyed so a form row can look its own numbers up synchronously.
 */
export function useMaterialPositions(project_id: string | undefined) {
  const { data, loading } = useRepositoryQuery<MaterialPosition[]>(
    async () => (project_id ? materialPositions(project_id) : []),
    [project_id],
  );

  return useMemo(() => {
    const rows = data ?? [];
    const byKey = new Map(rows.map((p) => [positionKey(p.boq_line_id, p.material_id), p]));
    return {
      loading,
      rows,
      /** Materials this BOQ line has a budget for. */
      materialsFor: (boq_line_id: string) =>
        rows.filter((p) => p.boq_line_id === boq_line_id).map((p) => p.material_id),
      get: (boq_line_id: string, material_id: string) =>
        byKey.get(positionKey(boq_line_id, material_id)) ?? null,
    };
  }, [data, loading]);
}
