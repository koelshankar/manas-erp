import type { GatePass, GatePassLine } from "@/lib/domain";
import type { ProjectScopedRepository, NewOf, PatchOf } from "./base";

export interface GatePassRepository extends ProjectScopedRepository<GatePass> {
  listLines(): Promise<GatePassLine[]>;
  listLinesByProject(project_id: string): Promise<GatePassLine[]>;
  listLinesByGatePass(gate_pass_id: string): Promise<GatePassLine[]>;
  createLine(input: NewOf<GatePassLine>): Promise<GatePassLine>;
  updateLine(id: string, patch: PatchOf<GatePassLine>): Promise<GatePassLine>;
  removeLine(id: string): Promise<void>;
}
