import { z } from "zod";
import { can, type Action, type Resource } from "@/config/permissions";
import type { Role } from "@/lib/domain";
import { NotFoundError, PermissionError, TransitionError, ValidationError } from "./types";
export { rupees } from "./pricing";
import type { ActingUser } from "./types";

/** Throws unless the acting role holds the grant. Every service opens with this. */
export function assertCan(actor: ActingUser, action: Action, resource: Resource): void {
  if (!can(actor.role, action, resource)) {
    throw new PermissionError(
      `${actor.role} may not ${action} ${resource}.`,
    );
  }
}

/** Parses input through zod and rethrows as a typed ValidationError. */
export function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first.path.join(".");
    throw new ValidationError(path ? `${path}: ${first.message}` : first.message, result.error.issues);
  }
  return result.data;
}

/** Throws unless `from -> to` is legal for this entity's state machine. */
export function assertTransition<S extends string>(
  entity: string,
  transitions: Record<S, S[]>,
  from: S,
  to: S,
): void {
  const allowed = transitions[from] ?? [];
  if (!allowed.includes(to)) {
    throw new TransitionError(
      `${entity} cannot move from "${from}" to "${to}". Allowed: ${allowed.length ? allowed.join(", ") : "none"}.`,
    );
  }
}

/** Unwraps a repository lookup that must have found something. */
export function required<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new NotFoundError(`${what} not found.`);
  return value;
}

/** Round a quantity to three decimals. */
export function qty(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export type { ActingUser, Role };
