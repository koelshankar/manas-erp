/**
 * Reading the three-level material master.
 *
 * Pure, and deliberately so: the seed shares it with the services, the same
 * way `pricing.ts` and `document-number.ts` are shared, so a material reads
 * the same in a seeded row as in one created on screen. It must never import
 * the data layer.
 *
 * Nothing stores the composed label. It is derived here and nowhere else,
 * which is what lets a parent be renamed in Masters without rewriting every
 * child — see `renameMaterialName` in master-service.ts. In Postgres this
 * becomes a view over the three tables.
 */
import type { Material, MaterialName, MaterialType } from "@/lib/domain";

/** The three columns their forms print, in their order. */
export type MaterialParts = {
  /** Level 1 — "Cement". */
  name: string;
  /** Level 2 — "OPC". */
  type: string;
  /** Level 3 — "53 Grade". Empty for a two-level material. */
  sub_type: string;
};

export const EMPTY_PARTS: MaterialParts = { name: "", type: "", sub_type: "" };

/**
 * The one-line label: "Cement · OPC · 53 Grade".
 *
 * A two-level material stops at its type rather than trailing an empty
 * separator, which is the whole reason `sub_type` is nullable.
 */
export function composeMaterialLabel(parts: MaterialParts): string {
  return [parts.name, parts.type, parts.sub_type].filter(Boolean).join(" · ");
}

/**
 * A resolver over the three tables.
 *
 * Built once per screen or per query and passed around, rather than each call
 * site joining for itself. `label` is what replaces the `material.name` column
 * this restructure removed.
 */
export type MaterialCatalog = {
  parts: (materialId: string | null | undefined) => MaterialParts;
  label: (materialId: string | null | undefined) => string;
  /** The leaf, or undefined when the id is unknown. */
  get: (materialId: string | null | undefined) => Material | undefined;
  /** Everything a search box needs to match on, lowercased. */
  haystack: (material: Material) => string;
};

export function buildMaterialCatalog(
  names: MaterialName[],
  types: MaterialType[],
  materials: Material[],
): MaterialCatalog {
  const nameById = new Map(names.map((n) => [n.id, n]));
  const typeById = new Map(types.map((t) => [t.id, t]));
  const materialById = new Map(materials.map((m) => [m.id, m]));

  const partsOf = (material: Material): MaterialParts => ({
    name: nameById.get(material.material_name_id)?.name ?? "",
    type: typeById.get(material.material_type_id)?.name ?? "",
    sub_type: material.sub_type ?? "",
  });

  return {
    get: (id) => (id ? materialById.get(id) : undefined),
    parts: (id) => {
      const m = id ? materialById.get(id) : undefined;
      return m ? partsOf(m) : EMPTY_PARTS;
    },
    label: (id) => {
      const m = id ? materialById.get(id) : undefined;
      // "—" rather than "" so a missing reference reads as absent, not blank.
      return m ? composeMaterialLabel(partsOf(m)) : "—";
    },
    haystack: (material) => {
      const p = partsOf(material);
      return [p.name, p.type, p.sub_type, material.code, material.brand, material.specification]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
    },
  };
}

/**
 * The catalogue, loaded from the repositories.
 *
 * Every query service that prints a material name calls this rather than
 * mapping `materials` on its own — there is no `material.name` column any
 * more, and the join is three tables wide. In Postgres this is one select
 * from the view.
 */
export async function loadMaterialCatalog(repos: {
  materialNames: { list: () => Promise<MaterialName[]> };
  materialTypes: { list: () => Promise<MaterialType[]> };
  materials: { list: () => Promise<Material[]> };
}): Promise<MaterialCatalog> {
  const [names, types, materials] = await Promise.all([
    repos.materialNames.list(),
    repos.materialTypes.list(),
    repos.materials.list(),
  ]);
  return buildMaterialCatalog(names, types, materials);
}
