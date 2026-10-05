import { z } from "zod";
import { project_scoped_shape } from "./primitives";

/**
 * The construction programme — a dated WBS the site tasks and work orders
 * run against. Read-only in this phase: it is written once (seeded, or
 * imported from a spreadsheet) and nothing in the app edits a row after.
 *
 * Hierarchy is `parent_id`, exactly as a WBS import gives it — a tower, then
 * an activity, then (for the finishing trades) a 1st Stage / 2nd Stage split.
 * `sequence` is the row's position among its siblings, which is what import
 * order and the on-screen order both read.
 *
 * `boq_line_id` is nullable: a summary row (a tower, a phase) has no
 * quantity of its own to link, only the leaf activities that roll up into it
 * do.
 */
export const programmeTaskSchema = z.object({
  ...project_scoped_shape,
  parent_id: z.string().nullable(),
  /** The row id as the source programme gives it, e.g. "1.2.3" — not a uuid. */
  wbs_code: z.string(),
  sequence: z.number(),
  name: z.string(),
  start_date: z.string(),
  end_date: z.string(),
  duration_days: z.number(),
  boq_line_id: z.string().nullable(),
});
export type ProgrammeTask = z.infer<typeof programmeTaskSchema>;

/** Derived, never stored — a row has no status column to drift from its dates. */
export const PROGRAMME_TASK_STATES = ["not_started", "in_progress", "completed"] as const;
export type ProgrammeTaskState = (typeof PROGRAMME_TASK_STATES)[number];
