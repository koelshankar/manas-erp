import type { MaterialIssue, MaterialIssueLine, StockLedgerEntry } from "@/lib/domain";
import type { ProjectScopedRepository, NewOf, PatchOf } from "./base";

export interface StockRepository extends ProjectScopedRepository<StockLedgerEntry> {
  listByMaterial(project_id: string, material_id: string): Promise<StockLedgerEntry[]>;
  balances(project_id: string): Promise<Array<{ material_id: string; balance_quantity: number }>>;
  /** Per store, which is what the Stores tab's stock position reads. */
  balancesByStore(
    store_id: string,
  ): Promise<Array<{ material_id: string; balance_quantity: number }>>;
  listByStore(store_id: string): Promise<StockLedgerEntry[]>;
  listIssues(): Promise<MaterialIssue[]>;
  getIssueById(id: string): Promise<MaterialIssue | null>;
  listIssuesByProject(project_id: string): Promise<MaterialIssue[]>;
  createIssue(input: NewOf<MaterialIssue>): Promise<MaterialIssue>;
  updateIssue(id: string, patch: PatchOf<MaterialIssue>): Promise<MaterialIssue>;
  removeIssue(id: string): Promise<void>;
  listIssueLines(): Promise<MaterialIssueLine[]>;
  listIssueLinesByProject(project_id: string): Promise<MaterialIssueLine[]>;
  listIssueLinesByIssue(material_issue_id: string): Promise<MaterialIssueLine[]>;
  createIssueLine(input: NewOf<MaterialIssueLine>): Promise<MaterialIssueLine>;
  updateIssueLine(id: string, patch: PatchOf<MaterialIssueLine>): Promise<MaterialIssueLine>;
  removeIssueLine(id: string): Promise<void>;
}
