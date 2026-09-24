import { z } from "zod";
import { base_entity_shape, project_scoped_shape, money, percent } from "./primitives";
import {
  contractorTypeSchema,
  projectStatusSchema,
  roleSchema,
  supplierStateSchema,
  teamSchema,
  tradeSchema,
  unitSchema,
} from "./enums";

/* ------------------------------------------------------------------ */
/* Project                                                             */
/* ------------------------------------------------------------------ */
export const projectSchema = z.object({
  ...base_entity_shape,
  code: z.string(),
  /** Three-letter abbreviation used in document numbers, e.g. MSP/IND/26-27/0014. */
  short_code: z.string(),
  name: z.string(),
  location: z.string(),
  client_name: z.string(),
  status: projectStatusSchema,
  start_date: z.string(),
  target_completion_date: z.string(),
  budget_amount: money,
  /** Denormalised roll-ups, recomputed by services. */
  spent_amount: money,
  percent_complete: percent,
});
export type Project = z.infer<typeof projectSchema>;

/* ------------------------------------------------------------------ */
/* User                                                                */
/* ------------------------------------------------------------------ */
export const userSchema = z.object({
  ...base_entity_shape,
  full_name: z.string(),
  email: z.string(),
  role: roleSchema,
  team: teamSchema,
  phone: z.string(),
  initials: z.string(),
  /**
   * Projects this user is posted to. Site and QS staff sit on one site, the
   * Project Head covers two, and the purchase and management roles see the
   * whole portfolio. Dashboards and the Approvals inbox are scoped by it.
   */
  assigned_project_ids: z.array(z.string()),
});
export type User = z.infer<typeof userSchema>;

/* ------------------------------------------------------------------ */
/* Contractor                                                          */
/* ------------------------------------------------------------------ */
export const contractorSchema = z.object({
  ...base_entity_shape,
  code: z.string(),
  name: z.string(),
  trade: tradeSchema,
  /** Constitution, which decides the TDS rate on every RA bill. */
  type: contractorTypeSchema,
  contact_person: z.string(),
  phone: z.string(),
  pan: z.string(),
  /** Small contractors are often unregistered, so GSTIN may be blank. */
  gstin: z.string(),
  address: z.string(),
  default_retention_percent: percent,
  is_active: z.boolean(),
});
export type Contractor = z.infer<typeof contractorSchema>;

/* ------------------------------------------------------------------ */
/* Material                                                            */
/* ------------------------------------------------------------------ */
export const materialSchema = z.object({
  ...base_entity_shape,
  code: z.string(),
  name: z.string(),
  category: z.string(),
  unit: unitSchema,
  hsn_code: z.string(),
  /** Default GST rate, prefilled onto quotes, PO lines and vendor bill lines. */
  gst_percent: z.number(),
  reorder_level: z.number(),
  is_active: z.boolean(),
});
export type Material = z.infer<typeof materialSchema>;

/* ------------------------------------------------------------------ */
/* Supplier                                                            */
/* ------------------------------------------------------------------ */
export const supplierSchema = z.object({
  ...base_entity_shape,
  code: z.string(),
  name: z.string(),
  contact_person: z.string(),
  phone: z.string(),
  email: z.string(),
  gstin: z.string(),
  address: z.string(),
  city: z.string(),
  /** Goa suppliers are taxed CGST+SGST; anyone else is IGST. */
  state: supplierStateSchema,
  payment_terms_days: z.number(),
  is_active: z.boolean(),
});
export type Supplier = z.infer<typeof supplierSchema>;

/** Standing rate for a material from a supplier. Never visible to site_execution. */
export const supplierRateSchema = z.object({
  ...base_entity_shape,
  supplier_id: z.string(),
  material_id: z.string(),
  rate: money,
  unit: unitSchema,
  valid_from: z.string(),
  valid_to: z.string().nullable(),
  lead_time_days: z.number(),
});
export type SupplierRate = z.infer<typeof supplierRateSchema>;

/* ------------------------------------------------------------------ */
/* BOQ                                                                 */
/* ------------------------------------------------------------------ */
export const boqLineSchema = z.object({
  ...project_scoped_shape,
  item_code: z.string(),
  description: z.string(),
  trade: tradeSchema,
  unit: unitSchema,
  quantity: z.number(),
  rate: money,
  amount: money,
  /** Live roll-ups maintained by services. */
  executed_quantity: z.number(),
  certified_amount: money,
});
export type BoqLine = z.infer<typeof boqLineSchema>;

/**
 * The material allowance inside a BOQ line: how much of each material the line
 * is budgeted to consume, and at what rate.
 *
 * This is the yardstick for two things:
 *   - indents are checked against it (budget qty less already indented / issued)
 *   - Budget vs Actual measures issued value against it
 */
export const boqMaterialBudgetSchema = z.object({
  ...project_scoped_shape,
  boq_line_id: z.string(),
  material_id: z.string(),
  budget_qty: z.number(),
  budget_rate: money,
});
export type BoqMaterialBudget = z.infer<typeof boqMaterialBudgetSchema>;
