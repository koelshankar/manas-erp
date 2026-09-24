import { z } from "zod";
import { base_entity_shape } from "./primitives";
import { approvableEntityTypeSchema, approvalStatusSchema, roleSchema, stepCodeSchema } from "./enums";

/**
 * ONE generic approval row serves every gate in the system:
 *   - Indent approval by the Project Head (A2)
 *   - Approval to purchase by the Purchase Head (B2)
 *   - The four-step bill chain: Project QS -> Project Head -> QS Head -> HoD (C3-C4)
 *
 * Rows are never deleted or mutated in place beyond their own decision, so the
 * table doubles as the audit trail.
 */
export const approvalSchema = z.object({
  ...base_entity_shape,
  project_id: z.string().nullable(),
  entity_type: approvableEntityTypeSchema,
  entity_id: z.string(),
  step_code: stepCodeSchema,
  /** 1-based position within this entity's approval chain. */
  sequence: z.number(),
  required_role: roleSchema,
  status: approvalStatusSchema,
  actor_user_id: z.string().nullable(),
  comment: z.string(),
  acted_at: z.string().nullable(),
});
export type Approval = z.infer<typeof approvalSchema>;
