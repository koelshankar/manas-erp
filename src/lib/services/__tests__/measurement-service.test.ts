import { beforeEach, describe, expect, it } from "vitest";
import { daysAgoDate, today } from "@/lib/clock";
import {
  createJointMeasurement,
  dimensionsFor,
  getIssuedVsMeasured,
  measuredQtyFromDimensions,
  signJointMeasurement,
} from "@/lib/services/measurement-service";
import { markReadyToMeasure } from "@/lib/services/site-service";
import { PermissionError, ValidationError } from "@/lib/services/types";
import { PH, project, QS, reset, repos, SITE } from "./helpers";
import type { Unit } from "@/lib/domain";

beforeEach(reset);

/** A dimension grid that multiplies out to `target` for the given unit. */
function gridFor(unit: Unit, target: number) {
  const needed = dimensionsFor(unit);
  if (needed.length === 0) return { nos: target, length: null, breadth: null, depth: null };
  const grid: { nos: number; length: number | null; breadth: number | null; depth: number | null } =
    { nos: 1, length: null, breadth: null, depth: null };
  // Put the whole quantity on the first dimension and leave the rest at 1.
  needed.forEach((dim, i) => {
    grid[dim] = i === 0 ? target : 1;
  });
  return grid;
}

/** A work-order line with unmeasured progress, plus its parent work order. */
async function measurableLine() {
  const p = await project();
  const line = (await repos().workOrders.listLinesByProject(p.id)).find(
    (l) => l.done_qty - l.measured_qty > 5,
  )!;
  const wo = (await repos().workOrders.getById(line.work_order_id))!;
  return { project: p, wo, line };
}

describe("dimension arithmetic", () => {
  it("uses only the dimensions the unit needs", () => {
    expect(dimensionsFor("cum")).toEqual(["length", "breadth", "depth"]);
    expect(dimensionsFor("sqm")).toEqual(["length", "breadth"]);
    expect(dimensionsFor("rmt")).toEqual(["length"]);
    expect(dimensionsFor("nos")).toEqual([]);
  });

  it("multiplies nos by those dimensions", () => {
    expect(measuredQtyFromDimensions("cum", { nos: 2, length: 3, breadth: 4, depth: 0.5 })).toBe(12);
    expect(measuredQtyFromDimensions("sqm", { nos: 4, length: 3, breadth: 2.5, depth: null })).toBe(30);
    expect(measuredQtyFromDimensions("nos", { nos: 6, length: null, breadth: null, depth: null })).toBe(6);
  });

  it("returns null when a needed dimension is missing", () => {
    expect(measuredQtyFromDimensions("cum", { nos: 2, length: 3, breadth: 4, depth: null })).toBeNull();
    expect(measuredQtyFromDimensions("sqm", { nos: null, length: 3, breadth: 2, depth: null })).toBeNull();
  });
});

describe("createJointMeasurement (C1)", () => {
  it("measures a ready line and numbers the sheet", async () => {
    const { project: p, wo, line } = await measurableLine();
    await markReadyToMeasure({ work_order_line_id: line.id, ready_qty: 5 }, await SITE());

    const { measurement, lines } = await createJointMeasurement(
      {
        project_id: p.id,
        work_order_id: wo.id,
        measurement_date: today(),
        period_from: daysAgoDate(20),
        period_to: today(),
        // Dimensions matched to the line's unit: cum needs L x B x D.
        lines: [{ work_order_line_id: line.id, ...gridFor(line.unit, 5) }],
      },
      await QS(),
    );

    expect(measurement.status).toBe("draft");
    expect(measurement.measurement_number).toMatch(/^MSP\/JM\/26-27\/\d{4}$/);
    expect(measurement.has_excess).toBe(false);
    expect(lines).toHaveLength(1);
    expect(lines[0].measured_qty).toBe(5);
    expect(lines[0].previous_measured_qty).toBe(line.measured_qty);
    expect(lines[0].agreed_rate).toBe(line.agreed_rate);
    // A draft moves nothing — signing does.
    const after = (await repos().workOrders.listLines()).find((l) => l.id === line.id)!;
    expect(after.measured_qty).toBe(line.measured_qty);
  });

  it("accepts a directly entered quantity for a lump-sum line", async () => {
    const { project: p, wo, line } = await measurableLine();
    const { lines } = await createJointMeasurement(
      {
        project_id: p.id,
        work_order_id: wo.id,
        measurement_date: today(),
        period_from: daysAgoDate(20),
        period_to: today(),
        lines: [{ work_order_line_id: line.id, measured_qty: 7.5 }],
      },
      await QS(),
    );
    expect(lines[0].measured_qty).toBe(7.5);
    expect(lines[0].is_manual_qty).toBe(true);
  });

  it("blocks an excess measure unless it is explained, then flags it", async () => {
    const { project: p, wo, line } = await measurableLine();
    const excess = line.quantity - line.measured_qty + 10;

    await expect(
      createJointMeasurement(
        {
          project_id: p.id,
          work_order_id: wo.id,
          measurement_date: today(),
          period_from: daysAgoDate(20),
          period_to: today(),
          lines: [{ work_order_line_id: line.id, measured_qty: excess }],
        },
        await QS(),
      ),
    ).rejects.toThrow(/needs a reason/);

    const { measurement, lines } = await createJointMeasurement(
      {
        project_id: p.id,
        work_order_id: wo.id,
        measurement_date: today(),
        period_from: daysAgoDate(20),
        period_to: today(),
        lines: [
          {
            work_order_line_id: line.id,
            measured_qty: excess,
            excess_reason: "Extra width instructed by the architect on site.",
          },
        ],
      },
      await QS(),
    );
    expect(measurement.has_excess).toBe(true);
    expect(lines[0].is_excess).toBe(true);
    expect(lines[0].excess_reason).toContain("architect");
  });

  it("refuses the Site Engineer", async () => {
    const { project: p, wo, line } = await measurableLine();
    await expect(
      createJointMeasurement(
        {
          project_id: p.id,
          work_order_id: wo.id,
          measurement_date: today(),
          period_from: daysAgoDate(20),
          period_to: today(),
          lines: [{ work_order_line_id: line.id, measured_qty: 1 }],
        },
        await SITE(),
      ),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("refuses a line from another work order", async () => {
    const { project: p, wo } = await measurableLine();
    const other = (await repos().workOrders.listLinesByProject(p.id)).find(
      (l) => l.work_order_id !== wo.id,
    )!;
    await expect(
      createJointMeasurement(
        {
          project_id: p.id,
          work_order_id: wo.id,
          measurement_date: today(),
          period_from: daysAgoDate(20),
          period_to: today(),
          lines: [{ work_order_line_id: other.id, measured_qty: 1 }],
        },
        await QS(),
      ),
    ).rejects.toThrow(/not a line on/);
  });

  it("refuses a sheet with no quantity and no dimensions", async () => {
    const { project: p, wo, line } = await measurableLine();
    await expect(
      createJointMeasurement(
        {
          project_id: p.id,
          work_order_id: wo.id,
          measurement_date: today(),
          period_from: daysAgoDate(20),
          period_to: today(),
          lines: [{ work_order_line_id: line.id }],
        },
        await QS(),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("signJointMeasurement (C1)", () => {
  async function draftSheet() {
    const { project: p, wo, line } = await measurableLine();
    await markReadyToMeasure({ work_order_line_id: line.id, ready_qty: 5 }, await SITE());
    const made = await createJointMeasurement(
      {
        project_id: p.id,
        work_order_id: wo.id,
        measurement_date: today(),
        period_from: daysAgoDate(20),
        period_to: today(),
        lines: [{ work_order_line_id: line.id, measured_qty: 5 }],
      },
      await QS(),
    );
    return { ...made, project: p, line };
  }

  it("records both signatures, advances measured_qty and clears the ready flag", async () => {
    const { measurement, line } = await draftSheet();
    const signed = await signJointMeasurement(
      {
        joint_measurement_id: measurement.id,
        contractor_signatory_name: "Prakash Shirodkar",
        signed_on: today(),
      },
      await QS(),
    );

    expect(signed.measurement.status).toBe("signed");
    expect(signed.measurement.signed_by_contractor_name).toBe("Prakash Shirodkar");
    expect(signed.measurement.signed_by_qs_user_id).not.toBeNull();

    const after = (await repos().workOrders.listLines()).find((l) => l.id === line.id)!;
    expect(after.measured_qty).toBeCloseTo(line.measured_qty + 5, 3);
    expect(after.ready_to_measure).toBe(false);
    expect(after.ready_qty).toBe(0);
  });

  it("refuses to sign twice", async () => {
    const { measurement } = await draftSheet();
    const payload = {
      joint_measurement_id: measurement.id,
      contractor_signatory_name: "Prakash Shirodkar",
      signed_on: today(),
    };
    await signJointMeasurement(payload, await QS());
    await expect(signJointMeasurement(payload, await QS())).rejects.toThrow(
      /cannot move from "signed"/,
    );
  });

  it("refuses the Project Head", async () => {
    const { measurement } = await draftSheet();
    await expect(
      signJointMeasurement(
        {
          joint_measurement_id: measurement.id,
          contractor_signatory_name: "Prakash Shirodkar",
          signed_on: today(),
        },
        await PH(),
      ),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("requires the contractor's representative to be named", async () => {
    const { measurement } = await draftSheet();
    await expect(
      signJointMeasurement(
        {
          joint_measurement_id: measurement.id,
          contractor_signatory_name: "",
          signed_on: today(),
        },
        await QS(),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("getIssuedVsMeasured", () => {
  it("compares material issued against what the measured work should have used", async () => {
    const p = await project();
    const rows = await getIssuedVsMeasured(p.id);
    expect(rows.length).toBeGreaterThan(0);

    for (const row of rows) {
      expect(row.theoretical_qty).toBeCloseTo(row.measured_qty * row.budget_qty_per_unit, 2);
      // Nothing issued is excluded outright.
      expect(row.issued_qty).toBeGreaterThan(0);

      if (row.state === "not_measured") {
        // No denominator, so no variance and never a flag (audit P3).
        expect(row.measured_qty).toBe(0);
        expect(row.variance_qty).toBeNull();
        expect(row.variance_percent).toBeNull();
        expect(row.is_flagged).toBe(false);
        continue;
      }

      expect(row.measured_qty).toBeGreaterThan(0);
      expect(row.variance_qty).toBeCloseTo(row.issued_qty - row.theoretical_qty, 2);
      // Only over-consumption is flagged; using less is good news.
      if (row.is_flagged) expect(row.variance_percent!).toBeGreaterThan(5);
      else expect(row.variance_percent!).toBeLessThanOrEqual(5);
    }
    expect(rows.some((r) => r.is_flagged)).toBe(true);
  });

  it("moves the variance when more is measured", async () => {
    const p = await project();
    const before = await getIssuedVsMeasured(p.id);
    const flagged = before.find((r) => r.is_flagged && r.measured_qty > 0)!;

    const line = (await repos().workOrders.listLinesByProject(p.id)).find(
      (l) => l.boq_line_id === flagged.boq_line_id && l.done_qty > l.measured_qty,
    );
    if (!line) return; // nothing left to measure on that line in this seed

    const wo = (await repos().workOrders.getById(line.work_order_id))!;
    const made = await createJointMeasurement(
      {
        project_id: p.id,
        work_order_id: wo.id,
        measurement_date: today(),
        period_from: daysAgoDate(20),
        period_to: today(),
        lines: [
          { work_order_line_id: line.id, measured_qty: Math.min(50, line.done_qty - line.measured_qty) },
        ],
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

    const after = await getIssuedVsMeasured(p.id);
    const same = after.find(
      (r) => r.boq_line_id === flagged.boq_line_id && r.material_id === flagged.material_id,
    )!;
    // More measured work means more theoretical consumption, so the overdraw shrinks.
    // Both lines are measured, so both carry a variance.
    expect(same.theoretical_qty).toBeGreaterThan(flagged.theoretical_qty);
    expect(same.variance_percent).not.toBeNull();
    expect(flagged.variance_percent).not.toBeNull();
    expect(same.variance_percent!).toBeLessThan(flagged.variance_percent!);
  });
});
