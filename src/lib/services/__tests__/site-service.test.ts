import { beforeEach, describe, expect, it } from "vitest";
import {
  createSiteTask,
  markReadyToMeasure,
  submitDpr,
  updateSiteTaskStatus,
  workDoneVsBalance,
} from "@/lib/services/site-service";
import { PermissionError } from "@/lib/services/types";
import { daysAheadDate, today } from "@/lib/clock";
import { firstWorkOrder, lineWithProgress, PH, PO, project, reset, repos, SITE } from "./helpers";

beforeEach(reset);

/** Today is never seeded, so it is always free to file a report for. */
const FREE_DATE = today();

describe("createSiteTask (A1)", () => {
  it("plans a task against a priced work-order line", async () => {
    const p = await project();
    const { wo, lines } = await firstWorkOrder(p.id);

    const task = await createSiteTask(
      {
        project_id: p.id,
        title: "Shuttering, Tower C third floor",
        work_order_id: wo.id,
        work_order_line_id: lines[0].id,
        trade: "rcc",
        location_block: "Tower C",
        planned_start: daysAheadDate(1),
        planned_end: daysAheadDate(18),
      },
      await SITE(),
    );

    expect(task.status).toBe("planned");
    expect(task.work_order_line_id).toBe(lines[0].id);
    // The BOQ line is inherited from the work-order line, never typed.
    expect(task.boq_line_id).toBe(lines[0].boq_line_id);
    expect(task.assigned_contractor_id).toBe(wo.contractor_id);
    expect(task.progress_percent).toBe(0);
  });

  it("refuses the Project Head", async () => {
    const p = await project();
    const { wo, lines } = await firstWorkOrder(p.id);
    await expect(
      createSiteTask(
        {
          project_id: p.id,
          title: "Shuttering",
          work_order_id: wo.id,
          work_order_line_id: lines[0].id,
          trade: "rcc",
          planned_start: daysAheadDate(1),
          planned_end: daysAheadDate(18),
        },
        await PH(),
      ),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("refuses an end date before the start", async () => {
    const p = await project();
    const { wo, lines } = await firstWorkOrder(p.id);
    await expect(
      createSiteTask(
        {
          project_id: p.id,
          title: "Shuttering",
          work_order_id: wo.id,
          work_order_line_id: lines[0].id,
          trade: "rcc",
          planned_start: daysAheadDate(18),
          planned_end: daysAheadDate(1),
        },
        await SITE(),
      ),
    ).rejects.toThrow(/cannot finish before it starts/);
  });
});

describe("updateSiteTaskStatus (A1)", () => {
  it("walks planned -> in_progress -> completed", async () => {
    const p = await project();
    const task = (await repos().siteTasks.listByProject(p.id)).find((t) => t.status === "planned")!;
    const started = await updateSiteTaskStatus(task.id, "in_progress", await SITE());
    expect(started.status).toBe("in_progress");
    const done = await updateSiteTaskStatus(task.id, "completed", await SITE());
    expect(done.status).toBe("completed");
    expect(done.progress_percent).toBe(100);
  });

  it("refuses to jump straight from planned to completed", async () => {
    const p = await project();
    const task = (await repos().siteTasks.listByProject(p.id)).find((t) => t.status === "planned")!;
    await expect(updateSiteTaskStatus(task.id, "completed", await SITE())).rejects.toThrow(
      /cannot move from "planned"/,
    );
  });
});

describe("submitDpr (A3)", () => {
  it("files the day, advances done_qty and appends work progress", async () => {
    const p = await project();
    const line = await lineWithProgress(p.id);
    const before = line.done_qty;

    const result = await submitDpr(
      {
        project_id: p.id,
        report_date: FREE_DATE,
        weather: "Clear",
        remarks: "Good run on the slab.",
        progress: [{ work_order_line_id: line.id, qty_done_today: 25 }],
        labour: [
          { contractor_id: (await repos().contractors.list())[0].id, trade: "mason", count: 12 },
          { contractor_id: (await repos().contractors.list())[0].id, trade: "helper", count: 18 },
        ],
      },
      await SITE(),
    );

    expect(result.dpr.report_date).toBe(FREE_DATE);
    expect(result.dpr.total_labour_count).toBe(30);
    expect(result.dpr.total_progress_entries).toBe(1);
    expect(result.work_progress[0].cumulative_quantity).toBeCloseTo(before + 25, 3);

    const after = (await repos().workOrders.listLines()).find((l) => l.id === line.id)!;
    expect(after.done_qty).toBeCloseTo(before + 25, 3);
  });

  it("refuses a second report on the same day", async () => {
    const p = await project();
    const line = await lineWithProgress(p.id);
    const payload = {
      project_id: p.id,
      report_date: FREE_DATE,
      progress: [{ work_order_line_id: line.id, qty_done_today: 5 }],
    };
    await submitDpr(payload, await SITE());
    await expect(submitDpr(payload, await SITE())).rejects.toThrow(/already been filed/);
  });

  it("refuses the Purchase Officer", async () => {
    const p = await project();
    const line = await lineWithProgress(p.id);
    await expect(
      submitDpr(
        {
          project_id: p.id,
          report_date: FREE_DATE,
          progress: [{ work_order_line_id: line.id, qty_done_today: 5 }],
        },
        await PO(),
      ),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("refuses an empty report", async () => {
    const p = await project();
    await expect(
      submitDpr({ project_id: p.id, report_date: FREE_DATE }, await SITE()),
    ).rejects.toThrow(/at least one progress or labour entry/);
  });

  it("refuses the same work-order line twice on one day", async () => {
    const p = await project();
    const line = await lineWithProgress(p.id);
    await expect(
      submitDpr(
        {
          project_id: p.id,
          report_date: FREE_DATE,
          progress: [
            { work_order_line_id: line.id, qty_done_today: 5 },
            { work_order_line_id: line.id, qty_done_today: 7 },
          ],
        },
        await SITE(),
      ),
    ).rejects.toThrow(/appears twice/);
  });
});

describe("markReadyToMeasure (A4)", () => {
  it("flags the line with the quantity claimed ready", async () => {
    const p = await project();
    const line = (await repos().workOrders.listLinesByProject(p.id)).find(
      (l) => l.done_qty - l.measured_qty > 1 && !l.ready_to_measure,
    )!;
    const available = line.done_qty - line.measured_qty;

    const flagged = await markReadyToMeasure(
      { work_order_line_id: line.id, ready_qty: Math.floor(available / 2) },
      await SITE(),
    );
    expect(flagged.ready_to_measure).toBe(true);
    expect(flagged.ready_qty).toBe(Math.floor(available / 2));
  });

  it("refuses more than is done but unmeasured", async () => {
    const p = await project();
    const line = await lineWithProgress(p.id);
    await expect(
      markReadyToMeasure({ work_order_line_id: line.id, ready_qty: 999_999 }, await SITE()),
    ).rejects.toThrow(/done but not yet measured/);
  });

  it("refuses the Project Head", async () => {
    const p = await project();
    const line = await lineWithProgress(p.id);
    await expect(
      markReadyToMeasure({ work_order_line_id: line.id, ready_qty: 1 }, await PH()),
    ).rejects.toBeInstanceOf(PermissionError);
  });
});

describe("workDoneVsBalance (A4)", () => {
  it("reports done, measured, billed and balance per line", async () => {
    const p = await project();
    const rows = await workDoneVsBalance(p.id);
    expect(rows.length).toBeGreaterThan(0);

    for (const row of rows) {
      expect(row.balance_qty).toBeCloseTo(row.wo_qty - row.done_qty, 3);
      expect(row.awaiting_measurement_qty).toBeCloseTo(row.done_qty - row.measured_qty, 3);
      // Nothing can be billed that was never measured.
      expect(row.billed_qty).toBeLessThanOrEqual(row.measured_qty + 0.001);
    }
    expect(rows.some((r) => r.ready_to_measure)).toBe(true);
  });
});
