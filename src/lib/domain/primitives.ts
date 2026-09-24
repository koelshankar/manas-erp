import { z } from "zod";
import { now } from "@/lib/clock";

/**
 * Shared primitives. Field names are snake_case so they map 1:1 onto future
 * Postgres columns. ids are uuid strings, timestamps are ISO-8601 strings.
 */

export const uuid = z.string().uuid();
/** Full ISO-8601 timestamp, e.g. 2026-09-21T06:30:00.000Z */
export const iso_datetime = z.string();
/** Calendar date only, e.g. 2026-09-21 */
export const iso_date = z.string();
/** Money is stored as a plain number of rupees (no paise sub-units in the demo). */
export const money = z.number();
export const quantity = z.number();
export const percent = z.number().min(0).max(100);

/** Every entity carries these three columns. */
export const base_entity_shape = {
  id: uuid,
  created_at: iso_datetime,
  updated_at: iso_datetime,
} as const;

/** Project-scoped entities additionally carry project_id. */
export const project_scoped_shape = {
  ...base_entity_shape,
  project_id: uuid,
} as const;

export type BaseEntity = {
  id: string;
  created_at: string;
  updated_at: string;
};

export type ProjectScoped = BaseEntity & { project_id: string };

export function newId(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return now();
}
