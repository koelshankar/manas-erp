import { getRepositories } from "@/lib/data";
import type { ProgrammeTaskState } from "@/lib/domain";
import { today } from "@/lib/clock";
import { programmeTaskPercentElapsed, programmeTaskState } from "../programme-service";
import type { QueryScope } from "./types";

/** One top-level WBS row of the programme, as the Overview draws it. */
export type ScheduleRow = {
  id: string;
  wbs_code: string;
  name: string;
  start_date: string;
  end_date: string;
  duration_days: number;
  state: ProgrammeTaskState;
  /** How far through its own span today sits, 0–100. Informational only. */
  percent_elapsed: number;
  /** Activities folded under this row. */
  activity_count: number;
};

export type ScheduleSummary = {
  project_id: string;
  /** Top-level rows only — the tree stays on Progress → Programme. */
  rows: ScheduleRow[];
  /** Every dated row in the programme, for "N activities" in the caption. */
  task_count: number;
  today: string;
};

/**
 * The programme, collapsed to its top level, for the project Overview.
 *
 * The programme is informational: it reads nothing but its own rows, and
 * nothing reads it. It is not wired into site tasks, work orders or billing,
 * which is exactly why it is safe to put in front of every role.
 */
export async function getScheduleSummary(scope: QueryScope): Promise<ScheduleSummary | null> {
  const project_id = scope.project_ids[0];
  if (!project_id) return null;
  const tasks = await getRepositories().programme.listByProject(project_id);
  const todayStr = today();
  const childCount = new Map<string, number>();
  tasks.forEach((t) => {
    if (t.parent_id) childCount.set(t.parent_id, (childCount.get(t.parent_id) ?? 0) + 1);
  });

  const rows = tasks
    .filter((t) => t.parent_id === null)
    .sort((a, b) => a.sequence - b.sequence)
    .map<ScheduleRow>((t) => ({
      id: t.id,
      wbs_code: t.wbs_code,
      name: t.name,
      start_date: t.start_date,
      end_date: t.end_date,
      duration_days: t.duration_days,
      state: programmeTaskState(t, todayStr),
      percent_elapsed: programmeTaskPercentElapsed(t, todayStr),
      activity_count: childCount.get(t.id) ?? 0,
    }));

  return { project_id, rows, task_count: tasks.length, today: todayStr };
}
