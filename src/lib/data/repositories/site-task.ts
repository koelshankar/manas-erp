import type { SiteTask, SiteTaskStatus } from "@/lib/domain";
import type { ProjectScopedRepository } from "./base";

export interface SiteTaskRepository extends ProjectScopedRepository<SiteTask> {
  listByWorkOrder(work_order_id: string): Promise<SiteTask[]>;
  listByStatus(project_id: string, status: SiteTaskStatus): Promise<SiteTask[]>;
}
