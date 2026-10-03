import { z } from "zod";
import { getRepositories } from "@/lib/data";
import {
  CONTRACTOR_TYPES,
  SUPPLIER_STATES,
  TRADES,
  UNITS,
  type Contractor,
  type Material,
  type MaterialName,
  type MaterialType,
  type Supplier,
} from "@/lib/domain";
import { assertCan, parseInput, required } from "./guards";
import { ValidationError, type ActingUser } from "./types";

/* Material and supplier masters, owned by Purchase & Stores. */

/* ------------------------------------------------------------------ */
/* The material master: name -> type -> sub-type                       */
/* ------------------------------------------------------------------ */

/**
 * Three levels, three pairs of services, and one rule running through all of
 * them: **a level with children cannot be deleted.** The alternative is an
 * orphaned leaf whose label renders half-blank on every document that ever
 * referenced it, which is worse than refusing.
 *
 * Nothing stores the composed label, so renaming a parent needs no cascade —
 * `materialLabel` reads the tree at render time. That is the whole reason the
 * leaf has no `name` column.
 */

export const materialNameInput = z.object({
  name: z.string().min(2, "a name is required"),
  sequence: z.number().nonnegative().default(0),
});
export type MaterialNameInput = z.input<typeof materialNameInput>;

export async function createMaterialName(
  input: MaterialNameInput,
  actor: ActingUser,
): Promise<MaterialName> {
  assertCan(actor, "create", "materials");
  const data = parseInput(materialNameInput, input);
  const repos = getRepositories();
  const existing = await repos.materialNames.list();
  if (existing.some((n) => n.name.toLowerCase() === data.name.toLowerCase())) {
    throw new ValidationError(`name: ${data.name} is already in the master`);
  }
  return repos.materialNames.create({
    ...data,
    sequence: data.sequence || existing.length + 1,
  });
}

export async function updateMaterialName(
  id: string,
  input: MaterialNameInput,
  actor: ActingUser,
): Promise<MaterialName> {
  assertCan(actor, "edit", "materials");
  const data = parseInput(materialNameInput, input);
  const repos = getRepositories();
  required(await repos.materialNames.getById(id), "Material name");
  const clash = (await repos.materialNames.list()).some(
    (n) => n.id !== id && n.name.toLowerCase() === data.name.toLowerCase(),
  );
  if (clash) throw new ValidationError(`name: ${data.name} is already in the master`);
  return repos.materialNames.update(id, data);
}

export async function deleteMaterialName(id: string, actor: ActingUser): Promise<void> {
  assertCan(actor, "delete", "materials");
  const repos = getRepositories();
  const name = required(await repos.materialNames.getById(id), "Material name");
  const children = (await repos.materialTypes.list()).filter(
    (t) => t.material_name_id === id,
  );
  if (children.length > 0) {
    throw new ValidationError(
      `${name.name} has ${children.length} type${children.length === 1 ? "" : "s"} under it. Delete those first.`,
    );
  }
  await repos.materialNames.remove(id);
}

export const materialTypeInput = z.object({
  material_name_id: z.string().min(1, "pick a material name"),
  name: z.string().min(1, "a type is required"),
  sequence: z.number().nonnegative().default(0),
});
export type MaterialTypeInput = z.input<typeof materialTypeInput>;

export async function createMaterialType(
  input: MaterialTypeInput,
  actor: ActingUser,
): Promise<MaterialType> {
  assertCan(actor, "create", "materials");
  const data = parseInput(materialTypeInput, input);
  const repos = getRepositories();
  required(await repos.materialNames.getById(data.material_name_id), "Material name");
  const siblings = (await repos.materialTypes.list()).filter(
    (t) => t.material_name_id === data.material_name_id,
  );
  // A type is unique within its parent, not globally: "Coarse Aggregate"
  // under Aggregate and under Sand are different rows.
  if (siblings.some((t) => t.name.toLowerCase() === data.name.toLowerCase())) {
    throw new ValidationError(`name: ${data.name} is already a type under this material`);
  }
  return repos.materialTypes.create({
    ...data,
    sequence: data.sequence || siblings.length + 1,
  });
}

export async function updateMaterialType(
  id: string,
  input: MaterialTypeInput,
  actor: ActingUser,
): Promise<MaterialType> {
  assertCan(actor, "edit", "materials");
  const data = parseInput(materialTypeInput, input);
  const repos = getRepositories();
  required(await repos.materialTypes.getById(id), "Material type");
  const clash = (await repos.materialTypes.list()).some(
    (t) =>
      t.id !== id &&
      t.material_name_id === data.material_name_id &&
      t.name.toLowerCase() === data.name.toLowerCase(),
  );
  if (clash) {
    throw new ValidationError(`name: ${data.name} is already a type under this material`);
  }
  return repos.materialTypes.update(id, data);
}

export async function deleteMaterialType(id: string, actor: ActingUser): Promise<void> {
  assertCan(actor, "delete", "materials");
  const repos = getRepositories();
  const type = required(await repos.materialTypes.getById(id), "Material type");
  const children = (await repos.materials.list()).filter((m) => m.material_type_id === id);
  if (children.length > 0) {
    throw new ValidationError(
      `${type.name} has ${children.length} material${children.length === 1 ? "" : "s"} under it. Delete those first.`,
    );
  }
  await repos.materialTypes.remove(id);
}

export const materialInput = z.object({
  code: z.string().min(2, "a code is required"),
  material_name_id: z.string().min(1, "pick a material name"),
  material_type_id: z.string().min(1, "pick a type"),
  /** Blank means a two-level material — see the Material schema. */
  sub_type: z.string().nullable().default(null),
  specification: z.string().default(""),
  brand: z.string().default(""),
  unit: z.enum(UNITS),
  hsn_code: z.string().min(2, "HSN code is required"),
  gst_percent: z.number().min(0).max(28),
  reorder_level: z.number().nonnegative(),
  is_active: z.boolean().default(true),
});

export type MaterialInput = z.input<typeof materialInput>;

/** The type must actually sit under the name, or the tree is inconsistent. */
async function assertTypeBelongsToName(
  material_name_id: string,
  material_type_id: string,
): Promise<void> {
  const repos = getRepositories();
  required(await repos.materialNames.getById(material_name_id), "Material name");
  const type = required(await repos.materialTypes.getById(material_type_id), "Material type");
  if (type.material_name_id !== material_name_id) {
    throw new ValidationError("material_type_id: that type belongs to another material");
  }
}

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
  await assertTypeBelongsToName(data.material_name_id, data.material_type_id);
  return repos.materials.create({ ...data, sub_type: emptyToNull(data.sub_type) });
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
  await assertTypeBelongsToName(data.material_name_id, data.material_type_id);
  return repos.materials.update(id, { ...data, sub_type: emptyToNull(data.sub_type) });
}

/**
 * A material that documents already reference cannot be deleted — the
 * reference would dangle and the indent, PO or GRN that holds it would print
 * a blank material column. Deactivating it keeps the history readable and
 * takes it out of the picker.
 */
export async function deleteMaterial(id: string, actor: ActingUser): Promise<void> {
  assertCan(actor, "delete", "materials");
  const repos = getRepositories();
  required(await repos.materials.getById(id), "Material");
  const [indentLines, poLines, stock] = await Promise.all([
    repos.indents.listLines(),
    repos.purchaseOrders.listLines(),
    repos.stock.list(),
  ]);
  const used =
    indentLines.some((l) => l.material_id === id) ||
    poLines.some((l) => l.material_id === id) ||
    stock.some((e) => e.material_id === id);
  if (used) {
    throw new ValidationError(
      "This material is used on an indent, a purchase order or the stock ledger. Mark it inactive instead of deleting it.",
    );
  }
  await repos.materials.remove(id);
}

/** An empty sub-type box means "two-level material", which is stored as null. */
function emptyToNull(value: string | null): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
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
