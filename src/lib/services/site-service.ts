import { z } from "zod";
import { getRepositories } from "@/lib/data";
import {
  SITE_TASK_TRANSITIONS,
  type Dpr,
  type DprLabourEntry,
  type DprProgressEntry,
  type LabourTrade,
  type SiteTask,
  type SiteTaskStatus,
  type WorkOrderLine,
  type WorkProgress,
} from "@/lib/domain";
import { LABOUR_TRADES, TRADES } from "@/lib/domain";
import { assertCan, assertTransition, parseInput, qty, required } from "./guards";
import { ValidationError, WorkflowError, type ActingUser } from "./types";

/* ------------------------------------------------------------------ */
/* A1 — site tasks                                                     */
/* ------------------------------------------------------------------ */

export const siteTaskInput = z.object({
  project_id: z.string().min(1),
  title: z.string().min(3, "give the task a title"),
  description: z.string().default(""),
  work_order_id: z.string().min(1, "pick a work order"),
  work_order_line_id: z.string().min(1, "pick the work-order line this delivers"),
  trade: z.enum(TRADES),
  location_block: z.string().default(""),
  planned_start: z.string().min(1, "a planned start is required"),
  planned_end: z.string().min(1, "a planned end is required"),
  assigned_contractor_id: z.string().nullable().default(null),
});

export type SiteTaskInput = z.input<typeof siteTaskInput>;

/** A1 — turns an upcoming work-order activity into a planned task on site. */
export async function createSiteTask(
  input: SiteTaskInput,
  actor: ActingUser,
): Promise<SiteTask> {
  assertCan(actor, "create", "site_tasks");
  const data = parseInput(siteTaskInput, input);
  const repos = getRepositories();

  const project = required(await repos.projects.getById(data.project_id), "Project");
  const workOrder = required(await repos.workOrders.getById(data.work_order_id), "Work order");
  const line = required(
    (await repos.workOrders.listLinesByWorkOrder(workOrder.id)).find(
      (l) => l.id === data.work_order_line_id,
    ),
    "Work-order line",
  );
  if (data.planned_end < data.planned_start) {
    throw new ValidationError("planned_end: cannot finish before it starts");
  }

  const existing = await repos.siteTasks.listByProject(project.id);
  const task_code = `${project.code}/T/${String(existing.length + 1).padStart(3, "0")}`;

  return repos.siteTasks.create({
    project_id: project.id,
    task_code,
    title: data.title,
    description: data.description,
    work_order_id: workOrder.id,
    work_order_line_id: line.id,
    boq_line_id: line.boq_line_id,
    trade: data.trade,
    location_block: data.location_block,
    planned_start: data.planned_start,
    planned_end: data.planned_end,
    status: "planned",
    assigned_contractor_id: data.assigned_contractor_id ?? workOrder.contractor_id,
    progress_percent: 0,
  });
}

export const updateSiteTaskInput = siteTaskInput.partial().extend({
  site_task_id: z.string().min(1),
});

export type UpdateSiteTaskInput = z.input<typeof updateSiteTaskInput>;

/** Edits the plan. Status is moved by updateSiteTaskStatus, never here. */
export async function updateSiteTask(
  input: UpdateSiteTaskInput,
  actor: ActingUser,
): Promise<SiteTask> {
  assertCan(actor, "edit", "site_tasks");
  const data = parseInput(updateSiteTaskInput, input);
  const repos = getRepositories();

  const task = required(await repos.siteTasks.getById(data.site_task_id), "Site task");
  const planned_start = data.planned_start ?? task.planned_start;
  const planned_end = data.planned_end ?? task.planned_end;
  if (planned_end < planned_start) {
    throw new ValidationError("planned_end: cannot finish before it starts");
  }

  return repos.siteTasks.update(task.id, {
    title: data.title ?? task.title,
    description: data.description ?? task.description,
    trade: data.trade ?? task.trade,
    location_block: data.location_block ?? task.location_block,
    planned_start,
    planned_end,
    assigned_contractor_id: data.assigned_contractor_id ?? task.assigned_contractor_id,
  });
}

/** A1 — planned -> in_progress -> completed. */
export async function updateSiteTaskStatus(
  site_task_id: string,
  status: SiteTaskStatus,
  actor: ActingUser,
): Promise<SiteTask> {
  assertCan(actor, "edit", "site_tasks");
  const repos = getRepositories();
  const task = required(await repos.siteTasks.getById(site_task_id), "Site task");
  assertTransition("Site task", SITE_TASK_TRANSITIONS, task.status, status);
  return repos.siteTasks.update(task.id, {
    status,
    progress_percent: status === "completed" ? 100 : status === "planned" ? 0 : task.progress_percent,
  });
}

/* ------------------------------------------------------------------ */
/* A3 — daily progress report                                          */
/* ------------------------------------------------------------------ */

export const dprProgressInput = z.object({
  work_order_line_id: z.string().min(1),
  site_task_id: z.string().nullable().default(null),
  qty_done_today: z.number().positive("quantity must be greater than zero"),
  remarks: z.string().default(""),
});

export const dprLabourInput = z.object({
  contractor_id: z.string().min(1),
  trade: z.enum(LABOUR_TRADES),
  count: z.number().int().positive("head count must be at least one"),
  remarks: z.string().default(""),
});

export const submitDprInput = z.object({
  project_id: z.string().min(1),
  report_date: z.string().min(1),
  weather: z.string().default(""),
  remarks: z.string().default(""),
  progress: z.array(dprProgressInput).default([]),
  labour: z.array(dprLabourInput).default([]),
});

export type SubmitDprInput = z.input<typeof submitDprInput>;

export type SubmitDprResult = {
  dpr: Dpr;
  progress: DprProgressEntry[];
  labour: DprLabourEntry[];
  /** One row per line touched, carrying the new running total. */
  work_progress: WorkProgress[];
};

/**
 * A3. One report per project per day.
 *
 * The progress entries are the only source of A4: each one appends a
 * WorkProgress row and advances WorkOrderLine.done_qty. Nothing else writes
 * either, so "work done" can always be traced back to a day's report.
 */
export async function submitDpr(
  input: SubmitDprInput,
  actor: ActingUser,
): Promise<SubmitDprResult> {
  assertCan(actor, "create", "dpr");
  const data = parseInput(submitDprInput, input);
  const repos = getRepositories();

  const project = required(await repos.projects.getById(data.project_id), "Project");
  if (await repos.dprs.getByDate(project.id, data.report_date)) {
    throw new WorkflowError(`A report has already been filed for ${data.report_date}.`);
  }
  if (data.progress.length === 0 && data.labour.length === 0) {
    throw new ValidationError("a report needs at least one progress or labour entry");
  }

  const woLines = await repos.workOrders.listLinesByProject(project.id);
  const lineById = new Map(woLines.map((l) => [l.id, l]));
  const contractors = await repos.contractors.list();
  const contractorIds = new Set(contractors.map((c) => c.id));

  const seenLines = new Set<string>();
  data.progress.forEach((entry, i) => {
    if (!lineById.has(entry.work_order_line_id)) {
      throw new ValidationError(`progress.${i}: not a work-order line on this project`);
    }
    if (seenLines.has(entry.work_order_line_id)) {
      throw new ValidationError(`progress.${i}: the same work-order line appears twice`);
    }
    seenLines.add(entry.work_order_line_id);
  });

  const seenLabour = new Set<string>();
  data.labour.forEach((entry, i) => {
    if (!contractorIds.has(entry.contractor_id)) {
      throw new ValidationError(`labour.${i}: unknown contractor`);
    }
    const key = `${entry.contractor_id}:${entry.trade}`;
    if (seenLabour.has(key)) {
      throw new ValidationError(`labour.${i}: this contractor and trade appear twice`);
    }
    seenLabour.add(key);
  });

  const dpr = await repos.dprs.create({
    project_id: project.id,
    report_date: data.report_date,
    prepared_by_user_id: actor.user_id,
    weather: data.weather,
    remarks: data.remarks,
    total_labour_count: data.labour.reduce((s, l) => s + l.count, 0),
    total_progress_entries: data.progress.length,
  });

  const progress: DprProgressEntry[] = [];
  const work_progress: WorkProgress[] = [];

  for (const entry of data.progress) {
    const line = lineById.get(entry.work_order_line_id)!;
    progress.push(
      await repos.dprs.createProgressEntry({
        project_id: project.id,
        dpr_id: dpr.id,
        site_task_id: entry.site_task_id,
        work_order_line_id: line.id,
        qty_done_today: qty(entry.qty_done_today),
        remarks: entry.remarks,
      }),
    );

    const cumulative = qty(line.done_qty + entry.qty_done_today);
    work_progress.push(
      await repos.workProgress.create({
        project_id: project.id,
        work_order_line_id: line.id,
        boq_line_id: line.boq_line_id,
        dpr_id: dpr.id,
        progress_date: data.report_date,
        quantity_done: qty(entry.qty_done_today),
        cumulative_quantity: cumulative,
        recorded_by_user_id: actor.user_id,
        remarks: entry.remarks,
      }),
    );
    await repos.workOrders.updateLine(line.id, { done_qty: cumulative });

    // A task that has been reported on is under way; one that has reached its
    // full work-order quantity is done.
    if (entry.site_task_id) {
      const task = await repos.siteTasks.getById(entry.site_task_id);
      if (task) {
        const next: SiteTaskStatus = cumulative >= line.quantity - 0.0005 ? "completed" : "in_progress";
        if (next !== task.status && (SITE_TASK_TRANSITIONS[task.status] ?? []).includes(next)) {
          await repos.siteTasks.update(task.id, {
            status: next,
            progress_percent:
              line.quantity > 0 ? Math.min(100, Math.round((cumulative / line.quantity) * 100)) : 0,
          });
        }
      }
    }
  }

  const labour: DprLabourEntry[] = [];
  for (const entry of data.labour) {
    labour.push(
      await repos.dprs.createLabourEntry({
        project_id: project.id,
        dpr_id: dpr.id,
        contractor_id: entry.contractor_id,
        trade: entry.trade as LabourTrade,
        count: entry.count,
        remarks: entry.remarks,
      }),
    );
  }

  return { dpr, progress, labour, work_progress };
}

/* ------------------------------------------------------------------ */
/* A4 — work done vs balance                                           */
/* ------------------------------------------------------------------ */

export const markReadyToMeasureInput = z.object({
  work_order_line_id: z.string().min(1),
  /** Quantity the site is claiming is ready for the QS to measure. */
  ready_qty: z.number().positive("say how much is ready"),
});

export type MarkReadyToMeasureInput = z.input<typeof markReadyToMeasureInput>;

/**
 * A4 -> C1. The Site Engineer flags a line ready, with the quantity claimed.
 * That is what puts it in front of the QS.
 */
export async function markReadyToMeasure(
  input: MarkReadyToMeasureInput,
  actor: ActingUser,
): Promise<WorkOrderLine> {
  assertCan(actor, "edit", "work_done");
  const data = parseInput(markReadyToMeasureInput, input);
  const repos = getRepositories();

  const line = required(
    (await repos.workOrders.listLines()).find((l) => l.id === data.work_order_line_id),
    "Work-order line",
  );

  const unmeasured = qty(line.done_qty - line.measured_qty);
  if (unmeasured <= 0) {
    throw new WorkflowError("Everything reported done on this line has already been measured.");
  }
  if (data.ready_qty > unmeasured + 0.0005) {
    throw new ValidationError(
      `ready_qty: only ${unmeasured} ${line.unit} is done but not yet measured`,
    );
  }

  return repos.workOrders.updateLine(line.id, {
    ready_to_measure: true,
    ready_qty: qty(data.ready_qty),
  });
}

/** Clears the flag once a measurement has consumed it. */
export async function clearReadyToMeasure(work_order_line_id: string): Promise<void> {
  await getRepositories().workOrders.updateLine(work_order_line_id, {
    ready_to_measure: false,
    ready_qty: 0,
  });
}

export type WorkDoneRow = {
  work_order_id: string;
  work_order_line_id: string;
  boq_line_id: string;
  description: string;
  unit: string;
  /** Work-order quantity — the contract. */
  wo_qty: number;
  /** Reported through DPRs. */
  done_qty: number;
  /** On signed joint measurements. */
  measured_qty: number;
  /** Certified through RA bills. */
  billed_qty: number;
  /** wo_qty less done_qty. */
  balance_qty: number;
  /** done_qty less measured_qty — what a measurement could still pick up. */
  awaiting_measurement_qty: number;
  ready_to_measure: boolean;
  ready_qty: number;
  agreed_rate: number;
  percent_done: number;
};

/** A4 — the read model behind Work Done vs Balance. */
export async function workDoneVsBalance(project_id: string): Promise<WorkDoneRow[]> {
  const repos = getRepositories();
  const [lines, boqLines] = await Promise.all([
    repos.workOrders.listLinesByProject(project_id),
    repos.boq.listByProject(project_id),
  ]);
  const boqById = new Map(boqLines.map((b) => [b.id, b]));

  return lines.map((line) => ({
    work_order_id: line.work_order_id,
    work_order_line_id: line.id,
    boq_line_id: line.boq_line_id,
    description: line.description || (boqById.get(line.boq_line_id)?.description ?? ""),
    unit: line.unit,
    wo_qty: line.quantity,
    done_qty: line.done_qty,
    measured_qty: line.measured_qty,
    billed_qty: line.billed_qty,
    balance_qty: qty(line.quantity - line.done_qty),
    awaiting_measurement_qty: qty(line.done_qty - line.measured_qty),
    ready_to_measure: line.ready_to_measure,
    ready_qty: line.ready_qty,
    agreed_rate: line.agreed_rate,
    percent_done: line.quantity > 0 ? Math.round((line.done_qty / line.quantity) * 1000) / 10 : 0,
  }));
}
