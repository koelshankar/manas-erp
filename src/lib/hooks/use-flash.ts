"use client";

import { create } from "zustand";

/**
 * Rows that were just written, so the list they land in can find them.
 *
 * `useServiceAction` flashes the id of whatever a service returns; every table
 * that renders that id highlights it for a few seconds and scrolls it into
 * view. This is view state — not demo data — which is why it is a store of its
 * own rather than a table, and why it counts ticks instead of reading the
 * clock.
 */
type FlashState = {
  ids: ReadonlySet<string>;
  /** Bumps on every flash so a list can tell "the same row, again". */
  tick: number;
  flash: (ids: string[]) => void;
};

const FLASH_MS = 4500;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export const useFlashStore = create<FlashState>((set, get) => ({
  ids: new Set(),
  tick: 0,
  flash: (ids) => {
    if (ids.length === 0) return;
    set({ ids: new Set([...get().ids, ...ids]), tick: get().tick + 1 });
    ids.forEach((id) => {
      const prior = timers.get(id);
      if (prior) clearTimeout(prior);
      timers.set(
        id,
        setTimeout(() => {
          timers.delete(id);
          const next = new Set(get().ids);
          next.delete(id);
          set({ ids: next });
        }, FLASH_MS),
      );
    });
  },
}));

/** The ids currently highlighted, and a counter that changes when one is added. */
export function useFlashed(): { ids: ReadonlySet<string>; tick: number } {
  const ids = useFlashStore((s) => s.ids);
  const tick = useFlashStore((s) => s.tick);
  return { ids, tick };
}

/** Pulls every `id` out of whatever a service returned: one record or a list. */
export function idsOfResult(result: unknown): string[] {
  const out: string[] = [];
  const visit = (v: unknown, depth: number) => {
    if (!v || typeof v !== "object" || depth > 1) return;
    if (Array.isArray(v)) {
      v.forEach((x) => visit(x, depth + 1));
      return;
    }
    const id = (v as { id?: unknown }).id;
    if (typeof id === "string") out.push(id);
  };
  visit(result, 0);
  return out;
}
