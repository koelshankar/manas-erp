import type { Role, StepCode, Team } from "@/lib/domain";

/**
 * Read services for the dashboards.
 *
 * One function per widget, each taking a scope and returning a typed shape the
 * component only has to render. These are written to become SQL views or RPCs
 * later, so they never reach for anything a query could not.
 */
export type QueryScope = {
  role: Role;
  user_id: string;
  /**
   * Projects in play: the user's assignment, optionally narrowed further by
   * the dashboard's project filter.
   */
  project_ids: string[];
};

/** One row in the "Needs your action" panel. */
export type ActionItem = {
  /** Stable key: entity type + id + what is being asked for. */
  id: string;
  entity_type: string;
  entity_id: string;
  /** Chart step code, where the chart gives one. */
  step_code: StepCode | null;
  team: Team;
  /** What the role is being asked to do. */
  label: string;
  document_number: string;
  project_id: string;
  project_name: string;
  /** Secondary line — contractor, supplier, or what the document is for. */
  context: string;
  /** Absent when the role may not see values — stripped by redactMoney. */
  value?: number;
  /** The date the clock started on this item. */
  since: string;
  age_days: number;
  href: string;
  /** True for items shown for awareness that this role cannot act on. */
  read_only?: boolean;
};

/** Ageing bands used across the dashboards: amber over 3 days, red over 7. */
export type AgeBand = "fresh" | "warn" | "late";

export function ageBand(age_days: number): AgeBand {
  if (age_days > 7) return "late";
  if (age_days > 3) return "warn";
  return "fresh";
}

/** A number a widget renders, with where clicking it should go. */
export type Kpi = {
  key: string;
  label: string;
  /** Pre-formatted by the query so the component never decides. */
  display: string;
  hint?: string;
  href?: string;
  tone?: "neutral" | "good" | "warn" | "bad";
};
