"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { today } from "@/lib/clock";
import { emptyDatabase, type DemoDatabase, type TableName } from "../database";
import { buildSeed } from "../seed";

export const STORAGE_KEY = "manas-erp-demo-v1";

/**
 * Shape of the persisted database.
 *
 * **Bump this whenever anything in `src/lib/domain` changes** — a new column, a
 * renamed field, a new table. A browser holding an older snapshot has rows of
 * the wrong shape, and code written against the current types will read
 * `undefined` off them. On a mismatch the store throws the snapshot away and
 * rebuilds from the seed, which is the right trade for a demo: there is no
 * user-authored data worth migrating field by field.
 */
const SCHEMA_VERSION = 12;

type PersistedState = {
  db: DemoDatabase;
  /** The day the seed was laid out for. See `isStale`. */
  seeded_on: string;
};

type DemoStore = {
  db: DemoDatabase;
  /** The day this data was seeded for. */
  seeded_on: string;
  /** localStorage has been read back. Components must not render data before this. */
  hydrated: boolean;
  markHydrated: () => void;
  mutate: (fn: (db: DemoDatabase) => void) => void;
  resetToSeed: () => void;
};

/**
 * Stand-in for localStorage outside the browser (SSR and tests). Nothing is
 * meant to survive there, so writes go nowhere and reads always miss.
 */
const memoryStorage: Storage = {
  length: 0,
  key: () => null,
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
};

/** True when a snapshot was laid out for a day that is no longer today. */
function isStale(saved: Partial<PersistedState>): boolean {
  return saved.seeded_on !== today();
}

function cloneDb(db: DemoDatabase): DemoDatabase {
  const next = {} as DemoDatabase;
  (Object.keys(db) as TableName[]).forEach((k) => {
    // Shallow-copy each table; rows themselves are replaced, never mutated.
    (next as Record<string, unknown[]>)[k] = [...(db[k] as unknown[])];
  });
  return next;
}

/**
 * The one and only Zustand store. Components must NEVER import this directly —
 * they go through services (writes) and repository-backed hooks (reads).
 */
export const useDemoStore = create<DemoStore>()(
  persist(
    (set) => ({
      db: buildSeed(),
      seeded_on: today(),
      hydrated: false,
      markHydrated: () => set({ hydrated: true }),
      mutate: (fn) =>
        set((state) => {
          const next = cloneDb(state.db);
          fn(next);
          return { db: next };
        }),
      resetToSeed: () => set({ db: buildSeed(), seeded_on: today() }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() =>
        typeof window === "undefined" ? memoryStorage : window.localStorage,
      ),
      partialize: (state) => ({ db: state.db, seeded_on: state.seeded_on }),
      version: SCHEMA_VERSION,
      /**
       * Only called when the stored version differs. There is nothing worth
       * salvaging from an older shape, so start again from the seed.
       */
      migrate: () => ({ db: buildSeed(), seeded_on: today() }),
      merge: (persisted, current) => {
        const saved = persisted as Partial<PersistedState> | undefined;
        // Seed dates are relative to the day they were laid out for. A snapshot
        // from an earlier day would show yesterday's DPR as today's and age
        // everything wrongly, so it is rebuilt rather than restored.
        if (!saved?.db || isStale(saved)) return { ...current, db: buildSeed(), seeded_on: today() };
        return { ...current, db: saved.db, seeded_on: saved.seeded_on ?? today() };
      },
      onRehydrateStorage: () => (state) => {
        state?.markHydrated();
      },
    },
  ),
);

/** Read the current database outside React. */
export function readDb(): DemoDatabase {
  return useDemoStore.getState().db;
}

/** Apply a mutation outside React. */
export function writeDb(fn: (db: DemoDatabase) => void): void {
  useDemoStore.getState().mutate(fn);
}

/** Restore the deterministic seed, discarding anything the demo user did. */
export function resetDemo(): void {
  useDemoStore.getState().resetToSeed();
}

/** Used by tests and by the SSR pass, where localStorage does not exist. */
export function freshDatabase(): DemoDatabase {
  return emptyDatabase();
}
