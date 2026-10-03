import { beforeEach, describe, expect, it } from "vitest";
import {
  buildMaterialCatalog,
  composeMaterialLabel,
  loadMaterialCatalog,
} from "@/lib/services/material-catalog";
import {
  createMaterial,
  createMaterialName,
  createMaterialType,
  deleteMaterialName,
  deleteMaterialType,
  updateMaterialName,
} from "@/lib/services/master-service";
import { actorFor, repos as getRepositories, reset } from "./helpers";

/**
 * The three-level material master.
 *
 * The rules worth holding are the ones a screen would otherwise get wrong:
 * that a two-level material reads correctly, that a parent with children
 * cannot be deleted, and that renaming a parent changes every child's label
 * without any row being rewritten.
 */
describe("the material master", () => {
  beforeEach(reset);

  it("seeds 20 to 30 materials across a hierarchy", async () => {
    const repos = getRepositories();
    const [names, types, materials] = await Promise.all([
      repos.materialNames.list(),
      repos.materialTypes.list(),
      repos.materials.list(),
    ]);
    expect(materials.length).toBeGreaterThanOrEqual(20);
    expect(materials.length).toBeLessThanOrEqual(30);
    expect(names.length).toBeGreaterThan(5);
    expect(types.length).toBeGreaterThan(names.length);
  });

  it("keeps every original material, restructured", async () => {
    const repos = getRepositories();
    const materials = await repos.materials.list();
    const catalog = await loadMaterialCatalog(repos);

    // The three the brief names, plus the rest of the original flat list:
    // the seeded indents, POs, receipts and issues all address these by code.
    const cement = materials.find((m) => m.code === "MAT-001")!;
    const sand = materials.find((m) => m.code === "MAT-005")!;
    const aggregate = materials.find((m) => m.code === "MAT-007")!;
    expect(catalog.label(cement.id)).toBe("Cement · OPC · 53 Grade");
    expect(catalog.label(sand.id)).toBe("Sand · River Sand");
    expect(catalog.label(aggregate.id)).toBe("Aggregate · Coarse Aggregate · 20mm");

    for (let i = 1; i <= 15; i += 1) {
      const code = `MAT-${String(i).padStart(3, "0")}`;
      expect(materials.some((m) => m.code === code), `${code} survived`).toBe(true);
    }
  });

  it("reads a two-level material without a trailing separator", () => {
    expect(composeMaterialLabel({ name: "Sand", type: "River Sand", sub_type: "" })).toBe(
      "Sand · River Sand",
    );
    expect(
      composeMaterialLabel({ name: "Cement", type: "OPC", sub_type: "53 Grade" }),
    ).toBe("Cement · OPC · 53 Grade");
  });

  it("saves a two-level material from a blank sub-type", async () => {
    const actor = await actorFor("purchase_officer");
    const repos = getRepositories();
    const names = await repos.materialNames.list();
    const cement = names.find((n) => n.name === "Cement")!;
    const type = await createMaterialType(
      { material_name_id: cement.id, name: "Rapid Hardening" },
      actor,
    );
    const created = await createMaterial(
      {
        code: "MAT-900",
        material_name_id: cement.id,
        material_type_id: type.id,
        sub_type: "   ",
        unit: "bag",
        hsn_code: "2523",
        gst_percent: 28,
        reorder_level: 50,
      },
      actor,
    );
    // Whitespace is not a sub-type; it is stored as null.
    expect(created.sub_type).toBeNull();
    const catalog = await loadMaterialCatalog(repos);
    expect(catalog.label(created.id)).toBe("Cement · Rapid Hardening");
  });

  it("refuses to delete a level that still has children", async () => {
    const actor = await actorFor("purchase_officer");
    const repos = getRepositories();
    const cement = (await repos.materialNames.list()).find((n) => n.name === "Cement")!;
    await expect(deleteMaterialName(cement.id, actor)).rejects.toThrow(/type/i);

    const opc = (await repos.materialTypes.list()).find(
      (t) => t.material_name_id === cement.id && t.name === "OPC",
    )!;
    await expect(deleteMaterialType(opc.id, actor)).rejects.toThrow(/material/i);
  });

  it("deletes an empty level", async () => {
    const actor = await actorFor("purchase_officer");
    const repos = getRepositories();
    const created = await createMaterialName({ name: "Formwork" }, actor);
    await deleteMaterialName(created.id, actor);
    expect((await repos.materialNames.list()).some((n) => n.id === created.id)).toBe(false);
  });

  it("renames a parent without rewriting a single child row", async () => {
    const actor = await actorFor("purchase_officer");
    const repos = getRepositories();
    const cement = (await repos.materialNames.list()).find((n) => n.name === "Cement")!;
    const before = (await repos.materials.list()).filter(
      (m) => m.material_name_id === cement.id,
    );

    await updateMaterialName(cement.id, { name: "Cementitious", sequence: cement.sequence }, actor);

    const after = (await repos.materials.list()).filter(
      (m) => m.material_name_id === cement.id,
    );
    // No leaf stores the label, so nothing about the leaves changed...
    expect(after.map((m) => m.updated_at)).toEqual(before.map((m) => m.updated_at));
    // ...and yet every one of them reads the new name.
    const catalog = await loadMaterialCatalog(repos);
    after.forEach((m) => expect(catalog.label(m.id)).toMatch(/^Cementitious · /));
  });

  it("refuses a type that belongs to another material name", async () => {
    const actor = await actorFor("purchase_officer");
    const repos = getRepositories();
    const steel = (await repos.materialNames.list()).find((n) => n.name === "Steel")!;
    const cementType = (await repos.materialTypes.list()).find((t) => t.name === "OPC")!;
    await expect(
      createMaterial(
        {
          code: "MAT-901",
          material_name_id: steel.id,
          material_type_id: cementType.id,
          sub_type: null,
          unit: "mt",
          hsn_code: "7214",
          gst_percent: 18,
          reorder_level: 1,
        },
        actor,
      ),
    ).rejects.toThrow(/belongs to another material/);
  });

  it("finds a material by any level, its code or its specification", async () => {
    const repos = getRepositories();
    const [names, types, materials] = await Promise.all([
      repos.materialNames.list(),
      repos.materialTypes.list(),
      repos.materials.list(),
    ]);
    const catalog = buildMaterialCatalog(names, types, materials);
    const find = (q: string) =>
      materials.filter((m) => catalog.haystack(m).includes(q.toLowerCase()));

    expect(find("cpvc").length).toBeGreaterThan(0); // level 2
    expect(find("53 grade").length).toBeGreaterThan(0); // level 3
    expect(find("MAT-001").length).toBe(1); // code
    expect(find("IS 1786").length).toBeGreaterThan(0); // specification
  });
});
