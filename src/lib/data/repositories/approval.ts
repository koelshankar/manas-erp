import type { Approval, ApprovableEntityType, Role } from "@/lib/domain";
import type { CrudRepository } from "./base";

export interface ApprovalRepository extends CrudRepository<Approval> {
  listForEntity(entity_type: ApprovableEntityType, entity_id: string): Promise<Approval[]>;
  listPendingForRole(required_role: Role): Promise<Approval[]>;
  listPendingForProject(project_id: string): Promise<Approval[]>;
  listByProject(project_id: string): Promise<Approval[]>;
}
