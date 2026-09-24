import { z } from "zod";
import { getRepositories } from "@/lib/data";
import {
  ISSUED_VS_MEASURED_TOLERANCE_PERCENT,
  MEASUREMENT_TRANSITIONS,
  nowIso,
  type JointMeasurement,
  type JointMeasurementLine,
  type Unit,
} from "@/lib/domain";
import { assertCan, assertTransition, parseInput, qty, required, rupees } from "./guards";
import { nextDocumentNumber } from "./numbering";
import { clearReadyToMeasure } from "./site-service";
import { ValidationError, WorkflowError, type ActingUser } from "./types";

/* ------------------------------------------------------------------ */
/* Dimension arithmetic                                                */
/* ------------------------------------------------------------------ */

/**
 * How many of the four dimension boxes a unit actually uses.
 * cum needs L×B×D, sqm needs L×B, rmt needs L, everything else is a count.
 */
export function dimensionsFor(unit: Unit): Array<"length" | "breadth" | "depth"> {
  switch (unit) {
    case "cum":
    case "brass":
      return ["length", "breadth", "depth"];
    case "sqm":
      return ["length", "breadth"];
    case "rmt":
      return ["length"];
    default:
      return [];
  }
}

export type Dimensions = {
  nos: number | null;
  length: number | null;
  breadth: number | null;
  depth: number | null;
};

/** nos × whichever dimensions the unit uses. Returns null if any are missing. */
export function measuredQtyFromDimensions(unit: Unit, d: Dimensions): number | null {
  const needed = dimensionsFor(unit);
  if (d.nos === null || d.nos <= 0) return null;
  let value = d.nos;
  for (const key of needed) {
    const dim = d[key];
    if (dim === null || dim <= 0) return null;
    value *= dim;
  }
  return Math.round(value * 1000) / 1000;
}

/* ------------------------------------------------------------------ */
/* C1 — createJointMeasurement                                         */
/* ------------------------------------------------------------------ */

export const measurementLineInput = z
  .object({
    work_order_line_id: z.string().min(1),
    nos: z.number().nullable().default(null),
    length: z.number().nullable().default(null),
    breadth: z.number().nullable().default(null),
    depth: z.number().nullable().default(null),
    /** Set to enter a quantity directly instead of deriving it. */
    measured_qty: z.number().nullable().default(null),
    /** Required when the cumulative measure would exceed the work-order qty. */
    excess_reason: z.string().default(""),
    remarks: z.string().default(""),
  })
  .refine((l) => l.measured_qty !== null || l.nos !== null, {
    message: "enter the dimensions or a quantity",
    path: ["measured_qty"],
  });

export const createJointMeasurementInput = z.object({
  project_id: z.string().min(1),
  work_order_id: z.string().min(1),
  measurement_date: z.string().min(1),
  period_from: z.string().min(1),
  period_to: z.string().min(1),
  remarks: z.string().default(""),
  lines: z.array(measurementLineInput).min(1, "a measurement needs at least one line"),
});

export type CreateJointMeasurementInput = z.input<typeof createJointMeasurementInput>;

export type MeasurementResult = {
  measurement: JointMeasurement;
  lines: JointMeasurementLine[];
};

/**
 * C1. The QS measures the lines the site flagged ready.
 *
 * Measuring past the work-order quantity is blocked unless an excess_reason is
 * given; the line and the sheet are then flagged so the chain can see it.
 */
export async function createJointMeasurement(
  input: CreateJointMeasurementInput,
  actor: ActingUser,
): Promise<MeasurementResult> {
  assertCan(actor, "create", "measurements");
  const data = parseInput(createJointMeasurementInput, input);
  const repos = getRepositories();

  const project = required(await repos.projects.getById(data.project_id), "Project");
  const workOrder = required(await repos.workOrders.getById(data.work_order_id), "Work order");
  if (workOrder.project_id !== project.id) {
    throw new ValidationError("work_order_id: that work order belongs to another project");
  }
  if (data.period_to < data.period_from) {
    throw new ValidationError("period_to: the period cannot end before it starts");
  }

  const woLines = await repos.workOrders.listLinesByWorkOrder(workOrder.id);
  const lineById = new Map(woLines.map((l) => [l.id, l]));

  const seen = new Set<string>();
  const draft = data.lines.map((line, i) => {
    const woLine = lineById.get(line.work_order_line_id);
    if (!woLine) throw new ValidationError(`lines.${i}: not a line on ${workOrder.wo_number}`);
    if (seen.has(line.work_order_line_id)) {
      throw new ValidationError(`lines.${i}: the same work-order line appears twice`);
    }
    seen.add(line.work_order_line_id);

    const derived =
      line.measured_qty !== null
        ? qty(line.measured_qty)
        : measuredQtyFromDimensions(woLine.unit, line);
    if (derived === null) {
      throw new ValidationError(
        `lines.${i}: nos and the ${dimensionsFor(woLine.unit).join(", ")} dimensions are needed for ${woLine.unit}`,
      );
    }
    if (derived <= 0) throw new ValidationError(`lines.${i}: measured quantity must be above zero`);

    const previous = woLine.measured_qty;
    const cumulative = qty(previous + derived);
    const is_excess = cumulative > woLine.quantity + 0.0005;
    if (is_excess && line.excess_reason.trim().length < 5) {
      throw new ValidationError(
        `lines.${i}.excess_reason: measuring ${cumulative} against a work-order quantity of ${woLine.quantity} needs a reason`,
      );
    }

    return { woLine, line, measured_qty: derived, previous, cumulative, is_excess };
  });

  const at = nowIso();
  const measurement_number = await nextDocumentNumber("JM", project, at);
  const has_excess = draft.some((d) => d.is_excess);

  const measurement = await repos.measurements.create({
    project_id: project.id,
    measurement_number,
    work_order_id: workOrder.id,
    contractor_id: workOrder.contractor_id,
    measurement_date: data.measurement_date,
    period_from: data.period_from,
    period_to: data.period_to,
    status: "draft",
    measured_by_user_id: actor.user_id,
    signed_by_contractor_name: "",
    signed_by_contractor_at: null,
    signed_by_qs_user_id: null,
    signed_by_qs_at: null,
    ra_bill_id: null,
    has_excess,
    total_value: rupees(draft.reduce((s, d) => s + d.measured_qty * d.woLine.agreed_rate, 0)),
    remarks: data.remarks,
  });

  const lines: JointMeasurementLine[] = [];
  for (const d of draft) {
    lines.push(
      await repos.measurements.createLine({
        project_id: project.id,
        joint_measurement_id: measurement.id,
        boq_line_id: d.woLine.boq_line_id,
        work_order_line_id: d.woLine.id,
        description: d.woLine.description,
        unit: d.woLine.unit,
        nos: d.line.nos,
        length: d.line.length,
        breadth: d.line.breadth,
        depth: d.line.depth,
        is_manual_qty: d.line.measured_qty !== null,
        measured_qty: d.measured_qty,
        previous_measured_qty: d.previous,
        cumulative_measured_qty: d.cumulative,
        agreed_rate: d.woLine.agreed_rate,
        amount: rupees(d.measured_qty * d.woLine.agreed_rate),
        is_excess: d.is_excess,
        excess_reason: d.is_excess ? d.line.excess_reason : "",
        remarks: d.line.remarks,
      }),
    );
  }

  return { measurement, lines };
}

/* ------------------------------------------------------------------ */
/* C1 — signJointMeasurement                                           */
/* ------------------------------------------------------------------ */

export const signJointMeasurementInput = z.object({
  joint_measurement_id: z.string().min(1),
  contractor_signatory_name: z.string().min(3, "the contractor's representative must be named"),
  signed_on: z.string().min(1),
});

export type SignJointMeasurementInput = z.input<typeof signJointMeasurementInput>;

/**
 * C1. Both signatures go on together — a sheet signed by only one party is not
 * a joint measurement. Signing is what advances WorkOrderLine.measured_qty and
 * clears the site's ready flag.
 */
export async function signJointMeasurement(
  input: SignJointMeasurementInput,
  actor: ActingUser,
): Promise<MeasurementResult> {
  assertCan(actor, "edit", "measurements");
  const data = parseInput(signJointMeasurementInput, input);
  const repos = getRepositories();

  const measurement = required(
    await repos.measurements.getById(data.joint_measurement_id),
    "Joint measurement",
  );
  assertTransition("Joint measurement", MEASUREMENT_TRANSITIONS, measurement.status, "signed");

  const lines = await repos.measurements.listLinesByMeasurement(measurement.id);
  if (lines.length === 0) throw new WorkflowError("There is nothing on this sheet to sign.");

  const at = nowIso();
  const signed = await repos.measurements.update(measurement.id, {
    status: "signed",
    signed_by_contractor_name: data.contractor_signatory_name,
    signed_by_contractor_at: at,
    signed_by_qs_user_id: actor.user_id,
    signed_by_qs_at: at,
  });

  for (const line of lines) {
    const woLine = (await repos.workOrders.listLines()).find(
      (l) => l.id === line.work_order_line_id,
    );
    if (!woLine) continue;
    await repos.workOrders.updateLine(woLine.id, {
      measured_qty: qty(woLine.measured_qty + line.measured_qty),
    });
    await clearReadyToMeasure(woLine.id);
  }

  return { measurement: signed, lines };
}

/* ------------------------------------------------------------------ */
/* Issued v. Measured — the dashed line on the chart                   */
/* ------------------------------------------------------------------ */

export type IssuedVsMeasuredRow = {
  boq_line_id: string;
  item_code: string;
  description: string;
  material_id: string;
  unit: string;
  /** Allowance per unit of BOQ quantity, from BoqMaterialBudget. */
  budget_qty_per_unit: number;
  /** Cumulative measured quantity on the BOQ line's work-order lines. */
  measured_qty: number;
  /** measured_qty × budget_qty_per_unit — what should have been consumed. */
  theoretical_qty: number;
  /** What actually left the store against this BOQ line. */
  issued_qty: number;
  /** Null while the line has not been measured — there is nothing to compare. */
  variance_qty: number | null;
  variance_percent: number | null;
  /** True when the overdraw is beyond tolerance. Never true unmeasured. */
  is_flagged: boolean;
  /**
   * Which of the three states this line is in.
   *
   * `not_measured` is the important one: measured_qty of zero means the work
   * has not been measured yet, not that every bag issued was wasted. Reporting
   * it as a 100% overrun buried four real flags under twenty-four false ones
   * (audit P3/P4).
   */
  state: "flagged" | "within_tolerance" | "not_measured";
};

/**
 * The "Issued v. Measured" check: material drawn from store against a BOQ line
 * versus what the measured work should have consumed at the budgeted rate.
 *
 * Only over-consumption is flagged — using less than budgeted is good news.
 */
export async function getIssuedVsMeasured(project_id: string): Promise<IssuedVsMeasuredRow[]> {
  const repos = getRepositories();
  const [boqLines, budgets, woLines, issues, materials] = await Promise.all([
    repos.boq.listByProject(project_id),
    repos.boq.listMaterialBudgetsByProject(project_id),
    repos.workOrders.listLinesByProject(project_id),
    repos.stock.listIssuesByProject(project_id),
    repos.materials.list(),
  ]);

  const boqById = new Map(boqLines.map((b) => [b.id, b]));
  const materialById = new Map(materials.map((m) => [m.id, m]));

  // Measured quantity per BOQ line, summed across its work-order lines.
  const measuredByBoq = new Map<string, number>();
  woLines.forEach((l) => {
    measuredByBoq.set(l.boq_line_id, (measuredByBoq.get(l.boq_line_id) ?? 0) + l.measured_qty);
  });

  const rows: IssuedVsMeasuredRow[] = [];
  for (const budget of budgets) {
    const boq = boqById.get(budget.boq_line_id);
    const material = materialById.get(budget.material_id);
    if (!boq || !material || boq.quantity <= 0) continue;

    const measured_qty = qty(measuredByBoq.get(boq.id) ?? 0);
    const budget_qty_per_unit = budget.budget_qty / boq.quantity;
    const theoretical_qty = qty(measured_qty * budget_qty_per_unit);
    const issued_qty = qty(
      issues
        .filter((i) => i.boq_line_id === boq.id && i.material_id === budget.material_id)
        .reduce((s, i) => s + i.quantity, 0),
    );
    // Nothing issued against this line: there is no consumption to judge.
    if (issued_qty === 0) continue;

    // Not yet measured: no denominator, so no variance and no flag.
    if (measured_qty === 0) {
      rows.push({
        boq_line_id: boq.id,
        item_code: boq.item_code,
        description: boq.description,
        material_id: budget.material_id,
        unit: material.unit,
        budget_qty_per_unit: Math.round(budget_qty_per_unit * 10000) / 10000,
        measured_qty,
        theoretical_qty,
        issued_qty,
        variance_qty: null,
        variance_percent: null,
        is_flagged: false,
        state: "not_measured",
      });
      continue;
    }

    const variance_qty = qty(issued_qty - theoretical_qty);
    const variance_percent =
      theoretical_qty > 0 ? Math.round((variance_qty / theoretical_qty) * 1000) / 10 : 0;
    const is_flagged = variance_percent > ISSUED_VS_MEASURED_TOLERANCE_PERCENT;

    rows.push({
      boq_line_id: boq.id,
      item_code: boq.item_code,
      description: boq.description,
      material_id: budget.material_id,
      unit: material.unit,
      budget_qty_per_unit: Math.round(budget_qty_per_unit * 10000) / 10000,
      measured_qty,
      theoretical_qty,
      issued_qty,
      variance_qty,
      variance_percent,
      is_flagged,
      // Using less than budgeted is good news, never a flag.
      state: is_flagged ? "flagged" : "within_tolerance",
    });
  }

  return rows.sort((a, b) => (b.variance_percent ?? -Infinity) - (a.variance_percent ?? -Infinity));
}
