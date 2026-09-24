/**
 * Value-blindness, enforced at the data layer.
 *
 * A screen that decides for itself whether to print a rupee figure will get it
 * wrong the first time someone adds a column — which is exactly what happened
 * to the pinned project header (audit C1). So the queries strip the fields
 * instead: a value-blind role's payload does not *contain* the money, and a
 * component that renders it has nothing to render.
 *
 * Fields are removed, not zeroed. A zero is a lie the screen will happily
 * format as "₹0"; `undefined` renders as "—" through `formatInr` and cannot be
 * summed, charted or compared by accident.
 */
import { can } from "@/config/permissions";
import type { Role } from "@/lib/domain";

/**
 * What counts as money, by name.
 *
 * Deliberately generous: a new `landed_cost_amount` or `certified_to_date` is
 * caught the day it is added, without anyone remembering this file exists.
 */
const MONEY_FIELD =
  /(^|_)(amount|rate|rates|value|values|cost|price|total|totals|gross|net|tds|retention|payable|receivable|outstanding|balance_amount)s?$|^(budget|spent|certified|billed_value|invoiced)/;

/** Quantities and counts that happen to end in a money-ish word but are not. */
const NOT_MONEY = new Set([
  "percent_complete",
  "exchange_rate",
  "gst_percent",
  "tds_percent",
  "retention_percent",
  "budget_qty",
  "certified_qty",
  "billed_qty",
]);

export function isMoneyField(key: string): boolean {
  if (NOT_MONEY.has(key)) return false;
  return MONEY_FIELD.test(key);
}

/** Whether this role may see rupee values at all. */
export function canSeeValues(role: Role): boolean {
  return can(role, "view", "rates");
}

type Json = unknown;

/**
 * Removes every monetary field from a payload, at any depth.
 *
 * Returns the payload untouched for a role that may see values, so the common
 * path costs one boolean.
 */
export function redactMoney<T>(role: Role, payload: T): T {
  if (canSeeValues(role)) return payload;
  return strip(payload) as T;
}

function strip(node: Json): Json {
  if (Array.isArray(node)) return node.map(strip);
  if (node === null || typeof node !== "object") return node;
  if (node instanceof Date) return node;

  const out: Record<string, Json> = {};
  for (const [key, value] of Object.entries(node as Record<string, Json>)) {
    // The field is dropped, not set to undefined: `"x" in payload` is false,
    // so a test can assert absence rather than falsiness.
    if (isMoneyField(key)) continue;
    out[key] = strip(value);
  }
  return out;
}

/**
 * Dev-only tripwire: shouts if a monetary field reaches a value-blind screen.
 *
 * Called by `useMoneyLeakCheck` on every page, so a leak is found while it is
 * being written rather than in a screenshot audit months later. Silent in
 * production.
 */
export function assertNoMoney(role: Role, payload: unknown, where: string): string[] {
  if (process.env.NODE_ENV === "production") return [];
  if (canSeeValues(role)) return [];

  const leaks: string[] = [];
  walk(payload, "", leaks, new Set());
  if (leaks.length > 0) {
    console.error(
      `[value-blindness] ${where} leaked ${leaks.length} monetary field(s) to ${role}:\n  ` +
        leaks.join("\n  ") +
        `\n  Strip them in the query with redactMoney(scope.role, …).`,
    );
  }
  return leaks;
}

function walk(node: Json, path: string, leaks: string[], seen: Set<object>): void {
  if (node === null || typeof node !== "object") return;
  if (seen.has(node)) return;
  seen.add(node);

  if (Array.isArray(node)) {
    // One representative element is enough; a list of 500 rows leaks the same
    // field 500 times and the console message has to stay readable.
    if (node.length > 0) walk(node[0], `${path}[]`, leaks, seen);
    return;
  }

  for (const [key, value] of Object.entries(node as Record<string, Json>)) {
    const here = path ? `${path}.${key}` : key;
    if (isMoneyField(key) && value !== undefined) leaks.push(here);
    else walk(value, here, leaks, seen);
  }
}
