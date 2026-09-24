import type { Role, Team, User } from "@/lib/domain";

/**
 * The session contract. Supabase auth will replace the implementation behind
 * `SessionProvider` — this shape must not change.
 */
export type Session = {
  user: User | null;
  role: Role;
  team: Team;
  /** Projects this user is posted to. Empty until the store has hydrated. */
  assigned_project_ids: string[];
  setRole: (role: Role) => void;
  /** False until localStorage has been read back. */
  ready: boolean;
};

export const DEFAULT_ROLE: Role = "project_head";

/** Where the role switcher remembers the demo user's last choice. */
export const ROLE_STORAGE_KEY = "manas-erp-role";
