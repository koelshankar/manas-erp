"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Role } from "@/lib/domain";
import {
  ROLE_TAB_ACCESS,
  WORKSPACE_TAB_KEYS,
  type RoleTabAccess,
  type WorkspaceTabKey,
} from "@/config/permissions";

/**
 * The editable copy of the role x tab matrix.
 *
 * `ROLE_TAB_ACCESS` in permissions.ts is the approved seed; this is the
 * overlay the Masters screen writes to, so a reader can turn a tab on for a
 * role and watch the workspace change under them. It is deliberately a
 * separate store from the demo database — it is configuration, not a record,
 * and it must survive `resetDemo()`.
 *
 * In Postgres this is a `role_tab_access` table read through the same
 * `projectTabsFor()`, and the Masters screen becomes writes against it.
 */
const STORAGE_KEY = "manas-erp-tab-access-v1";

/** Bump when WORKSPACE_TAB_KEYS or the roles change. */
const MATRIX_VERSION = 1;

type Overlay = Partial<Record<Role, Partial<RoleTabAccess>>>;

type TabAccessStore = {
  overlay: Overlay;
  hydrated: boolean;
  markHydrated: () => void;
  setTab: (role: Role, tab: WorkspaceTabKey, allowed: boolean) => void;
  resetMatrix: () => void;
};

const memoryStorage: Storage = {
  length: 0,
  key: () => null,
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
};

export const useTabAccessStore = create<TabAccessStore>()(
  persist(
    (set) => ({
      overlay: {},
      hydrated: false,
      markHydrated: () => set({ hydrated: true }),
      setTab: (role, tab, allowed) =>
        set((state) => ({
          overlay: {
            ...state.overlay,
            [role]: { ...state.overlay[role], [tab]: allowed },
          },
        })),
      resetMatrix: () => set({ overlay: {} }),
    }),
    {
      name: STORAGE_KEY,
      version: MATRIX_VERSION,
      storage: createJSONStorage(() =>
        typeof window === "undefined" ? memoryStorage : window.localStorage,
      ),
      partialize: (state) => ({ overlay: state.overlay }),
      onRehydrateStorage: () => (state) => state?.markHydrated(),
    },
  ),
);

/** The matrix as it currently stands: approved seed with the overlay on top. */
export function resolveTabAccess(role: Role, overlay: Overlay): RoleTabAccess {
  const seed = ROLE_TAB_ACCESS[role];
  const edits = overlay[role];
  if (!edits) return seed;
  const out = { ...seed };
  WORKSPACE_TAB_KEYS.forEach((key) => {
    const edited = edits[key];
    if (edited !== undefined) out[key] = edited;
  });
  return out;
}
