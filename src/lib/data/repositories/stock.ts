import type { StockLedgerEntry, MaterialIssue } from "@/lib/domain";
import type { ProjectScopedRepository, NewOf, PatchOf } from "./base";

export interface StockRepository extends ProjectScopedRepository<StockLedgerEntry> {
  listByMaterial(project_id: string, material_id: string): Promise<StockLedgerEntry[]>;
  balances(project_id: string): Promise<Array<{ material_id: string; balance_quantity: number }>>;
  listIssues(): Promise<MaterialIssue[]>;
  listIssuesByProject(project_id: string): Promise<MaterialIssue[]>;
  createIssue(input: NewOf<MaterialIssue>): Promise<MaterialIssue>;
  updateIssue(id: string, patch: PatchOf<MaterialIssue>): Promise<MaterialIssue>;
  removeIssue(id: string): Promise<void>;
}
