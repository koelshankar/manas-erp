import { beforeEach, describe, expect, it } from "vitest";
import { today } from "@/lib/clock";
import {
  acknowledgeMaterialTransfer,
  cancelMaterialTransfer,
  createMaterialTransfer,
  dispatchMaterialTransfer,
  updateMaterialTransfer,
} from "@/lib/services/transfer-service";
import { issueMaterial } from "@/lib/services/stores-service";
import { stockPositions } from "@/lib/services/stock-position";
import { storeStockOnHand } from "@/lib/services/stock-ledger";
import { PermissionError, ValidationError } from "@/lib/services/types";
import { PO, project, repos, reset, SITE } from "./helpers";

beforeEach(reset);

/**
 * Two stores at either end of a transfer.
 *
 * Manas Sapphire is seeded with two — a main store and one at the far tower —
 * so the within-project case needs no second project. The cross-project case
 * uses Manas Greens.
 */
async function twoStores() {
  const from = await project();
  const mine = await repos().stores.listByProject(from.id);
  if (mine.length < 2) throw new Error("seed has fewer than two stores on MNS-SAP");
  const greens = await repos().projects.getByCode("MNS-GRN");
  if (!greens) throw new Error("seed is missing MNS-GRN");
  const theirs = (await repos().stores.listByProject(greens.id))[0];
  return {
    project: from,
    main: mine.find((s) => s.is_primary)!,
    tower: mine.find((s) => !s.is_primary)!,
    otherProject: greens,
    otherStore: theirs,
  };
}

/** A material the main store holds plenty of. */
async function stocked() {
  const ctx = await twoStores();
  const rows = await stockPositions(ctx.project.id, ctx.main.id);
  const row = rows.find((r) => r.balance > 100);
  if (!row) throw new Error("seed has no well-stocked material in the main store");
  return { ...ctx, row };
}

describe("createMaterialTransfer", () => {
  it("writes a draft that moves nothing yet", async () => {
    const ctx = await stocked();
    const before = await storeStockOnHand(ctx.main.id, ctx.row.material_id);

    const { transfer, lines } = await createMaterialTransfer(
      {
        project_id: ctx.project.id,
        from_store_id: ctx.main.id,
        to_project_id: ctx.otherProject.id,
        to_store_id: ctx.otherStore.id,
        transfer_date: today(),
        reason: "Shortfall at Greens",
        lines: [{ material_id: ctx.row.material_id, quantity: 25 }],
      },
      await SITE(),
    );

    expect(transfer.transfer_number).toMatch(/^MSP\/MTO\/26-27\/\d{4}$/);
    expect(transfer.status).toBe("draft");
    expect(lines[0].received_qty).toBe(0);
    expect(await storeStockOnHand(ctx.main.id, ctx.row.material_id)).toBe(before);
  });

  it("refuses a transfer to the store it came from", async () => {
    const ctx = await stocked();
    await expect(
      createMaterialTransfer(
        {
          project_id: ctx.project.id,
          from_store_id: ctx.main.id,
          to_project_id: ctx.project.id,
          to_store_id: ctx.main.id,
          transfer_date: today(),
          reason: "Nowhere",
          lines: [{ material_id: ctx.row.material_id, quantity: 1 }],
        },
        await SITE(),
      ),
    ).rejects.toThrow(/somewhere else/);
  });

  it("refuses to move more than the issuing store holds", async () => {
    const ctx = await stocked();
    await expect(
      createMaterialTransfer(
        {
          project_id: ctx.project.id,
          from_store_id: ctx.main.id,
          to_project_id: ctx.project.id,
          to_store_id: ctx.tower.id,
          transfer_date: today(),
          reason: "More than there is",
          lines: [{ material_id: ctx.row.material_id, quantity: ctx.row.balance + 100 }],
        },
        await SITE(),
      ),
    ).rejects.toThrow(/holds only/);
  });

  it("refuses the purchase officer, who holds no grant on transfers", async () => {
    const ctx = await stocked();
    await expect(
      createMaterialTransfer(
        {
          project_id: ctx.project.id,
          from_store_id: ctx.main.id,
          to_project_id: ctx.project.id,
          to_store_id: ctx.tower.id,
          transfer_date: today(),
          reason: "Not their document",
          lines: [{ material_id: ctx.row.material_id, quantity: 1 }],
        },
        await PO(),
      ),
    ).rejects.toBeInstanceOf(PermissionError);
  });
});

describe("the in-transit gap", () => {
  async function draft(quantity = 30, crossProject = true) {
    const ctx = await stocked();
    const { transfer, lines } = await createMaterialTransfer(
      {
        project_id: ctx.project.id,
        from_store_id: ctx.main.id,
        to_project_id: crossProject ? ctx.otherProject.id : ctx.project.id,
        to_store_id: crossProject ? ctx.otherStore.id : ctx.tower.id,
        transfer_date: today(),
        reason: "Shortfall at the other end",
        lines: [{ material_id: ctx.row.material_id, quantity }],
      },
      await SITE(),
    );
    return { ...ctx, transfer, line: lines[0] };
  }

  /**
   * The whole point of the document: a quantity that has left one store and
   * arrived nowhere is in neither position, and both ends say so.
   */
  it("leaves the quantity in neither store while it is in transit", async () => {
    const ctx = await draft(30);
    const fromBefore = await storeStockOnHand(ctx.main.id, ctx.row.material_id);
    const toBefore = await storeStockOnHand(ctx.otherStore.id, ctx.row.material_id);

    const dispatched = await dispatchMaterialTransfer(ctx.transfer.id, await SITE());
    expect(dispatched.transfer.status).toBe("in_transit");
    expect(dispatched.transfer.dispatched_at).not.toBeNull();
    expect(dispatched.stock_entries[0].movement_type).toBe("transfer_out");
    // No valuation in Stores.
    expect(dispatched.stock_entries[0].rate).toBeNull();

    expect(await storeStockOnHand(ctx.main.id, ctx.row.material_id)).toBeCloseTo(
      fromBefore - 30,
      3,
    );
    expect(await storeStockOnHand(ctx.otherStore.id, ctx.row.material_id)).toBeCloseTo(
      toBefore,
      3,
    );
  });

  it("updates both stock positions when the receiving store acknowledges it", async () => {
    const ctx = await draft(30);
    await dispatchMaterialTransfer(ctx.transfer.id, await SITE());
    const fromAfterDispatch = await storeStockOnHand(ctx.main.id, ctx.row.material_id);
    const toBefore = await storeStockOnHand(ctx.otherStore.id, ctx.row.material_id);

    const result = await acknowledgeMaterialTransfer(
      { material_transfer_id: ctx.transfer.id, received_on: today() },
      await SITE(),
    );

    expect(result.transfer.status).toBe("acknowledged");
    expect(result.transfer.acknowledged_at).not.toBeNull();
    expect(result.stock_entries[0].movement_type).toBe("transfer_in");
    // The issuing store is unchanged by the acknowledgement: it lost the stock
    // when the lorry left.
    expect(await storeStockOnHand(ctx.main.id, ctx.row.material_id)).toBeCloseTo(
      fromAfterDispatch,
      3,
    );
    expect(await storeStockOnHand(ctx.otherStore.id, ctx.row.material_id)).toBeCloseTo(
      toBefore + 30,
      3,
    );

    // And it shows in the receiving project's position, under its own column.
    const position = (await stockPositions(ctx.otherProject.id, ctx.otherStore.id)).find(
      (r) => r.material_id === ctx.row.material_id,
    )!;
    expect(position.transferred_in).toBeGreaterThanOrEqual(30);
  });

  /**
   * A short delivery is recorded, never written out of the document: the
   * difference between sent and received is what a transfer that lost four bags
   * on the road is for.
   */
  it("records a shortfall without rewriting the quantity dispatched", async () => {
    const ctx = await draft(30);
    await dispatchMaterialTransfer(ctx.transfer.id, await SITE());
    const toBefore = await storeStockOnHand(ctx.otherStore.id, ctx.row.material_id);

    const result = await acknowledgeMaterialTransfer(
      {
        material_transfer_id: ctx.transfer.id,
        received_on: today(),
        lines: [{ material_transfer_line_id: ctx.line.id, received_qty: 26 }],
      },
      await SITE(),
    );

    expect(result.lines[0].quantity).toBe(30);
    expect(result.lines[0].received_qty).toBe(26);
    expect(await storeStockOnHand(ctx.otherStore.id, ctx.row.material_id)).toBeCloseTo(
      toBefore + 26,
      3,
    );
  });

  it("refuses more arriving than was dispatched", async () => {
    const ctx = await draft(30);
    await dispatchMaterialTransfer(ctx.transfer.id, await SITE());
    await expect(
      acknowledgeMaterialTransfer(
        {
          material_transfer_id: ctx.transfer.id,
          received_on: today(),
          lines: [{ material_transfer_line_id: ctx.line.id, received_qty: 40 }],
        },
        await SITE(),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses to acknowledge a transfer nobody has dispatched", async () => {
    const ctx = await draft(10);
    await expect(
      acknowledgeMaterialTransfer(
        { material_transfer_id: ctx.transfer.id, received_on: today() },
        await SITE(),
      ),
    ).rejects.toThrow(/cannot move from "draft"/);
  });

  it("refuses to edit or cancel a transfer once it has been dispatched", async () => {
    const ctx = await draft(10);
    await dispatchMaterialTransfer(ctx.transfer.id, await SITE());

    await expect(
      updateMaterialTransfer(
        {
          material_transfer_id: ctx.transfer.id,
          project_id: ctx.project.id,
          from_store_id: ctx.main.id,
          to_project_id: ctx.otherProject.id,
          to_store_id: ctx.otherStore.id,
          transfer_date: today(),
          reason: "Changed my mind",
          lines: [{ material_id: ctx.row.material_id, quantity: 5 }],
        },
        await SITE(),
      ),
    ).rejects.toThrow(/no longer be edited/);

    await expect(
      cancelMaterialTransfer(ctx.transfer.id, await SITE()),
    ).rejects.toThrow(/cannot move from "in_transit"/);
  });

  /**
   * A draft can sit for days, and the quantity it named may have gone out on an
   * issue in the meantime. Dispatch re-checks rather than trusting the draft.
   */
  it("re-checks availability at dispatch, not only when the draft was written", async () => {
    const ctx = await stocked();
    const balance = await storeStockOnHand(ctx.main.id, ctx.row.material_id);
    const workOrder = (await repos().workOrders.listByProject(ctx.project.id))[0];

    const { transfer } = await createMaterialTransfer(
      {
        project_id: ctx.project.id,
        from_store_id: ctx.main.id,
        to_project_id: ctx.project.id,
        to_store_id: ctx.tower.id,
        transfer_date: today(),
        reason: "Tower B needs it",
        lines: [{ material_id: ctx.row.material_id, quantity: balance - 5 }],
      },
      await SITE(),
    );

    // Most of it goes out to a contractor before the lorry is loaded.
    await issueMaterial(
      {
        project_id: ctx.project.id,
        store_id: ctx.main.id,
        work_order_id: workOrder.id,
        issue_date: today(),
        lines: [{ material_id: ctx.row.material_id, quantity: balance - 10 }],
      },
      await SITE(),
    );

    await expect(
      dispatchMaterialTransfer(transfer.id, await SITE()),
    ).rejects.toThrow(/holds only/);
  });

  it("cancels a draft nobody dispatched", async () => {
    const ctx = await draft(10);
    const cancelled = await cancelMaterialTransfer(ctx.transfer.id, await SITE());
    expect(cancelled.status).toBe("cancelled");
  });
});

describe("inbound transfers", () => {
  /**
   * A transfer is filed under the project it leaves, so the receiving store
   * cannot find its own work through the ordinary project scope. This is the
   * read that fixes it.
   */
  it("are found by destination, not by the project the document belongs to", async () => {
    const ctx = await stocked();
    const { transfer } = await createMaterialTransfer(
      {
        project_id: ctx.project.id,
        from_store_id: ctx.main.id,
        to_project_id: ctx.otherProject.id,
        to_store_id: ctx.otherStore.id,
        transfer_date: today(),
        reason: "Shortfall at Greens",
        lines: [{ material_id: ctx.row.material_id, quantity: 12 }],
      },
      await SITE(),
    );

    const theirs = await repos().materialTransfers.listInboundToProject(ctx.otherProject.id);
    expect(theirs.map((t) => t.id)).toContain(transfer.id);
    // And it is not in the receiving project's own filed documents.
    const filed = await repos().materialTransfers.listByProject(ctx.otherProject.id);
    expect(filed.map((t) => t.id)).not.toContain(transfer.id);
  });
});
