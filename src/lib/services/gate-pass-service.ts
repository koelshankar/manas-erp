import { z } from "zod";
import { getRepositories } from "@/lib/data";
import { APPROVAL_CHAINS } from "@/config/permissions";
import {
  GATE_PASS_TRANSITIONS,
  nowIso,
  type Approval,
  type GatePass,
  type GatePassLine,
  type StockLedgerEntry,
  type Unit,
} from "@/lib/domain";
import { assertCan, assertTransition, parseInput, qty, required } from "./guards";
import { loadMaterialCatalog } from "./material-catalog";
import { nextDocumentNumber } from "./numbering";
import { resolveStore } from "./stores-service";
import { postStockMovement, storeStockOnHand } from "./stock-ledger";
import { PermissionError, ValidationError, WorkflowError, type ActingUser } from "./types";

/**
 * The gate pass: material leaving the gate, on the form Manas sent us.
 *
 * Three rules hold this service together.
 *
 * **The type decides the form.** A returnable pass must carry an expected
 * return date; the other two must not. That is refused here rather than on the
 * screen, because a returnable pass with no date is a pass nobody can chase.
 *
 * **A stock line is checked against the store it leaves.** A line may also
 * carry no material at all — a contractor's own mixer, a ladder, scaffolding
 * that was never received on a GRN. Such a line names what is going out in
 * words and moves no stock, and it is the only place in the app where a
 * document line has no `material_id`.
 *
 * **Approval and the printed signatures are different things.** The project
 * manager's approval is a real gate and runs through the one generic
 * `Approval` row, with a null step code because the client's chart does not
 * draw this gate. The receiver's signature at the gate is the third block on
 * their form and is *not* a chain step: the receiver has no login, so it is
 * recorded as a name and a time.
 *
 * Stock leaves on approval, which is when the lorry goes.
 */

/* ------------------------------------------------------------------ */
/* Create and edit                                                     */
/* ------------------------------------------------------------------ */

export const gatePassLineInput = z
  .object({
    /** Null for a non-stock item; `description` then says what it is. */
    material_id: z.string().nullable().default(null),
    description: z.string().default(""),
    unit: z.string().min(1, "pick a unit"),
    quantity: z.number().positive("quantity must be greater than zero"),
    remarks: z.string().default(""),
  })
  .refine((l) => Boolean(l.material_id) || l.description.trim().length > 1, {
    message: "name the material, or describe what is going out",
    path: ["description"],
  });

export const createGatePassInput = z
  .object({
    project_id: z.string().min(1),
    store_id: z.string().nullable().default(null),
    pass_type: z.enum(["returnable", "non_returnable", "transfer"]),
    gate_pass_date: z.string().min(1),
    issued_to_name: z.string().min(2, "who is taking it?"),
    issued_to_company: z.string().default(""),
    vehicle_number: z.string().default(""),
    driver_name: z.string().default(""),
    purpose: z.string().min(3, "say why it is leaving site"),
    expected_return_date: z.string().nullable().default(null),
    material_transfer_id: z.string().nullable().default(null),
    remarks: z.string().default(""),
    lines: z.array(gatePassLineInput).min(1, "a gate pass needs at least one line"),
  })
  .refine((p) => p.pass_type !== "returnable" || Boolean(p.expected_return_date), {
    message: "a returnable gate pass needs the date it is expected back",
    path: ["expected_return_date"],
  })
  .refine((p) => p.pass_type === "returnable" || !p.expected_return_date, {
    message: "only a returnable gate pass has a return date",
    path: ["expected_return_date"],
  });

export type CreateGatePassInput = z.input<typeof createGatePassInput>;

export type GatePassResult = { gate_pass: GatePass; lines: GatePassLine[] };

export async function createGatePass(
  input: CreateGatePassInput,
  actor: ActingUser,
): Promise<GatePassResult> {
  assertCan(actor, "create", "gate_pass");
  const data = parseInput(createGatePassInput, input);
  const repos = getRepositories();

  const project = required(await repos.projects.getById(data.project_id), "Project");
  const store = await resolveStore(project.id, data.store_id);
  await assertLinesAreAvailable(store.id, data.lines);

  const gate_pass_number = await nextDocumentNumber("GP", project, nowIso());
  const gate_pass = await repos.gatePasses.create({
    project_id: project.id,
    gate_pass_number,
    gate_pass_date: data.gate_pass_date,
    pass_type: data.pass_type,
    store_id: store.id,
    issued_to_name: data.issued_to_name,
    issued_to_company: data.issued_to_company,
    vehicle_number: data.vehicle_number,
    driver_name: data.driver_name,
    purpose: data.purpose,
    expected_return_date: data.expected_return_date,
    status: "draft",
    raised_by_user_id: actor.user_id,
    approved_by_user_id: null,
    approved_at: null,
    decision_comment: "",
    acknowledged_by_name: "",
    acknowledged_at: null,
    closed_at: null,
    material_transfer_id: data.material_transfer_id,
    remarks: data.remarks,
  });

  const lines = await writeLines(gate_pass, data.lines);
  return { gate_pass, lines };
}

export const updateGatePassInput = createGatePassInput.safeExtend({
  gate_pass_id: z.string().min(1),
});

export type UpdateGatePassInput = z.input<typeof updateGatePassInput>;

/** A draft may be rewritten whole. Once it is out for approval it may not. */
export async function updateGatePass(
  input: UpdateGatePassInput,
  actor: ActingUser,
): Promise<GatePassResult> {
  assertCan(actor, "edit", "gate_pass");
  const data = parseInput(updateGatePassInput, input);
  const repos = getRepositories();

  const existing = required(await repos.gatePasses.getById(data.gate_pass_id), "Gate pass");
  if (existing.status !== "draft") {
    throw new WorkflowError(
      `${existing.gate_pass_number} has left draft and can no longer be edited.`,
    );
  }
  const store = await resolveStore(existing.project_id, data.store_id ?? existing.store_id);
  await assertLinesAreAvailable(store.id, data.lines);

  const gate_pass = await repos.gatePasses.update(existing.id, {
    gate_pass_date: data.gate_pass_date,
    pass_type: data.pass_type,
    store_id: store.id,
    issued_to_name: data.issued_to_name,
    issued_to_company: data.issued_to_company,
    vehicle_number: data.vehicle_number,
    driver_name: data.driver_name,
    purpose: data.purpose,
    expected_return_date: data.expected_return_date,
    material_transfer_id: data.material_transfer_id,
    remarks: data.remarks,
  });

  for (const line of await repos.gatePasses.listLinesByGatePass(gate_pass.id)) {
    await repos.gatePasses.removeLine(line.id);
  }
  const lines = await writeLines(gate_pass, data.lines);
  return { gate_pass, lines };
}

type LineInput = z.infer<typeof gatePassLineInput>;

/**
 * A stock line may not take out more than the store holds.
 *
 * Lines with no material are skipped: nothing in the store is leaving, so
 * there is no balance to check.
 */
async function assertLinesAreAvailable(store_id: string, lines: LineInput[]): Promise<void> {
  const repos = getRepositories();
  const catalog = await loadMaterialCatalog(repos);
  const store = required(await repos.stores.getById(store_id), "Store");
  const wanted = new Map<string, number>();

  for (const [i, line] of lines.entries()) {
    if (!line.material_id) continue;
    const material = required(await repos.materials.getById(line.material_id), "Material");
    // Two lines of the same material come out of the same balance.
    const running = (wanted.get(material.id) ?? 0) + line.quantity;
    wanted.set(material.id, running);
    const available = await storeStockOnHand(store_id, material.id);
    if (running > available + 0.0005) {
      throw new ValidationError(
        `lines.${i}.quantity: ${store.name} holds only ${available} ${material.unit} of ${catalog.label(material.id)}`,
      );
    }
  }
}

async function writeLines(gate_pass: GatePass, lines: LineInput[]): Promise<GatePassLine[]> {
  const repos = getRepositories();
  const out: GatePassLine[] = [];
  for (const line of lines) {
    out.push(
      await repos.gatePasses.createLine({
        project_id: gate_pass.project_id,
        gate_pass_id: gate_pass.id,
        material_id: line.material_id,
        description: line.description,
        unit: line.unit as Unit,
        quantity: qty(line.quantity),
        returned_qty: 0,
        remarks: line.remarks,
      }),
    );
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* The project manager's signature                                     */
/* ------------------------------------------------------------------ */

/** Sends a draft to the project manager, opening its one chain row. */
export async function submitGatePass(
  gate_pass_id: string,
  actor: ActingUser,
): Promise<{ gate_pass: GatePass; approval: Approval }> {
  assertCan(actor, "edit", "gate_pass");
  const repos = getRepositories();

  const pass = required(await repos.gatePasses.getById(gate_pass_id), "Gate pass");
  assertTransition("Gate pass", GATE_PASS_TRANSITIONS, pass.status, "pending_approval");
  const lines = await repos.gatePasses.listLinesByGatePass(pass.id);
  if (lines.length === 0) throw new ValidationError("lines: this gate pass has nothing on it");

  const step = APPROVAL_CHAINS.gate_pass[0];

  /* Resubmitting after a send-back reopens the existing row rather than
     stacking a second one, so the audit trail stays one row per decision. */
  const existing = (await repos.approvals.listForEntity("gate_pass", pass.id))[0];
  const approval = existing
    ? await repos.approvals.update(existing.id, {
        status: "pending",
        actor_user_id: null,
        comment: "",
        acted_at: null,
      })
    : await repos.approvals.create({
        project_id: pass.project_id,
        entity_type: "gate_pass",
        entity_id: pass.id,
        step_code: step.step_code,
        sequence: step.sequence,
        required_role: step.required_role,
        status: "pending",
        actor_user_id: null,
        comment: "",
        acted_at: null,
      });

  const gate_pass = await repos.gatePasses.update(pass.id, {
    status: "pending_approval",
    decision_comment: "",
  });
  return { gate_pass, approval };
}

export const actOnGatePassInput = z.object({
  gate_pass_id: z.string().min(1),
  action: z.enum(["approve", "reject"]),
  comment: z.string().default(""),
});

export type ActOnGatePassInput = z.input<typeof actOnGatePassInput>;

export type ActOnGatePassResult = {
  gate_pass: GatePass;
  approval: Approval;
  stock_entries: StockLedgerEntry[];
};

/**
 * The project manager approves or refuses the pass.
 *
 * Approval is what takes the stock out: the material is physically going
 * through the gate, and holding the movement back until somebody remembers to
 * mark it gone would leave the store's position wrong for as long as that took.
 */
export async function actOnGatePass(
  input: ActOnGatePassInput,
  actor: ActingUser,
): Promise<ActOnGatePassResult> {
  assertCan(actor, "approve", "gate_pass");
  const data = parseInput(actOnGatePassInput, input);
  const repos = getRepositories();

  const pass = required(await repos.gatePasses.getById(data.gate_pass_id), "Gate pass");
  const approval = required(
    (await repos.approvals.listForEntity("gate_pass", pass.id)).find((a) => a.status === "pending"),
    "Open approval step",
  );
  if (approval.required_role !== actor.role) {
    throw new PermissionError(
      `${pass.gate_pass_number} is waiting on ${approval.required_role.replace(/_/g, " ")}.`,
    );
  }
  if (data.action === "reject" && data.comment.trim().length < 3) {
    throw new ValidationError("comment: say why the pass is refused");
  }

  const at = nowIso();
  const to = data.action === "approve" ? "approved" : "rejected";
  assertTransition("Gate pass", GATE_PASS_TRANSITIONS, pass.status, to);

  const decided = await repos.approvals.update(approval.id, {
    status: data.action === "approve" ? "approved" : "rejected",
    actor_user_id: actor.user_id,
    comment: data.comment,
    acted_at: at,
  });

  const stock_entries: StockLedgerEntry[] = [];
  if (data.action === "approve") {
    for (const line of await repos.gatePasses.listLinesByGatePass(pass.id)) {
      // A non-stock line is not in the store, so nothing leaves it.
      if (!line.material_id) continue;
      stock_entries.push(
        await postStockMovement({
          project_id: pass.project_id,
          store_id: pass.store_id,
          material_id: line.material_id,
          movement_type: "gate_pass_out",
          movement_date: pass.gate_pass_date,
          quantity_in: 0,
          quantity_out: line.quantity,
          /* No valuation in Stores. A gate pass is a movement of goods, not of
             money, and pricing one would be the first place that decision had
             to be made. */
          rate: null,
          value: 0,
          source_entity_type: "gate_pass",
          source_entity_id: pass.id,
          remarks: `Out on ${pass.gate_pass_number} — ${pass.purpose}`,
        }),
      );
    }
  }

  const gate_pass = await repos.gatePasses.update(pass.id, {
    status: to,
    approved_by_user_id: data.action === "approve" ? actor.user_id : null,
    approved_at: data.action === "approve" ? at : null,
    decision_comment: data.comment,
  });

  return { gate_pass, approval: decided, stock_entries };
}

/* ------------------------------------------------------------------ */
/* The gate                                                            */
/* ------------------------------------------------------------------ */

/** The receiver signs for it at the gate. A name, because they have no login. */
export async function acknowledgeGatePass(
  gate_pass_id: string,
  acknowledged_by_name: string,
  actor: ActingUser,
): Promise<GatePass> {
  assertCan(actor, "edit", "gate_pass");
  const repos = getRepositories();
  const pass = required(await repos.gatePasses.getById(gate_pass_id), "Gate pass");
  if (acknowledged_by_name.trim().length < 2) {
    throw new ValidationError("acknowledged_by_name: give the name of whoever signed for it");
  }
  assertTransition("Gate pass", GATE_PASS_TRANSITIONS, pass.status, "acknowledged");
  return repos.gatePasses.update(pass.id, {
    status: "acknowledged",
    acknowledged_by_name: acknowledged_by_name.trim(),
    acknowledged_at: nowIso(),
  });
}

export const recordGatePassReturnInput = z.object({
  gate_pass_id: z.string().min(1),
  return_date: z.string().min(1),
  lines: z
    .array(
      z.object({
        gate_pass_line_id: z.string().min(1),
        returned_qty: z.number().nonnegative(),
      }),
    )
    .min(1),
  remarks: z.string().default(""),
});

export type RecordGatePassReturnInput = z.input<typeof recordGatePassReturnInput>;

export type RecordGatePassReturnResult = {
  gate_pass: GatePass;
  lines: GatePassLine[];
  stock_entries: StockLedgerEntry[];
  /** True when every line is now square and the pass has closed. */
  fully_returned: boolean;
};

/**
 * Closes a returnable pass by recording what came back.
 *
 * Material comes back in part, so the return is per line and may be recorded
 * more than once. Stock only comes back for a line that had a material behind
 * it on the way out; a returned ladder changes nothing in the store. The pass
 * closes itself when every line is square.
 */
export async function recordGatePassReturn(
  input: RecordGatePassReturnInput,
  actor: ActingUser,
): Promise<RecordGatePassReturnResult> {
  assertCan(actor, "edit", "gate_pass");
  const data = parseInput(recordGatePassReturnInput, input);
  const repos = getRepositories();

  const pass = required(await repos.gatePasses.getById(data.gate_pass_id), "Gate pass");
  if (pass.pass_type !== "returnable") {
    throw new WorkflowError(
      `${pass.gate_pass_number} is a ${pass.pass_type.replace(/_/g, "-")} pass, so nothing is expected back.`,
    );
  }
  if (pass.status !== "acknowledged") {
    throw new WorkflowError(
      `Material can only be returned against a pass the receiver has signed for. ${pass.gate_pass_number} is "${pass.status}".`,
    );
  }

  const existing = await repos.gatePasses.listLinesByGatePass(pass.id);
  const byId = new Map(existing.map((l) => [l.id, l]));
  if (data.lines.every((l) => l.returned_qty === 0)) {
    throw new ValidationError("lines: nothing was returned");
  }

  const lines: GatePassLine[] = [];
  const stock_entries: StockLedgerEntry[] = [];

  for (const [i, entry] of data.lines.entries()) {
    const line = byId.get(entry.gate_pass_line_id);
    if (!line) throw new ValidationError(`lines.${i}: not a line on ${pass.gate_pass_number}`);
    if (entry.returned_qty === 0) continue;

    const outstanding = qty(line.quantity - line.returned_qty);
    if (entry.returned_qty > outstanding + 0.0005) {
      throw new ValidationError(
        `lines.${i}.returned_qty: only ${outstanding} ${line.unit} is still out on this line`,
      );
    }

    lines.push(
      await repos.gatePasses.updateLine(line.id, {
        returned_qty: qty(line.returned_qty + entry.returned_qty),
      }),
    );

    if (line.material_id) {
      stock_entries.push(
        await postStockMovement({
          project_id: pass.project_id,
          store_id: pass.store_id,
          material_id: line.material_id,
          movement_type: "gate_pass_return",
          movement_date: data.return_date,
          quantity_in: entry.returned_qty,
          quantity_out: 0,
          rate: null,
          value: 0,
          source_entity_type: "gate_pass",
          source_entity_id: pass.id,
          remarks: `Returned against ${pass.gate_pass_number}`,
        }),
      );
    }
  }

  const after = await repos.gatePasses.listLinesByGatePass(pass.id);
  const fully_returned = after.every((l) => l.returned_qty >= l.quantity - 0.0005);

  const gate_pass = fully_returned
    ? await repos.gatePasses.update(pass.id, { status: "returned", closed_at: nowIso() })
    : pass;

  return { gate_pass, lines, stock_entries, fully_returned };
}

/**
 * Files a non-returnable pass away.
 *
 * Nothing is coming back, so there is no return to record — but an
 * acknowledged pass sitting open forever is noise in the queue, and the
 * storeman needs a way to say he is done with it.
 */
export async function closeGatePass(
  gate_pass_id: string,
  actor: ActingUser,
): Promise<GatePass> {
  assertCan(actor, "edit", "gate_pass");
  const repos = getRepositories();
  const pass = required(await repos.gatePasses.getById(gate_pass_id), "Gate pass");
  if (pass.pass_type === "returnable") {
    throw new WorkflowError(
      `${pass.gate_pass_number} is returnable. Record what came back instead of closing it.`,
    );
  }
  assertTransition("Gate pass", GATE_PASS_TRANSITIONS, pass.status, "closed");
  return repos.gatePasses.update(pass.id, { status: "closed", closed_at: nowIso() });
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

/** What is still out of the gate on a returnable pass, per line. */
export function outstandingOf(lines: GatePassLine[]): number {
  return qty(lines.reduce((sum, l) => sum + Math.max(0, l.quantity - l.returned_qty), 0));
}

/** True when a returnable pass is past the date it was due back. */
export function isOverdue(pass: GatePass, onDate: string): boolean {
  if (pass.pass_type !== "returnable") return false;
  if (pass.status === "returned" || pass.status === "rejected") return false;
  return Boolean(pass.expected_return_date && pass.expected_return_date < onDate);
}
