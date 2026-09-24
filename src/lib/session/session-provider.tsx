"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Role, User } from "@/lib/domain";
import { ROLE_TEAM } from "@/config/permissions";
import { ROLES } from "@/lib/domain";
import { useAllRows, useIsHydrated } from "@/lib/hooks/use-repository";
import { DEFAULT_ROLE, ROLE_STORAGE_KEY, type Session } from "./types";

const SessionContext = createContext<Session | null>(null);

function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/**
 * Mock session. The role switcher in the top bar drives it.
 *
 * TODO(supabase): replace the internals with `supabase.auth.getUser()` plus a
 * `profiles` lookup for the role. Keep the exported `useSession()` shape.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>(DEFAULT_ROLE);
  const hydrated = useIsHydrated();
  const users = useAllRows("users");

  // Read the last-used role back after mount, never during render, so the
  // server markup and the first client render still agree.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(ROLE_STORAGE_KEY);
      if (isRole(stored)) setRoleState(stored);
    } catch {
      // Private browsing or blocked storage: stay on the default role.
    }
  }, []);

  const setRole = useCallback((next: Role) => {
    setRoleState(next);
    try {
      window.localStorage.setItem(ROLE_STORAGE_KEY, next);
    } catch {
      // Not being able to remember the choice is not worth failing over.
    }
  }, []);

  const value = useMemo<Session>(() => {
    const user = (users as User[]).find((u) => u.role === role) ?? null;
    return {
      user,
      role,
      team: ROLE_TEAM[role],
      assigned_project_ids: user?.assigned_project_ids ?? [],
      setRole,
      ready: hydrated,
    };
  }, [users, role, setRole, hydrated]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
