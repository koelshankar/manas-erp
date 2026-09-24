"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { DemoDatabase, TableName } from "@/lib/data";
import { useDemoStore } from "@/lib/data/local";
import { getRepositories } from "@/lib/data";

/**
 * Read-side hooks.
 *
 * Components never touch the Zustand store directly — they use these. The
 * hooks are the seam that a Supabase swap replaces with react-query or
 * server components; the return shape `{ data, loading }` stays the same.
 */

/** True once localStorage has been read back. Guards hydration mismatches. */
export function useIsHydrated(): boolean {
  const hydrated = useDemoStore((s) => s.hydrated);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted && hydrated;
}

/**
 * Shared empty result. Returning a fresh `[]` before hydration would change
 * identity on every render, which quietly breaks any useMemo or useEffect that
 * depends on these rows.
 */
const EMPTY: readonly never[] = [];

/**
 * Subscribes to one table. Returns `[]` until hydration completes so the
 * server-rendered markup and the first client render always agree.
 *
 * The identity is stable between mutations: the store replaces a table's array
 * only when something in it actually changed.
 */
export function useAllRows<K extends TableName>(table: K): DemoDatabase[K] {
  const hydrated = useIsHydrated();
  const rows = useDemoStore((s) => s.db[table]);
  return (hydrated ? rows : EMPTY) as DemoDatabase[K];
}

/** Subscribes to one table, filtered to a project. Identity is stable too. */
export function useProjectRows<K extends TableName>(
  table: K,
  project_id: string | undefined,
): DemoDatabase[K] {
  const rows = useAllRows(table);
  return useMemo(() => {
    if (!project_id) return EMPTY as unknown as DemoDatabase[K];
    return (rows as unknown as Array<{ project_id?: string }>).filter(
      (r) => r.project_id === project_id,
    ) as unknown as DemoDatabase[K];
  }, [rows, project_id]);
}

export type AsyncResult<T> = { data: T | null; loading: boolean; error: Error | null };

/**
 * Runs an arbitrary repository query. Use this when a screen needs something
 * the table hooks above cannot express (joins, roll-ups, ordering).
 */
export function useRepositoryQuery<T>(
  run: (repos: ReturnType<typeof getRepositories>) => Promise<T>,
  deps: unknown[],
): AsyncResult<T> {
  const hydrated = useIsHydrated();
  const version = useDemoStore((s) => s.db);
  const [state, setState] = useState<AsyncResult<T>>({ data: null, loading: true, error: null });

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    run(getRepositories())
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((error: Error) => {
        if (!cancelled) setState({ data: null, loading: false, error });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, version, ...deps]);

  return state;
}

/** The project id from the current /projects/[projectId]/… route. */
export function useProjectId(): string {
  const params = useParams<{ projectId: string }>();
  return params?.projectId ?? "";
}
