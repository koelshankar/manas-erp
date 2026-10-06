import type { WorkOrder, WorkOrderContract, WorkOrderLine } from "@/lib/domain";
import type { ProjectScopedRepository, NewOf, PatchOf } from "./base";

export interface WorkOrderRepository extends ProjectScopedRepository<WorkOrder> {
  listLines(): Promise<WorkOrderLine[]>;
  listLinesByProject(project_id: string): Promise<WorkOrderLine[]>;
  listLinesByWorkOrder(work_order_id: string): Promise<WorkOrderLine[]>;
  listLinesByBoqLine(boq_line_id: string): Promise<WorkOrderLine[]>;
  createLine(input: NewOf<WorkOrderLine>): Promise<WorkOrderLine>;
  updateLine(id: string, patch: PatchOf<WorkOrderLine>): Promise<WorkOrderLine>;
  removeLine(id: string): Promise<void>;

  /** One contract row per work order (Phase 7); null until someone sets terms. */
  listContracts(): Promise<WorkOrderContract[]>;
  getContractByWorkOrder(work_order_id: string): Promise<WorkOrderContract | null>;
  createContract(input: NewOf<WorkOrderContract>): Promise<WorkOrderContract>;
  updateContract(id: string, patch: PatchOf<WorkOrderContract>): Promise<WorkOrderContract>;
}
