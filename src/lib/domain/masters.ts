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
  /** Budget and spend are not stored: `projectBudgetSummary` derives them. */
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
/**
 * The material master is three levels: **name -> type -> sub-type**.
 *
 * Every form Manas Developers sent us — indent, GRN, gate pass, material
 * issue, material transfer order — carries three columns for a material, so
 * the master is shaped the same way. `Material` is the leaf, and it is what
 * every other table still points at: `material_id` did not move, which is why
 * this change does not reach the indent, the PO or the stock ledger.
 *
 * Level 1. "Cement", "Steel", "Aggregate".
 */
export const materialNameSchema = z.object({
  ...base_entity_shape,
  name: z.string(),
  /** Sort order within the master list. */
  sequence: z.number(),
});
export type MaterialName = z.infer<typeof materialNameSchema>;

/** Level 2. "OPC", "TMT Bar", "Coarse Aggregate". */
export const materialTypeSchema = z.object({
  ...base_entity_shape,
  material_name_id: z.string(),
  name: z.string(),
  sequence: z.number(),
});
export type MaterialType = z.infer<typeof materialTypeSchema>;

/**
 * Level 3, the leaf, and the thing every document actually references.
 *
 * `sub_type` is nullable on purpose: not every material has three levels.
 * River sand is Sand -> River Sand and stops there, and forcing an empty leaf
 * under it would put a blank third column on every printed form. A null
 * sub-type means the material *is* its type — see `materialLabel`.
 */
export const materialSchema = z.object({
  ...base_entity_shape,
  code: z.string(),
  material_name_id: z.string(),
  material_type_id: z.string(),
  /** Null for a two-level material. */
  sub_type: z.string().nullable(),
  unit: unitSchema,
  /**
   * The spec paragraph their purchase orders print inside the material
   * column — "IS 269:2015, 53 grade, bags of 50 kg". Free text on purpose:
   * it is prose on a document, not a field anything computes with.
   */
  specification: z.string(),
  /** Brand or make, where one is specified. Blank where any make will do. */
  brand: z.string(),
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
  /* Work done and certified are derived per line by `budgetVsActual`. */
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
