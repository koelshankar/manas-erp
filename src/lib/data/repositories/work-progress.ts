import type { WorkProgress } from "@/lib/domain";
import type { ProjectScopedRepository } from "./base";

export interface WorkProgressRepository extends ProjectScopedRepository<WorkProgress> {
  listByWorkOrderLine(work_order_line_id: string): Promise<WorkProgress[]>;
}
