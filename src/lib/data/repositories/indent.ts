import type { Indent, IndentLine, IndentStatus } from "@/lib/domain";
import type { ProjectScopedRepository, NewOf, PatchOf } from "./base";

export interface IndentRepository extends ProjectScopedRepository<Indent> {
  listByStatus(status: IndentStatus): Promise<Indent[]>;
  listLines(): Promise<IndentLine[]>;
  listLinesByProject(project_id: string): Promise<IndentLine[]>;
  listLinesByIndent(indent_id: string): Promise<IndentLine[]>;
  createLine(input: NewOf<IndentLine>): Promise<IndentLine>;
  updateLine(id: string, patch: PatchOf<IndentLine>): Promise<IndentLine>;
  removeLine(id: string): Promise<void>;
}
