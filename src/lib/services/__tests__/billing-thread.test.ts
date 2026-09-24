import { beforeEach, describe, expect, it } from "vitest";
import { daysAgoDate, daysAheadDate, today } from "@/lib/clock";
import {
  createSiteTask,
  markReadyToMeasure,
  submitDpr,
  workDoneVsBalance,
} from "@/lib/services/site-service";
import {
  createJointMeasurement,
  getIssuedVsMeasured,
  signJointMeasurement,
} from "@/lib/services/measurement-service";
import {
  actOnRaBill,
  contractorRunningAccount,
  createRaBill,
  handOverRaBill,
  submitRaBill,
} from "@/lib/services/billing-service";
import { budgetRaBills, budgetVsActual } from "@/lib/services/budget-service";
import { TDS_PERCENT } from "@/lib/domain";
import { HOD, PH, project, QS, QS_HEAD, reset, repos, SITE } from "./helpers";

beforeEach(reset);

/**
 * The whole billing thread in one pass:
 *
 *   A1 task -> A3 DPR -> A4 ready to measure -> C1 measure -> C1 sign
 *   -> C2 RA bill -> C3 QS (with an adjustment) -> C3 PH -> C4 QS Head
 *   -> C4 HoD -> C5 handover
 *
 * Every status, the revision log, the totals, the contractor running account
 * and Budget vs Actual are asserted along the way.
 */
describe("the full billing thread, A1 to C5", () => {
  it("cascades correctly from a daily report to accounts handover", async () => {
    const p = await project();

    // A line nobody has reported on yet, so the arithmetic starts from zero.
    const line = (await repos().workOrders.listLinesByProject(p.id)).find(
      (l) => l.done_qty === 0 && l.quantity > 200,
    )!;
    const wo = (await repos().workOrders.getById(line.work_order_id))!;
    const contractor = (await repos().contractors.getById(wo.contractor_id))!;

    const DAY_ONE = 60;
    const DAY_TWO = 40;
    const DONE = DAY_ONE + DAY_TWO;
    const MEASURED = 90;
    const CERTIFIED = 80;

    /* -------- A1: plan the task -------- */
    const task = await createSiteTask(
      {
        project_id: p.id,
        title: "Blockwork, Tower C second floor",
        work_order_id: wo.id,
        work_order_line_id: line.id,
        trade: "masonry",
        location_block: "Tower C",
        planned_start: daysAgoDate(6),
        planned_end: daysAheadDate(28),
      },
      await SITE(),
    );
    expect(task.status).toBe("planned");

    /* -------- A3: two days of reports -------- */
    const day1 = await submitDpr(
      {
        project_id: p.id,
        report_date: today(),
        weather: "Clear",
        progress: [
          { work_order_line_id: line.id, site_task_id: task.id, qty_done_today: DAY_ONE },
        ],
        labour: [{ contractor_id: contractor.id, trade: "mason", count: 14 }],
      },
      await SITE(),
    );
    expect(day1.work_progress[0].cumulative_quantity).toBe(DAY_ONE);
    // Reporting progress puts the task under way.
    expect((await repos().siteTasks.getById(task.id))!.status).toBe("in_progress");

    await submitDpr(
      {
        project_id: p.id,
        report_date: daysAheadDate(1),
        weather: "Humid",
        progress: [
          { work_order_line_id: line.id, site_task_id: task.id, qty_done_today: DAY_TWO },
        ],
        labour: [{ contractor_id: contractor.id, trade: "helper", count: 9 }],
      },
      await SITE(),
    );

    /* -------- A4: done is the sum of the reports -------- */
    let rows = await workDoneVsBalance(p.id);
    let row = rows.find((r) => r.work_order_line_id === line.id)!;
    expect(row.done_qty).toBe(DONE);
    expect(row.measured_qty).toBe(0);
    expect(row.balance_qty).toBeCloseTo(line.quantity - DONE, 3);
    expect(row.awaiting_measurement_qty).toBe(DONE);

    const flagged = await markReadyToMeasure(
      { work_order_line_id: line.id, ready_qty: MEASURED },
      await SITE(),
    );
    expect(flagged.ready_to_measure).toBe(true);
    expect(flagged.ready_qty).toBe(MEASURED);

    /* -------- C1: measure and sign -------- */
    const made = await createJointMeasurement(
      {
        project_id: p.id,
        work_order_id: wo.id,
        measurement_date: daysAheadDate(2),
        period_from: today(),
        period_to: daysAheadDate(1),
        lines: [{ work_order_line_id: line.id, measured_qty: MEASURED }],
      },
      await QS(),
    );
    expect(made.measurement.status).toBe("draft");
    expect(made.lines[0].previous_measured_qty).toBe(0);
    expect(made.lines[0].cumulative_measured_qty).toBe(MEASURED);
    expect(made.measurement.has_excess).toBe(false);

    const signed = await signJointMeasurement(
      {
        joint_measurement_id: made.measurement.id,
        contractor_signatory_name: contractor.contact_person,
        signed_on: daysAheadDate(2),
      },
      await QS(),
    );
    expect(signed.measurement.status).toBe("signed");

    rows = await workDoneVsBalance(p.id);
    row = rows.find((r) => r.work_order_line_id === line.id)!;
    expect(row.measured_qty).toBe(MEASURED);
    expect(row.ready_to_measure).toBe(false);

    /* -------- C2: the RA bill -------- */
    const { bill, lines } = await createRaBill(
      {
        project_id: p.id,
        work_order_id: wo.id,
        joint_measurement_ids: [made.measurement.id],
        bill_date: daysAheadDate(3),
        advance_recovery_amount: 5000,
        other_deductions_amount: 1200,
        other_deductions_reason: "Water and power charges",
      },
      await QS(),
    );

    expect(bill.status).toBe("draft");
    expect(bill.tds_percent).toBe(TDS_PERCENT[contractor.type]);
    expect(lines[0].rate).toBe(line.agreed_rate);
    expect(lines[0].claimed_qty).toBe(MEASURED);
    expect((await repos().measurements.getById(made.measurement.id))!.status).toBe("billed");

    /* -------- C3: submitted, all four rows open -------- */
    const submitted = await submitRaBill(bill.id, await QS());
    expect(submitted.bill.status).toBe("in_certification");
    expect(submitted.approvals).toHaveLength(4);
    expect(submitted.bill.current_sequence).toBe(1);

    /* -------- C3 step 1: the QS cuts a quantity -------- */
    const qsAct = await actOnRaBill(
      {
        ra_bill_id: bill.id,
        action: "approve",
        comment: "Lobby return wall measured twice — trimmed.",
        adjustments: [{ ra_bill_line_id: lines[0].id, certified_qty: CERTIFIED }],
      },
      await QS(),
    );
    expect(qsAct.revisions).toHaveLength(1);
    expect(qsAct.revisions[0].from_qty).toBe(MEASURED);
    expect(qsAct.revisions[0].to_qty).toBe(CERTIFIED);
    expect(qsAct.bill.current_sequence).toBe(2);
    expect(qsAct.bill.gross_amount).toBeCloseTo(CERTIFIED * line.agreed_rate, 2);

    /* -------- C3 step 2: the Project Head, cross-team -------- */
    const phAct = await actOnRaBill(
      { ra_bill_id: bill.id, action: "approve", comment: "Agrees with the site records." },
      await PH(),
    );
    expect(phAct.bill.current_sequence).toBe(3);
    expect(phAct.bill.current_step_code).toBe("C4");

    /* -------- C4 step 3 and 4 -------- */
    const qsHeadAct = await actOnRaBill(
      { ra_bill_id: bill.id, action: "approve", comment: "" },
      await QS_HEAD(),
    );
    expect(qsHeadAct.bill.current_sequence).toBe(4);

    const hodAct = await actOnRaBill(
      { ra_bill_id: bill.id, action: "approve", comment: "Approved for payment." },
      await HOD(),
    );
    expect(hodAct.bill.status).toBe("certified");
    expect(hodAct.bill.current_sequence).toBeNull();

    /* -------- The arithmetic holds -------- */
    const certified = hodAct.bill;
    const gross = CERTIFIED * line.agreed_rate;
    expect(certified.gross_amount).toBeCloseTo(gross, 2);
    expect(certified.retention_amount).toBeCloseTo((gross * wo.retention_percent) / 100, 1);
    expect(certified.tds_amount).toBeCloseTo((gross * TDS_PERCENT[contractor.type]) / 100, 1);
    expect(certified.total_deductions).toBeCloseTo(
      certified.retention_amount + certified.tds_amount + 5000 + 1200,
      1,
    );
    expect(certified.net_payable_amount).toBeCloseTo(gross - certified.total_deductions, 1);
    expect(certified.cumulative_gross_amount).toBeCloseTo(
      certified.previous_gross_amount + gross,
      2,
    );

    /* -------- A4 now shows the billed quantity -------- */
    rows = await workDoneVsBalance(p.id);
    row = rows.find((r) => r.work_order_line_id === line.id)!;
    expect(row.billed_qty).toBe(CERTIFIED);

    /* -------- The audit trail is complete -------- */
    const chain = await repos().approvals.listForEntity("ra_bill", bill.id);
    expect(chain).toHaveLength(4);
    expect(chain.every((a) => a.status === "approved")).toBe(true);
    expect(chain.map((a) => a.step_code)).toEqual(["C3", "C3", "C4", "C4"]);
    expect(chain[1].comment).toContain("site records");

    const revisions = await repos().raBills.listRevisionsByBill(bill.id);
    expect(revisions).toHaveLength(1);
    expect(revisions[0].comment).toContain("Lobby return wall");

    /* -------- Budget vs Actual picks the certification up -------- */
    const budget = await budgetVsActual(p.id);
    const budgetRow = budget.find((b) => b.boq_line_id === line.boq_line_id)!;
    expect(budgetRow.certified_amount).toBeGreaterThanOrEqual(gross - 1);
    expect(budgetRow.work_order_value).toBeGreaterThan(0);
    expect(budgetRow.total_budget).toBeCloseTo(
      budgetRow.material_budget_value + budgetRow.work_order_value,
      1,
    );
    expect(budgetRow.total_actual).toBeCloseTo(
      budgetRow.material_issued_value + budgetRow.certified_amount,
      1,
    );

    const drill = await budgetRaBills(p.id, line.boq_line_id);
    expect(drill.some((d) => d.bill_number === bill.bill_number)).toBe(true);

    /* -------- The contractor running account moves -------- */
    const account = (await contractorRunningAccount({ project_id: p.id })).find(
      (a) => a.work_order_id === wo.id,
    )!;
    expect(account.certified_amount).toBeGreaterThanOrEqual(gross - 1);
    expect(account.retention_held).toBeGreaterThanOrEqual(certified.retention_amount - 1);
    expect(account.tds_deducted).toBeGreaterThanOrEqual(certified.tds_amount - 1);
    expect(account.advances_recovered).toBeGreaterThanOrEqual(5000);
    expect(account.balance_to_bill).toBeCloseTo(
      account.order_value - account.certified_amount,
      2,
    );

    /* -------- Issued vs measured reacts to the new measurement -------- */
    const ivm = await getIssuedVsMeasured(p.id);
    const forLine = ivm.filter((r) => r.boq_line_id === line.boq_line_id);
    forLine.forEach((r) => {
      expect(r.measured_qty).toBeGreaterThanOrEqual(MEASURED);
      expect(r.theoretical_qty).toBeCloseTo(r.measured_qty * r.budget_qty_per_unit, 2);
    });

    /* -------- C5: handover -------- */
    const handed = await handOverRaBill(bill.id, await QS());
    expect(handed.status).toBe("handed_over");
    expect(handed.handed_over_at).not.toBeNull();

    /* -------- Every link in the chain is navigable -------- */
    expect(task.work_order_line_id).toBe(line.id);
    expect(day1.progress[0].work_order_line_id).toBe(line.id);
    expect(day1.progress[0].site_task_id).toBe(task.id);
    expect(made.lines[0].work_order_line_id).toBe(line.id);
    expect(made.lines[0].boq_line_id).toBe(line.boq_line_id);
    expect(lines[0].work_order_line_id).toBe(line.id);
    expect(lines[0].boq_line_id).toBe(line.boq_line_id);
    expect(bill.joint_measurement_ids).toContain(made.measurement.id);
    expect(revisions[0].ra_bill_line_id).toBe(lines[0].id);
  });
});

describe("the seed is a valid starting point for billing", () => {
  it("leaves a bill at every step of the chain", async () => {
    const p = await project();
    const bills = await repos().raBills.listByProject(p.id);
    const pending = bills
      .filter((b) => b.status === "in_certification")
      .map((b) => b.current_sequence);

    expect(pending).toContain(1);
    expect(pending).toContain(2);
    expect(pending).toContain(3);
    expect(pending).toContain(4);
    expect(bills.some((b) => b.status === "certified")).toBe(true);
    expect(bills.some((b) => b.status === "handed_over")).toBe(true);
    expect(bills.some((b) => b.status === "draft" && b.decision_comment.length > 0)).toBe(true);
  });

  it("has a revision recorded by the QS", async () => {
    const p = await project();
    const revisions = (await repos().raBills.listRevisions()).filter((r) => r.project_id === p.id);
    expect(revisions.length).toBeGreaterThan(0);
    expect(revisions[0].to_qty).toBeLessThan(revisions[0].from_qty);
    expect(revisions[0].sequence).toBe(1);
  });

  it("has a draft sheet, a signed unbilled sheet and one carrying an excess", async () => {
    const p = await project();
    const sheets = await repos().measurements.listByProject(p.id);
    expect(sheets.some((m) => m.status === "draft")).toBe(true);
    expect(sheets.some((m) => m.status === "signed")).toBe(true);
    expect(sheets.some((m) => m.has_excess)).toBe(true);
  });

  it("has reports for most of the fortnight, with dates missing", async () => {
    const p = await project();
    const dprs = await repos().dprs.listByProject(p.id);
    expect(dprs.length).toBeGreaterThanOrEqual(10);
    const dates = new Set(dprs.map((d) => d.report_date));
    // 14 days back, two of them deliberately unreported.
    expect(dates.size).toBe(dprs.length);
    expect(dprs.length).toBeLessThan(14);
  });

  it("has lines flagged ready to measure", async () => {
    const p = await project();
    const lines = await repos().workOrders.listLinesByProject(p.id);
    expect(lines.some((l) => l.ready_to_measure && l.ready_qty > 0)).toBe(true);
  });

  it("has contractors at both TDS rates", async () => {
    const bills = await repos().raBills.list();
    const rates = new Set(bills.map((b) => b.tds_percent));
    expect(rates.has(1)).toBe(true);
    expect(rates.has(2)).toBe(true);
  });

  it("has a BOQ line drawing more material than the measured work justifies", async () => {
    const p = await project();
    const rows = await getIssuedVsMeasured(p.id);
    expect(rows.some((r) => r.is_flagged)).toBe(true);
  });
});
