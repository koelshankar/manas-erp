import type { z } from "zod";
import type { Role } from "@/lib/domain";

/**
 * Every service call carries who is acting. Permission checks inside services
 * go through `can()` in src/config/permissions.ts — never through a role
 * comparison written inline.
 */
export type ActingUser = {
  user_id: string;
  role: Role;
};

export class ServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServiceError";
  }
}

export class PermissionError extends ServiceError {
  constructor(message: string) {
    super(message);
    this.name = "PermissionError";
  }
}

export class ValidationError extends ServiceError {
  readonly issues: z.core.$ZodIssue[];
  constructor(message: string, issues: z.core.$ZodIssue[] = []) {
    super(message);
    this.name = "ValidationError";
    this.issues = issues;
  }
}

/** An illegal move in an entity's state machine. */
export class TransitionError extends ServiceError {
  constructor(message: string) {
    super(message);
    this.name = "TransitionError";
  }
}

export class NotFoundError extends ServiceError {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

/** A rule that is neither a permission nor a state-machine problem. */
export class WorkflowError extends ServiceError {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowError";
  }
}

/** Placeholder body for service functions built in later prompts. */
export function notImplemented(name: string): never {
  throw new WorkflowError(`${name}() is not implemented yet — see CLAUDE.md for the build order.`);
}
