import type {
  GatePass,
  GatePassLine,
  GatePassType,
  MaterialTransfer,
  MaterialTransferLine,
  Project,
  StockLedgerEntry,
  StockMovementType,
  Store,
  Unit,
} from "@/lib/domain";
import type { DemoDatabase } from "../database";
import type { ProjectPlan } from "./catalog";
import { postedUserOrNull, type Masters } from "./masters";
import { daysAgoIso, daysAheadDate, sid } from "./ids";
import { seedDocumentNumber } from "@/lib/services/document-number";
import type { Counters } from "./project-seed";
import { next } from "./project-seed";

/* ------------------------------------------------------------------ */
/* Stores                                                             */
/* ------------------------------------------------------------------ */

/**
 * The stores each project runs.
 *
 * Manas have not told us whether they keep one store per site or share one
 * across sites, so the seed shows the model answering both: two sites have a
 * single store, and the biggest has a second one at the far tower. A screen
 * that only ever saw one store per project would quietly assume there is one,
 * and the first multi-store site would find every picker and every position
 * table wrong at once.
 */
export function buildStores(
  db: DemoDatabase,
  project: Project,
  plan: ProjectPlan,
  counters: Counters,
): Store[] {
  const created = daysAgoIso(plan.started_days_ago);
  const stores: Store[] = [
    {
      id: sid("store", next(counters, "store")),
      project_id: project.id,
      created_at: created,
      updated_at: created,
      code: `${plan.short_code}-ST1`,
      name: `${plan.name} main store`,
      location: `Ground level yard, ${plan.location}`,
      keeper_name: "Mangesh Parab",
      is_primary: true,
      is_active: true,
    },
  ];

  // The deepest site is big enough to have a second store at the far tower.
  if (plan.scale >= 1) {
    stores.push({
      id: sid("store", next(counters, "store")),
      project_id: project.id,
      created_at: daysAgoIso(Math.max(30, plan.started_days_ago - 180)),
      updated_at: daysAgoIso(30),
      code: `${plan.short_code}-ST2`,
      name: `${plan.name} tower B store`,
      location: `Tower B basement, ${plan.location}`,
      keeper_name: "Ramesh Gaonkar",
      is_primary: false,
      is_active: true,
    });
  }

  db.stores.push(...stores);
  return stores;
}

/* ------------------------------------------------------------------ */
/* The stores thread                                                  */
/* ------------------------------------------------------------------ */

/**
 * Gate passes and transfer orders, seeded so every queue in the Stores tab has
 * something in it.
 *
 * Laid down in a **second pass**, after every project has been seeded, for one
 * reason: a transfer order crosses projects, and the receiving store has to
 * exist before anything can be written into it. Seeding it inside the
 * per-project pass would mean Manas Sapphire trying to post stock into a store
 * Manas Greens has not opened yet.
 *
 * Quantities are taken as a fraction of what the store actually holds, read
 * off the ledger the material thread has already written, so no seeded
 * document ever takes out stock that was never received. A material with
 * nothing behind it is skipped rather than forced.
 *
 * Numbers are issued oldest first, so they read in calendar order and need no
 * renumbering pass.
 */
export function seedStoresThread(db: DemoDatabase, masters: Masters, counters: Counters): void {
  const projects = [...db.projects];

  /* ---------------- Gate passes, per project ---------------- */
  projects.forEach((project, index) => {
    const store = primaryStore(db, project.id);
    if (!store) return;
    const keeper = storesUser(db, masters, project.id);
    const manager = postedUserOrNull(masters.users, "project_head", project.id);
    if (!keeper) return;

    /*
     * Five passes, one per state the screen has to render, staggered a little
     * per project so a portfolio view does not show the same story three
     * times:
     *
     *   1  returnable, with the project manager      -> his approval queue
     *   2  returnable, signed for, OVERDUE back      -> the overdue panel
     *   3  non-returnable, signed for, still open    -> the storeman closes it
     *   4  returnable, back in full                  -> history
     *   5  draft                                     -> the storeman submits it
     */
    const drift = index * 2;

    makeGatePass(db, counters, {
      project,
      store,
      raised_by: keeper.id,
      pass_type: "returnable",
      days_ago: 4 + drift,
      status: "pending_approval",
      issued_to_name: "Sachin Naik",
      issued_to_company: "Naik Electro Mechanical Works",
      purpose: "Vibrator needle and one bag of cement for a trial cube off site",
      vehicle_number: `GA 03 ${plate(index)} 4471`,
      driver_name: "Suresh Kerkar",
      return_days_ahead: 6,
      lines: [
        { description: "Concrete vibrator needle, 60mm", unit: "nos", quantity: 2 },
        { stockFraction: 0.01, unit_hint: "bag" },
      ],
      approved_by: manager?.id ?? null,
    });

    makeGatePass(db, counters, {
      project,
      store,
      raised_by: keeper.id,
      pass_type: "returnable",
      days_ago: 21 + drift,
      status: "acknowledged",
      issued_to_name: "Dilip Shetye",
      issued_to_company: "Shetye Plant Hire",
      purpose: "Plate compactor sent out for repair",
      vehicle_number: `GA 05 ${plate(index + 1)} 1180`,
      driver_name: "Anand Velip",
      // Due back nine days ago and still out: this is the overdue row.
      return_days_ahead: -9,
      lines: [{ description: "Plate compactor, 5HP", unit: "nos", quantity: 1 }],
      approved_by: manager?.id ?? null,
    });

    makeGatePass(db, counters, {
      project,
      store,
      raised_by: keeper.id,
      pass_type: "non_returnable",
      days_ago: 9 + drift,
      status: "acknowledged",
      issued_to_name: "Rajesh Pednekar",
      issued_to_company: "Pednekar Scrap Traders",
      purpose: "Surplus steel and empty bags sold as scrap",
      vehicle_number: `GA 02 ${plate(index + 2)} 7765`,
      driver_name: "Vinod Harmalkar",
      return_days_ahead: null,
      lines: [
        { description: "Empty cement bags and bar offcuts", unit: "kg", quantity: 320 },
        // A stock line as well, so the position shows material that has left
        // the gate rather than only tools that were never in the store.
        { stockFraction: 0.01, unit_hint: "mt" },
      ],
      approved_by: manager?.id ?? null,
    });

    makeGatePass(db, counters, {
      project,
      store,
      raised_by: keeper.id,
      pass_type: "returnable",
      days_ago: 46 + drift,
      status: "returned",
      issued_to_name: "Dilip Shetye",
      issued_to_company: "Shetye Plant Hire",
      purpose: "Shuttering plywood sent out for cutting to size",
      vehicle_number: `GA 05 ${plate(index + 3)} 1180`,
      driver_name: "Anand Velip",
      return_days_ahead: -32,
      returned_days_ago: 31,
      lines: [
        { description: "Bar bending machine, 32mm", unit: "nos", quantity: 1 },
        // Came back in full, which is what closed the pass.
        { stockFraction: 0.02, unit_hint: "sqm" },
      ],
      approved_by: manager?.id ?? null,
    });

    makeGatePass(db, counters, {
      project,
      store,
      raised_by: keeper.id,
      pass_type: "non_returnable",
      days_ago: 1,
      status: "draft",
      issued_to_name: "Mahadev Sawant",
      issued_to_company: "Sawant Transport",
      purpose: "Surplus floor tiles going back to the supplier's godown",
      vehicle_number: "",
      driver_name: "",
      return_days_ahead: null,
      lines: [{ stockFraction: 0.02, unit_hint: "sqm" }],
      approved_by: null,
    });
  });

  /* ---------------- Transfer orders, across projects ---------------- */
  /*
   * A transfer needs two stores, so these are written between the sites rather
   * than inside one. Three states, which is the whole document:
   *
   *   in_transit     -> the receiving store's acknowledgement queue
   *   acknowledged   -> history, and one of them arrived four bags short
   *   draft          -> the storeman still filling it in
   */
  const [first, second, third] = projects;

  if (first && second) {
    makeTransfer(db, counters, masters, {
      from_project: first,
      to_project: second,
      days_ago: 3,
      status: "in_transit",
      reason: "Shortfall at Greens while its own order is still with the supplier",
      vehicle_number: "GA 01 AB 9920",
      fractions: [0.04, 0.03],
    });

    makeTransfer(db, counters, masters, {
      from_project: second,
      to_project: first,
      days_ago: 38,
      status: "acknowledged",
      reason: "Surplus binding wire and cover blocks returned to the main store",
      vehicle_number: "GA 01 AB 9920",
      fractions: [0.03],
      // Four bags light on arrival, which is why received_qty is its own column.
      shortfall: 0.15,
    });
  }

  if (first && third) {
    makeTransfer(db, counters, masters, {
      from_project: first,
      to_project: third,
      days_ago: 1,
      status: "draft",
      reason: "Opening stock for the Heights site store",
      vehicle_number: "",
      fractions: [0.02, 0.02],
    });
  }

  /* A second store on the deepest site, stocked by an internal transfer, so the
     per-store position has two stores with something in each. */
  if (first) {
    const stores = db.stores.filter((s) => s.project_id === first.id);
    if (stores.length > 1) {
      makeTransfer(db, counters, masters, {
        from_project: first,
        to_project: first,
        days_ago: 15,
        status: "acknowledged",
        reason: "Tower B store stocked for the next slab",
        vehicle_number: "Site dumper",
        fractions: [0.05, 0.04],
        to_store_id: stores[1].id,
      });
    }
  }
}

/* ------------------------------------------------------------------ */
/* Builders                                                           */
/* ------------------------------------------------------------------ */

type GatePassLineSpec =
  /** A non-stock item: a tool, a machine, scrap. Nothing leaves the store. */
  | { description: string; unit: Unit; quantity: number }
  /** A stock item, sized as a fraction of what the store actually holds. */
  | { stockFraction: number; unit_hint: Unit };

function makeGatePass(
  db: DemoDatabase,
  counters: Counters,
  opts: {
    project: Project;
    store: Store;
    raised_by: string;
    pass_type: GatePassType;
    days_ago: number;
    status: GatePass["status"];
    issued_to_name: string;
    issued_to_company: string;
    purpose: string;
    vehicle_number: string;
    driver_name: string;
    /** Negative is in the past, which is what makes a pass overdue. */
    return_days_ahead: number | null;
    returned_days_ago?: number;
    lines: GatePassLineSpec[];
    approved_by: string | null;
  },
): void {
  const at = daysAgoIso(opts.days_ago);
  const gate_pass_id = sid("gate_pass", next(counters, "gate_pass"));
  const decided = opts.status === "draft" || opts.status === "pending_approval" ? null : at;

  const pass: GatePass = {
    id: gate_pass_id,
    project_id: opts.project.id,
    created_at: at,
    updated_at: at,
    gate_pass_number: seedDocumentNumber(
      opts.project.short_code,
      "GP",
      at,
      next(counters, `GP:${opts.project.code}`),
    ),
    gate_pass_date: at.slice(0, 10),
    pass_type: opts.pass_type,
    store_id: opts.store.id,
    issued_to_name: opts.issued_to_name,
    issued_to_company: opts.issued_to_company,
    vehicle_number: opts.vehicle_number,
    driver_name: opts.driver_name,
    purpose: opts.purpose,
    expected_return_date:
      opts.pass_type === "returnable" && opts.return_days_ahead !== null
        ? daysAheadDate(opts.return_days_ahead)
        : null,
    status: opts.status,
    raised_by_user_id: opts.raised_by,
    approved_by_user_id: decided ? opts.approved_by : null,
    approved_at: decided,
    decision_comment: "",
    acknowledged_by_name:
      opts.status === "acknowledged" || opts.status === "returned" ? opts.issued_to_name : "",
    acknowledged_at: opts.status === "acknowledged" || opts.status === "returned" ? at : null,
    closed_at:
      opts.status === "returned" ? daysAgoIso(opts.returned_days_ago ?? opts.days_ago) : null,
    material_transfer_id: null,
    remarks: "",
  };
  db.gate_passes.push(pass);

  // Stock only leaves on approval, exactly as `actOnGatePass` writes it.
  const movesStock = decided !== null;

  opts.lines.forEach((spec) => {
    const resolved = resolveLine(db, opts.store.id, spec);
    if (!resolved) return;
    const returned = opts.status === "returned" ? resolved.quantity : 0;

    const line: GatePassLine = {
      id: sid("gate_pass_line", next(counters, "gate_pass_line")),
      project_id: opts.project.id,
      created_at: at,
      updated_at: at,
      gate_pass_id,
      material_id: resolved.material_id,
      description: resolved.description,
      unit: resolved.unit,
      quantity: resolved.quantity,
      returned_qty: returned,
      remarks: "",
    };
    db.gate_pass_lines.push(line);

    if (!movesStock || !resolved.material_id) return;
    pushMovement(db, counters, {
      project_id: opts.project.id,
      store_id: opts.store.id,
      material_id: resolved.material_id,
      movement_type: "gate_pass_out",
      at,
      quantity_in: 0,
      quantity_out: resolved.quantity,
      remarks: `Out on ${pass.gate_pass_number} — ${opts.purpose}`,
      source_entity_type: "gate_pass",
      source_entity_id: gate_pass_id,
    });

    if (returned > 0) {
      const backIso = daysAgoIso(opts.returned_days_ago ?? opts.days_ago);
      pushMovement(db, counters, {
        project_id: opts.project.id,
        store_id: opts.store.id,
        material_id: resolved.material_id,
        movement_type: "gate_pass_return",
        at: backIso,
        quantity_in: returned,
        quantity_out: 0,
        remarks: `Returned against ${pass.gate_pass_number}`,
        source_entity_type: "gate_pass",
        source_entity_id: gate_pass_id,
      });
    }
  });
}

function makeTransfer(
  db: DemoDatabase,
  counters: Counters,
  masters: Masters,
  opts: {
    from_project: Project;
    to_project: Project;
    days_ago: number;
    status: MaterialTransfer["status"];
    reason: string;
    vehicle_number: string;
    /** One fraction of the issuing store's balance per line. */
    fractions: number[];
    /** Fraction of the dispatched quantity that never arrived. */
    shortfall?: number;
    to_store_id?: string;
  },
): void {
  const from = primaryStore(db, opts.from_project.id);
  const to = opts.to_store_id
    ? db.stores.find((s) => s.id === opts.to_store_id)
    : primaryStore(db, opts.to_project.id);
  if (!from || !to || from.id === to.id) return;

  const at = daysAgoIso(opts.days_ago);
  const keeper = storesUser(db, masters, opts.from_project.id);
  if (!keeper) return;

  const picked = opts.fractions
    .map((fraction, i) => stockedMaterial(db, from.id, fraction, i))
    .filter((m): m is NonNullable<typeof m> => m !== null);
  if (picked.length === 0) return;

  const transfer_id = sid("material_transfer", next(counters, "material_transfer"));
  const dispatched = opts.status === "draft" ? null : at;
  const acknowledged = opts.status === "acknowledged" ? at : null;

  const transfer: MaterialTransfer = {
    id: transfer_id,
    project_id: opts.from_project.id,
    created_at: at,
    updated_at: at,
    transfer_number: seedDocumentNumber(
      opts.from_project.short_code,
      "MTO",
      at,
      next(counters, `MTO:${opts.from_project.code}`),
    ),
    transfer_date: at.slice(0, 10),
    from_store_id: from.id,
    to_project_id: to.project_id,
    to_store_id: to.id,
    reason: opts.reason,
    vehicle_number: opts.vehicle_number,
    status: opts.status,
    raised_by_user_id: keeper.id,
    dispatched_at: dispatched,
    acknowledged_by_user_id: acknowledged ? keeper.id : null,
    acknowledged_at: acknowledged,
    remarks: "",
  };
  db.material_transfers.push(transfer);

  picked.forEach((item, i) => {
    // Only the first line of a short transfer went missing, which is how a
    // real one reads: one pallet, not the whole load.
    const lost = i === 0 && opts.shortfall ? item.quantity * opts.shortfall : 0;
    const received = acknowledged ? round(item.quantity - lost) : 0;

    const line: MaterialTransferLine = {
      id: sid("material_transfer_line", next(counters, "material_transfer_line")),
      project_id: opts.from_project.id,
      created_at: at,
      updated_at: at,
      material_transfer_id: transfer_id,
      material_id: item.material_id,
      unit: item.unit,
      quantity: item.quantity,
      received_qty: received,
      remarks: "",
    };
    db.material_transfer_lines.push(line);

    if (!dispatched) return;
    pushMovement(db, counters, {
      project_id: opts.from_project.id,
      store_id: from.id,
      material_id: item.material_id,
      movement_type: "transfer_out",
      at,
      quantity_in: 0,
      quantity_out: item.quantity,
      remarks: `Transferred out on ${transfer.transfer_number}`,
      source_entity_type: "material_transfer",
      source_entity_id: transfer_id,
    });

    // The arriving row is written only by the acknowledgement, which is what
    // makes "in transit" a real state rather than a flag on a finished move.
    if (received > 0) {
      pushMovement(db, counters, {
        project_id: to.project_id,
        store_id: to.id,
        material_id: item.material_id,
        movement_type: "transfer_in",
        at,
        quantity_in: received,
        quantity_out: 0,
        remarks: `Transferred in on ${transfer.transfer_number}`,
        source_entity_type: "material_transfer",
        source_entity_id: transfer_id,
      });
    }
  });
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function pushMovement(
  db: DemoDatabase,
  counters: Counters,
  opts: {
    project_id: string;
    store_id: string;
    material_id: string;
    movement_type: StockMovementType;
    at: string;
    quantity_in: number;
    quantity_out: number;
    remarks: string;
    source_entity_type: string;
    source_entity_id: string;
  },
): void {
  const row: StockLedgerEntry = {
    id: sid("stock_ledger_entry", next(counters, "stock_ledger_entry")),
    project_id: opts.project_id,
    created_at: opts.at,
    updated_at: opts.at,
    store_id: opts.store_id,
    material_id: opts.material_id,
    movement_type: opts.movement_type,
    movement_date: opts.at.slice(0, 10),
    quantity_in: opts.quantity_in,
    quantity_out: opts.quantity_out,
    /* Left at zero on purpose: `orderStockLedger` recomputes every balance in
       date order per store once the whole seed is down, and a figure written
       here would only be a guess at what the calendar says. */
    balance_quantity: 0,
    /* No valuation in Stores. A gate pass and a transfer move goods, not
       money, so there is no rate to carry. */
    rate: null,
    value: 0,
    source_entity_type: opts.source_entity_type,
    source_entity_id: opts.source_entity_id,
    remarks: opts.remarks,
  };
  db.stock_ledger_entries.push(row);
}

function resolveLine(
  db: DemoDatabase,
  store_id: string,
  spec: GatePassLineSpec,
): { material_id: string | null; description: string; unit: Unit; quantity: number } | null {
  if ("description" in spec) {
    return {
      material_id: null,
      description: spec.description,
      unit: spec.unit,
      quantity: spec.quantity,
    };
  }
  const item = stockedMaterial(db, store_id, spec.stockFraction, 0, spec.unit_hint);
  if (!item) return null;
  return { material_id: item.material_id, description: "", unit: item.unit, quantity: item.quantity };
}

/**
 * A material the store actually holds, sized as a fraction of its balance.
 *
 * `nth` walks down the list so two lines on one document do not pick the same
 * material, and `unit_hint` prefers a material measured the way the scenario
 * reads — tiles in sqm, cement in bags — falling back to whatever is there
 * rather than dropping the line.
 */
function stockedMaterial(
  db: DemoDatabase,
  store_id: string,
  fraction: number,
  nth: number,
  unit_hint?: Unit,
): { material_id: string; unit: Unit; quantity: number } | null {
  const balances = new Map<string, number>();
  db.stock_ledger_entries
    .filter((e) => e.store_id === store_id)
    .forEach((e) => {
      balances.set(
        e.material_id,
        (balances.get(e.material_id) ?? 0) + e.quantity_in - e.quantity_out,
      );
    });

  const materialById = new Map(db.materials.map((m) => [m.id, m]));
  const held = [...balances.entries()]
    .filter(([, balance]) => balance > 1)
    .map(([material_id, balance]) => ({ material_id, balance, material: materialById.get(material_id) }))
    .filter((r) => Boolean(r.material))
    // Biggest balance first, so a seeded document never empties a store.
    .sort((a, b) => b.balance - a.balance || a.material_id.localeCompare(b.material_id));

  const preferred = unit_hint ? held.filter((r) => r.material!.unit === unit_hint) : [];
  const pool = preferred.length > 0 ? preferred : held;
  const chosen = pool[nth % Math.max(1, pool.length)];
  if (!chosen) return null;

  const quantity = round(Math.max(1, chosen.balance * fraction));
  if (quantity > chosen.balance) return null;
  return { material_id: chosen.material_id, unit: chosen.material!.unit, quantity };
}

function primaryStore(db: DemoDatabase, project_id: string): Store | undefined {
  const mine = db.stores.filter((s) => s.project_id === project_id);
  return mine.find((s) => s.is_primary) ?? mine[0];
}

/** Whoever holds the store on this site: the storeman, else the engineer. */
function storesUser(db: DemoDatabase, masters: Masters, project_id: string) {
  return (
    postedUserOrNull(masters.users, "store_keeper", project_id) ??
    postedUserOrNull(masters.users, "site_engineer", project_id) ??
    db.users[0]
  );
}

/** Deterministic two-letter plate block, so the demo reads the same every time. */
function plate(n: number): string {
  const letters = ["AB", "CD", "EF", "GH", "JK", "LM"];
  return letters[n % letters.length];
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
