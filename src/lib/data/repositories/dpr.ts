import type { Dpr, DprLabourEntry, DprProgressEntry } from "@/lib/domain";
import type { ProjectScopedRepository, NewOf, PatchOf } from "./base";

export interface DprRepository extends ProjectScopedRepository<Dpr> {
  /** One report per project per day — the date is the natural key. */
  getByDate(project_id: string, report_date: string): Promise<Dpr | null>;

  listProgressEntries(): Promise<DprProgressEntry[]>;
  listProgressEntriesByProject(project_id: string): Promise<DprProgressEntry[]>;
  listProgressEntriesByDpr(dpr_id: string): Promise<DprProgressEntry[]>;
  listProgressEntriesByWorkOrderLine(work_order_line_id: string): Promise<DprProgressEntry[]>;
  createProgressEntry(input: NewOf<DprProgressEntry>): Promise<DprProgressEntry>;
  updateProgressEntry(id: string, patch: PatchOf<DprProgressEntry>): Promise<DprProgressEntry>;
  removeProgressEntry(id: string): Promise<void>;

  listLabourEntries(): Promise<DprLabourEntry[]>;
  listLabourEntriesByProject(project_id: string): Promise<DprLabourEntry[]>;
  listLabourEntriesByDpr(dpr_id: string): Promise<DprLabourEntry[]>;
  createLabourEntry(input: NewOf<DprLabourEntry>): Promise<DprLabourEntry>;
  updateLabourEntry(id: string, patch: PatchOf<DprLabourEntry>): Promise<DprLabourEntry>;
  removeLabourEntry(id: string): Promise<void>;
}
