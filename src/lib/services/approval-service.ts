import type { Approval, ApprovableEntityType } from "@/lib/domain";
import type { ApprovalChainKey } from "@/config/permissions";
import type { ActingUser } from "./types";
import { notImplemented } from "./types";

/**
 * The shared approval engine. Indent (A2), purchase (B2) and the bill chain
 * (C3-C4) all run through here, so the Approval table is a complete audit log.
 */

/** Materialises the chain from APPROVAL_CHAINS as pending Approval rows. */
export async function openApprovalChain(
  _chain: ApprovalChainKey,
  _entity_type: ApprovableEntityType,
  _entity_id: string,
  _project_id: string | null,
): Promise<Approval[]> {
  return notImplemented("openApprovalChain");
}

/** Approves the caller's pending step and unlocks the next one. */
export async function approveStep(
  _approval_id: string,
  _actor: ActingUser,
  _comment?: string,
): Promise<Approval> {
  return notImplemented("approveStep");
}

/** Rejects the caller's pending step and cancels the rest of the chain. */
export async function rejectStep(
  _approval_id: string,
  _actor: ActingUser,
  _comment: string,
): Promise<Approval> {
  return notImplemented("rejectStep");
}

/** The step a given entity is currently waiting on, or null when complete. */
export async function currentStep(
  _entity_type: ApprovableEntityType,
  _entity_id: string,
): Promise<Approval | null> {
  return notImplemented("currentStep");
}
