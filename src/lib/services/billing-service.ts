import { z } from "zod";
import { getRepositories } from "@/lib/data";
import {
  MEASUREMENT_TRANSITIONS,
  RA_BILL_TRANSITIONS,
  TDS_PERCENT,
  nowIso,
  type Approval,
  type RaBill,
  type RaBillLine,
  type RaBillRevision,
} from "@/lib/domain";
import { APPROVAL_CHAINS } from "@/config/permissions";
import { assertCan, assertTransition, parseInput, qty, required, rupees } from "./guards";
import { computeRaBillTotals as computeTotals } from "./ra-bill-math";
import { raBillNumber } from "./document-number";
import { PermissionError, ValidationError, WorkflowError, type ActingUser } from "./types";

/* The bill arithmetic lives in ./ra-bill-math so the deterministic seed can
   build bills with identical maths. */
export { computeRaBillTotals } from "./ra-bill-math";
export type { RaBillTotals, RaBillTotalsInput } from "./ra-bill-math";

/* ------------------------------------------------------------------ */
/* C2 — createRaBill                                                   */
/* ------------------------------------------------------------------ */

export const createRaBillInput = z.object({
  project_id: z.string().min(1),
  work_order_id: z.string().min(1),
  /** Signed, not-yet-billed measurements to draw from. */
  joint_measurement_ids: z.array(z.string()).min(1, "pick at least one signed measurement"),
  bill_date: z.string().min(1),
  advance_recovery_amount: z.number().nonnegative().default(0),
  other_deductions_amount: z.number().nonnegative().default(0),
  other_deductions_reason: z.string().default(""),
  remarks: z.string().default(""),
});

export type CreateRaBillInput = z.input<typeof createRaBillInput>;

export type RaBillResult = { bill: RaBill; lines: RaBillLine[] };

/**
 * C2. Builds the contractor's running-account bill from signed measurements.
 *
 * Rates come from the work order — never from the measurement and never typed.
 * Previous cumulative comes from the earlier bills on the same work order, so
 * the abstract always reads previous / this bill / cumulative.
 */
export async function createRaBill(
  input: CreateRaBillInput,
  actor: ActingUser,
): Promise<RaBillResult> {
  assertCan(actor, "create", "ra_bills");
  const data = parseInput(createRaBillInput, input);
  const repos = getRepositories();

  const project = required(await repos.projects.getById(data.project_id), "Project");
  const workOrder = required(await repos.workOrders.getById(data.work_order_id), "Work order");
  const contractor = required(
    await repos.contractors.getById(workOrder.contractor_id),
    "Contractor",
  );

  if (data.other_deductions_amount > 0 && data.other_deductions_reason.trim().length < 3) {
    throw new ValidationError("other_deductions_reason: say what the deduction is for");
  }

  const measurements = [];
  for (const id of data.joint_measurement_ids) {
    const m = required(await repos.measurements.getById(id), "Joint measurement");
    if (m.work_order_id !== workOrder.id) {
      throw new ValidationError(
        `${m.measurement_number} belongs to a different work order — one bill covers one work order`,
      );
    }
    if (m.status !== "signed") {
      throw new ValidationError(
        `${m.measurement_number} is "${m.status}" — only a signed, unbilled measurement can be billed`,
      );
    }
    measurements.push(m);
  }

  // Pool the measured lines by work-order line: one bill line per WO line.
  const byWoLine = new Map<string, { claimed: number; boq_line_id: string; description: string; unit: string }>();
  for (const m of measurements) {
    for (const line of await repos.measurements.listLinesByMeasurement(m.id)) {
      const entry = byWoLine.get(line.work_order_line_id) ?? {
        claimed: 0,
        boq_line_id: line.boq_line_id,
        description: line.description,
        unit: line.unit,
      };
      entry.claimed = qty(entry.claimed + line.measured_qty);
      byWoLine.set(line.work_order_line_id, entry);
    }
  }
  if (byWoLine.size === 0) throw new WorkflowError("Those measurements have no lines.");

  const earlier = (await repos.raBills.listByWorkOrder(workOrder.id)).filter(
    (b) => b.status !== "rejected",
  );
  const previous_gross_amount = rupees(
    earlier.filter((b) => b.status !== "draft").reduce((s, b) => s + b.gross_amount, 0),
  );
  const bill_sequence = earlier.length + 1;

  const woLines = await repos.workOrders.listLinesByWorkOrder(workOrder.id);
  const woLineById = new Map(woLines.map((l) => [l.id, l]));
  const previousBillLines = await repos.raBills.listLines();

  const draft = [...byWoLine.entries()].map(([work_order_line_id, entry]) => {
    const woLine = required(woLineById.get(work_order_line_id), "Work-order line");
    const previous_cumulative_qty = qty(
      previousBillLines
        .filter(
          (l) =>
            l.work_order_line_id === work_order_line_id &&
            earlier.some((b) => b.id === l.ra_bill_id && b.status !== "draft"),
        )
        .reduce((s, l) => s + l.certified_qty, 0),
    );
    return {
      work_order_line_id,
      boq_line_id: entry.boq_line_id,
      description: entry.description || woLine.description,
      unit: woLine.unit,
      rate: woLine.agreed_rate,
      previous_cumulative_qty,
      claimed_qty: entry.claimed,
      certified_qty: entry.claimed,
      cumulative_qty: qty(previous_cumulative_qty + entry.claimed),
    };
  });

  const tds_percent = TDS_PERCENT[contractor.type];
  const totals = computeTotals(draft, {
    previous_gross_amount,
    retention_percent: workOrder.retention_percent,
    tds_percent,
    advance_recovery_amount: data.advance_recovery_amount,
    other_deductions_amount: data.other_deductions_amount,
  });

  const periods = measurements.map((m) => m.period_from).sort();
  const periodEnds = measurements.map((m) => m.period_to).sort();

  const bill = await repos.raBills.create({
    project_id: project.id,
    bill_number: raBillNumber(project.short_code, workOrder.wo_number, bill_sequence),
    bill_sequence,
    work_order_id: workOrder.id,
    contractor_id: contractor.id,
    joint_measurement_ids: measurements.map((m) => m.id),
    bill_date: data.bill_date,
    period_from: periods[0],
    period_to: periodEnds[periodEnds.length - 1],
    status: "draft",
    previous_gross_amount,
    retention_percent: workOrder.retention_percent,
    tds_percent,
    advance_recovery_amount: rupees(data.advance_recovery_amount),
    other_deductions_amount: rupees(data.other_deductions_amount),
    other_deductions_reason: data.other_deductions_reason,
    prepared_by_user_id: actor.user_id,
    submitted_at: null,
    current_step_code: null,
    current_sequence: null,
    certified_at: null,
    handed_over_at: null,
    decision_comment: "",
    remarks: data.remarks,
    ...totals,
  });

  const lines: RaBillLine[] = [];
  for (const d of draft) {
    lines.push(
      await repos.raBills.createLine({
        project_id: project.id,
        ra_bill_id: bill.id,
        ...d,
        amount: rupees(d.certified_qty * d.rate),
      }),
    );
  }

  for (const m of measurements) {
    assertTransition("Joint measurement", MEASUREMENT_TRANSITIONS, m.status, "billed");
    await repos.measurements.update(m.id, { status: "billed", ra_bill_id: bill.id });
  }

  return { bill, lines };
}

/* ------------------------------------------------------------------ */
/* C2 -> C3 — submitRaBill                                             */
/* ------------------------------------------------------------------ */

/** C2 → C3. Opens all four chain rows; only sequence 1 is actionable. */
export async function submitRaBill(
  ra_bill_id: string,
  actor: ActingUser,
): Promise<{ bill: RaBill; approvals: Approval[] }> {
  assertCan(actor, "edit", "ra_bills");
  const repos = getRepositories();

  const bill = required(await repos.raBills.getById(ra_bill_id), "RA bill");
  assertTransition("RA bill", RA_BILL_TRANSITIONS, bill.status, "submitted");
  if ((await repos.raBills.listLinesByBill(bill.id)).length === 0) {
    throw new WorkflowError("This bill has no lines to certify.");
  }

  const at = nowIso();
  const open = await repos.approvals.listForEntity("ra_bill", bill.id);
  const approvals: Approval[] = [];

  // A bill that was sent back keeps its original chain rows; reopen them.
  if (open.length > 0) {
    for (const row of open) {
      approvals.push(
        await repos.approvals.update(row.id, {
          status: "pending",
          actor_user_id: null,
          comment: "",
          acted_at: null,
        }),
      );
    }
  } else {
    for (const step of APPROVAL_CHAINS.ra_bill) {
      approvals.push(
        await repos.approvals.create({
          project_id: bill.project_id,
          entity_type: "ra_bill",
          entity_id: bill.id,
          step_code: step.step_code,
          sequence: step.sequence,
          required_role: step.required_role,
          status: "pending",
          actor_user_id: null,
          comment: "",
          acted_at: null,
        }),
      );
    }
  }

  const first = APPROVAL_CHAINS.ra_bill[0];
  const submitted = await repos.raBills.update(bill.id, {
    status: "in_certification",
    submitted_at: at,
    current_step_code: first.step_code,
    current_sequence: first.sequence,
    decision_comment: "",
  });

  return { bill: submitted, approvals };
}

/* ------------------------------------------------------------------ */
/* C3-C4 — actOnRaBill                                                 */
/* ------------------------------------------------------------------ */

export const raBillAdjustmentInput = z.object({
  ra_bill_line_id: z.string().min(1),
  certified_qty: z.number().nonnegative(),
});

export const actOnRaBillInput = z
  .object({
    ra_bill_id: z.string().min(1),
    action: z.enum(["approve", "send_back", "reject"]),
    comment: z.string().default(""),
    /** Certified quantities the acting step wants to change. */
    adjustments: z.array(raBillAdjustmentInput).default([]),
  })
  .refine((d) => d.action === "approve" || d.comment.trim().length > 0, {
    message: "sending back or rejecting needs a comment",
    path: ["comment"],
  })
  .refine((d) => d.adjustments.length === 0 || d.comment.trim().length > 0, {
    message: "changing a certified quantity needs a comment",
    path: ["comment"],
  });

export type ActOnRaBillInput = z.input<typeof actOnRaBillInput>;

export type ActOnRaBillResult = {
  bill: RaBill;
  lines: RaBillLine[];
  approval: Approval;
  revisions: RaBillRevision[];
};

/** The chain row this bill is waiting on, or null when it is not in the chain. */
export async function pendingStepFor(ra_bill_id: string): Promise<Approval | null> {
  const rows = await getRepositories().approvals.listForEntity("ra_bill", ra_bill_id);
  const pending = rows.filter((r) => r.status === "pending").sort((a, b) => a.sequence - b.sequence);
  return pending[0] ?? null;
}

/**
 * C3-C4. One step acts: approve, adjust certified quantities, send back, or
 * reject.
 *
 * Only the lowest pending sequence is actionable, and only by the role that
 * holds it. Every quantity change is logged as a RaBillRevision and the totals
 * are recomputed from the lines. HoD approval (sequence 4) certifies the bill.
 */
export async function actOnRaBill(
  input: ActOnRaBillInput,
  actor: ActingUser,
): Promise<ActOnRaBillResult> {
  assertCan(actor, "approve", "certification");
  const data = parseInput(actOnRaBillInput, input);
  const repos = getRepositories();

  const bill = required(await repos.raBills.getById(data.ra_bill_id), "RA bill");
  if (bill.status !== "in_certification") {
    throw new WorkflowError(`This bill is "${bill.status}", not in the certification chain.`);
  }

  const step = await pendingStepFor(bill.id);
  if (!step) throw new WorkflowError("This bill has no open certification step.");
  if (step.required_role !== actor.role) {
    throw new PermissionError(
      `This bill is waiting on ${step.required_role.replace(/_/g, " ")}, not ${actor.role.replace(/_/g, " ")}.`,
    );
  }

  const at = nowIso();
  let lines = await repos.raBills.listLinesByBill(bill.id);
  const lineById = new Map(lines.map((l) => [l.id, l]));
  const revisions: RaBillRevision[] = [];

  /* --- send back / reject: no adjustments are applied ----------------- */
  if (data.action !== "approve") {
    const approval = await repos.approvals.update(step.id, {
      status: "rejected",
      actor_user_id: actor.user_id,
      comment: data.comment,
      acted_at: at,
    });
    const next = data.action === "send_back" ? "draft" : "rejected";
    assertTransition("RA bill", RA_BILL_TRANSITIONS, bill.status, next);
    const updated = await repos.raBills.update(bill.id, {
      status: next,
      current_step_code: null,
      current_sequence: null,
      decision_comment: data.comment,
    });
    return { bill: updated, lines, approval, revisions };
  }

  /* --- approve, applying any adjustments ------------------------------ */
  for (const adjustment of data.adjustments) {
    const line = lineById.get(adjustment.ra_bill_line_id);
    if (!line) throw new ValidationError(`${adjustment.ra_bill_line_id} is not a line on this bill`);
    if (adjustment.certified_qty > line.claimed_qty + 0.0005) {
      throw new ValidationError(
        `certified quantity ${adjustment.certified_qty} exceeds the claimed ${line.claimed_qty}`,
      );
    }
    const to_qty = qty(adjustment.certified_qty);
    if (Math.abs(to_qty - line.certified_qty) < 0.0005) continue;

    revisions.push(
      await repos.raBills.createRevision({
        project_id: bill.project_id,
        ra_bill_id: bill.id,
        ra_bill_line_id: line.id,
        step_code: step.step_code,
        sequence: step.sequence,
        user_id: actor.user_id,
        from_qty: line.certified_qty,
        to_qty,
        comment: data.comment,
        acted_at: at,
      }),
    );

    await repos.raBills.updateLine(line.id, {
      certified_qty: to_qty,
      cumulative_qty: qty(line.previous_cumulative_qty + to_qty),
      amount: rupees(to_qty * line.rate),
    });
  }

  lines = await repos.raBills.listLinesByBill(bill.id);
  const totals = computeTotals(lines, {
    previous_gross_amount: bill.previous_gross_amount,
    retention_percent: bill.retention_percent,
    tds_percent: bill.tds_percent,
    advance_recovery_amount: bill.advance_recovery_amount,
    other_deductions_amount: bill.other_deductions_amount,
  });

  const approval = await repos.approvals.update(step.id, {
    status: "approved",
    actor_user_id: actor.user_id,
    comment: data.comment,
    acted_at: at,
  });

  const nextStep = APPROVAL_CHAINS.ra_bill.find((s) => s.sequence === step.sequence + 1);

  if (nextStep) {
    const updated = await repos.raBills.update(bill.id, {
      ...totals,
      current_step_code: nextStep.step_code,
      current_sequence: nextStep.sequence,
    });
    return { bill: updated, lines, approval, revisions };
  }

  // Sequence 4 — HoD — certifies the bill and advances the work-order lines.
  assertTransition("RA bill", RA_BILL_TRANSITIONS, bill.status, "certified");
  const certified = await repos.raBills.update(bill.id, {
    ...totals,
    status: "certified",
    current_step_code: null,
    current_sequence: null,
    certified_at: at,
  });

  for (const line of lines) {
    const woLine = (await repos.workOrders.listLines()).find(
      (l) => l.id === line.work_order_line_id,
    );
    if (!woLine) continue;
    await repos.workOrders.updateLine(woLine.id, {
      billed_qty: qty(woLine.billed_qty + line.certified_qty),
    });
  }

  return { bill: certified, lines, approval, revisions };
}

/* ------------------------------------------------------------------ */
/* C5 — handOverRaBill                                                 */
/* ------------------------------------------------------------------ */

/** C5. Releases the certified bill to Accounts. Read-only after this. */
export async function handOverRaBill(ra_bill_id: string, actor: ActingUser): Promise<RaBill> {
  assertCan(actor, "edit", "handed_over");
  const repos = getRepositories();
  const bill = required(await repos.raBills.getById(ra_bill_id), "RA bill");
  assertTransition("RA bill", RA_BILL_TRANSITIONS, bill.status, "handed_over");
  return repos.raBills.update(bill.id, { status: "handed_over", handed_over_at: nowIso() });
}

/* ------------------------------------------------------------------ */
/* Contractor running account                                          */
/* ------------------------------------------------------------------ */

export type ContractorAccountRow = {
  contractor_id: string;
  work_order_id: string;
  wo_number: string;
  project_id: string;
  order_value: number;
  /** Gross certified on bills that have cleared the chain. */
  certified_amount: number;
  retention_held: number;
  tds_deducted: number;
  advances_recovered: number;
  other_deductions: number;
  net_payable: number;
  /** Order value less certified — what is still to be billed. */
  balance_to_bill: number;
  bills_in_chain: number;
};

/**
 * Running account per contractor per work order. Payments are out of scope —
 * this stops at what Accounts has been asked to pay.
 */
export async function contractorRunningAccount(opts?: {
  project_id?: string;
  contractor_id?: string;
}): Promise<ContractorAccountRow[]> {
  const repos = getRepositories();
  const [workOrders, bills] = await Promise.all([
    repos.workOrders.list(),
    repos.raBills.list(),
  ]);

  return workOrders
    .filter((w) => !opts?.project_id || w.project_id === opts.project_id)
    .filter((w) => !opts?.contractor_id || w.contractor_id === opts.contractor_id)
    .map((wo) => {
      const mine = bills.filter((b) => b.work_order_id === wo.id);
      // Only a bill that has cleared the chain counts against the account.
      const counted = mine.filter((b) => b.status === "certified" || b.status === "handed_over");
      const certified_amount = rupees(counted.reduce((s, b) => s + b.gross_amount, 0));
      return {
        contractor_id: wo.contractor_id,
        work_order_id: wo.id,
        wo_number: wo.wo_number,
        project_id: wo.project_id,
        order_value: wo.order_value,
        certified_amount,
        retention_held: rupees(counted.reduce((s, b) => s + b.retention_amount, 0)),
        tds_deducted: rupees(counted.reduce((s, b) => s + b.tds_amount, 0)),
        advances_recovered: rupees(counted.reduce((s, b) => s + b.advance_recovery_amount, 0)),
        other_deductions: rupees(counted.reduce((s, b) => s + b.other_deductions_amount, 0)),
        net_payable: rupees(counted.reduce((s, b) => s + b.net_payable_amount, 0)),
        balance_to_bill: rupees(wo.order_value - certified_amount),
        bills_in_chain: mine.filter((b) => b.status === "in_certification").length,
      };
    });
}
