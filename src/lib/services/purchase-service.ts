import { z } from "zod";
import { getRepositories } from "@/lib/data";
import {
  COMPARATIVE_TRANSITIONS,
  INDENT_TRANSITIONS,
  PO_TRANSITIONS,
  nowIso,
  type Approval,
  type Comparative,
  type ComparativeLine,
  type IndentStatus,
  type PoLine,
  type PurchaseOrder,
  type Quote,
} from "@/lib/domain";
import { APPROVAL_CHAINS } from "@/config/permissions";
import { assertCan, assertTransition, parseInput, qty, required, rupees } from "./guards";
import { nextDocumentNumber } from "./numbering";
import { landedCost as computeLanded, splitTax as computeSplit } from "./pricing";
import { ValidationError, WorkflowError, type ActingUser } from "./types";

/* Landed cost and the CGST/SGST vs IGST split live in ./pricing so the
   deterministic seed can build rows with identical arithmetic. */
export { landedCost, splitTax } from "./pricing";
export type { LandedCost, TaxSplit } from "./pricing";

/* ------------------------------------------------------------------ */
/* B1 — createComparative                                              */
/* ------------------------------------------------------------------ */

export const quoteInput = z.object({
  supplier_id: z.string().min(1),
  rate: z.number().positive("rate must be greater than zero"),
  gst_percent: z.number().min(0).max(28),
  freight_amount: z.number().nonnegative().default(0),
  delivery_days: z.number().int().nonnegative().default(7),
  payment_terms: z.string().default(""),
  remarks: z.string().default(""),
});

export const comparativeLineInput = z.object({
  indent_line_id: z.string().min(1),
  quotes: z.array(quoteInput).min(3, "compare at least three suppliers on every line"),
  selected_supplier_id: z.string().min(1, "pick a supplier for this line"),
  justification: z.string().default(""),
});

export const createComparativeInput = z.object({
  project_id: z.string().min(1),
  remarks: z.string().default(""),
  lines: z.array(comparativeLineInput).min(1, "a comparative needs at least one line"),
  /** True sends it straight to the Purchase Head (B2) in the same call. */
  submit: z.boolean().default(false),
});

export type CreateComparativeInput = z.input<typeof createComparativeInput>;

export type ComparativeResult = {
  comparative: Comparative;
  lines: ComparativeLine[];
  quotes: Quote[];
  approval: Approval | null;
};

/**
 * B1. Builds a comparative from approved indent lines of ONE project. Lines may
 * come from several indents, and the officer may split the award across
 * suppliers — one selection per line.
 *
 * Landed cost and L1 are computed here, not in the screen.
 */
export async function createComparative(
  input: CreateComparativeInput,
  actor: ActingUser,
): Promise<ComparativeResult> {
  assertCan(actor, "create", "comparatives");
  const data = parseInput(createComparativeInput, input);
  const repos = getRepositories();

  const project = required(await repos.projects.getById(data.project_id), "Project");
  const indentLines = await repos.indents.listLinesByProject(project.id);
  const indents = await repos.indents.listByProject(project.id);
  const indentById = new Map(indents.map((i) => [i.id, i]));
  const lineById = new Map(indentLines.map((l) => [l.id, l]));
  const suppliers = await repos.suppliers.list();
  const supplierIds = new Set(suppliers.map((s) => s.id));

  // Lines already committed to a live comparative may not be picked up twice.
  const openComparatives = (await repos.comparatives.listByProject(project.id)).filter(
    (c) => c.status !== "rejected" && c.status !== "sent_back",
  );
  const openComparativeIds = new Set(openComparatives.map((c) => c.id));
  const committed = new Set(
    (await repos.comparatives.listLinesByProject(project.id))
      .filter((l) => openComparativeIds.has(l.comparative_id))
      .map((l) => l.indent_line_id),
  );

  const seen = new Set<string>();
  data.lines.forEach((line, i) => {
    const indentLine = lineById.get(line.indent_line_id);
    if (!indentLine) throw new ValidationError(`lines.${i}: not an indent line on this project`);
    if (seen.has(line.indent_line_id)) {
      throw new ValidationError(`lines.${i}: the same indent line appears twice`);
    }
    seen.add(line.indent_line_id);
    if (committed.has(line.indent_line_id)) {
      throw new ValidationError(`lines.${i}: this indent line is already on another comparative`);
    }
    const indent = indentById.get(indentLine.indent_id);
    if (!indent || (indent.status !== "approved" && indent.status !== "partially_approved")) {
      throw new ValidationError(
        `lines.${i}: indent ${indent?.indent_number ?? ""} is not approved for purchase`,
      );
    }
    if (!indentLine.approved_qty || indentLine.approved_qty <= 0) {
      throw new ValidationError(`lines.${i}: this line was not approved`);
    }
    const quoted = new Set(line.quotes.map((q) => q.supplier_id));
    if (quoted.size !== line.quotes.length) {
      throw new ValidationError(`lines.${i}: the same supplier is quoted twice`);
    }
    line.quotes.forEach((q, qi) => {
      if (!supplierIds.has(q.supplier_id)) {
        throw new ValidationError(`lines.${i}.quotes.${qi}.supplier_id: unknown supplier`);
      }
    });
    if (!quoted.has(line.selected_supplier_id)) {
      throw new ValidationError(`lines.${i}: the selected supplier has no quote on this line`);
    }
  });

  const today = nowIso();
  const comparative_number = await nextDocumentNumber("CMP", project, today);
  const indent_ids = [
    ...new Set(data.lines.map((l) => lineById.get(l.indent_line_id)!.indent_id)),
  ];

  const comparative = await repos.comparatives.create({
    project_id: project.id,
    comparative_number,
    indent_ids,
    prepared_by_user_id: actor.user_id,
    prepared_date: today.slice(0, 10),
    status: "draft",
    submitted_at: null,
    decided_by_user_id: null,
    decided_at: null,
    decision_comment: "",
    total_selected_value: 0,
    remarks: data.remarks,
  });

  const lines: ComparativeLine[] = [];
  const quotes: Quote[] = [];
  let total = 0;

  for (const [i, lineInput] of data.lines.entries()) {
    const indentLine = lineById.get(lineInput.indent_line_id)!;
    const quantity = indentLine.approved_qty!;

    const priced = lineInput.quotes.map((q) => ({
      ...q,
      ...computeLanded(quantity, q.rate, q.gst_percent, q.freight_amount),
    }));
    const cheapest = priced.reduce((best, q) => (q.landed_rate < best.landed_rate ? q : best), priced[0]);
    const selected = priced.find((q) => q.supplier_id === lineInput.selected_supplier_id)!;
    const is_l1_selected = selected.supplier_id === cheapest.supplier_id;

    if (!is_l1_selected && lineInput.justification.trim().length < 5) {
      throw new ValidationError(
        `lines.${i}.justification: a justification is required when the selection is not L1`,
      );
    }

    const line = await repos.comparatives.createLine({
      project_id: project.id,
      comparative_id: comparative.id,
      indent_id: indentLine.indent_id,
      indent_line_id: indentLine.id,
      boq_line_id: indentLine.boq_line_id,
      material_id: indentLine.material_id,
      unit: indentLine.unit,
      quantity,
      selected_supplier_id: selected.supplier_id,
      selected_quote_id: null,
      is_l1_selected,
      justification: is_l1_selected ? "" : lineInput.justification,
    });

    let selectedQuoteId: string | null = null;
    for (const q of priced) {
      const created = await repos.comparatives.createQuote({
        project_id: project.id,
        comparative_id: comparative.id,
        comparative_line_id: line.id,
        material_id: indentLine.material_id,
        supplier_id: q.supplier_id,
        unit: indentLine.unit,
        quantity,
        rate: rupees(q.rate),
        gst_percent: q.gst_percent,
        freight_amount: rupees(q.freight_amount),
        delivery_days: q.delivery_days,
        payment_terms: q.payment_terms,
        basic_amount: q.basic_amount,
        tax_amount: q.tax_amount,
        landed_amount: q.landed_amount,
        landed_rate: q.landed_rate,
        is_l1: q.supplier_id === cheapest.supplier_id,
        is_selected: q.supplier_id === selected.supplier_id,
        remarks: q.remarks,
      });
      quotes.push(created);
      if (created.is_selected) selectedQuoteId = created.id;
    }

    total += selected.landed_amount;
    lines.push(await repos.comparatives.updateLine(line.id, { selected_quote_id: selectedQuoteId }));
  }

  const withTotal = await repos.comparatives.update(comparative.id, {
    total_selected_value: rupees(total),
  });

  if (!data.submit) return { comparative: withTotal, lines, quotes, approval: null };

  const submitted = await submitComparative(withTotal.id, actor);
  return { comparative: submitted.comparative, lines, quotes, approval: submitted.approval };
}

/* ------------------------------------------------------------------ */
/* B1 -> B2 — submitComparative                                        */
/* ------------------------------------------------------------------ */

export async function submitComparative(
  comparative_id: string,
  actor: ActingUser,
): Promise<{ comparative: Comparative; approval: Approval }> {
  assertCan(actor, "edit", "comparatives");
  const repos = getRepositories();

  const comparative = required(await repos.comparatives.getById(comparative_id), "Comparative");
  assertTransition("Comparative", COMPARATIVE_TRANSITIONS, comparative.status, "pending_approval");

  const lines = await repos.comparatives.listLinesByComparative(comparative.id);
  if (lines.length === 0) throw new WorkflowError("This comparative has no lines to approve.");
  if (lines.some((l) => !l.selected_supplier_id)) {
    throw new WorkflowError("Every line needs a selected supplier before submitting.");
  }

  const at = nowIso();
  const updated = await repos.comparatives.update(comparative.id, {
    status: "pending_approval",
    submitted_at: at,
  });

  const step = APPROVAL_CHAINS.comparative[0];
  const approval = await repos.approvals.create({
    project_id: comparative.project_id,
    entity_type: "comparative",
    entity_id: comparative.id,
    step_code: step.step_code,
    sequence: step.sequence,
    required_role: step.required_role,
    status: "pending",
    actor_user_id: null,
    comment: "",
    acted_at: null,
  });

  // The linked indents are now inside the purchase pipeline.
  for (const indent_id of comparative.indent_ids) {
    const indent = await repos.indents.getById(indent_id);
    if (!indent) continue;
    assertTransition("Indent", INDENT_TRANSITIONS, indent.status, "in_comparative");
    await repos.indents.update(indent.id, { status: "in_comparative" });
  }

  return { comparative: updated, approval };
}

/* ------------------------------------------------------------------ */
/* B2 — decideComparative                                              */
/* ------------------------------------------------------------------ */

export const decideComparativeInput = z
  .object({
    comparative_id: z.string().min(1),
    decision: z.enum(["approve", "send_back", "reject"]),
    comment: z.string().default(""),
  })
  .refine((d) => d.decision === "approve" || d.comment.trim().length > 0, {
    message: "sending back or rejecting needs a comment",
    path: ["comment"],
  });

export type DecideComparativeInput = z.input<typeof decideComparativeInput>;

/** Recomputes whether every approved line on an indent was approved in full. */
async function indentStatusAfterRelease(indent_id: string): Promise<IndentStatus> {
  const lines = await getRepositories().indents.listLinesByIndent(indent_id);
  const allFull = lines.every((l) => l.approved_qty === l.requested_qty);
  return allFull ? "approved" : "partially_approved";
}

/**
 * B2. The Purchase Head approves the comparative (rates are then fixed), sends
 * it back for rework, or rejects it. Either of the latter two releases the
 * indents so they can be quoted again.
 */
export async function decideComparative(
  input: DecideComparativeInput,
  actor: ActingUser,
): Promise<{ comparative: Comparative; approval: Approval }> {
  assertCan(actor, "approve", "purchase_approval");
  const data = parseInput(decideComparativeInput, input);
  const repos = getRepositories();

  const comparative = required(await repos.comparatives.getById(data.comparative_id), "Comparative");
  const next =
    data.decision === "approve" ? "approved" : data.decision === "send_back" ? "sent_back" : "rejected";
  assertTransition("Comparative", COMPARATIVE_TRANSITIONS, comparative.status, next);

  const at = nowIso();
  const updated = await repos.comparatives.update(comparative.id, {
    status: next,
    decided_by_user_id: actor.user_id,
    decided_at: at,
    decision_comment: data.comment,
  });

  const pending = (await repos.approvals.listForEntity("comparative", comparative.id)).find(
    (a) => a.status === "pending",
  );
  if (!pending) throw new WorkflowError("This comparative has no open approval step.");

  const approval = await repos.approvals.update(pending.id, {
    status: next === "approved" ? "approved" : next === "sent_back" ? "sent_back" : "rejected",
    actor_user_id: actor.user_id,
    comment: data.comment,
    acted_at: at,
  });

  if (data.decision !== "approve") {
    for (const indent_id of comparative.indent_ids) {
      const indent = await repos.indents.getById(indent_id);
      if (!indent || indent.status !== "in_comparative") continue;
      await repos.indents.update(indent.id, { status: await indentStatusAfterRelease(indent.id) });
    }
  }

  return { comparative: updated, approval };
}

/* ------------------------------------------------------------------ */
/* B3 — createPurchaseOrders                                           */
/* ------------------------------------------------------------------ */

export const createPurchaseOrdersInput = z.object({
  comparative_id: z.string().min(1),
  po_date: z.string().optional(),
  expected_delivery_date: z.string().optional(),
  terms: z.string().default(
    "Delivery at site. Payment as per agreed credit period from GRN date. Rates inclusive of loading and unloading.",
  ),
});

export type CreatePurchaseOrdersInput = z.input<typeof createPurchaseOrdersInput>;

/**
 * B3. One PO per selected supplier on an approved comparative. Splitting the
 * award across suppliers therefore produces several POs from one comparative.
 *
 * Cascades: indent lines gain ordered_qty, indents move to po_raised.
 */
export async function createPurchaseOrders(
  input: CreatePurchaseOrdersInput,
  actor: ActingUser,
): Promise<{ purchase_orders: PurchaseOrder[]; lines: PoLine[] }> {
  assertCan(actor, "create", "purchase_orders");
  const data = parseInput(createPurchaseOrdersInput, input);
  const repos = getRepositories();

  const comparative = required(await repos.comparatives.getById(data.comparative_id), "Comparative");
  if (comparative.status !== "approved") {
    throw new WorkflowError(
      `Only an approved comparative can raise POs. This one is "${comparative.status}".`,
    );
  }
  if ((await repos.purchaseOrders.listByComparative(comparative.id)).length > 0) {
    throw new WorkflowError("POs have already been generated from this comparative.");
  }

  const project = required(await repos.projects.getById(comparative.project_id), "Project");
  const comparativeLines = await repos.comparatives.listLinesByComparative(comparative.id);
  const quotes = await repos.comparatives.listQuotesByComparative(comparative.id);
  const quoteById = new Map(quotes.map((q) => [q.id, q]));
  const suppliers = await repos.suppliers.list();
  const supplierById = new Map(suppliers.map((s) => [s.id, s]));

  const bySupplier = new Map<string, ComparativeLine[]>();
  for (const line of comparativeLines) {
    if (!line.selected_supplier_id) continue;
    const list = bySupplier.get(line.selected_supplier_id) ?? [];
    list.push(line);
    bySupplier.set(line.selected_supplier_id, list);
  }
  if (bySupplier.size === 0) throw new WorkflowError("Nothing on this comparative was selected.");

  const today = nowIso();
  const po_date = data.po_date ?? today.slice(0, 10);
  const purchase_orders: PurchaseOrder[] = [];
  const allLines: PoLine[] = [];

  for (const [supplier_id, group] of bySupplier) {
    const supplier = required(supplierById.get(supplier_id), "Supplier");
    const po_number = await nextDocumentNumber("PO", project, today);

    const maxLead = group.reduce((max, l) => {
      const q = l.selected_quote_id ? quoteById.get(l.selected_quote_id) : undefined;
      return Math.max(max, q?.delivery_days ?? 7);
    }, 0);
    const expected = data.expected_delivery_date ?? addDays(po_date, maxLead);

    let basic = 0;
    let freight = 0;
    let tax = 0;
    const draftLines = group.map((line) => {
      const quote = required(
        line.selected_quote_id ? quoteById.get(line.selected_quote_id) : null,
        "Selected quote",
      );
      basic += quote.basic_amount;
      freight += quote.freight_amount;
      tax += quote.tax_amount;
      return { line, quote };
    });

    const split = computeSplit(supplier.state, tax);
    const po = await repos.purchaseOrders.create({
      project_id: project.id,
      po_number,
      comparative_id: comparative.id,
      indent_ids: [...new Set(group.map((l) => l.indent_id))],
      supplier_id,
      po_date,
      expected_delivery_date: expected,
      status: "draft",
      raised_by_user_id: actor.user_id,
      sent_at: null,
      basic_amount: rupees(basic),
      freight_amount: rupees(freight),
      ...split,
      total_amount: rupees(basic + freight + tax),
      delivery_address: `${project.name} site office, ${project.location}`,
      terms: data.terms,
    });

    for (const { line, quote } of draftLines) {
      const created = await repos.purchaseOrders.createLine({
        project_id: project.id,
        purchase_order_id: po.id,
        comparative_line_id: line.id,
        indent_id: line.indent_id,
        indent_line_id: line.indent_line_id,
        boq_line_id: line.boq_line_id,
        material_id: line.material_id,
        unit: line.unit,
        ordered_qty: line.quantity,
        rate: quote.rate,
        gst_percent: quote.gst_percent,
        freight_amount: quote.freight_amount,
        basic_amount: quote.basic_amount,
        tax_amount: quote.tax_amount,
        line_total: quote.landed_amount,
        received_qty: 0,
        rejected_qty: 0,
      });
      allLines.push(created);

      const indentLine = (await repos.indents.listLinesByIndent(line.indent_id)).find(
        (l) => l.id === line.indent_line_id,
      );
      if (indentLine) {
        await repos.indents.updateLine(indentLine.id, {
          ordered_qty: qty(indentLine.ordered_qty + line.quantity),
        });
      }
    }

    purchase_orders.push(po);
  }

  for (const indent_id of comparative.indent_ids) {
    const indent = await repos.indents.getById(indent_id);
    if (!indent) continue;
    assertTransition("Indent", INDENT_TRANSITIONS, indent.status, "po_raised");
    await repos.indents.update(indent.id, { status: "po_raised" });
  }

  return { purchase_orders, lines: allLines };
}

/* ------------------------------------------------------------------ */
/* B4 — markPoSent                                                     */
/* ------------------------------------------------------------------ */

/** B4. Dispatches the PO to the vendor. Nothing can be received before this. */
export async function markPoSent(
  purchase_order_id: string,
  actor: ActingUser,
): Promise<PurchaseOrder> {
  assertCan(actor, "edit", "purchase_orders");
  const repos = getRepositories();
  const po = required(await repos.purchaseOrders.getById(purchase_order_id), "Purchase order");
  assertTransition("Purchase order", PO_TRANSITIONS, po.status, "sent");
  return repos.purchaseOrders.update(po.id, { status: "sent", sent_at: nowIso() });
}

/* ------------------------------------------------------------------ */

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
