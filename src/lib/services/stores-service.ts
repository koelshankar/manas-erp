import { z } from "zod";
import { getRepositories } from "@/lib/data";
import { loadMaterialCatalog } from "./material-catalog";
import {
  INDENT_TRANSITIONS,
  MATERIAL_ISSUE_TRANSITIONS,
  PO_TRANSITIONS,
  RETURN_TRANSITIONS,
  nowIso,
  type Grn,
  type GrnLine,
  type MaterialIssue,
  type MaterialIssueLine,
  type PoStatus,
  type Return,
  type ReturnStatus,
  type StockLedgerEntry,
  type Store,
  type Unit,
} from "@/lib/domain";
import { assertCan, assertTransition, parseInput, qty, required, rupees } from "./guards";
import { nextDocumentNumber } from "./numbering";
import { weightedAverageRate } from "./budget-position";
import { cumulativeIssuedToContractor } from "./stock-position";
import { postStockMovement, storeStockOnHand } from "./stock-ledger";
import { NotFoundError, ValidationError, WorkflowError, type ActingUser } from "./types";

/* ------------------------------------------------------------------ */
/* Stores                                                             */
/* ------------------------------------------------------------------ */

/**
 * The store a document belongs to.
 *
 * A GRN never asks — at the gate nobody is choosing a store — so it takes the
 * project's primary one. The stores documents name theirs, and the lookup
 * checks the store really belongs to the project it is being used on.
 */
export async function resolveStore(project_id: string, store_id?: string | null): Promise<Store> {
  const repos = getRepositories();
  if (store_id) {
    const store = required(await repos.stores.getById(store_id), "Store");
    if (store.project_id !== project_id) {
      throw new ValidationError(`store_id: ${store.name} does not belong to this project`);
    }
    return store;
  }
  const primary = await repos.stores.primaryForProject(project_id);
  if (!primary) {
    throw new NotFoundError("This project has no store. Add one in Masters first.");
  }
  return primary;
}

/* ------------------------------------------------------------------ */
/* B5-B6 — postGrn                                                     */
/* ------------------------------------------------------------------ */

export const grnLineInput = z
  .object({
    po_line_id: z.string().min(1),
    received_qty: z.number().nonnegative(),
    accepted_qty: z.number().nonnegative(),
    rejected_qty: z.number().nonnegative().default(0),
    rejection_reason: z.string().default(""),
  })
  .refine((l) => qtyEq(l.accepted_qty + l.rejected_qty, l.received_qty), {
    message: "accepted plus rejected must equal received",
    path: ["received_qty"],
  })
  .refine((l) => l.rejected_qty === 0 || l.rejection_reason.trim().length > 0, {
    message: "a rejected quantity needs a reason",
    path: ["rejection_reason"],
  });

export const postGrnInput = z.object({
  purchase_order_id: z.string().min(1),
  /** Defaults to the project's primary store; see `resolveStore`. */
  store_id: z.string().nullable().default(null),
  challan_number: z.string().min(1, "challan number is required"),
  vehicle_number: z.string().min(1, "vehicle number is required"),
  received_on: z.string().min(1),
  remarks: z.string().default(""),
  lines: z.array(grnLineInput).min(1),
});

export type PostGrnInput = z.input<typeof postGrnInput>;

export type PostGrnResult = {
  grn: Grn;
  lines: GrnLine[];
  stock_entries: StockLedgerEntry[];
  returns: Return[];
  purchase_order_status: PoStatus;
};

function qtyEq(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.0005;
}

/**
 * B5-B6. Material lands on site and the Site Engineer verifies it.
 *
 * Cascades, all in this one call:
 *   - PO lines gain received / rejected quantity; the PO moves to
 *     partially_received or received
 *   - accepted quantity becomes a stock ledger receipt at the PO rate (A5)
 *   - any rejected quantity raises a Return for Purchase to chase
 *   - indent lines gain received quantity; the indent follows the PO
 *
 * A posted GRN is immutable. Corrections are made by a return, not an edit.
 */
export async function postGrn(input: PostGrnInput, actor: ActingUser): Promise<PostGrnResult> {
  assertCan(actor, "create", "grn");
  const data = parseInput(postGrnInput, input);
  const repos = getRepositories();

  const po = required(await repos.purchaseOrders.getById(data.purchase_order_id), "Purchase order");
  if (po.status !== "sent" && po.status !== "partially_received") {
    throw new WorkflowError(
      `Material can only be received against an issued purchase order. ${po.po_number} is "${po.status}".`,
    );
  }

  const project = required(await repos.projects.getById(po.project_id), "Project");
  const poLines = await repos.purchaseOrders.listLinesByPo(po.id);
  const poLineById = new Map(poLines.map((l) => [l.id, l]));

  const seen = new Set<string>();
  for (const [i, line] of data.lines.entries()) {
    const poLine = poLineById.get(line.po_line_id);
    if (!poLine) throw new ValidationError(`lines.${i}: not a line on ${po.po_number}`);
    if (seen.has(line.po_line_id)) {
      throw new ValidationError(`lines.${i}: the same PO line appears twice`);
    }
    seen.add(line.po_line_id);
    const pending = qty(poLine.ordered_qty - poLine.received_qty - poLine.rejected_qty);
    if (line.accepted_qty > pending + 0.0005) {
      throw new ValidationError(
        `lines.${i}.accepted_qty: ${line.accepted_qty} exceeds the pending ${pending} on this PO line`,
      );
    }
  }
  if (data.lines.every((l) => l.received_qty === 0)) {
    throw new ValidationError("lines: nothing was received");
  }

  const at = nowIso();
  const store = await resolveStore(project.id, data.store_id);
  const grn_number = await nextDocumentNumber("GRN", project, at);
  const grn = await repos.grns.create({
    project_id: project.id,
    grn_number,
    purchase_order_id: po.id,
    supplier_id: po.supplier_id,
    store_id: store.id,
    received_on: data.received_on,
    received_by_user_id: actor.user_id,
    status: "posted",
    vehicle_number: data.vehicle_number,
    challan_number: data.challan_number,
    remarks: data.remarks,
  });

  const lines: GrnLine[] = [];
  const stock_entries: StockLedgerEntry[] = [];
  const returns: Return[] = [];

  for (const line of data.lines) {
    if (line.received_qty === 0) continue;
    const poLine = poLineById.get(line.po_line_id)!;

    const grnLine = await repos.grns.createLine({
      project_id: project.id,
      grn_id: grn.id,
      purchase_order_id: po.id,
      po_line_id: poLine.id,
      indent_line_id: poLine.indent_line_id,
      boq_line_id: poLine.boq_line_id,
      material_id: poLine.material_id,
      unit: poLine.unit,
      received_qty: qty(line.received_qty),
      accepted_qty: qty(line.accepted_qty),
      rejected_qty: qty(line.rejected_qty),
      rejection_reason: line.rejection_reason,
      rate: poLine.rate,
      gst_percent: poLine.gst_percent,
      billed_qty: 0,
    });
    lines.push(grnLine);

    if (line.accepted_qty > 0) {
      stock_entries.push(
        await postStockMovement({
          project_id: project.id,
          store_id: store.id,
          material_id: poLine.material_id,
          movement_type: "receipt",
          movement_date: data.received_on,
          quantity_in: line.accepted_qty,
          quantity_out: 0,
          rate: poLine.rate,
          value: rupees(line.accepted_qty * poLine.rate),
          source_entity_type: "grn",
          source_entity_id: grn.id,
          remarks: `Received against ${grn.grn_number}`,
        }),
      );
    }

    if (line.rejected_qty > 0) {
      const return_number = await nextDocumentNumber("RTN", project, at);
      returns.push(
        await repos.returns.create({
          project_id: project.id,
          return_number,
          supplier_id: po.supplier_id,
          purchase_order_id: po.id,
          grn_id: grn.id,
          grn_line_id: grnLine.id,
          material_id: poLine.material_id,
          unit: poLine.unit,
          quantity: qty(line.rejected_qty),
          rate: poLine.rate,
          amount: rupees(line.rejected_qty * poLine.rate),
          return_date: data.received_on,
          reason: line.rejection_reason,
          status: "raised",
          raised_by_user_id: actor.user_id,
          dispatched_at: null,
          debit_note_number: null,
          debit_note_at: null,
        }),
      );
    }

    await repos.purchaseOrders.updateLine(poLine.id, {
      received_qty: qty(poLine.received_qty + line.accepted_qty),
      rejected_qty: qty(poLine.rejected_qty + line.rejected_qty),
    });

    if (poLine.indent_line_id && line.accepted_qty > 0) {
      const indentLines = await repos.indents.listLines();
      const indentLine = indentLines.find((l) => l.id === poLine.indent_line_id);
      if (indentLine) {
        await repos.indents.updateLine(indentLine.id, {
          received_qty: qty(indentLine.received_qty + line.accepted_qty),
        });
      }
    }
  }

  // PO roll-up.
  const afterLines = await repos.purchaseOrders.listLinesByPo(po.id);
  const fullyDone = afterLines.every((l) =>
    qtyEq(l.received_qty + l.rejected_qty, l.ordered_qty) || l.received_qty + l.rejected_qty > l.ordered_qty,
  );
  const nextPoStatus: PoStatus = fullyDone ? "received" : "partially_received";
  assertTransition("Purchase order", PO_TRANSITIONS, po.status, nextPoStatus);
  await repos.purchaseOrders.update(po.id, { status: nextPoStatus });

  // Indent roll-up, for every indent this PO draws on.
  for (const indent_id of po.indent_ids) {
    const indent = await repos.indents.getById(indent_id);
    if (!indent) continue;
    const indentLines = await repos.indents.listLinesByIndent(indent.id);
    const live = indentLines.filter((l) => (l.approved_qty ?? 0) > 0);
    const allIn = live.every((l) => l.received_qty >= (l.approved_qty ?? 0) - 0.0005);
    const next = allIn ? "received" : "partially_received";
    if (indent.status === next && next === "partially_received") continue;
    assertTransition("Indent", INDENT_TRANSITIONS, indent.status, next);
    await repos.indents.update(indent.id, { status: next });
  }

  return { grn, lines, stock_entries, returns, purchase_order_status: nextPoStatus };
}

/* ------------------------------------------------------------------ */
/* A5 — issueMaterial                                                  */
/* ------------------------------------------------------------------ */

/**
 * One material on an issue note.
 *
 * No BOQ line is required at the schema level, because the screen defaults it
 * from the material's budgeted line and a storeman handing out two bags of
 * cement should not be blocked on a cost code. A line with no BOQ line simply
 * does not reach Budget vs Actual, which is honest: nobody said where it went.
 */
export const issueLineInput = z.object({
  material_id: z.string().min(1, "pick a material"),
  quantity: z.number().positive("quantity must be greater than zero"),
  boq_line_id: z.string().nullable().default(null),
  remarks: z.string().default(""),
});

export const issueMaterialInput = z.object({
  project_id: z.string().min(1),
  /** Defaults to the project's primary store. */
  store_id: z.string().nullable().default(null),
  work_order_id: z.string().min(1, "pick a work order"),
  issued_to_contractor_id: z.string().nullable().default(null),
  issue_date: z.string().min(1),
  remarks: z.string().default(""),
  lines: z.array(issueLineInput).min(1, "an issue note needs at least one material"),
});

export type IssueMaterialInput = z.input<typeof issueMaterialInput>;

export type IssueMaterialResult = {
  issue: MaterialIssue;
  lines: MaterialIssueLine[];
  stock_entries: StockLedgerEntry[];
};

/**
 * A5. Issues material from a store to the contractor working on the project.
 *
 * One note, one contractor, one work order, as many materials as the storeman
 * handed over — which is the form Manas sent us. Every line:
 *
 *   - must have stock behind it **in the store it is being issued from**
 *   - is valued at the weighted average of receipts at PO rate, fixed now;
 *     that value is what Budget vs Actual consumes and is never shown in Stores
 *   - carries the cumulative quantity issued to this contractor for this
 *     material, which is the column the whole form exists for
 *
 * The cumulative is computed here and stored on the line. Recomputing it on
 * render would mean a note printed last month quietly changing its figures the
 * next time anything is issued, and the paper in their file would stop
 * matching the screen.
 */
export async function issueMaterial(
  input: IssueMaterialInput,
  actor: ActingUser,
): Promise<IssueMaterialResult> {
  assertCan(actor, "create", "site_stock");
  const data = parseInput(issueMaterialInput, input);
  const repos = getRepositories();

  const project = required(await repos.projects.getById(data.project_id), "Project");
  const workOrder = required(await repos.workOrders.getById(data.work_order_id), "Work order");
  const store = await resolveStore(project.id, data.store_id);
  const catalog = await loadMaterialCatalog(repos);
  const contractor_id = data.issued_to_contractor_id ?? workOrder.contractor_id;

  // Validate every line before writing anything: a note that half-posts leaves
  // the store short by a quantity nobody signed for.
  const seen = new Set<string>();
  const prepared: Array<{
    material_id: string;
    unit: Unit;
    quantity: number;
    boq_line_id: string | null;
    rate: number;
    value: number;
  }> = [];

  for (const [i, line] of data.lines.entries()) {
    if (seen.has(line.material_id)) {
      throw new ValidationError(
        `lines.${i}.material_id: ${catalog.label(line.material_id)} appears twice on this note`,
      );
    }
    seen.add(line.material_id);

    const material = required(await repos.materials.getById(line.material_id), "Material");
    if (line.boq_line_id) required(await repos.boq.getById(line.boq_line_id), "BOQ line");

    const available = await storeStockOnHand(store.id, material.id);
    if (line.quantity > available + 0.0005) {
      throw new ValidationError(
        `lines.${i}.quantity: ${store.name} holds only ${available} ${material.unit} of ${catalog.label(material.id)}`,
      );
    }

    const rate = await weightedAverageRate(project.id, material.id);
    prepared.push({
      material_id: material.id,
      unit: material.unit,
      quantity: qty(line.quantity),
      boq_line_id: line.boq_line_id,
      rate,
      value: rupees(line.quantity * rate),
    });
  }

  const issue_number = await nextDocumentNumber("ISS", project, nowIso());
  const issue = await repos.stock.createIssue({
    project_id: project.id,
    issue_number,
    issue_date: data.issue_date,
    store_id: store.id,
    work_order_id: workOrder.id,
    issued_to_contractor_id: contractor_id,
    issued_by_user_id: actor.user_id,
    status: "issued",
    acknowledged_by_name: "",
    acknowledged_at: null,
    remarks: data.remarks,
  });

  const lines: MaterialIssueLine[] = [];
  const stock_entries: StockLedgerEntry[] = [];

  for (const [i, line] of prepared.entries()) {
    // Everything issued to this contractor before this note, plus this line.
    const before = await cumulativeIssuedToContractor(project.id, contractor_id, line.material_id);
    lines.push(
      await repos.stock.createIssueLine({
        project_id: project.id,
        material_issue_id: issue.id,
        material_id: line.material_id,
        unit: line.unit,
        quantity: line.quantity,
        cumulative_qty: qty(before + line.quantity),
        boq_line_id: line.boq_line_id,
        rate: line.rate,
        value: line.value,
        remarks: data.lines[i].remarks ?? "",
      }),
    );

    stock_entries.push(
      await postStockMovement({
        project_id: project.id,
        store_id: store.id,
        material_id: line.material_id,
        movement_type: "issue",
        movement_date: data.issue_date,
        quantity_in: 0,
        quantity_out: line.quantity,
        rate: line.rate,
        value: line.value,
        source_entity_type: "material_issue",
        source_entity_id: issue.id,
        remarks: `Issued on ${issue.issue_number}`,
      }),
    );
  }

  return { issue, lines, stock_entries };
}

/**
 * The contractor's storeman signs for the material.
 *
 * Their template has four signature blocks and this is the fourth. It changes
 * nothing about the stock — the material left the counter when the note was
 * written — but an unacknowledged issue is the one a contractor later disputes,
 * so it is worth being able to see which ones are still unsigned.
 */
export async function acknowledgeMaterialIssue(
  material_issue_id: string,
  acknowledged_by_name: string,
  actor: ActingUser,
): Promise<MaterialIssue> {
  assertCan(actor, "edit", "site_stock");
  const repos = getRepositories();
  const issue = required(await repos.stock.getIssueById(material_issue_id), "Material issue");
  if (acknowledged_by_name.trim().length < 2) {
    throw new ValidationError("acknowledged_by_name: give the name of whoever signed for it");
  }
  assertTransition("Material issue", MATERIAL_ISSUE_TRANSITIONS, issue.status, "acknowledged");
  return repos.stock.updateIssue(issue.id, {
    status: "acknowledged",
    acknowledged_by_name: acknowledged_by_name.trim(),
    acknowledged_at: nowIso(),
  });
}

/* ------------------------------------------------------------------ */
/* Returns                                                             */
/* ------------------------------------------------------------------ */

export const createReturnInput = z.object({
  grn_line_id: z.string().min(1),
  quantity: z.number().positive(),
  reason: z.string().min(3, "a return needs a reason"),
  return_date: z.string().min(1),
});

export type CreateReturnInput = z.input<typeof createReturnInput>;

/**
 * Raises a return by hand. postGrn already raises one automatically for every
 * rejected quantity; this covers material found defective after receipt.
 */
export async function createReturn(
  input: CreateReturnInput,
  actor: ActingUser,
): Promise<Return> {
  assertCan(actor, "create", "returns");
  const data = parseInput(createReturnInput, input);
  const repos = getRepositories();

  const grnLine = required(
    (await repos.grns.listLines()).find((l) => l.id === data.grn_line_id),
    "GRN line",
  );
  const grn = required(await repos.grns.getById(grnLine.grn_id), "GRN");
  const project = required(await repos.projects.getById(grn.project_id), "Project");

  const alreadyReturned = (await repos.returns.listByGrn(grn.id))
    .filter((r) => r.grn_line_id === grnLine.id)
    .reduce((s, r) => s + r.quantity, 0);
  const returnable = qty(grnLine.received_qty - alreadyReturned);
  if (data.quantity > returnable + 0.0005) {
    throw new ValidationError(
      `quantity: only ${returnable} ${grnLine.unit} remains returnable on this GRN line`,
    );
  }

  return repos.returns.create({
    project_id: project.id,
    return_number: await nextDocumentNumber("RTN", project, nowIso()),
    supplier_id: grn.supplier_id,
    purchase_order_id: grn.purchase_order_id,
    grn_id: grn.id,
    grn_line_id: grnLine.id,
    material_id: grnLine.material_id,
    unit: grnLine.unit,
    quantity: qty(data.quantity),
    rate: grnLine.rate,
    amount: rupees(data.quantity * grnLine.rate),
    return_date: data.return_date,
    reason: data.reason,
    status: "raised",
    raised_by_user_id: actor.user_id,
    dispatched_at: null,
    debit_note_number: null,
    debit_note_at: null,
  });
}

/**
 * Moves a return along: raised -> dispatched -> debit_note_issued.
 * Issuing the debit note posts a debit to the supplier's ledger.
 */
export async function advanceReturn(
  return_id: string,
  to: ReturnStatus,
  actor: ActingUser,
): Promise<Return> {
  assertCan(actor, "edit", "returns");
  const repos = getRepositories();

  const entry = required(await repos.returns.getById(return_id), "Return");
  assertTransition("Return", RETURN_TRANSITIONS, entry.status, to);
  const at = nowIso();

  if (to === "dispatched") {
    return repos.returns.update(entry.id, { status: "dispatched", dispatched_at: at });
  }

  const project = required(await repos.projects.getById(entry.project_id), "Project");
  const debit_note_number = await nextDocumentNumber("DN", project, at);
  const updated = await repos.returns.update(entry.id, {
    status: "debit_note_issued",
    debit_note_number,
    debit_note_at: at,
  });

  await repos.supplierLedger.create({
    project_id: entry.project_id,
    supplier_id: entry.supplier_id,
    entry_date: at.slice(0, 10),
    entry_type: "debit_note",
    reference_type: "return",
    reference_id: entry.id,
    reference_number: debit_note_number,
    debit: entry.amount,
    credit: 0,
    narration: `Debit note against ${entry.return_number} — ${entry.reason}`,
  });

  return updated;
}
