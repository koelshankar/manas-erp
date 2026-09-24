import type { WorkOrder, WorkOrderLine } from "@/lib/domain";
import type { ProjectScopedRepository, NewOf, PatchOf } from "./base";

export interface WorkOrderRepository extends ProjectScopedRepository<WorkOrder> {
  listLines(): Promise<WorkOrderLine[]>;
  listLinesByProject(project_id: string): Promise<WorkOrderLine[]>;
  listLinesByWorkOrder(work_order_id: string): Promise<WorkOrderLine[]>;
  listLinesByBoqLine(boq_line_id: string): Promise<WorkOrderLine[]>;
  createLine(input: NewOf<WorkOrderLine>): Promise<WorkOrderLine>;
  updateLine(id: string, patch: PatchOf<WorkOrderLine>): Promise<WorkOrderLine>;
  removeLine(id: string): Promise<void>;
}
