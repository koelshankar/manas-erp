import type { BoqLine, BoqMaterialBudget } from "@/lib/domain";
import type { ProjectScopedRepository, NewOf, PatchOf } from "./base";

export interface BoqRepository extends ProjectScopedRepository<BoqLine> {
  listMaterialBudgets(): Promise<BoqMaterialBudget[]>;
  listMaterialBudgetsByProject(project_id: string): Promise<BoqMaterialBudget[]>;
  listMaterialBudgetsByBoqLine(boq_line_id: string): Promise<BoqMaterialBudget[]>;
  getMaterialBudget(boq_line_id: string, material_id: string): Promise<BoqMaterialBudget | null>;
  createMaterialBudget(input: NewOf<BoqMaterialBudget>): Promise<BoqMaterialBudget>;
  updateMaterialBudget(id: string, patch: PatchOf<BoqMaterialBudget>): Promise<BoqMaterialBudget>;
  removeMaterialBudget(id: string): Promise<void>;
}
