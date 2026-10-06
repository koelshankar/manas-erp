import type { Transmittal, TransmittalLine } from "@/lib/domain";
import type { NewOf, ProjectScopedRepository } from "./base";

export interface TransmittalRepository extends ProjectScopedRepository<Transmittal> {
  listLines(): Promise<TransmittalLine[]>;
  listLinesByProject(project_id: string): Promise<TransmittalLine[]>;
  listLinesByTransmittal(transmittal_id: string): Promise<TransmittalLine[]>;
  createLine(input: NewOf<TransmittalLine>): Promise<TransmittalLine>;
  removeLine(id: string): Promise<void>;
}
