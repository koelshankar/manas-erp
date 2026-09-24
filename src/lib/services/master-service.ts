import { z } from "zod";
import { getRepositories } from "@/lib/data";
import {
  CONTRACTOR_TYPES,
  SUPPLIER_STATES,
  TRADES,
  UNITS,
  type Contractor,
  type Material,
  type Supplier,
} from "@/lib/domain";
import { assertCan, parseInput, required } from "./guards";
import { ValidationError, type ActingUser } from "./types";

/* Material and supplier masters, owned by Purchase & Stores. */

export const materialInput = z.object({
  code: z.string().min(2, "a code is required"),
  name: z.string().min(2, "a name is required"),
  category: z.string().min(2, "a category is required"),
  unit: z.enum(UNITS),
  hsn_code: z.string().min(2, "HSN code is required"),
  gst_percent: z.number().min(0).max(28),
  reorder_level: z.number().nonnegative(),
  is_active: z.boolean().default(true),
});

export type MaterialInput = z.input<typeof materialInput>;

export async function createMaterial(
  input: MaterialInput,
  actor: ActingUser,
): Promise<Material> {
  assertCan(actor, "create", "materials");
  const data = parseInput(materialInput, input);
  const repos = getRepositories();
  if ((await repos.materials.list()).some((m) => m.code === data.code)) {
    throw new ValidationError(`code: ${data.code} is already in use`);
  }
  return repos.materials.create(data);
}

export async function updateMaterial(
  id: string,
  input: MaterialInput,
  actor: ActingUser,
): Promise<Material> {
  assertCan(actor, "edit", "materials");
  const data = parseInput(materialInput, input);
  const repos = getRepositories();
  required(await repos.materials.getById(id), "Material");
  if ((await repos.materials.list()).some((m) => m.code === data.code && m.id !== id)) {
    throw new ValidationError(`code: ${data.code} is already in use`);
  }
  return repos.materials.update(id, data);
}

export const supplierInput = z.object({
  code: z.string().min(2, "a code is required"),
  name: z.string().min(2, "a name is required"),
  contact_person: z.string().default(""),
  phone: z.string().default(""),
  email: z.string().default(""),
  gstin: z.string().min(15, "a 15-character GSTIN is required").max(15),
  address: z.string().default(""),
  city: z.string().default(""),
  state: z.enum(SUPPLIER_STATES),
  payment_terms_days: z.number().int().nonnegative(),
  is_active: z.boolean().default(true),
});

export type SupplierInput = z.input<typeof supplierInput>;

export async function createSupplier(
  input: SupplierInput,
  actor: ActingUser,
): Promise<Supplier> {
  assertCan(actor, "create", "suppliers");
  const data = parseInput(supplierInput, input);
  const repos = getRepositories();
  if ((await repos.suppliers.list()).some((s) => s.code === data.code)) {
    throw new ValidationError(`code: ${data.code} is already in use`);
  }
  return repos.suppliers.create(data);
}

export async function updateSupplier(
  id: string,
  input: SupplierInput,
  actor: ActingUser,
): Promise<Supplier> {
  assertCan(actor, "edit", "suppliers");
  const data = parseInput(supplierInput, input);
  const repos = getRepositories();
  required(await repos.suppliers.getById(id), "Supplier");
  if ((await repos.suppliers.list()).some((s) => s.code === data.code && s.id !== id)) {
    throw new ValidationError(`code: ${data.code} is already in use`);
  }
  return repos.suppliers.update(id, data);
}

/* ------------------------------------------------------------------ */
/* Contractor master — owned by Project & Budget                       */
/* ------------------------------------------------------------------ */

export const contractorInput = z.object({
  code: z.string().min(2, "a code is required"),
  name: z.string().min(2, "a name is required"),
  trade: z.enum(TRADES),
  type: z.enum(CONTRACTOR_TYPES),
  contact_person: z.string().default(""),
  phone: z.string().default(""),
  pan: z.string().min(10, "a 10-character PAN is required").max(10),
  /** Small contractors are often unregistered, so GSTIN may be left blank. */
  gstin: z.string().default(""),
  address: z.string().default(""),
  default_retention_percent: z.number().min(0).max(100),
  is_active: z.boolean().default(true),
});

export type ContractorInput = z.input<typeof contractorInput>;

export async function createContractor(
  input: ContractorInput,
  actor: ActingUser,
): Promise<Contractor> {
  assertCan(actor, "create", "contractors");
  const data = parseInput(contractorInput, input);
  const repos = getRepositories();
  if ((await repos.contractors.list()).some((c) => c.code === data.code)) {
    throw new ValidationError(`code: ${data.code} is already in use`);
  }
  return repos.contractors.create(data);
}

export async function updateContractor(
  id: string,
  input: ContractorInput,
  actor: ActingUser,
): Promise<Contractor> {
  assertCan(actor, "edit", "contractors");
  const data = parseInput(contractorInput, input);
  const repos = getRepositories();
  required(await repos.contractors.getById(id), "Contractor");
  if ((await repos.contractors.list()).some((c) => c.code === data.code && c.id !== id)) {
    throw new ValidationError(`code: ${data.code} is already in use`);
  }
  return repos.contractors.update(id, data);
}
