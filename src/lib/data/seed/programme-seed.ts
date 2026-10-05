import type { DemoDatabase } from "../database";
import type { ProgrammeTask } from "@/lib/domain";
import { daysAgoDate, daysAheadDate, sid } from "./ids";
import { next, type Counters } from "./project-seed";

/**
 * One project's construction programme — enough to prove the hierarchy and
 * the virtualised render without seeding the client's real 2,284-row WBS.
 * Three towers, ~15 activities each, the finishing trades split into a 1st
 * and 2nd Stage the way their own sheets do it.
 *
 * Durations are laid out relative to the project's own start/target so the
 * bars land where "today" actually is: Tower A is well past its finishes,
 * Tower B is mid-finishing, Tower C has barely started — a spread that only
 * holds together because every date here is `daysAgoDate` / `daysAheadDate`,
 * never a literal.
 */

type ActivityPlan = {
  name: string;
  /** Days from the tower's start to this activity's start. */
  offset: number;
  duration: number;
  /** Split into "1st Stage" / "2nd Stage" children rather than one bar. */
  staged?: boolean;
};

const TOWER_SPAN_DAYS = 560;

const ACTIVITIES: ActivityPlan[] = [
  { name: "Excavation & PCC", offset: 0, duration: 25 },
  { name: "Foundation RCC", offset: 20, duration: 45 },
  { name: "Plinth beam & backfilling", offset: 60, duration: 30 },
  { name: "RCC framework — slabs & columns", offset: 85, duration: 150 },
  { name: "Block work", offset: 200, duration: 70, staged: true },
  { name: "Internal plastering", offset: 260, duration: 60, staged: true },
  { name: "External plastering", offset: 270, duration: 55, staged: true },
  { name: "Waterproofing — terrace & wet areas", offset: 310, duration: 25 },
  { name: "IPS flooring", offset: 330, duration: 40, staged: true },
  { name: "Tile flooring", offset: 360, duration: 50, staged: true },
  { name: "Cornice works", offset: 390, duration: 30, staged: true },
  { name: "UPVC windows and doors", offset: 350, duration: 45, staged: true },
  { name: "CP and sanitary fixing", offset: 400, duration: 40, staged: true },
  { name: "Acid wash and grouting", offset: 480, duration: 20, staged: true },
  { name: "Painting & finishing touches", offset: 460, duration: 60 },
];

const TOWER_NAMES = ["Tower A", "Tower B", "Tower C"];

export function seedProgramme(
  db: DemoDatabase,
  project_id: string,
  plan: { started_days_ago: number; target_days_ahead: number },
  counters: Counters,
): void {
  const tasks: ProgrammeTask[] = [];

  // Towers hand over one after another, each starting a third of the way
  // into the previous tower's span rather than all breaking ground at once.
  TOWER_NAMES.forEach((towerName, towerIndex) => {
    const towerStartAgo = plan.started_days_ago - towerIndex * Math.round(TOWER_SPAN_DAYS / 3.2);
    const towerEndAgo = towerStartAgo - TOWER_SPAN_DAYS;
    const towerId = sid("programme_task", next(counters, "programme_task"));
    const towerSequence = towerIndex;

    tasks.push({
      id: towerId,
      created_at: daysAgoDate(plan.started_days_ago) + "T06:00:00.000Z",
      updated_at: daysAgoDate(plan.started_days_ago) + "T06:00:00.000Z",
      project_id,
      parent_id: null,
      wbs_code: String(towerIndex + 1),
      sequence: towerSequence,
      name: towerName,
      start_date: dateFromAgo(towerStartAgo),
      end_date: dateFromAgo(towerEndAgo),
      duration_days: TOWER_SPAN_DAYS,
      boq_line_id: null,
    });

    ACTIVITIES.forEach((activity, activityIndex) => {
      const activityWbs = `${towerIndex + 1}.${activityIndex + 1}`;
      const activityStartAgo = towerStartAgo - activity.offset;
      const activityEndAgo = activityStartAgo - activity.duration;

      if (!activity.staged) {
        tasks.push(
          buildTask(
            next(counters, "programme_task"),
            project_id,
            towerId,
            activityWbs,
            activityIndex,
            activity.name,
            activityStartAgo,
            activityEndAgo,
            activity.duration,
            plan.started_days_ago,
          ),
        );
        return;
      }

      const activityId = sid("programme_task", next(counters, "programme_task"));
      tasks.push({
        id: activityId,
        created_at: daysAgoDate(plan.started_days_ago) + "T06:00:00.000Z",
        updated_at: daysAgoDate(plan.started_days_ago) + "T06:00:00.000Z",
        project_id,
        parent_id: towerId,
        wbs_code: activityWbs,
        sequence: activityIndex,
        name: activity.name,
        start_date: dateFromAgo(activityStartAgo),
        end_date: dateFromAgo(activityEndAgo),
        duration_days: activity.duration,
        boq_line_id: null,
      });

      const stageDuration = Math.round(activity.duration / 2);
      ["1st Stage", "2nd Stage"].forEach((stageName, stageIndex) => {
        const stageStartAgo = activityStartAgo - stageIndex * stageDuration;
        const stageEndAgo = stageStartAgo - stageDuration;
        tasks.push({
          id: sid("programme_task", next(counters, "programme_task")),
          created_at: daysAgoDate(plan.started_days_ago) + "T06:00:00.000Z",
          updated_at: daysAgoDate(plan.started_days_ago) + "T06:00:00.000Z",
          project_id,
          parent_id: activityId,
          wbs_code: `${activityWbs}.${stageIndex + 1}`,
          sequence: stageIndex,
          name: stageName,
          start_date: dateFromAgo(stageStartAgo),
          end_date: dateFromAgo(stageEndAgo),
          duration_days: stageDuration,
          boq_line_id: null,
        });
      });
    });
  });

  db.programme_tasks.push(...tasks);
}

/** `daysAgoDate` for a positive offset, `daysAheadDate` once the offset runs negative. */
function dateFromAgo(daysAgo: number): string {
  return daysAgo >= 0 ? daysAgoDate(daysAgo) : daysAheadDate(-daysAgo);
}

function buildTask(
  rowNo: number,
  project_id: string,
  parent_id: string,
  wbs_code: string,
  sequence: number,
  name: string,
  startAgo: number,
  endAgo: number,
  duration: number,
  startedDaysAgo: number,
): ProgrammeTask {
  const ts = daysAgoDate(startedDaysAgo) + "T06:00:00.000Z";
  return {
    id: sid("programme_task", rowNo),
    created_at: ts,
    updated_at: ts,
    project_id,
    parent_id,
    wbs_code,
    sequence,
    name,
    start_date: dateFromAgo(startAgo),
    end_date: dateFromAgo(endAgo),
    duration_days: duration,
    boq_line_id: null,
  };
}
