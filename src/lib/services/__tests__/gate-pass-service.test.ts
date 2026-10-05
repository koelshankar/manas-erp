import { beforeEach, describe, expect, it } from "vitest";
import { daysAheadDate, today } from "@/lib/clock";
import {
  acknowledgeGatePass,
  actOnGatePass,
  closeGatePass,
  createGatePass,
  recordGatePassReturn,
  submitGatePass,
  updateGatePass,
} from "@/lib/services/gate-pass-service";
import { stockPositions } from "@/lib/services/stock-position";
import { storeStockOnHand } from "@/lib/services/stock-ledger";
import { PermissionError, ValidationError } from "@/lib/services/types";
import { PH, PO, project, repos, reset, SITE } from "./helpers";

beforeEach(reset);

/** The store every seeded receipt on Manas Sapphire went into. */
async function mainStore() {
  const p = await project();
  const store = await repos().stores.primaryForProject(p.id);
  if (!store) throw new Error("seed has no store on MNS-SAP");
  return { project: p, store };
}

/** A material the main store actually holds, with its balance. */
async function stocked() {
  const { project: p, store } = await mainStore();
  const rows = await stockPositions(p.id, store.id);
  const row = rows.find((r) => r.balance > 100);
  if (!row) throw new Error("seed has no well-stocked material in the main store");
  return { project: p, store, row };
}

describe("createGatePass", () => {
  it("writes a returnable pass as a draft, moving no stock", async () => {
    const { project: p, store, row } = await stocked();
    const before = await storeStockOnHand(store.id, row.material_id);

    const { gate_pass, lines } = await createGatePass(
      {
        project_id: p.id,
        store_id: store.id,
        pass_type: "returnable",
        gate_pass_date: today(),
        issued_to_name: "Sachin Naik",
        issued_to_company: "Naik Electro Mechanical Works",
        purpose: "Trial cube cast off site",
        expected_return_date: daysAheadDate(5),
        lines: [{ material_id: row.material_id, unit: row.unit, quantity: 10 }],
      },
      await SITE(),
    );

    expect(gate_pass.gate_pass_number).toMatch(/^MSP\/GP\/26-27\/\d{4}$/);
    expect(gate_pass.status).toBe("draft");
    expect(lines).toHaveLength(1);
    // Nothing leaves the store until the project manager signs.
    expect(await storeStockOnHand(store.id, row.material_id)).toBe(before);
  });

  /**
   * The one place in the app a document line may have no material: a gate pass
   * is also how a tool or a hired machine leaves, and such a line moves no
   * stock.
   */
  it("accepts a line with no material, described in words", async () => {
    const { project: p, store } = await mainStore();
    const { lines } = await createGatePass(
      {
        project_id: p.id,
        store_id: store.id,
        pass_type: "returnable",
        gate_pass_date: today(),
        issued_to_name: "Dilip Shetye",
        purpose: "Plate compactor out for repair",
        expected_return_date: daysAheadDate(10),
        lines: [{ description: "Plate compactor, 5HP", unit: "nos", quantity: 1 }],
      },
      await SITE(),
    );
    expect(lines[0].material_id).toBeNull();
    expect(lines[0].description).toBe("Plate compactor, 5HP");
  });

  it("requires a return date on a returnable pass and refuses one on the others", async () => {
    const { project: p, store } = await mainStore();
    const base = {
      project_id: p.id,
      store_id: store.id,
      gate_pass_date: today(),
      issued_to_name: "Rajesh Pednekar",
      purpose: "Scrap going out",
      lines: [{ description: "Empty bags", unit: "kg" as const, quantity: 40 }],
    };

    await expect(
      createGatePass({ ...base, pass_type: "returnable", expected_return_date: null }, await SITE()),
    ).rejects.toThrow(/expected back/);

    await expect(
      createGatePass(
        { ...base, pass_type: "non_returnable", expected_return_date: daysAheadDate(5) },
        await SITE(),
      ),
    ).rejects.toThrow(/only a returnable/i);

    const ok = await createGatePass(
      { ...base, pass_type: "non_returnable", expected_return_date: null },
      await SITE(),
    );
    expect(ok.gate_pass.expected_return_date).toBeNull();
  });

  it("refuses to take out more than the store holds", async () => {
    const { project: p, store, row } = await stocked();
    await expect(
      createGatePass(
        {
          project_id: p.id,
          store_id: store.id,
          pass_type: "non_returnable",
          gate_pass_date: today(),
          issued_to_name: "Somebody",
          purpose: "More than there is",
          lines: [{ material_id: row.material_id, unit: row.unit, quantity: row.balance + 50 }],
        },
        await SITE(),
      ),
    ).rejects.toThrow(/holds only/);
  });

  it("refuses the purchase officer, who holds no grant on gate passes", async () => {
    const { project: p, store } = await mainStore();
    await expect(
      createGatePass(
        {
          project_id: p.id,
          store_id: store.id,
          pass_type: "non_returnable",
          gate_pass_date: today(),
          issued_to_name: "Somebody",
          purpose: "Not their document",
          lines: [{ description: "A ladder", unit: "nos", quantity: 1 }],
        },
        await PO(),
      ),
    ).rejects.toBeInstanceOf(PermissionError);
  });
});

describe("the gate pass chain", () => {
  async function draftWithStock() {
    const { project: p, store, row } = await stocked();
    const { gate_pass } = await createGatePass(
      {
        project_id: p.id,
        store_id: store.id,
        pass_type: "returnable",
        gate_pass_date: today(),
        issued_to_name: "Sachin Naik",
        purpose: "Out for a trial",
        expected_return_date: daysAheadDate(5),
        lines: [{ material_id: row.material_id, unit: row.unit, quantity: 12 }],
      },
      await SITE(),
    );
    return { project: p, store, row, gate_pass };
  }

  /**
   * Approval is what takes the stock out: the material is physically going
   * through the gate, and holding the movement back until somebody marked it
   * gone would leave the position wrong for as long as that took.
   */
  it("takes stock out of the store when the project manager approves", async () => {
    const { store, row, gate_pass } = await draftWithStock();
    const before = await storeStockOnHand(store.id, row.material_id);

    await submitGatePass(gate_pass.id, await SITE());
    const result = await actOnGatePass(
      { gate_pass_id: gate_pass.id, action: "approve" },
      await PH(),
    );

    expect(result.gate_pass.status).toBe("approved");
    expect(result.gate_pass.approved_by_user_id).not.toBeNull();
    expect(result.stock_entries).toHaveLength(1);
    expect(result.stock_entries[0].movement_type).toBe("gate_pass_out");
    // No valuation in Stores: a gate pass moves goods, not money.
    expect(result.stock_entries[0].rate).toBeNull();
    expect(result.stock_entries[0].value).toBe(0);
    expect(await storeStockOnHand(store.id, row.material_id)).toBeCloseTo(before - 12, 3);
  });

  it("refuses the storeman the project manager's step", async () => {
    const { gate_pass } = await draftWithStock();
    await submitGatePass(gate_pass.id, await SITE());
    await expect(
      actOnGatePass({ gate_pass_id: gate_pass.id, action: "approve" }, await SITE()),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("needs a reason to refuse, and moves no stock when it does", async () => {
    const { store, row, gate_pass } = await draftWithStock();
    const before = await storeStockOnHand(store.id, row.material_id);
    await submitGatePass(gate_pass.id, await SITE());

    await expect(
      actOnGatePass({ gate_pass_id: gate_pass.id, action: "reject", comment: "" }, await PH()),
    ).rejects.toBeInstanceOf(ValidationError);

    const result = await actOnGatePass(
      { gate_pass_id: gate_pass.id, action: "reject", comment: "Not needed off site" },
      await PH(),
    );
    expect(result.gate_pass.status).toBe("rejected");
    expect(result.stock_entries).toHaveLength(0);
    expect(await storeStockOnHand(store.id, row.material_id)).toBe(before);
  });

  it("refuses to edit a pass once it has left draft", async () => {
    const { project: p, store, row, gate_pass } = await draftWithStock();
    await submitGatePass(gate_pass.id, await SITE());
    await expect(
      updateGatePass(
        {
          gate_pass_id: gate_pass.id,
          project_id: p.id,
          store_id: store.id,
          pass_type: "returnable",
          gate_pass_date: today(),
          issued_to_name: "Someone else",
          purpose: "Changed my mind",
          expected_return_date: daysAheadDate(5),
          lines: [{ material_id: row.material_id, unit: row.unit, quantity: 1 }],
        },
        await SITE(),
      ),
    ).rejects.toThrow(/no longer be edited/);
  });
});

describe("recordGatePassReturn", () => {
  async function outOfTheGate(quantity = 20) {
    const { project: p, store, row } = await stocked();
    const { gate_pass, lines } = await createGatePass(
      {
        project_id: p.id,
        store_id: store.id,
        pass_type: "returnable",
        gate_pass_date: today(),
        issued_to_name: "Sachin Naik",
        purpose: "Out for a trial",
        expected_return_date: daysAheadDate(5),
        lines: [{ material_id: row.material_id, unit: row.unit, quantity }],
      },
      await SITE(),
    );
    await submitGatePass(gate_pass.id, await SITE());
    await actOnGatePass({ gate_pass_id: gate_pass.id, action: "approve" }, await PH());
    await acknowledgeGatePass(gate_pass.id, "Sachin Naik", await SITE());
    return { project: p, store, row, gate_pass, line: lines[0] };
  }

  it("brings stock back and closes the pass when every line is square", async () => {
    const { store, row, gate_pass, line } = await outOfTheGate(20);
    const outside = await storeStockOnHand(store.id, row.material_id);

    const result = await recordGatePassReturn(
      {
        gate_pass_id: gate_pass.id,
        return_date: today(),
        lines: [{ gate_pass_line_id: line.id, returned_qty: 20 }],
      },
      await SITE(),
    );

    expect(result.fully_returned).toBe(true);
    expect(result.gate_pass.status).toBe("returned");
    expect(result.gate_pass.closed_at).not.toBeNull();
    expect(result.stock_entries[0].movement_type).toBe("gate_pass_return");
    expect(await storeStockOnHand(store.id, row.material_id)).toBeCloseTo(outside + 20, 3);
  });

  /** Material comes back in part, so the return may be recorded more than once. */
  it("keeps the pass open while part of it is still out", async () => {
    const { gate_pass, line } = await outOfTheGate(20);

    const first = await recordGatePassReturn(
      {
        gate_pass_id: gate_pass.id,
        return_date: today(),
        lines: [{ gate_pass_line_id: line.id, returned_qty: 8 }],
      },
      await SITE(),
    );
    expect(first.fully_returned).toBe(false);
    expect(first.gate_pass.status).toBe("acknowledged");
    expect(first.lines[0].returned_qty).toBe(8);

    const second = await recordGatePassReturn(
      {
        gate_pass_id: gate_pass.id,
        return_date: today(),
        lines: [{ gate_pass_line_id: line.id, returned_qty: 12 }],
      },
      await SITE(),
    );
    expect(second.fully_returned).toBe(true);
    expect(second.gate_pass.status).toBe("returned");
  });

  it("refuses more back than went out", async () => {
    const { gate_pass, line } = await outOfTheGate(20);
    await expect(
      recordGatePassReturn(
        {
          gate_pass_id: gate_pass.id,
          return_date: today(),
          lines: [{ gate_pass_line_id: line.id, returned_qty: 25 }],
        },
        await SITE(),
      ),
    ).rejects.toThrow(/still out/);
  });

  it("refuses a return against a non-returnable pass, which is closed instead", async () => {
    const { project: p, store } = await mainStore();
    const { gate_pass, lines } = await createGatePass(
      {
        project_id: p.id,
        store_id: store.id,
        pass_type: "non_returnable",
        gate_pass_date: today(),
        issued_to_name: "Rajesh Pednekar",
        purpose: "Scrap sold",
        lines: [{ description: "Empty bags", unit: "kg", quantity: 40 }],
      },
      await SITE(),
    );
    await submitGatePass(gate_pass.id, await SITE());
    await actOnGatePass({ gate_pass_id: gate_pass.id, action: "approve" }, await PH());
    await acknowledgeGatePass(gate_pass.id, "Rajesh Pednekar", await SITE());

    await expect(
      recordGatePassReturn(
        {
          gate_pass_id: gate_pass.id,
          return_date: today(),
          lines: [{ gate_pass_line_id: lines[0].id, returned_qty: 40 }],
        },
        await SITE(),
      ),
    ).rejects.toThrow(/nothing is expected back/i);

    const closed = await closeGatePass(gate_pass.id, await SITE());
    expect(closed.status).toBe("closed");
  });
});

describe("the stock position", () => {
  /**
   * The whole point of the position: a figure nobody maintains, that cannot
   * drift out of step with the documents because it is the documents.
   */
  it("shows material out on a gate pass without losing it from the balance history", async () => {
    const { project: p, store, row } = await stocked();
    const before = (await stockPositions(p.id, store.id)).find(
      (r) => r.material_id === row.material_id,
    )!;

    const { gate_pass } = await createGatePass(
      {
        project_id: p.id,
        store_id: store.id,
        pass_type: "returnable",
        gate_pass_date: today(),
        issued_to_name: "Sachin Naik",
        purpose: "Out for a trial",
        expected_return_date: daysAheadDate(5),
        lines: [{ material_id: row.material_id, unit: row.unit, quantity: 15 }],
      },
      await SITE(),
    );
    await submitGatePass(gate_pass.id, await SITE());
    await actOnGatePass({ gate_pass_id: gate_pass.id, action: "approve" }, await PH());

    const after = (await stockPositions(p.id, store.id)).find(
      (r) => r.material_id === row.material_id,
    )!;
    expect(after.on_gate_pass).toBeCloseTo(before.on_gate_pass + 15, 3);
    expect(after.balance).toBeCloseTo(before.balance - 15, 3);
    // Receipts and issues are untouched: a gate pass is its own column.
    expect(after.received).toBeCloseTo(before.received, 3);
    expect(after.issued).toBeCloseTo(before.issued, 3);
  });

  /** No rupee figure anywhere in Stores, for any role. */
  it("returns no monetary field at all", async () => {
    const { project: p } = await mainStore();
    const rows = await stockPositions(p.id);
    expect(rows.length).toBeGreaterThan(0);
    const money = /(^|_)(amount|rate|value|cost|price|total)s?$/;
    rows.forEach((row) => {
      Object.keys(row).forEach((key) => expect(key).not.toMatch(money));
    });
  });
});
