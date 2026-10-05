import { z } from "zod";
import { getRepositories } from "@/lib/data";
import {
  PO_TRANSITIONS,
  nowIso,
  type Approval,
  type IndentStatus,
  type PoAmendment,
  type PoDeliverySchedule,
  type PoDeliveryScheduleLine,
  type PoLine,
  type PoTerm,
  type PurchaseOrder,
  type Unit,
} from "@/lib/domain";
import { APPROVAL_CHAINS } from "@/config/permissions";
import { assertCan, assertTransition, parseInput, qty, required, rupees } from "./guards";
import { nextDocumentNumber } from "./numbering";
import { poCharges } from "./po-math";
import { composePoTerms, PO_VARIABLE_DEFAULTS } from "./po-terms";
import { PermissionError, ValidationError, WorkflowError, type ActingUser } from "./types";

/**
 * The purchase order's own workflow: the two-level sign-off between B3 and B4,
 * and the issue that opens the order to the GRN flow.
 *
 * Creation, the delivery schedule, the charges and the amendment live beside
 * this in the same file as they are built; the comparative-driven B3 generator
 * stays in `purchase-service.ts`, which is where the comparative is.
 */

/* ------------------------------------------------------------------ */
/* The chain                                                           */
/* ------------------------------------------------------------------ */

/** The chain row this order waits on, or null when it is not in the chain. */
export async function pendingPoStep(purchase_order_id: string): Promise<Approval | null> {
  const rows = await getRepositories().approvals.listForEntity(
    "purchase_order",
    purchase_order_id,
  );
  const pending = rows
    .filter((r) => r.status === "pending")
    .sort((a, b) => a.sequence - b.sequence);
  return pending[0] ?? null;
}

/**
 * B3 — the officer sends a draft for sign-off.
 *
 * Both chain rows are opened at once and both start `pending`, exactly as the
 * RA bill chain does: only the lowest pending sequence is actionable, and only
 * by the role that holds it. Resubmitting an order that was sent back reopens
 * the rows that were closed rather than adding a second set, so the Approval
 * table stays readable as the audit trail it is.
 */
export async function submitPurchaseOrder(
  purchase_order_id: string,
  actor: ActingUser,
): Promise<{ purchase_order: PurchaseOrder; approvals: Approval[] }> {
  assertCan(actor, "edit", "purchase_orders");
  const repos = getRepositories();

  const po = required(await repos.purchaseOrders.getById(purchase_order_id), "Purchase order");
  assertTransition("Purchase order", PO_TRANSITIONS, po.status, "pending_approval");

  const lines = await repos.purchaseOrders.listLinesByPo(po.id);
  if (lines.length === 0) {
    throw new WorkflowError("This purchase order has no lines to approve.");
  }

  const at = nowIso();
  const existing = await repos.approvals.listForEntity("purchase_order", po.id);
  const approvals: Approval[] = [];

  for (const step of APPROVAL_CHAINS.purchase_order) {
    const prior = existing.find((a) => a.sequence === step.sequence);
    approvals.push(
      prior
        ? await repos.approvals.update(prior.id, {
            status: "pending",
            actor_user_id: null,
            comment: "",
            acted_at: null,
          })
        : await repos.approvals.create({
            project_id: po.project_id,
            entity_type: "purchase_order",
            entity_id: po.id,
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

  const first = APPROVAL_CHAINS.purchase_order[0];
  const purchase_order = await repos.purchaseOrders.update(po.id, {
    status: "pending_approval",
    submitted_at: at,
    current_step_code: first.step_code,
    current_sequence: first.sequence,
    decision_comment: "",
  });

  return { purchase_order, approvals };
}

export const actOnPurchaseOrderInput = z
  .object({
    purchase_order_id: z.string().min(1),
    action: z.enum(["approve", "send_back", "reject"]),
    comment: z.string().default(""),
  })
  .refine((d) => d.action === "approve" || d.comment.trim().length > 0, {
    message: "sending back or rejecting needs a comment",
    path: ["comment"],
  });

export type ActOnPurchaseOrderInput = z.input<typeof actOnPurchaseOrderInput>;

/**
 * One chain step acts. Recommending moves the order on to the authorised
 * signatory; authorising makes it `approved`, which is what `issuePurchaseOrder`
 * needs. Sending back returns it to the officer as a draft; rejecting stops it.
 */
export async function actOnPurchaseOrder(
  input: ActOnPurchaseOrderInput,
  actor: ActingUser,
): Promise<{ purchase_order: PurchaseOrder; approval: Approval }> {
  assertCan(actor, "approve", "purchase_orders");
  const data = parseInput(actOnPurchaseOrderInput, input);
  const repos = getRepositories();

  const po = required(await repos.purchaseOrders.getById(data.purchase_order_id), "Purchase order");
  if (po.status !== "pending_approval") {
    throw new WorkflowError(`This purchase order is "${po.status}", not awaiting approval.`);
  }

  const step = await pendingPoStep(po.id);
  if (!step) throw new WorkflowError("This purchase order has no open approval step.");
  if (step.required_role !== actor.role) {
    throw new PermissionError(
      `This order is waiting on ${step.required_role.replace(/_/g, " ")}, not ${actor.role.replace(/_/g, " ")}.`,
    );
  }

  const at = nowIso();

  if (data.action !== "approve") {
    const approval = await repos.approvals.update(step.id, {
      status: data.action === "send_back" ? "sent_back" : "rejected",
      actor_user_id: actor.user_id,
      comment: data.comment,
      acted_at: at,
    });
    const next = data.action === "send_back" ? "sent_back" : "rejected";
    assertTransition("Purchase order", PO_TRANSITIONS, po.status, next);
    const purchase_order = await repos.purchaseOrders.update(po.id, {
      status: next,
      current_step_code: null,
      current_sequence: null,
      decision_comment: data.comment,
    });
    return { purchase_order, approval };
  }

  const approval = await repos.approvals.update(step.id, {
    status: "approved",
    actor_user_id: actor.user_id,
    comment: data.comment,
    acted_at: at,
  });

  const nextStep = APPROVAL_CHAINS.purchase_order.find((s) => s.sequence === step.sequence + 1);
  if (nextStep) {
    const purchase_order = await repos.purchaseOrders.update(po.id, {
      current_step_code: nextStep.step_code,
      current_sequence: nextStep.sequence,
    });
    return { purchase_order, approval };
  }

  assertTransition("Purchase order", PO_TRANSITIONS, po.status, "approved");
  const purchase_order = await repos.purchaseOrders.update(po.id, {
    status: "approved",
    current_step_code: null,
    current_sequence: null,
  });
  return { purchase_order, approval };
}

/**
 * A sent-back order returns to the officer's hands. Separate from editing so
 * the reopening is one deliberate act and the chain rows are only reset once.
 */
export async function reopenPurchaseOrder(
  purchase_order_id: string,
  actor: ActingUser,
): Promise<PurchaseOrder> {
  assertCan(actor, "edit", "purchase_orders");
  const repos = getRepositories();
  const po = required(await repos.purchaseOrders.getById(purchase_order_id), "Purchase order");
  assertTransition("Purchase order", PO_TRANSITIONS, po.status, "draft");
  return repos.purchaseOrders.update(po.id, {
    status: "draft",
    current_step_code: null,
    current_sequence: null,
  });
}

/* ------------------------------------------------------------------ */
/* B4 — issue                                                          */
/* ------------------------------------------------------------------ */

/**
 * B4. Issues the authorised order to the supplier, which locks it and makes it
 * visible to the GRN flow. Nothing can be received before this.
 */
export async function issuePurchaseOrder(
  purchase_order_id: string,
  actor: ActingUser,
): Promise<PurchaseOrder> {
  assertCan(actor, "edit", "purchase_orders");
  const repos = getRepositories();
  const po = required(await repos.purchaseOrders.getById(purchase_order_id), "Purchase order");
  assertTransition("Purchase order", PO_TRANSITIONS, po.status, "sent");
  return repos.purchaseOrders.update(po.id, {
    status: "sent",
    sent_at: nowIso(),
    current_step_code: null,
    current_sequence: null,
  });
}

/* ------------------------------------------------------------------ */
/* B3 — writing an order                                               */
/* ------------------------------------------------------------------ */

/**
 * One PO line.
 *
 * Where the line comes from a document above it — an approved indent line, or a
 * comparative line whose vendor won — the material, unit and BOQ attribution
 * come with it and the editor shows them read-only. A line on a blank order has
 * nothing above it, so it names its own material and the BOQ line its cost
 * belongs to; that is the one place a PO picks a material.
 */
export const purchaseOrderLineInput = z.object({
  indent_line_id: z.string().nullable().default(null),
  comparative_line_id: z.string().nullable().default(null),
  /** Required only on a line with no document above it. */
  material_id: z.string().default(""),
  boq_line_id: z.string().default(""),
  ordered_qty: z.number().positive("order a quantity greater than zero"),
  rate: z.number().nonnegative(),
  gst_percent: z.number().min(0).max(28),
  freight_amount: z.number().nonnegative().default(0),
});
export type PurchaseOrderLineInput = z.input<typeof purchaseOrderLineInput>;

/** One instalment inside a delivery schedule, against a line by its position. */
export const deliveryScheduleLineInput = z.object({
  /** Index into `lines`, because the PO lines have no ids until they are written. */
  line_index: z.number().int().nonnegative(),
  quantity: z.number().positive("schedule a quantity greater than zero"),
  /** Null on a balance schedule. */
  delivery_date: z.string().nullable().default(null),
});

export const deliveryScheduleInput = z.object({
  title: z.string().default(""),
  /** A balance schedule carries no dates; it prints the "as per site requirement" note. */
  is_balance: z.boolean().default(false),
  note: z.string().default(""),
  lines: z.array(deliveryScheduleLineInput).default([]),
});
export type DeliveryScheduleInput = z.input<typeof deliveryScheduleInput>;

export const purchaseOrderInput = z.object({
  project_id: z.string().min(1),
  supplier_id: z.string().min(1, "pick the supplier this order goes to"),
  /** Set when the order came out of an approved comparative. */
  comparative_id: z.string().nullable().default(null),
  po_date: z.string().optional(),
  expected_delivery_date: z.string().optional(),
  lines: z.array(purchaseOrderLineInput).min(1, "an order needs at least one line"),
  schedules: z.array(deliveryScheduleInput).default([]),
  transportation_charge: z.number().nonnegative().default(0),
  freight_gst_percent: z.number().min(0).max(28).default(18),
  delivery_address: z.string().default(""),
  delivery_contact_name: z.string().default(""),
  delivery_contact_phone: z.string().default(""),
  /** The four clauses that read differently on every order. */
  payment_terms: z.string().default(PO_VARIABLE_DEFAULTS.payment_terms),
  po_validity: z.string().default(PO_VARIABLE_DEFAULTS.po_validity),
  warranty: z.string().default(PO_VARIABLE_DEFAULTS.warranty),
  brand_terms: z.string().default(PO_VARIABLE_DEFAULTS.brand),
  /** Library clauses this order carries. Empty means "the default selection". */
  clause_ids: z.array(z.string()).default([]),
  /** Library wording reworded on this order only, keyed by clause id. */
  clause_overrides: z.record(z.string(), z.string()).default({}),
});
export type PurchaseOrderInput = z.input<typeof purchaseOrderInput>;

export type PurchaseOrderDocument = {
  purchase_order: PurchaseOrder;
  lines: PoLine[];
  schedules: PoDeliverySchedule[];
  schedule_lines: PoDeliveryScheduleLine[];
  terms: PoTerm[];
};

/** A line resolved against whatever document sits above it. */
type ResolvedLine = {
  input: z.infer<typeof purchaseOrderLineInput>;
  material_id: string;
  boq_line_id: string;
  unit: Unit;
  indent_id: string | null;
  brand: string;
  specification: string;
};

/**
 * Resolves each input line against the document above it, and refuses anything
 * that would let an order be raised for something nobody asked for.
 *
 * An indent line must be approved and have quantity left unordered; a
 * comparative line must belong to the approved comparative this order came from
 * and to the supplier that won it. Material and unit are never taken from the
 * input where a parent exists — that is what stops a PO quietly ordering a
 * different material from the one the site indented.
 */
async function resolveLines(
  data: z.infer<typeof purchaseOrderInput>,
  project_id: string,
  ignorePoId: string | null,
): Promise<ResolvedLine[]> {
  const repos = getRepositories();
  const indentLines = await repos.indents.listLinesByProject(project_id);
  const indents = await repos.indents.listByProject(project_id);
  const indentById = new Map(indents.map((i) => [i.id, i]));
  const indentLineById = new Map(indentLines.map((l) => [l.id, l]));
  const comparativeLines = data.comparative_id
    ? await repos.comparatives.listLinesByComparative(data.comparative_id)
    : [];
  const comparativeLineById = new Map(comparativeLines.map((l) => [l.id, l]));
  const materials = await repos.materials.list();
  const materialById = new Map(materials.map((m) => [m.id, m]));
  const boqLines = await repos.boq.listByProject(project_id);
  const boqIds = new Set(boqLines.map((b) => b.id));

  /* Quantity already on another live order, so a line cannot be ordered twice. */
  const liveOrders = (await repos.purchaseOrders.listByProject(project_id)).filter(
    (p) => p.id !== ignorePoId && p.status !== "rejected",
  );
  const liveIds = new Set(liveOrders.map((p) => p.id));
  const alreadyOrdered = new Map<string, number>();
  for (const l of await repos.purchaseOrders.listLinesByProject(project_id)) {
    if (!liveIds.has(l.purchase_order_id) || !l.indent_line_id) continue;
    alreadyOrdered.set(
      l.indent_line_id,
      (alreadyOrdered.get(l.indent_line_id) ?? 0) + l.ordered_qty,
    );
  }

  const wantedPerIndentLine = new Map<string, number>();
  const out: ResolvedLine[] = [];

  data.lines.forEach((input, i) => {
    let material_id = input.material_id;
    let boq_line_id = input.boq_line_id;
    let indent_id: string | null = null;

    if (input.comparative_line_id) {
      const cl = comparativeLineById.get(input.comparative_line_id);
      if (!cl) throw new ValidationError(`lines.${i}: not a line on this comparative`);
      if (cl.selected_supplier_id !== data.supplier_id) {
        throw new ValidationError(
          `lines.${i}: this line was awarded to another supplier on the comparative`,
        );
      }
      material_id = cl.material_id;
      boq_line_id = cl.boq_line_id;
      indent_id = cl.indent_id;
      if (!input.indent_line_id) input.indent_line_id = cl.indent_line_id;
    }

    if (input.indent_line_id) {
      const il = indentLineById.get(input.indent_line_id);
      if (!il) throw new ValidationError(`lines.${i}: not an indent line on this project`);
      const indent = indentById.get(il.indent_id);
      if (!indent || !INDENT_READY_FOR_PO.includes(indent.status)) {
        throw new ValidationError(
          `lines.${i}: indent ${indent?.indent_number ?? ""} is not approved for purchase`,
        );
      }
      const approved = il.approved_qty ?? 0;
      if (approved <= 0) throw new ValidationError(`lines.${i}: this line was not approved`);

      const wanted = (wantedPerIndentLine.get(il.id) ?? 0) + input.ordered_qty;
      wantedPerIndentLine.set(il.id, wanted);
      const balance = qty(approved - (alreadyOrdered.get(il.id) ?? 0));
      if (wanted > balance + 0.0005) {
        throw new ValidationError(
          `lines.${i}: only ${balance} of the approved quantity is left to order on this indent line`,
        );
      }
      material_id = il.material_id;
      boq_line_id = il.boq_line_id;
      indent_id = il.indent_id;
    }

    if (!material_id) throw new ValidationError(`lines.${i}.material_id: pick a material`);
    if (!boq_line_id) throw new ValidationError(`lines.${i}.boq_line_id: pick the BOQ line this is against`);
    if (!boqIds.has(boq_line_id)) {
      throw new ValidationError(`lines.${i}.boq_line_id: not a BOQ line on this project`);
    }
    const material = materialById.get(material_id);
    if (!material) throw new ValidationError(`lines.${i}.material_id: unknown material`);

    out.push({
      input,
      material_id,
      boq_line_id,
      unit: material.unit,
      indent_id,
      brand: material.brand,
      specification: material.specification,
    });
  });

  return out;
}

/** An indent whose lines may still be put on an order. */
const INDENT_READY_FOR_PO: IndentStatus[] = [
  "approved",
  "partially_approved",
  "in_comparative",
  "po_raised",
  "partially_received",
];

/**
 * Checks every schedule against the lines it draws on.
 *
 * Scheduled quantity may not exceed what was ordered — a schedule promising
 * more than the order carries is a supplier dispute waiting to happen. A dated
 * schedule needs its dates; a balance schedule must not have any, because the
 * whole point of it is that they are not known yet.
 */
function assertSchedulesFit(
  data: z.infer<typeof purchaseOrderInput>,
  resolved: ResolvedLine[],
): void {
  const scheduled = new Map<number, number>();
  data.schedules.forEach((schedule, si) => {
    schedule.lines.forEach((line, li) => {
      if (line.line_index >= resolved.length) {
        throw new ValidationError(`schedules.${si}.lines.${li}: no such order line`);
      }
      if (schedule.is_balance && line.delivery_date) {
        throw new ValidationError(
          `schedules.${si}.lines.${li}: a balance schedule carries no dates — its dates are confirmed as per site requirement`,
        );
      }
      if (!schedule.is_balance && !line.delivery_date) {
        throw new ValidationError(`schedules.${si}.lines.${li}.delivery_date: give a delivery date`);
      }
      scheduled.set(line.line_index, (scheduled.get(line.line_index) ?? 0) + line.quantity);
    });
  });

  for (const [index, total] of scheduled) {
    const ordered = resolved[index].input.ordered_qty;
    if (qty(total) > ordered + 0.0005) {
      throw new ValidationError(
        `schedules: line ${index + 1} is scheduled for ${qty(total)} against an ordered ${ordered}`,
      );
    }
  }
}

/** The clauses this order carries: the given selection, or the library default. */
async function clausesFor(clause_ids: string[]) {
  const all = await getRepositories().poClauses.listActive();
  if (clause_ids.length === 0) return all.filter((c) => c.is_default);
  const wanted = new Set(clause_ids);
  return all.filter((c) => wanted.has(c.id));
}

/** Writes the order's lines, schedules and clause list. Used by create and update. */
async function writeChildren(
  po: PurchaseOrder,
  data: z.infer<typeof purchaseOrderInput>,
  resolved: ResolvedLine[],
): Promise<Omit<PurchaseOrderDocument, "purchase_order">> {
  const repos = getRepositories();

  const lines: PoLine[] = [];
  for (const r of resolved) {
    const basic = rupees(r.input.ordered_qty * r.input.rate);
    const tax = rupees(((basic + r.input.freight_amount) * r.input.gst_percent) / 100);
    lines.push(
      await repos.purchaseOrders.createLine({
        project_id: po.project_id,
        purchase_order_id: po.id,
        comparative_line_id: r.input.comparative_line_id,
        indent_id: r.indent_id,
        indent_line_id: r.input.indent_line_id,
        boq_line_id: r.boq_line_id,
        material_id: r.material_id,
        unit: r.unit,
        ordered_qty: qty(r.input.ordered_qty),
        rate: rupees(r.input.rate),
        gst_percent: r.input.gst_percent,
        freight_amount: rupees(r.input.freight_amount),
        basic_amount: basic,
        tax_amount: tax,
        line_total: rupees(basic + r.input.freight_amount + tax),
        brand: r.brand,
        specification: r.specification,
        received_qty: 0,
        rejected_qty: 0,
      }),
    );
  }

  const schedules: PoDeliverySchedule[] = [];
  const schedule_lines: PoDeliveryScheduleLine[] = [];
  for (const [si, s] of data.schedules.entries()) {
    const schedule = await repos.purchaseOrders.createSchedule({
      project_id: po.project_id,
      purchase_order_id: po.id,
      sequence: si + 1,
      title: s.title,
      is_balance: s.is_balance,
      note: s.note,
    });
    schedules.push(schedule);
    for (const l of s.lines) {
      const line = lines[l.line_index];
      schedule_lines.push(
        await repos.purchaseOrders.createScheduleLine({
          project_id: po.project_id,
          purchase_order_id: po.id,
          po_delivery_schedule_id: schedule.id,
          po_line_id: line.id,
          material_id: line.material_id,
          unit: line.unit,
          quantity: qty(l.quantity),
          delivery_date: s.is_balance ? null : l.delivery_date,
        }),
      );
    }
  }

  const drafts = composePoTerms(
    await clausesFor(data.clause_ids),
    {
      payment_terms: data.payment_terms,
      po_validity: data.po_validity,
      warranty: data.warranty,
      brand: data.brand_terms,
    },
    data.clause_overrides,
  );
  const terms: PoTerm[] = [];
  for (const d of drafts) {
    terms.push(
      await repos.purchaseOrders.createTerm({
        project_id: po.project_id,
        purchase_order_id: po.id,
        ...d,
      }),
    );
  }

  return { lines, schedules, schedule_lines, terms };
}

/** Removes every child row of a draft, ahead of rewriting them. */
async function clearChildren(purchase_order_id: string): Promise<void> {
  const repos = getRepositories();
  for (const l of await repos.purchaseOrders.listScheduleLinesByPo(purchase_order_id)) {
    await repos.purchaseOrders.removeScheduleLine(l.id);
  }
  for (const s of await repos.purchaseOrders.listSchedulesByPo(purchase_order_id)) {
    await repos.purchaseOrders.removeSchedule(s.id);
  }
  for (const t of await repos.purchaseOrders.listTermsByPo(purchase_order_id)) {
    await repos.purchaseOrders.removeTerm(t.id);
  }
  for (const l of await repos.purchaseOrders.listLinesByPo(purchase_order_id)) {
    await repos.purchaseOrders.removeLine(l.id);
  }
}

/** Rolls the indent lines' ordered_qty up from every live order on the project. */
async function syncIndentOrderedQty(project_id: string): Promise<void> {
  const repos = getRepositories();
  const orders = await repos.purchaseOrders.listByProject(project_id);
  const live = new Set(orders.filter((p) => p.status !== "rejected").map((p) => p.id));
  const totals = new Map<string, number>();
  for (const l of await repos.purchaseOrders.listLinesByProject(project_id)) {
    if (!live.has(l.purchase_order_id) || !l.indent_line_id) continue;
    totals.set(l.indent_line_id, (totals.get(l.indent_line_id) ?? 0) + l.ordered_qty);
  }
  for (const il of await repos.indents.listLinesByProject(project_id)) {
    const next = qty(totals.get(il.id) ?? 0);
    if (Math.abs(next - il.ordered_qty) > 0.0005) {
      await repos.indents.updateLine(il.id, { ordered_qty: next });
    }
  }
}

/**
 * B3. Writes a draft purchase order: its lines, its delivery schedules, its
 * charges and its clause list.
 *
 * All three routes Manas asked for come through here — consolidating approved
 * indent lines, taking an approved comparative's winning rates, or a blank order
 * with nothing above it. What differs is only what the editor hands in; the
 * rules about what may be ordered are in one place.
 */
export async function createPurchaseOrder(
  input: PurchaseOrderInput,
  actor: ActingUser,
): Promise<PurchaseOrderDocument> {
  assertCan(actor, "create", "purchase_orders");
  const data = parseInput(purchaseOrderInput, input);
  const repos = getRepositories();

  const project = required(await repos.projects.getById(data.project_id), "Project");
  const supplier = required(await repos.suppliers.getById(data.supplier_id), "Supplier");

  if (data.comparative_id) {
    const comparative = required(
      await repos.comparatives.getById(data.comparative_id),
      "Comparative",
    );
    if (comparative.status !== "approved") {
      throw new WorkflowError(
        `Only an approved comparative can raise orders. This one is "${comparative.status}".`,
      );
    }
  }

  const resolved = await resolveLines(data, project.id, null);
  assertSchedulesFit(data, resolved);

  const at = nowIso();
  const po_date = data.po_date ?? at.slice(0, 10);
  const charges = poCharges(
    resolved.map((r) => ({
      ordered_qty: r.input.ordered_qty,
      rate: r.input.rate,
      gst_percent: r.input.gst_percent,
      freight_amount: r.input.freight_amount,
    })),
    {
      transportation_charge: data.transportation_charge,
      freight_gst_percent: data.freight_gst_percent,
      supplier_state: supplier.state,
    },
  );

  const po = await repos.purchaseOrders.create({
    project_id: project.id,
    po_number: await nextDocumentNumber("PO", project, at),
    amend_no: 0,
    amend_reason: "",
    comparative_id: data.comparative_id,
    indent_ids: [...new Set(resolved.map((r) => r.indent_id).filter((x): x is string => Boolean(x)))],
    supplier_id: supplier.id,
    po_date,
    expected_delivery_date: data.expected_delivery_date ?? latestScheduledDate(data) ?? po_date,
    status: "draft",
    raised_by_user_id: actor.user_id,
    submitted_at: null,
    current_step_code: null,
    current_sequence: null,
    decision_comment: "",
    sent_at: null,
    basic_amount: charges.material_value,
    freight_amount: rupees(charges.transportation_charge - data.transportation_charge),
    transportation_charge: rupees(data.transportation_charge),
    freight_gst_percent: data.freight_gst_percent,
    is_interstate: charges.is_interstate,
    cgst_amount: charges.cgst_amount,
    sgst_amount: charges.sgst_amount,
    igst_amount: charges.igst_amount,
    total_amount: charges.total_amount,
    delivery_address:
      data.delivery_address || `${project.name} site office, ${project.location}`,
    delivery_contact_name: data.delivery_contact_name,
    delivery_contact_phone: data.delivery_contact_phone,
    payment_terms: data.payment_terms,
    po_validity: data.po_validity,
    warranty: data.warranty,
    brand_terms: data.brand_terms,
    terms: "",
  });

  const children = await writeChildren(po, data, resolved);
  await syncIndentOrderedQty(project.id);

  return { purchase_order: po, ...children };
}

/**
 * Edits a draft. Lines, schedules and terms are rewritten wholesale rather than
 * diffed — a draft has no receipts against it, so there is nothing a diff would
 * preserve, and one write path is one set of rules to get right.
 */
export async function updatePurchaseOrder(
  purchase_order_id: string,
  input: PurchaseOrderInput,
  actor: ActingUser,
): Promise<PurchaseOrderDocument> {
  assertCan(actor, "edit", "purchase_orders");
  const data = parseInput(purchaseOrderInput, input);
  const repos = getRepositories();

  const existing = required(
    await repos.purchaseOrders.getById(purchase_order_id),
    "Purchase order",
  );
  if (existing.status !== "draft") {
    throw new WorkflowError(
      `Only a draft can be edited. ${existing.po_number} is "${existing.status}" — amend it instead.`,
    );
  }
  const supplier = required(await repos.suppliers.getById(data.supplier_id), "Supplier");

  const resolved = await resolveLines(data, existing.project_id, existing.id);
  assertSchedulesFit(data, resolved);
  await clearChildren(existing.id);

  const charges = poCharges(
    resolved.map((r) => ({
      ordered_qty: r.input.ordered_qty,
      rate: r.input.rate,
      gst_percent: r.input.gst_percent,
      freight_amount: r.input.freight_amount,
    })),
    {
      transportation_charge: data.transportation_charge,
      freight_gst_percent: data.freight_gst_percent,
      supplier_state: supplier.state,
    },
  );

  const po = await repos.purchaseOrders.update(existing.id, {
    supplier_id: supplier.id,
    comparative_id: data.comparative_id,
    po_date: data.po_date ?? existing.po_date,
    expected_delivery_date:
      data.expected_delivery_date ?? latestScheduledDate(data) ?? existing.expected_delivery_date,
    indent_ids: [...new Set(resolved.map((r) => r.indent_id).filter((x): x is string => Boolean(x)))],
    basic_amount: charges.material_value,
    freight_amount: rupees(charges.transportation_charge - data.transportation_charge),
    transportation_charge: rupees(data.transportation_charge),
    freight_gst_percent: data.freight_gst_percent,
    is_interstate: charges.is_interstate,
    cgst_amount: charges.cgst_amount,
    sgst_amount: charges.sgst_amount,
    igst_amount: charges.igst_amount,
    total_amount: charges.total_amount,
    delivery_address: data.delivery_address || existing.delivery_address,
    delivery_contact_name: data.delivery_contact_name,
    delivery_contact_phone: data.delivery_contact_phone,
    payment_terms: data.payment_terms,
    po_validity: data.po_validity,
    warranty: data.warranty,
    brand_terms: data.brand_terms,
  });

  const children = await writeChildren(po, data, resolved);
  await syncIndentOrderedQty(existing.project_id);

  return { purchase_order: po, ...children };
}

/** The last dated instalment across the schedules, which is when the order lands. */
function latestScheduledDate(data: z.infer<typeof purchaseOrderInput>): string | null {
  const dates = data.schedules
    .flatMap((s) => s.lines.map((l) => l.delivery_date))
    .filter((d): d is string => Boolean(d))
    .sort();
  return dates.length > 0 ? dates[dates.length - 1] : null;
}

/* ------------------------------------------------------------------ */
/* Amendment                                                           */
/* ------------------------------------------------------------------ */

export const amendPurchaseOrderInput = z.object({
  purchase_order_id: z.string().min(1),
  reason: z.string().min(5, "say why the order is being amended"),
});
export type AmendPurchaseOrderInput = z.input<typeof amendPurchaseOrderInput>;

/** The order as it stood, archived before the amendment touches it. */
export type PoSnapshot = {
  purchase_order: PurchaseOrder;
  lines: PoLine[];
  schedules: PoDeliverySchedule[];
  schedule_lines: PoDeliveryScheduleLine[];
  terms: PoTerm[];
};

/**
 * Raises an amendment: archives the current version, increments "PO Amend No."
 * and reopens the order as a draft for the officer to change and send round the
 * sign-off again.
 *
 * Refused once anything has been received against the order. An amendment
 * rewrites what was ordered, and a GRN is already measured against the old
 * figures — changing them underneath a receipt would make the three-way match
 * on the vendor bill compare against quantities nobody ever agreed to. That case
 * is a short-close and a fresh order, not an amendment.
 *
 * The archive is JSON because it is an archive: nothing queries into it, and in
 * Postgres it is one jsonb column rather than five shadow tables.
 */
export async function amendPurchaseOrder(
  input: AmendPurchaseOrderInput,
  actor: ActingUser,
): Promise<{ purchase_order: PurchaseOrder; amendment: PoAmendment }> {
  assertCan(actor, "edit", "purchase_orders");
  const data = parseInput(amendPurchaseOrderInput, input);
  const repos = getRepositories();

  const po = required(await repos.purchaseOrders.getById(data.purchase_order_id), "Purchase order");
  if (po.status !== "approved" && po.status !== "sent") {
    throw new WorkflowError(
      po.status === "draft"
        ? `${po.po_number} is still a draft — edit it instead of amending it.`
        : `${po.po_number} is "${po.status}" and cannot be amended.`,
    );
  }

  const lines = await repos.purchaseOrders.listLinesByPo(po.id);
  const received = lines.filter((l) => l.received_qty > 0 || l.rejected_qty > 0);
  if (received.length > 0) {
    throw new WorkflowError(
      `${po.po_number} already has material received against it. Close the balance and raise a fresh order rather than amending what a GRN was measured against.`,
    );
  }

  const snapshot: PoSnapshot = {
    purchase_order: po,
    lines,
    schedules: await repos.purchaseOrders.listSchedulesByPo(po.id),
    schedule_lines: await repos.purchaseOrders.listScheduleLinesByPo(po.id),
    terms: await repos.purchaseOrders.listTermsByPo(po.id),
  };

  const amendment = await repos.purchaseOrders.createAmendment({
    project_id: po.project_id,
    purchase_order_id: po.id,
    amend_no: po.amend_no,
    amended_by_user_id: actor.user_id,
    reason: data.reason,
    snapshot: JSON.stringify(snapshot),
    previous_total_amount: po.total_amount,
  });

  assertTransition("Purchase order", PO_TRANSITIONS, po.status, "draft");
  const purchase_order = await repos.purchaseOrders.update(po.id, {
    status: "draft",
    amend_no: po.amend_no + 1,
    amend_reason: data.reason,
    submitted_at: null,
    current_step_code: null,
    current_sequence: null,
    decision_comment: "",
  });

  return { purchase_order, amendment };
}

/** Reads an archived version back. The JSON is ours, so a bad parse is a bug. */
export function parsePoSnapshot(amendment: PoAmendment): PoSnapshot | null {
  try {
    return JSON.parse(amendment.snapshot) as PoSnapshot;
  } catch {
    return null;
  }
}
