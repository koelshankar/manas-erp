"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Opens a record straight from a link: `…/gate-pass?open=<id>&act=…`.
 *
 * "My work", the Approvals inbox and the notification bell all know exactly
 * which document is waiting, so they link to it rather than to the list it sits
 * in. The page hands over its rows; when the one named appears (rows hydrate
 * after the first render) `onOpen` is called once with it and the optional act
 * to start at, and the parameters are stripped from the address so closing the
 * record does not reopen it.
 */
export function useDeepLink<T extends { id: string }>(
  rows: readonly T[],
  onOpen: (record: T, act: string | null) => void,
): void {
  const params = useSearchParams();
  const pathname = usePathname();
  const id = params?.get("open") ?? null;
  const act = params?.get("act") ?? null;
  const done = useRef<string | null>(null);

  useEffect(() => {
    if (!id || done.current === id) return;
    const hit = rows.find((r) => r.id === id);
    if (!hit) return;
    done.current = id;
    onOpen(hit, act);
    window.history.replaceState(null, "", pathname ?? window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, act, rows]);
}
