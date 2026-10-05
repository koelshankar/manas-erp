import { z } from "zod";
import { getRepositories } from "@/lib/data";
import {
  TRANSFER_TRANSITIONS,
  nowIso,
  type MaterialTransfer,
  type MaterialTransferLine,
  type StockLedgerEntry,
} from "@/lib/domain";
import { assertCan, assertTransition, parseInput, qty, required } from "./guards";
import { loadMaterialCatalog } from "./material-catalog";
import { nextDocumentNumber } from "./numbering";
import { postStockMovement, storeStockOnHand } from "./stock-ledger";
import { ValidationError, WorkflowError, type ActingUser } from "./types";

/**
 * The material transfer order: stock moving between stores, which may be
 * between projects.
 *
 * The document exists because of the gap in the middle of it. A quantity
 * dispatched from one store and not yet signed for at the other is in neither
 * position, and both ends need to be able to say so — so the transfer writes
 * **two** stock rows at two different moments rather than one row that pretends
 * the move was instantaneous:
 *
 *   dispatch      -> `transfer_out` from the issuing store
 *   acknowledge   -> `transfer_in`  into the receiving store
 *
 * Between the two it is `in_transit`, and that is the state the receiving
 * storeman has a queue for.
 *
 * Material is **inherited from stock**, never picked blind: a line must name a
 * material the issuing store actually holds, and the quantity is checked
 * against that store's balance at dispatch as well as at entry, because a
 * draft can sit for days while the stock goes out on something else.
 *
 * No value travels with it. Manas asked for no valuation anywhere in Stores,
 * and the receiving end re-pricing stock would be the first place that decision
 * had to be made.
 */

export const transferLineInput = z.object({
  material_id: z.string().min(1, "pick a material"),
  quantity: z.number().positive("quantity must be greater than zero"),
  remarks: z.string().default(""),
});

export const createTransferInput = z
  .object({
    /** The issuing project. The document is filed here. */
    project_id: z.string().min(1),
    from_store_id: z.string().min(1, "pick the store it leaves"),
    to_project_id: z.string().min(1, "pick the receiving project"),
    to_store_id: z.string().min(1, "pick the receiving store"),
    transfer_date: z.string().min(1),
    reason: z.string().min(3, "say why it is being moved"),
    vehicle_number: z.string().default(""),
    remarks: z.string().default(""),
    lines: z.array(transferLineInput).min(1, "a transfer order needs at least one material"),
  })
  .refine((t) => t.from_store_id !== t.to_store_id, {
    message: "a transfer has to go somewhere else",
    path: ["to_store_id"],
  });

export type CreateTransferInput = z.input<typeof createTransferInput>;

export type TransferResult = {
  transfer: MaterialTransfer;
  lines: MaterialTransferLine[];
};

export async function createMaterialTransfer(
  input: CreateTransferInput,
  actor: ActingUser,
): Promise<TransferResult> {
  assertCan(actor, "create", "transfer_orders");
  const data = parseInput(createTransferInput, input);
  const repos = getRepositories();

  const project = required(await repos.projects.getById(data.project_id), "Project");
  const from = required(await repos.stores.getById(data.from_store_id), "Issuing store");
  const to = required(await repos.stores.getById(data.to_store_id), "Receiving store");
  if (from.project_id !== project.id) {
    throw new ValidationError(`from_store_id: ${from.name} does not belong to this project`);
  }
  if (to.project_id !== data.to_project_id) {
    throw new ValidationError(`to_store_id: ${to.name} does not belong to the receiving project`);
  }
  await assertLinesAreAvailable(from.id, data.lines);

  const transfer_number = await nextDocumentNumber("MTO", project, nowIso());
  const transfer = await repos.materialTransfers.create({
    project_id: project.id,
    transfer_number,
    transfer_date: data.transfer_date,
    from_store_id: from.id,
    to_project_id: data.to_project_id,
    to_store_id: to.id,
    reason: data.reason,
    vehicle_number: data.vehicle_number,
    status: "draft",
    raised_by_user_id: actor.user_id,
    dispatched_at: null,
    acknowledged_by_user_id: null,
    acknowledged_at: null,
    remarks: data.remarks,
  });

  const lines = await writeLines(transfer, data.lines);
  return { transfer, lines };
}

export const updateTransferInput = createTransferInput.safeExtend({
  material_transfer_id: z.string().min(1),
});

export type UpdateTransferInput = z.input<typeof updateTransferInput>;

/** A draft may be rewritten whole. Once it is on a lorry it may not. */
export async function updateMaterialTransfer(
  input: UpdateTransferInput,
  actor: ActingUser,
): Promise<TransferResult> {
  assertCan(actor, "edit", "transfer_orders");
  const data = parseInput(updateTransferInput, input);
  const repos = getRepositories();

  const existing = required(
    await repos.materialTransfers.getById(data.material_transfer_id),
    "Transfer order",
  );
  if (existing.status !== "draft") {
    throw new WorkflowError(
      `${existing.transfer_number} has been dispatched and can no longer be edited.`,
    );
  }
  const to = required(await repos.stores.getById(data.to_store_id), "Receiving store");
  if (to.project_id !== data.to_project_id) {
    throw new ValidationError(`to_store_id: ${to.name} does not belong to the receiving project`);
  }
  await assertLinesAreAvailable(data.from_store_id, data.lines);

  const transfer = await repos.materialTransfers.update(existing.id, {
    transfer_date: data.transfer_date,
    from_store_id: data.from_store_id,
    to_project_id: data.to_project_id,
    to_store_id: to.id,
    reason: data.reason,
    vehicle_number: data.vehicle_number,
    remarks: data.remarks,
  });

  for (const line of await repos.materialTransfers.listLinesByTransfer(transfer.id)) {
    await repos.materialTransfers.removeLine(line.id);
  }
  const lines = await writeLines(transfer, data.lines);
  return { transfer, lines };
}

type LineInput = z.infer<typeof transferLineInput>;

async function assertLinesAreAvailable(store_id: string, lines: LineInput[]): Promise<void> {
  const repos = getRepositories();
  const catalog = await loadMaterialCatalog(repos);
  const store = required(await repos.stores.getById(store_id), "Issuing store");
  const wanted = new Map<string, number>();

  for (const [i, line] of lines.entries()) {
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

async function writeLines(
  transfer: MaterialTransfer,
  lines: LineInput[],
): Promise<MaterialTransferLine[]> {
  const repos = getRepositories();
  const out: MaterialTransferLine[] = [];
  for (const line of lines) {
    const material = required(await repos.materials.getById(line.material_id), "Material");
    out.push(
      await repos.materialTransfers.createLine({
        project_id: transfer.project_id,
        material_transfer_id: transfer.id,
        material_id: material.id,
        unit: material.unit,
        quantity: qty(line.quantity),
        received_qty: 0,
        remarks: line.remarks,
      }),
    );
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Dispatch and acknowledgement                                        */
/* ------------------------------------------------------------------ */

export type DispatchTransferResult = {
  transfer: MaterialTransfer;
  stock_entries: StockLedgerEntry[];
};

/**
 * The lorry leaves. Stock comes off the issuing store and the transfer becomes
 * in-transit.
 *
 * Availability is re-checked here, not only when the draft was written: a draft
 * can sit for days, and the quantity it reserved may have gone out on an issue
 * in the meantime.
 */
export async function dispatchMaterialTransfer(
  material_transfer_id: string,
  actor: ActingUser,
): Promise<DispatchTransferResult> {
  assertCan(actor, "edit", "transfer_orders");
  const repos = getRepositories();

  const transfer = required(
    await repos.materialTransfers.getById(material_transfer_id),
    "Transfer order",
  );
  assertTransition("Transfer order", TRANSFER_TRANSITIONS, transfer.status, "in_transit");
  const lines = await repos.materialTransfers.listLinesByTransfer(transfer.id);
  if (lines.length === 0) {
    throw new ValidationError("lines: this transfer order has nothing on it");
  }
  await assertLinesAreAvailable(
    transfer.from_store_id,
    lines.map((l) => ({ material_id: l.material_id, quantity: l.quantity, remarks: l.remarks })),
  );

  const at = nowIso();
  const stock_entries: StockLedgerEntry[] = [];
  for (const line of lines) {
    stock_entries.push(
      await postStockMovement({
        project_id: transfer.project_id,
        store_id: transfer.from_store_id,
        material_id: line.material_id,
        movement_type: "transfer_out",
        movement_date: transfer.transfer_date,
        quantity_in: 0,
        quantity_out: line.quantity,
        rate: null,
        value: 0,
        source_entity_type: "material_transfer",
        source_entity_id: transfer.id,
        remarks: `Transferred out on ${transfer.transfer_number}`,
      }),
    );
  }

  return {
    transfer: await repos.materialTransfers.update(transfer.id, {
      status: "in_transit",
      dispatched_at: at,
    }),
    stock_entries,
  };
}

export const acknowledgeTransferInput = z.object({
  material_transfer_id: z.string().min(1),
  received_on: z.string().min(1),
  /** Short delivery is recorded here, per line. Omit to accept in full. */
  lines: z
    .array(
      z.object({
        material_transfer_line_id: z.string().min(1),
        received_qty: z.number().nonnegative(),
      }),
    )
    .default([]),
});

export type AcknowledgeTransferInput = z.input<typeof acknowledgeTransferInput>;

export type AcknowledgeTransferResult = {
  transfer: MaterialTransfer;
  lines: MaterialTransferLine[];
  stock_entries: StockLedgerEntry[];
};

/**
 * The receiving store signs for it, which is what completes the transfer.
 *
 * This is the only step that writes into the receiving store, and it writes
 * what actually arrived — a short delivery is recorded as a smaller
 * `received_qty`, never by editing the dispatched quantity. The difference
 * between the two is then visible on the document, which is the point: a
 * transfer that lost four bags on the road should say so rather than quietly
 * agree with itself.
 */
export async function acknowledgeMaterialTransfer(
  input: AcknowledgeTransferInput,
  actor: ActingUser,
): Promise<AcknowledgeTransferResult> {
  assertCan(actor, "edit", "transfer_orders");
  const data = parseInput(acknowledgeTransferInput, input);
  const repos = getRepositories();

  const transfer = required(
    await repos.materialTransfers.getById(data.material_transfer_id),
    "Transfer order",
  );
  assertTransition("Transfer order", TRANSFER_TRANSITIONS, transfer.status, "acknowledged");

  const existing = await repos.materialTransfers.listLinesByTransfer(transfer.id);
  const received = new Map(data.lines.map((l) => [l.material_transfer_line_id, l.received_qty]));
  for (const id of received.keys()) {
    if (!existing.some((l) => l.id === id)) {
      throw new ValidationError(`lines: ${id} is not a line on ${transfer.transfer_number}`);
    }
  }

  const at = nowIso();
  const lines: MaterialTransferLine[] = [];
  const stock_entries: StockLedgerEntry[] = [];

  for (const line of existing) {
    // Nothing said about a line means it arrived in full.
    const qtyIn = qty(received.has(line.id) ? received.get(line.id)! : line.quantity);
    if (qtyIn > line.quantity + 0.0005) {
      throw new ValidationError(
        `lines: ${qtyIn} ${line.unit} cannot arrive against ${line.quantity} ${line.unit} dispatched`,
      );
    }

    lines.push(await repos.materialTransfers.updateLine(line.id, { received_qty: qtyIn }));
    if (qtyIn === 0) continue;

    stock_entries.push(
      await postStockMovement({
        project_id: transfer.to_project_id,
        store_id: transfer.to_store_id,
        material_id: line.material_id,
        movement_type: "transfer_in",
        movement_date: data.received_on,
        quantity_in: qtyIn,
        quantity_out: 0,
        rate: null,
        value: 0,
        source_entity_type: "material_transfer",
        source_entity_id: transfer.id,
        remarks: `Transferred in on ${transfer.transfer_number}`,
      }),
    );
  }

  return {
    transfer: await repos.materialTransfers.update(transfer.id, {
      status: "acknowledged",
      acknowledged_by_user_id: actor.user_id,
      acknowledged_at: at,
    }),
    lines,
    stock_entries,
  };
}

/** A draft nobody dispatched. Once the material has left, it cannot be cancelled. */
export async function cancelMaterialTransfer(
  material_transfer_id: string,
  actor: ActingUser,
): Promise<MaterialTransfer> {
  assertCan(actor, "edit", "transfer_orders");
  const repos = getRepositories();
  const transfer = required(
    await repos.materialTransfers.getById(material_transfer_id),
    "Transfer order",
  );
  assertTransition("Transfer order", TRANSFER_TRANSITIONS, transfer.status, "cancelled");
  return repos.materialTransfers.update(transfer.id, { status: "cancelled" });
}

/** What a transfer lost on the road, per line, once it has been signed for. */
export function shortfallOf(lines: MaterialTransferLine[]): number {
  return qty(lines.reduce((sum, l) => sum + Math.max(0, l.quantity - l.received_qty), 0));
}
