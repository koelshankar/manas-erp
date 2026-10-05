import type { MaterialTransfer, MaterialTransferLine } from "@/lib/domain";
import type { ProjectScopedRepository, NewOf, PatchOf } from "./base";

export interface MaterialTransferRepository extends ProjectScopedRepository<MaterialTransfer> {
  /**
   * Transfers arriving at a project. A transfer is filed under the project it
   * leaves, so the receiving store cannot find its own inbound work through
   * `listByProject`.
   */
  listInboundToProject(to_project_id: string): Promise<MaterialTransfer[]>;
  listLines(): Promise<MaterialTransferLine[]>;
  listLinesByProject(project_id: string): Promise<MaterialTransferLine[]>;
  listLinesByTransfer(material_transfer_id: string): Promise<MaterialTransferLine[]>;
  createLine(input: NewOf<MaterialTransferLine>): Promise<MaterialTransferLine>;
  updateLine(id: string, patch: PatchOf<MaterialTransferLine>): Promise<MaterialTransferLine>;
  removeLine(id: string): Promise<void>;
}
