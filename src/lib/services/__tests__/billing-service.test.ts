import { beforeEach, describe, expect, it } from "vitest";
import { daysAgoDate, today } from "@/lib/clock";
import {
  actOnRaBill,
  computeRaBillTotals,
  contractorRunningAccount,
  createRaBill,
  handOverRaBill,
  pendingStepFor,
  submitRaBill,
} from "@/lib/services/billing-service";
import { createJointMeasurement, signJointMeasurement } from "@/lib/services/measurement-service";
import { markReadyToMeasure } from "@/lib/services/site-service";
import { PermissionError, ValidationError } from "@/lib/services/types";
import { TDS_PERCENT } from "@/lib/domain";
import { HOD, PH, PO, project, QS, QS_HEAD, reset, repos, SITE } from "./helpers";

beforeEach(reset);

/** A signed, unbilled measurement on a work order, ready to be billed. */
async function signedMeasurement(measure = 6) {
  const p = await project();
  const line = (await repos().workOrders.listLinesByProject(p.id)).find(
    (l) => l.done_qty - l.measured_qty > measure,
  )!;
  const wo = (await repos().workOrders.getById(line.work_order_id))!;
  await markReadyToMeasure({ work_order_line_id: line.id, ready_qty: measure }, await SITE());
  const made = await createJointMeasurement(
    {
      project_id: p.id,
      work_order_id: wo.id,
      measurement_date: today(),
      period_from: daysAgoDate(20),
      period_to: today(),
      lines: [{ work_order_line_id: line.id, measured_qty: measure }],
    },
    await QS(),
  );
  await signJointMeasurement(
    {
      joint_measurement_id: made.measurement.id,
      contractor_signatory_name: "Prakash Shirodkar",
      signed_on: today(),
    },
    await QS(),
  );
  return { project: p, wo, line, measurement: made.measurement, measured: measure };
}

describe("computeRaBillTotals", () => {
  it("derives every figure from the certified lines", () => {
    const totals = computeRaBillTotals(
      [
        { certified_qty: 10, rate: 1000 },
        { certified_qty: 5, rate: 2000 },
      ],
      {
        previous_gross_amount: 50_000,
        retention_percent: 5,
        tds_percent: 2,
        advance_recovery_amount: 1000,
        other_deductions_amount: 500,
      },
    );
    expect(totals.gross_amount).toBe(20_000);
    expect(totals.cumulative_gross_amount).toBe(70_000);
    expect(totals.retention_amount).toBe(1000);
    expect(totals.tds_amount).toBe(400);
    expect(totals.total_deductions).toBe(2900);
    expect(totals.net_payable_amount).toBe(17_100);
  });
});

describe("createRaBill (C2)", () => {
  it("builds the bill at work-order rates and marks the measurement billed", async () => {
    const { project: p, wo, line, measurement, measured } = await signedMeasurement();
    const contractor = (await repos().contractors.getById(wo.contractor_id))!;

    const { bill, lines } = await createRaBill(
      {
        project_id: p.id,
        work_order_id: wo.id,
        joint_measurement_ids: [measurement.id],
        bill_date: today(),
      },
      await QS(),
    );

    expect(bill.status).toBe("draft");
    expect(bill.bill_number).toMatch(/^MSP\/RA\/WO-\d+\/RA-\d{2}$/);
    expect(bill.tds_percent).toBe(TDS_PERCENT[contractor.type]);
    expect(bill.retention_percent).toBe(wo.retention_percent);

    expect(lines).toHaveLength(1);
    expect(lines[0].rate).toBe(line.agreed_rate);
    expect(lines[0].claimed_qty).toBe(measured);
    expect(lines[0].certified_qty).toBe(measured);
    expect(bill.gross_amount).toBeCloseTo(measured * line.agreed_rate, 2);
    expect(bill.net_payable_amount).toBeCloseTo(
      bill.gross_amount - bill.total_deductions,
      2,
    );

    const after = (await repos().measurements.getById(measurement.id))!;
    expect(after.status).toBe("billed");
    expect(after.ra_bill_id).toBe(bill.id);
  });

  it("numbers bills sequentially within the work order", async () => {
    const first = await signedMeasurement(6);
    const a = await createRaBill(
      {
        project_id: first.project.id,
        work_order_id: first.wo.id,
        joint_measurement_ids: [first.measurement.id],
        bill_date: today(),
      },
      await QS(),
    );
    const existing = (await repos().raBills.listByWorkOrder(first.wo.id)).length;
    expect(a.bill.bill_sequence).toBe(existing);
    expect(a.bill.bill_number.endsWith(`RA-${String(existing).padStart(2, "0")}`)).toBe(true);
  });

  it("refuses the Site Engineer", async () => {
    const { project: p, wo, measurement } = await signedMeasurement();
    await expect(
      createRaBill(
        {
          project_id: p.id,
          work_order_id: wo.id,
          joint_measurement_ids: [measurement.id],
          bill_date: today(),
        },
        await SITE(),
      ),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("refuses a measurement that is not signed", async () => {
    const p = await project();
    const draft = (await repos().measurements.listByProject(p.id)).find(
      (m) => m.status === "draft",
    )!;
    await expect(
      createRaBill(
        {
          project_id: p.id,
          work_order_id: draft.work_order_id,
          joint_measurement_ids: [draft.id],
          bill_date: today(),
        },
        await QS(),
      ),
    ).rejects.toThrow(/only a signed, unbilled measurement/);
  });

  it("refuses other deductions with no reason", async () => {
    const { project: p, wo, measurement } = await signedMeasurement();
    await expect(
      createRaBill(
        {
          project_id: p.id,
          work_order_id: wo.id,
          joint_measurement_ids: [measurement.id],
          bill_date: today(),
          other_deductions_amount: 500,
        },
        await QS(),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("the C3-C4 chain", () => {
  async function billInChain() {
    const { project: p, wo, measurement, line, measured } = await signedMeasurement(8);
    const { bill } = await createRaBill(
      {
        project_id: p.id,
        work_order_id: wo.id,
        joint_measurement_ids: [measurement.id],
        bill_date: today(),
      },
      await QS(),
    );
    const submitted = await submitRaBill(bill.id, await QS());
    return { project: p, wo, line, measured, bill: submitted.bill };
  }

  it("submitting opens all four rows and points at sequence 1", async () => {
    const { bill } = await billInChain();
    expect(bill.status).toBe("in_certification");
    expect(bill.current_sequence).toBe(1);
    expect(bill.current_step_code).toBe("C3");

    const rows = await repos().approvals.listForEntity("ra_bill", bill.id);
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.required_role)).toEqual([
      "project_qs",
      "project_head",
      "qs_head",
      "hod",
    ]);
    expect(rows.every((r) => r.status === "pending")).toBe(true);
  });

  it("only the lowest pending sequence can act", async () => {
    const { bill } = await billInChain();
    // The chain is at sequence 1 (QS) — the QS Head holds sequence 3.
    await expect(
      actOnRaBill({ ra_bill_id: bill.id, action: "approve" }, await QS_HEAD()),
    ).rejects.toBeInstanceOf(PermissionError);
    await expect(
      actOnRaBill({ ra_bill_id: bill.id, action: "approve" }, await HOD()),
    ).rejects.toThrow(/waiting on project qs/);
  });

  it("refuses a role with no step in the chain at all", async () => {
    const { bill } = await billInChain();
    await expect(
      actOnRaBill({ ra_bill_id: bill.id, action: "approve" }, await PO()),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("an adjustment is logged and the totals follow it", async () => {
    const { bill, measured } = await billInChain();
    const lines = await repos().raBills.listLinesByBill(bill.id);
    const cut = Math.round(measured * 0.75 * 1000) / 1000;

    const result = await actOnRaBill(
      {
        ra_bill_id: bill.id,
        action: "approve",
        comment: "Trimmed to the measured area at the lobby.",
        adjustments: [{ ra_bill_line_id: lines[0].id, certified_qty: cut }],
      },
      await QS(),
    );

    expect(result.revisions).toHaveLength(1);
    expect(result.revisions[0].from_qty).toBe(measured);
    expect(result.revisions[0].to_qty).toBe(cut);
    expect(result.revisions[0].step_code).toBe("C3");
    expect(result.revisions[0].sequence).toBe(1);

    expect(result.lines[0].certified_qty).toBe(cut);
    expect(result.bill.gross_amount).toBeCloseTo(cut * lines[0].rate, 2);
    expect(result.bill.current_sequence).toBe(2);
    expect(result.bill.net_payable_amount).toBeCloseTo(
      result.bill.gross_amount - result.bill.total_deductions,
      2,
    );
  });

  it("refuses a certified quantity above what was claimed", async () => {
    const { bill, measured } = await billInChain();
    const lines = await repos().raBills.listLinesByBill(bill.id);
    await expect(
      actOnRaBill(
        {
          ra_bill_id: bill.id,
          action: "approve",
          comment: "More than measured",
          adjustments: [{ ra_bill_line_id: lines[0].id, certified_qty: measured + 10 }],
        },
        await QS(),
      ),
    ).rejects.toThrow(/exceeds the claimed/);
  });

  it("requires a comment to adjust, send back or reject", async () => {
    const { bill } = await billInChain();
    const lines = await repos().raBills.listLinesByBill(bill.id);
    await expect(
      actOnRaBill(
        {
          ra_bill_id: bill.id,
          action: "approve",
          adjustments: [{ ra_bill_line_id: lines[0].id, certified_qty: 1 }],
        },
        await QS(),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      actOnRaBill({ ra_bill_id: bill.id, action: "send_back" }, await QS()),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("sending back returns the bill to draft with the comment", async () => {
    const { bill } = await billInChain();
    await actOnRaBill({ ra_bill_id: bill.id, action: "approve", comment: "" }, await QS());
    const result = await actOnRaBill(
      { ra_bill_id: bill.id, action: "send_back", comment: "Re-measure the west elevation." },
      await PH(),
    );
    expect(result.bill.status).toBe("draft");
    expect(result.bill.current_sequence).toBeNull();
    expect(result.bill.decision_comment).toContain("west elevation");

    // Resubmitting reopens the same four rows rather than adding more.
    const again = await submitRaBill(bill.id, await QS());
    expect(again.bill.current_sequence).toBe(1);
    expect((await repos().approvals.listForEntity("ra_bill", bill.id))).toHaveLength(4);
  });

  it("HoD approval certifies the bill and advances billed_qty", async () => {
    const { bill, line, measured } = await billInChain();
    await actOnRaBill({ ra_bill_id: bill.id, action: "approve", comment: "" }, await QS());
    await actOnRaBill({ ra_bill_id: bill.id, action: "approve", comment: "" }, await PH());
    await actOnRaBill({ ra_bill_id: bill.id, action: "approve", comment: "" }, await QS_HEAD());
    const final = await actOnRaBill(
      { ra_bill_id: bill.id, action: "approve", comment: "" },
      await HOD(),
    );

    expect(final.bill.status).toBe("certified");
    expect(final.bill.current_sequence).toBeNull();
    expect(final.bill.certified_at).not.toBeNull();
    expect(await pendingStepFor(bill.id)).toBeNull();

    const after = (await repos().workOrders.listLines()).find((l) => l.id === line.id)!;
    expect(after.billed_qty).toBeCloseTo(line.billed_qty + measured, 3);
  });

  it("refuses to act on a bill that is not in the chain", async () => {
    const { project: p, wo, measurement } = await signedMeasurement();
    const { bill } = await createRaBill(
      {
        project_id: p.id,
        work_order_id: wo.id,
        joint_measurement_ids: [measurement.id],
        bill_date: today(),
      },
      await QS(),
    );
    await expect(
      actOnRaBill({ ra_bill_id: bill.id, action: "approve", comment: "" }, await QS()),
    ).rejects.toThrow(/not in the certification chain/);
  });
});

describe("handOverRaBill (C5)", () => {
  it("releases a certified bill to Accounts", async () => {
    const p = await project();
    const certified = (await repos().raBills.listByProject(p.id)).find(
      (b) => b.status === "certified",
    )!;
    const handed = await handOverRaBill(certified.id, await QS());
    expect(handed.status).toBe("handed_over");
    expect(handed.handed_over_at).not.toBeNull();
  });

  it("refuses a bill that is still in the chain", async () => {
    const p = await project();
    const inChain = (await repos().raBills.listByProject(p.id)).find(
      (b) => b.status === "in_certification",
    )!;
    await expect(handOverRaBill(inChain.id, await QS())).rejects.toThrow(
      /cannot move from "in_certification"/,
    );
  });

  it("refuses the Site Engineer", async () => {
    const p = await project();
    const certified = (await repos().raBills.listByProject(p.id)).find(
      (b) => b.status === "certified",
    )!;
    await expect(handOverRaBill(certified.id, await SITE())).rejects.toBeInstanceOf(
      PermissionError,
    );
  });
});

describe("contractorRunningAccount", () => {
  it("counts only bills that have cleared the chain", async () => {
    const p = await project();
    const rows = await contractorRunningAccount({ project_id: p.id });
    expect(rows.length).toBeGreaterThan(0);

    for (const row of rows) {
      expect(row.balance_to_bill).toBeCloseTo(row.order_value - row.certified_amount, 2);
      const bills = (await repos().raBills.listByWorkOrder(row.work_order_id)).filter(
        (b) => b.status === "certified" || b.status === "handed_over",
      );
      const expected = Math.round(bills.reduce((s, b) => s + b.gross_amount, 0) * 100) / 100;
      expect(row.certified_amount).toBeCloseTo(expected, 2);
    }
    expect(rows.some((r) => r.retention_held > 0)).toBe(true);
    expect(rows.some((r) => r.bills_in_chain > 0)).toBe(true);
  });
});
