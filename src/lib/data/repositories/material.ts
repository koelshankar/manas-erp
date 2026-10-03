import type { Material, MaterialName, MaterialType } from "@/lib/domain";
import type { CrudRepository } from "./base";

/** Level 1 of the material master — "Cement", "Steel". */
export interface MaterialNameRepository extends CrudRepository<MaterialName> {}

/** Level 2 — "OPC", "TMT Bar". Hangs off a MaterialName. */
export interface MaterialTypeRepository extends CrudRepository<MaterialType> {}

/** Level 3, the leaf, and what every document's `material_id` points at. */
export interface MaterialRepository extends CrudRepository<Material> {}
