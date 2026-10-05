import { z } from "zod";
import { getRepositories } from "@/lib/data";
import { newId, type ProgrammeTask, type ProgrammeTaskState } from "@/lib/domain";
import { assertCan, parseInput, required } from "./guards";
import { ValidationError, type ActingUser } from "./types";

/**
 * The construction programme — read-only in this phase. The one write path is
 * `importProgramme`, which replaces a project's whole programme in one go;
 * nothing edits a row afterwards.
 */

/** Not stored — `ProgrammeTask` has no status column, so this is the only writer of state. */
export function programmeTaskState(
  task: { start_date: string; end_date: string },
  todayDate: string,
): ProgrammeTaskState {
  if (todayDate < task.start_date) return "not_started";
  if (todayDate > task.end_date) return "completed";
  return "in_progress";
}

/** A leaf's percent through its own span, for the Gantt bar — 0 before it starts, 100 once past. */
export function programmeTaskPercentElapsed(
  task: { start_date: string; end_date: string },
  todayDate: string,
): number {
  const start = Date.parse(task.start_date);
  const end = Date.parse(task.end_date);
  const now = Date.parse(todayDate);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.max(0, Math.min(100, Math.round(((now - start) / (end - start)) * 100)));
}

/* ------------------------------------------------------------------ */
/* Hierarchy                                                           */
/* ------------------------------------------------------------------ */

export type ProgrammeTreeNode = ProgrammeTask & { children: ProgrammeTreeNode[] };

/** Nests the flat, parent_id-linked rows into a tree, siblings in `sequence` order. */
export function buildProgrammeTree(tasks: ProgrammeTask[]): ProgrammeTreeNode[] {
  const byId = new Map<string, ProgrammeTreeNode>(
    tasks.map((t) => [t.id, { ...t, children: [] }]),
  );
  const roots: ProgrammeTreeNode[] = [];
  byId.forEach((node) => {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  });
  const bySequence = (a: ProgrammeTreeNode, b: ProgrammeTreeNode) => a.sequence - b.sequence;
  roots.sort(bySequence);
  byId.forEach((node) => node.children.sort(bySequence));
  return roots;
}

export type FlatProgrammeRow = {
  task: ProgrammeTask;
  depth: number;
  has_children: boolean;
  collapsed: boolean;
};

/**
 * Depth-first order, skipping the subtree under a collapsed row — what both
 * the virtualised Gantt and the mobile list render from, so the two can never
 * disagree about row order.
 */
export function flattenProgrammeTree(
  tree: ProgrammeTreeNode[],
  collapsedIds: ReadonlySet<string>,
  depth = 0,
): FlatProgrammeRow[] {
  const out: FlatProgrammeRow[] = [];
  for (const node of tree) {
    const has_children = node.children.length > 0;
    const collapsed = has_children && collapsedIds.has(node.id);
    out.push({ task: node, depth, has_children, collapsed });
    if (has_children && !collapsed) {
      out.push(...flattenProgrammeTree(node.children, collapsedIds, depth + 1));
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Import                                                              */
/* ------------------------------------------------------------------ */

/**
 * One row off the uploaded sheet, after column mapping. `wbs_code` is the
 * source ID column verbatim (e.g. "1.2.3") — hierarchy is read off it by
 * trimming its last dotted segment, so a flat sheet (no dots) imports as a
 * flat list rather than failing.
 */
export const programmeImportRow = z.object({
  wbs_code: z.string().min(1),
  name: z.string().min(1),
  start_date: z.string().min(1),
  end_date: z.string().min(1),
  duration_days: z.number().min(0),
  boq_line_id: z.string().nullable().optional(),
});
export type ProgrammeImportRow = z.infer<typeof programmeImportRow>;

export const programmeImportInput = z.object({
  project_id: z.string().min(1),
  rows: z.array(programmeImportRow).min(1, "the sheet has no rows to import"),
});
export type ProgrammeImportInput = z.input<typeof programmeImportInput>;

/** The row's parent wbs_code, or null for a top-level row ("1.2" -> "1", "1" -> null). */
export function parentWbsCode(wbs_code: string): string | null {
  const i = wbs_code.lastIndexOf(".");
  return i === -1 ? null : wbs_code.slice(0, i);
}

/**
 * Turns mapped sheet rows into programme tasks, wiring `parent_id` from the
 * wbs hierarchy. Pure, so the seed and the import dialog's preview share it.
 */
export function buildProgrammeTasks(
  project_id: string,
  rows: ProgrammeImportRow[],
): Array<Omit<ProgrammeTask, "created_at" | "updated_at">> {
  const idByCode = new Map<string, string>();
  rows.forEach((r) => idByCode.set(r.wbs_code, newId()));

  return rows.map((r, i) => {
    if (r.end_date < r.start_date) {
      throw new ValidationError(
        `row ${i + 1} (${r.wbs_code}): finish date is before the start date`,
      );
    }
    const parentCode = parentWbsCode(r.wbs_code);
    return {
      id: idByCode.get(r.wbs_code)!,
      project_id,
      parent_id: parentCode ? idByCode.get(parentCode) ?? null : null,
      wbs_code: r.wbs_code,
      sequence: i,
      name: r.name,
      start_date: r.start_date,
      end_date: r.end_date,
      duration_days: r.duration_days,
      boq_line_id: r.boq_line_id ?? null,
    };
  });
}

/** Replaces the project's whole programme with the imported sheet. */
export async function importProgramme(
  input: ProgrammeImportInput,
  actor: ActingUser,
): Promise<ProgrammeTask[]> {
  assertCan(actor, "create", "programme");
  const data = parseInput(programmeImportInput, input);
  const repos = getRepositories();
  required(await repos.projects.getById(data.project_id), "Project");

  const tasks = buildProgrammeTasks(data.project_id, data.rows);
  return repos.programme.replaceForProject(data.project_id, tasks);
}

/** Clears a project's programme — the way back out of a bad import. */
export async function clearProgramme(
  project_id: string,
  actor: ActingUser,
): Promise<void> {
  assertCan(actor, "delete", "programme");
  await getRepositories().programme.replaceForProject(project_id, []);
}
