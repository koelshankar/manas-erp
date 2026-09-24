/**
 * Deterministic uuid-shaped ids for the seed.
 *
 * Runtime-created records use crypto.randomUUID(); the seed must be stable
 * across reloads so it uses a table-number + row-number formula instead. Both
 * produce the same 8-4-4-4-12 uuid shape, so nothing downstream can tell them
 * apart.
 */
export const SEED_TABLES = {
  project: 1,
  user: 2,
  contractor: 3,
  material: 4,
  supplier: 5,
  supplier_rate: 6,
  boq_line: 7,
  boq_material_budget: 30,
  work_order: 8,
  work_order_line: 9,
  site_task: 10,
  indent: 11,
  indent_line: 12,
  comparative: 13,
  comparative_line: 31,
  quote: 14,
  purchase_order: 15,
  po_line: 16,
  grn: 17,
  grn_line: 18,
  stock_ledger_entry: 19,
  material_issue: 20,
  dpr: 21,
  dpr_labour_entry: 22,
  work_progress: 23,
  joint_measurement: 24,
  joint_measurement_line: 25,
  ra_bill: 26,
  vendor_bill: 27,
  vendor_bill_line: 32,
  supplier_return: 28,
  approval: 29,
  supplier_ledger_entry: 33,
  dpr_progress_entry: 34,
  ra_bill_line: 35,
  ra_bill_revision: 36,
  attachment: 37,
} as const;

export type SeedTable = keyof typeof SEED_TABLES;

export function sid(table: SeedTable, row: number): string {
  const t = SEED_TABLES[table];
  const a = t.toString(16).padStart(8, "0");
  const b = (row & 0xffff).toString(16).padStart(4, "0");
  const tail = (t * 1_000_000 + row).toString(16).padStart(12, "0");
  return `${a}-${b}-4000-8000-${tail}`;
}

/* ------------------------------------------------------------------ */
/* Seed clock                                                          */
/* ------------------------------------------------------------------ */

/*
 * Every seeded date is laid out relative to the day the demo is given, so
 * "today's DPR is not filed yet" and the ageing colours are true whenever the
 * client opens it. The offsets are fixed, which is what keeps the seed
 * reproducible: the same structure every time, anchored to a different day.
 */
export { daysAgoIso, daysAheadIso, daysAgoDate, daysAheadDate } from "@/lib/clock";

/** Deterministic pseudo-random in [0,1) from an integer seed. */
export function jitter(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** Deterministic integer in [min, max]. */
export function pick(n: number, min: number, max: number): number {
  return min + Math.floor(jitter(n) * (max - min + 1));
}

/** Round to the nearest rupee so seeded money never carries float noise. */
export function rupees(n: number): number {
  return Math.round(n);
}
