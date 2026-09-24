import type {
  Approval,
  BoqLine,
  Dpr,
  DprLabourEntry,
  DprProgressEntry,
  JointMeasurement,
  JointMeasurementLine,
  LabourTrade,
  Project,
  RaBill,
  RaBillLine,
  RaBillStatus,
  SiteTask,
  WorkOrder,
  WorkOrderLine,
  WorkProgress,
} from "@/lib/domain";
import { TDS_PERCENT } from "@/lib/domain";
import { APPROVAL_CHAINS } from "@/config/permissions";
import { computeRaBillTotals } from "@/lib/services/ra-bill-math";
import { raBillNumber, seedDocumentNumber } from "@/lib/services/document-number";
import type { DemoDatabase } from "../database";
import type { ProjectPlan } from "./catalog";
import { userByRole, type Masters } from "./masters";
import { daysAgoDate, daysAgoIso, daysAheadDate, jitter, pick, rupees, sid } from "./ids";
import type { Counters } from "./project-seed";

/**
 * The A1 -> C5 billing thread, seeded so every queue on the chart has something
 * in it on every project:
 *
 *   A1  site tasks against work-order lines, planned / in progress / completed
 *   A3  daily reports for the last 14 days, with two dates deliberately missing
 *   A4  done_qty summed from those reports; a few lines flagged ready to measure
 *   C1  a draft sheet, a signed-but-unbilled sheet, and one carrying an excess
 *   C2  RA bills sitting at every step of the chain, one sent back, one where
 *       the QS cut a quantity (with the revision that records it)
 *   C5  certified bills, some already handed over to Accounts
 *
 * Nothing is hand-typed: totals come from computeRaBillTotals(), the same
 * function the service uses, so the seed cannot contradict the rules.
 */

type Ctx = {
  db: DemoDatabase;
  plan: ProjectPlan;
  masters: Masters;
  counters: Counters;
  project: Project;
  boqLines: BoqLine[];
  workOrders: WorkOrder[];
  workOrderLines: WorkOrderLine[];
};

function next(c: Counters, key: string): number {
  c[key] = (c[key] ?? 0) + 1;
  return c[key];
}

function docSeq(c: Counters, project_code: string, kind: string): number {
  return next(c, `doc:${project_code}:${kind}`);
}

function qty(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** How far each trade has physically progressed, by project depth. */
const TRADE_PROGRESS: Record<string, number> = {
  rcc: 0.86,
  masonry: 0.71,
  plaster: 0.54,
  waterproofing: 0.42,
  flooring: 0.26,
  painting: 0.11,
  plumbing: 0.22,
  electrical: 0.18,
  general: 0.3,
};

// An early project has let its frame and nothing else, so its one trade is
// already on the curve — there is no further discount for being young.
const DEPTH_FACTOR: Record<ProjectPlan["depth"], number> = { full: 1, mid: 1, early: 1 };

/**
 * Reporting window: the fortnight behind today, with two dates deliberately
 * missed. Today itself is never seeded — "today's DPR is still to be filed" is
 * the Site Engineer's first action every time the demo is opened.
 */
const STEEL_ITEM = "BOQ-04";
const CONCRETE_ITEMS = ["BOQ-01", "BOQ-02", "BOQ-03"];

const DPR_DAYS = Array.from({ length: 14 }, (_, i) => i + 1).filter((d) => d !== 4 && d !== 9);

const LABOUR_MIX: LabourTrade[] = [
  "mason",
  "helper",
  "carpenter",
  "bar_bender",
  "plumber",
  "electrician",
  "painter",
];

/** The seven RA bill states the demo has to show, in the order they are created. */
type BillSpec = {
  status: RaBillStatus;
  /** Chain position still pending, 1-4; null once the chain is done. */
  pending_sequence: number | null;
  /** The QS cut a quantity at sequence 1 before approving. */
  qs_revision?: boolean;
  /** Sent back by this sequence, with a comment. */
  sent_back_at?: number;
  comment?: string;
};

const BILL_SPECS: BillSpec[] = [
  { status: "handed_over", pending_sequence: null },
  { status: "certified", pending_sequence: null },
  { status: "in_certification", pending_sequence: 1 },
  { status: "in_certification", pending_sequence: 2, qs_revision: true },
  { status: "in_certification", pending_sequence: 3 },
  { status: "in_certification", pending_sequence: 4 },
  {
    status: "draft",
    pending_sequence: null,
    sent_back_at: 2,
    comment:
      "Plaster quantity on the west elevation does not agree with the measurement sheet. Re-measure and resubmit.",
  },
];

export function seedBillingThread(ctx: Ctx): void {
  const { db, plan, masters, counters, project, boqLines, workOrders, workOrderLines } = ctx;
  const se = userByRole(masters.users, "site_engineer");
  const qsUser = userByRole(masters.users, "project_qs");
  const ph = userByRole(masters.users, "project_head");
  const qsHead = userByRole(masters.users, "qs_head");
  const hod = userByRole(masters.users, "hod");
  const chainUser = { 1: qsUser, 2: ph, 3: qsHead, 4: hod } as const;

  const factor = DEPTH_FACTOR[plan.depth];
  const boqById = new Map(boqLines.map((b) => [b.id, b]));
  const contractorById = new Map(masters.contractors.map((c) => [c.id, c]));
  const blocks = ["Tower A", "Tower B", "Podium", "Clubhouse"];

  /* ================================================================== */
  /* A4 target: how much of each line the site has reported done         */
  /* ================================================================== */

  /**
   * How many of each work order's lines are actually being worked on.
   *
   * A project that has consumed two thirds of its budget has more than two
   * live lines per contractor; a project three months old has two. Driven by
   * the same `consumed` target as the material history, so the three projects
   * read as three different stages rather than three copies (audit H1).
   */
  const ACTIVE_LINES_PER_WO = plan.consumed >= 0.5 ? 6 : 4;

  const activeLines: WorkOrderLine[] = workOrders.flatMap((wo) =>
    workOrderLines.filter((l) => l.work_order_id === wo.id).slice(0, ACTIVE_LINES_PER_WO),
  );

  // The "planned" line is the last active one that is not reinforcement —
  // steel follows the concrete it sits in, below.
  const lastPlanned = activeLines.findLastIndex(
    (l) => boqById.get(l.boq_line_id)?.item_code !== STEEL_ITEM,
  );

  const targetDone = new Map<string, number>();
  activeLines.forEach((line, i) => {
    const boq = boqById.get(line.boq_line_id);
    const progress = TRADE_PROGRESS[boq?.trade ?? "general"] ?? 0.3;
    /*
     * Lift the trade curve onto the project's stage.
     *
     * TRADE_PROGRESS averages about 0.38 across the trades, so dividing the
     * project's `consumed` target by that turns "two thirds of the budget is
     * gone" into "each trade is about 1.7× along its own arc". `factor` keeps
     * the original depth shape underneath it. Both are capped at 1: nothing is
     * ever more than finished.
     */
    const AVERAGE_TRADE_PROGRESS = 0.38;
    const stage = plan.consumed / AVERAGE_TRADE_PROGRESS;
    /*
     * The A1 list has to show all three states, on every project:
     *   the first line is carried right through to completion,
     *   the last is planned but not started — nothing done, nothing measured,
     *   everything between is running.
     * Without the untouched line there is no "planned" task to start and no
     * work-order line a new measurement can be demonstrated against.
     */
    const isFirst = i === 0;
    const isLast = i === lastPlanned;
    const fraction = isFirst
      ? 1
      : isLast
        ? 0
        : Math.min(1, progress * stage * factor * (0.9 + jitter(i) * 0.2));
    targetDone.set(line.id, qty(line.quantity * fraction));
  });

  // Reinforcement is placed as the concrete is cast, so the steel line is as
  // far along as the concrete lines are, weighted by their volume.
  const steel = activeLines.find((l) => boqById.get(l.boq_line_id)?.item_code === STEEL_ITEM);
  if (steel) {
    const concrete = activeLines.filter((l) => CONCRETE_ITEMS.includes(boqById.get(l.boq_line_id)?.item_code ?? ""));
    const volume = concrete.reduce((s, l) => s + l.quantity, 0);
    const cast = concrete.reduce((s, l) => s + Math.min(targetDone.get(l.id) ?? 0, l.quantity), 0);
    targetDone.set(steel.id, qty(steel.quantity * (volume > 0 ? cast / volume : 0)));
  }

  /*
   * One line runs past its BOQ quantity, so the demo has an excess
   * measurement to explain. It has to be work the site really reported —
   * measuring more than was done is not an excess, it is an error — so it is
   * the first line of the second contractor, when that line is complete.
   */
  const woWithActive = workOrders.filter((wo) =>
    activeLines.some((l) => l.work_order_id === wo.id),
  );
  const excessLine = activeLines.find((l) => l.work_order_id === woWithActive[1]?.id);
  if (excessLine && (targetDone.get(excessLine.id) ?? 0) >= excessLine.quantity * 0.95) {
    targetDone.set(excessLine.id, qty(excessLine.quantity * 1.04));
  }

  /* ================================================================== */
  /* A1 — site tasks, one per active line                                */
  /* ================================================================== */

  const siteTasks: SiteTask[] = activeLines.map((line, i) => {
    const wo = workOrders.find((w) => w.id === line.work_order_id)!;
    const boq = boqById.get(line.boq_line_id);
    const done = targetDone.get(line.id) ?? 0;
    const status = done >= line.quantity - 0.0005 ? "completed" : done > 0 ? "in_progress" : "planned";
    return {
      id: sid("site_task", next(counters, "site_task")),
      project_id: project.id,
      created_at: daysAgoIso(60 - i * 5),
      updated_at: daysAgoIso(Math.max(1, 20 - i * 3)),
      task_code: `${plan.code}/T/${String(i + 1).padStart(3, "0")}`,
      title: boq ? boq.description.split(" — ")[0] : `Site activity ${i + 1}`,
      description: `${line.description} — ${blocks[i % blocks.length]}`,
      work_order_id: wo.id,
      work_order_line_id: line.id,
      boq_line_id: line.boq_line_id,
      trade: boq?.trade ?? "general",
      location_block: blocks[i % blocks.length],
      planned_start: daysAgoDate(40 - i * 4),
      planned_end: daysAheadDate(i * 6 + 4),
      status,
      assigned_contractor_id: wo.contractor_id,
      progress_percent:
        line.quantity > 0 ? Math.min(100, Math.round((done / line.quantity) * 100)) : 0,
    };
  });
  db.site_tasks.push(...siteTasks);
  const taskByLine = new Map(siteTasks.map((t) => [t.work_order_line_id!, t]));

  // One purely planned task per project, so the A1 list is not all in-flight.
  const spareLine = workOrderLines.find((l) => !targetDone.has(l.id));
  if (spareLine) {
    const wo = workOrders.find((w) => w.id === spareLine.work_order_id)!;
    db.site_tasks.push({
      id: sid("site_task", next(counters, "site_task")),
      project_id: project.id,
      created_at: daysAgoIso(12),
      updated_at: daysAgoIso(12),
      task_code: `${plan.code}/T/${String(siteTasks.length + 1).padStart(3, "0")}`,
      title: spareLine.description.split(" — ")[0],
      description: `${spareLine.description} — ${blocks[3]}`,
      work_order_id: wo.id,
      work_order_line_id: spareLine.id,
      boq_line_id: spareLine.boq_line_id,
      trade: boqById.get(spareLine.boq_line_id)?.trade ?? "general",
      location_block: blocks[3],
      planned_start: daysAheadDate(6),
      planned_end: daysAheadDate(34),
      status: "planned",
      assigned_contractor_id: wo.contractor_id,
      progress_percent: 0,
    });
  }

  /* ================================================================== */
  /* A3 — daily reports, and the A4 totals derived from them             */
  /* ================================================================== */

  const weathers = ["Clear", "Humid", "Light showers", "Overcast", "Heavy rain"];
  const runningDone = new Map<string, number>();

  DPR_DAYS.slice()
    .sort((a, b) => b - a) // oldest first
    .forEach((daysAgo, dayIndex) => {
      const dprIso = daysAgoIso(daysAgo);
      const dpr_id = sid("dpr", next(counters, "dpr"));

      // Three lines are reported each day, on a rotating window so every
      // active line gets covered across the fortnight.
      const width = Math.min(3, activeLines.length);
      const start = (dayIndex * width) % activeLines.length;
      const todaysLines = Array.from(
        { length: width },
        (_, k) => activeLines[(start + k) % activeLines.length],
      );
      /** How many days in the window each line comes round. */
      const appearances = (DPR_DAYS.length * width) / activeLines.length;
      const progress: DprProgressEntry[] = [];

      todaysLines.forEach((line, li) => {
        const target = targetDone.get(line.id) ?? 0;
        const perDay = target / appearances;
        const amount = qty(perDay * (0.75 + jitter(dayIndex * 7 + li) * 0.5));
        const already = runningDone.get(line.id) ?? 0;
        const capped = qty(Math.min(amount, Math.max(0, target - already)));
        if (capped <= 0) return;
        runningDone.set(line.id, qty(already + capped));

        const entry: DprProgressEntry = {
          id: sid("dpr_progress_entry", next(counters, "dpr_progress_entry")),
          project_id: project.id,
          created_at: dprIso,
          updated_at: dprIso,
          dpr_id,
          site_task_id: taskByLine.get(line.id)?.id ?? null,
          work_order_line_id: line.id,
          qty_done_today: capped,
          remarks: "",
        };
        progress.push(entry);

        db.work_progress.push({
          id: sid("work_progress", next(counters, "work_progress")),
          project_id: project.id,
          created_at: dprIso,
          updated_at: dprIso,
          work_order_line_id: line.id,
          boq_line_id: line.boq_line_id,
          dpr_id,
          progress_date: dprIso.slice(0, 10),
          quantity_done: capped,
          cumulative_quantity: runningDone.get(line.id)!,
          recorded_by_user_id: se.id,
          remarks: "",
        } satisfies WorkProgress);
      });

      const labour: DprLabourEntry[] = workOrders.slice(0, 3).flatMap((wo, wi) =>
        LABOUR_MIX.filter((_, ti) => (ti + wi + dayIndex) % 3 === 0).map((trade, ti) => ({
          id: sid("dpr_labour_entry", next(counters, "dpr_labour_entry")),
          project_id: project.id,
          created_at: dprIso,
          updated_at: dprIso,
          dpr_id,
          contractor_id: wo.contractor_id,
          trade,
          count: pick(dayIndex * 11 + wi * 5 + ti, 3, 24),
          remarks: "",
        })),
      );

      db.dprs.push({
        id: dpr_id,
        project_id: project.id,
        created_at: dprIso,
        updated_at: dprIso,
        report_date: dprIso.slice(0, 10),
        prepared_by_user_id: se.id,
        weather: weathers[dayIndex % weathers.length],
        remarks:
          dayIndex % 4 === 0 ? "Awaiting material against the pending indent." : "",
        total_labour_count: labour.reduce((s, l) => s + l.count, 0),
        total_progress_entries: progress.length,
      } satisfies Dpr);
      db.dpr_progress_entries.push(...progress);
      db.dpr_labour_entries.push(...labour);
    });

  // A4: done_qty is whatever the reports added up to.
  activeLines.forEach((line) => {
    line.done_qty = qty(runningDone.get(line.id) ?? 0);
  });

  /* ================================================================== */
  /* C1/C2 — measurements and the bills built from them                  */
  /* ================================================================== */

  /** Measures a slice of each of a work order's active, done-but-unmeasured lines. */
  function makeMeasurement(opts: {
    workOrder: WorkOrder;
    lines: WorkOrderLine[];
    fraction: number;
    days_ago: number;
    status: "draft" | "signed" | "billed";
    /** Force the last line past its work-order quantity, with a reason. */
    excess?: boolean;
  }): { measurement: JointMeasurement; lines: JointMeasurementLine[] } | null {
    const jmIso = daysAgoIso(opts.days_ago);
    const jm_id = sid("joint_measurement", next(counters, "joint_measurement"));
    const signed = opts.status !== "draft";

    const jmLines: JointMeasurementLine[] = [];
    opts.lines.forEach((line) => {
      const unmeasured = qty(line.done_qty - line.measured_qty);
      if (unmeasured <= 0) return;
      // The excess sheet measures everything left on a line the site has
      // taken past its quantity; nothing is ever measured beyond what was done.
      const wantExcess = opts.excess && line.done_qty > line.quantity;
      const measured = wantExcess
        ? unmeasured
        : qty(Math.min(unmeasured, line.done_qty * opts.fraction));
      if (measured <= 0) return;

      const cumulative = qty(line.measured_qty + measured);
      const is_excess = cumulative > line.quantity + 0.0005;

      // Split the quantity back into a plausible dimension grid.
      const nos = Math.max(1, Math.round(measured / 12) || 1);
      jmLines.push({
        id: sid("joint_measurement_line", next(counters, "joint_measurement_line")),
        project_id: project.id,
        created_at: jmIso,
        updated_at: jmIso,
        joint_measurement_id: jm_id,
        boq_line_id: line.boq_line_id,
        work_order_line_id: line.id,
        description: line.description,
        unit: line.unit,
        nos,
        length: Math.round((measured / nos) * 100) / 100,
        breadth: null,
        depth: null,
        is_manual_qty: true,
        measured_qty: measured,
        previous_measured_qty: line.measured_qty,
        cumulative_measured_qty: cumulative,
        agreed_rate: line.agreed_rate,
        amount: rupees(measured * line.agreed_rate),
        is_excess,
        excess_reason: is_excess
          ? "Extra width measured at the lift lobby, instructed by the architect on site."
          : "",
        remarks: "",
      });

      // Only a signed sheet moves the work-order line's measured quantity.
      if (signed) line.measured_qty = cumulative;
    });

    if (jmLines.length === 0) return null;

    const measurement: JointMeasurement = {
      id: jm_id,
      project_id: project.id,
      created_at: jmIso,
      updated_at: jmIso,
      measurement_number: seedDocumentNumber(
        plan.short_code,
        "JM",
        jmIso,
        docSeq(counters, plan.code, "JM"),
      ),
      work_order_id: opts.workOrder.id,
      contractor_id: opts.workOrder.contractor_id,
      measurement_date: jmIso.slice(0, 10),
      period_from: daysAgoDate(opts.days_ago + 14),
      period_to: daysAgoDate(opts.days_ago),
      status: opts.status,
      measured_by_user_id: qsUser.id,
      signed_by_contractor_name: signed
        ? (contractorById.get(opts.workOrder.contractor_id)?.contact_person ?? "Site representative")
        : "",
      signed_by_contractor_at: signed ? jmIso : null,
      signed_by_qs_user_id: signed ? qsUser.id : null,
      signed_by_qs_at: signed ? jmIso : null,
      ra_bill_id: null,
      has_excess: jmLines.some((l) => l.is_excess),
      total_value: rupees(jmLines.reduce((s, l) => s + l.amount, 0)),
      remarks: "",
    };

    db.joint_measurements.push(measurement);
    db.joint_measurement_lines.push(...jmLines);
    return { measurement, lines: jmLines };
  }

  /** Builds an RA bill from one measurement and walks it to the wanted state. */
  function makeRaBill(opts: {
    workOrder: WorkOrder;
    measurement: JointMeasurement;
    jmLines: JointMeasurementLine[];
    sequence: number;
    days_ago: number;
    spec: BillSpec;
  }): RaBill {
    const billIso = daysAgoIso(opts.days_ago);
    const bill_id = sid("ra_bill", next(counters, "ra_bill"));
    const contractor = contractorById.get(opts.workOrder.contractor_id)!;
    const tds_percent = TDS_PERCENT[contractor.type];

    const earlier = db.ra_bills.filter(
      (b) => b.work_order_id === opts.workOrder.id && b.status !== "rejected" && b.status !== "draft",
    );
    const previous_gross_amount = rupees(earlier.reduce((s, b) => s + b.gross_amount, 0));
    const earlierLines = db.ra_bill_lines.filter((l) =>
      earlier.some((b) => b.id === l.ra_bill_id),
    );

    const lines: RaBillLine[] = opts.jmLines.map((jm) => {
      const previous_cumulative_qty = qty(
        earlierLines
          .filter((l) => l.work_order_line_id === jm.work_order_line_id)
          .reduce((s, l) => s + l.certified_qty, 0),
      );
      return {
        id: sid("ra_bill_line", next(counters, "ra_bill_line")),
        project_id: project.id,
        created_at: billIso,
        updated_at: billIso,
        ra_bill_id: bill_id,
        work_order_line_id: jm.work_order_line_id,
        boq_line_id: jm.boq_line_id,
        description: jm.description,
        unit: jm.unit,
        rate: jm.agreed_rate,
        previous_cumulative_qty,
        claimed_qty: jm.measured_qty,
        certified_qty: jm.measured_qty,
        cumulative_qty: qty(previous_cumulative_qty + jm.measured_qty),
        amount: rupees(jm.measured_qty * jm.agreed_rate),
      };
    });

    const advance_recovery_amount = opts.sequence === 1 ? 0 : rupees(lines.length * 5000);
    const other_deductions_amount = opts.spec.qs_revision ? 2500 : 0;

    /* --- the chain acts, in order ------------------------------------- */
    const acted = opts.spec.sent_back_at ?? opts.spec.pending_sequence ?? 5;
    const revisions: Array<{ line: RaBillLine; from: number; to: number }> = [];

    APPROVAL_CHAINS.ra_bill.forEach((step) => {
      const approvedHere = step.sequence < acted;
      const sentBackHere = step.sequence === opts.spec.sent_back_at;
      const actedIso = daysAgoIso(Math.max(1, opts.days_ago - step.sequence));

      if (approvedHere && step.sequence === 1 && opts.spec.qs_revision) {
        // The QS trimmed the first line before passing it on.
        const line = lines[0];
        const to = qty(line.claimed_qty * 0.88);
        revisions.push({ line, from: line.certified_qty, to });
        line.certified_qty = to;
        line.cumulative_qty = qty(line.previous_cumulative_qty + to);
        line.amount = rupees(to * line.rate);
      }

      // Every chain row exists from the moment the bill is submitted, exactly
      // as submitRaBill() creates them — steps beyond the current one simply
      // sit pending until the bill reaches them.
      if (opts.spec.status === "draft" && !approvedHere && !sentBackHere && !opts.spec.sent_back_at) {
        return;
      }

      db.approvals.push({
        id: sid("approval", next(counters, "approval")),
        created_at: billIso,
        updated_at: approvedHere || sentBackHere ? actedIso : billIso,
        project_id: project.id,
        entity_type: "ra_bill",
        entity_id: bill_id,
        step_code: step.step_code,
        sequence: step.sequence,
        required_role: step.required_role,
        status: sentBackHere ? "rejected" : approvedHere ? "approved" : "pending",
        actor_user_id:
          approvedHere || sentBackHere ? chainUser[step.sequence as 1 | 2 | 3 | 4].id : null,
        comment: sentBackHere
          ? (opts.spec.comment ?? "")
          : approvedHere
            ? opts.spec.qs_revision && step.sequence === 1
              ? "Lift-lobby plaster trimmed to the measured area."
              : `${step.label} completed.`
            : "",
        acted_at: approvedHere || sentBackHere ? actedIso : null,
      } satisfies Approval);
    });

    revisions.forEach((r) => {
      db.ra_bill_revisions.push({
        id: sid("ra_bill_revision", next(counters, "ra_bill_revision")),
        created_at: daysAgoIso(Math.max(1, opts.days_ago - 1)),
        updated_at: daysAgoIso(Math.max(1, opts.days_ago - 1)),
        project_id: project.id,
        ra_bill_id: bill_id,
        ra_bill_line_id: r.line.id,
        step_code: "C3",
        sequence: 1,
        user_id: qsUser.id,
        from_qty: r.from,
        to_qty: r.to,
        comment: "Lift-lobby plaster trimmed to the measured area.",
        acted_at: daysAgoIso(Math.max(1, opts.days_ago - 1)),
      });
    });

    const totals = computeRaBillTotals(lines, {
      previous_gross_amount,
      retention_percent: opts.workOrder.retention_percent,
      tds_percent,
      advance_recovery_amount,
      other_deductions_amount,
    });

    const pendingStep = opts.spec.pending_sequence
      ? APPROVAL_CHAINS.ra_bill.find((s) => s.sequence === opts.spec.pending_sequence)
      : null;

    const bill: RaBill = {
      id: bill_id,
      project_id: project.id,
      created_at: billIso,
      updated_at: billIso,
      bill_number: raBillNumber(plan.short_code, opts.workOrder.wo_number, opts.sequence),
      bill_sequence: opts.sequence,
      work_order_id: opts.workOrder.id,
      contractor_id: opts.workOrder.contractor_id,
      joint_measurement_ids: [opts.measurement.id],
      bill_date: billIso.slice(0, 10),
      period_from: opts.measurement.period_from,
      period_to: opts.measurement.period_to,
      status: opts.spec.status,
      previous_gross_amount,
      retention_percent: opts.workOrder.retention_percent,
      tds_percent,
      advance_recovery_amount,
      other_deductions_amount,
      other_deductions_reason: other_deductions_amount > 0 ? "Water and power charges" : "",
      prepared_by_user_id: qsUser.id,
      submitted_at: opts.spec.status === "draft" ? null : billIso,
      current_step_code: pendingStep?.step_code ?? null,
      current_sequence: pendingStep?.sequence ?? null,
      certified_at:
        opts.spec.status === "certified" || opts.spec.status === "handed_over"
          ? daysAgoIso(Math.max(1, opts.days_ago - 5))
          : null,
      handed_over_at:
        opts.spec.status === "handed_over" ? daysAgoIso(Math.max(1, opts.days_ago - 6)) : null,
      decision_comment: opts.spec.comment ?? "",
      remarks: "",
      ...totals,
    };

    db.ra_bills.push(bill);
    db.ra_bill_lines.push(...lines);
    db.joint_measurements
      .filter((m) => m.id === opts.measurement.id)
      .forEach((m) => {
        m.ra_bill_id = bill_id;
      });

    // Only a certified bill advances the work-order line's billed quantity.
    if (bill.status === "certified" || bill.status === "handed_over") {
      lines.forEach((l) => {
        const woLine = workOrderLines.find((w) => w.id === l.work_order_line_id);
        if (woLine) woLine.billed_qty = qty(woLine.billed_qty + l.certified_qty);
      });
    }

    return bill;
  }

  /* ---- one bill per spec, spread round-robin across the work orders --- */
  // A contractor with nothing done has nothing to bill.
  const billableWos = workOrders.filter((wo) =>
    activeLines.some((l) => l.work_order_id === wo.id && (targetDone.get(l.id) ?? 0) > 0),
  );
  // The seven showcase bills stay on the first four trades — frame,
  // blockwork, plaster, tiling on the lead project — whatever else is let.
  const showcaseWos = billableWos.slice(0, 4);
  const sequenceByWo = new Map<string, number>();

  /*
   * Settled history, before the seven bills the demo walks through.
   *
   * A seventeen-month-old project has a run of RA bills already certified and
   * handed to accounts; without them the portfolio chart showed 3% consumed on
   * every project (audit H1). These are all `handed_over` — no queue, no
   * approval waiting — so they add weight without adding noise to any inbox.
   */
  const HISTORY_BILLS = plan.consumed >= 0.5 ? 4 : plan.consumed >= 0.2 ? 3 : 0;
  /*
   * History must stop well short of what the site has reported done. The
   * seven showcase bills below take about 0.44 of each work order between
   * them, and the three trailing measurements (draft, signed, excess) another
   * 0.32 — so history takes under half, or those queues come up empty and the
   * demo has nothing to walk through.
   */
  const HISTORY_SLICE = plan.consumed >= 0.5 ? 0.11 : 0.15;

  for (let round = 0; round < HISTORY_BILLS; round += 1) {
    billableWos.forEach((wo, wi) => {
      const lines = activeLines.filter((l) => l.work_order_id === wo.id);
      // Each round takes a large slice of what is left unmeasured.
      const made = makeMeasurement({
        workOrder: wo,
        lines,
        fraction: HISTORY_SLICE,
        days_ago: 250 - round * 45 - wi,
        status: "billed",
      });
      if (!made) return;
      const sequence = (sequenceByWo.get(wo.id) ?? 0) + 1;
      sequenceByWo.set(wo.id, sequence);
      makeRaBill({
        workOrder: wo,
        measurement: made.measurement,
        jmLines: made.lines,
        sequence,
        days_ago: 246 - round * 45 - wi,
        spec: { status: "handed_over", pending_sequence: null },
      });
    });
  }

  BILL_SPECS.forEach((spec, i) => {
    const wo = showcaseWos[i % Math.max(showcaseWos.length, 1)];
    if (!wo) return;
    const lines = activeLines.filter((l) => l.work_order_id === wo.id);
    const made = makeMeasurement({
      workOrder: wo,
      lines,
      fraction: 0.22,
      days_ago: 58 - i * 7,
      status: "billed",
    });
    if (!made) return;
    const sequence = (sequenceByWo.get(wo.id) ?? 0) + 1;
    sequenceByWo.set(wo.id, sequence);
    makeRaBill({
      workOrder: wo,
      measurement: made.measurement,
      jmLines: made.lines,
      sequence,
      days_ago: 54 - i * 7,
      spec,
    });
  });

  /* ---- measurements that have not become bills ----------------------- */
  if (billableWos[0]) {
    // Signed and waiting for the QS to prepare a bill.
    makeMeasurement({
      workOrder: billableWos[0],
      lines: activeLines.filter((l) => l.work_order_id === billableWos[0].id),
      fraction: 0.14,
      days_ago: 6,
      status: "signed",
    });
  }
  const excessWo =
    excessLine && excessLine.done_qty > excessLine.quantity
      ? workOrders.find((w) => w.id === excessLine.work_order_id)
      : undefined;
  if (excessWo) {
    // Signed, and one line measured past the work-order quantity.
    makeMeasurement({
      workOrder: excessWo,
      lines: activeLines.filter((l) => l.work_order_id === excessWo.id),
      fraction: 0.1,
      days_ago: 4,
      status: "signed",
      excess: true,
    });
  }
  const draftWo = showcaseWos[2] ?? showcaseWos[0];
  if (draftWo) {
    // Still being typed up — no signatures, so it moves nothing.
    makeMeasurement({
      workOrder: draftWo,
      lines: activeLines.filter((l) => l.work_order_id === draftWo.id),
      fraction: 0.08,
      days_ago: 2,
      status: "draft",
    });
  }

  /* ---- A4: what the site has flagged ready for the QS ---------------- */
  activeLines.forEach((line, i) => {
    const unmeasured = qty(line.done_qty - line.measured_qty);
    if (unmeasured <= 0 || i % 2 === 1) return;
    line.ready_to_measure = true;
    line.ready_qty = qty(unmeasured * 0.8);
  });
}
