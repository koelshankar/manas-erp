import type {
  JointMeasurement,
  JointMeasurementLine,
  MeasurementStatus,
} from "@/lib/domain";
import type { ProjectScopedRepository, NewOf, PatchOf } from "./base";

export interface MeasurementRepository extends ProjectScopedRepository<JointMeasurement> {
  listByWorkOrder(work_order_id: string): Promise<JointMeasurement[]>;
  listByStatus(status: MeasurementStatus): Promise<JointMeasurement[]>;
  listLines(): Promise<JointMeasurementLine[]>;
  listLinesByProject(project_id: string): Promise<JointMeasurementLine[]>;
  listLinesByMeasurement(joint_measurement_id: string): Promise<JointMeasurementLine[]>;
  listLinesByWorkOrderLine(work_order_line_id: string): Promise<JointMeasurementLine[]>;
  createLine(input: NewOf<JointMeasurementLine>): Promise<JointMeasurementLine>;
  updateLine(id: string, patch: PatchOf<JointMeasurementLine>): Promise<JointMeasurementLine>;
  removeLine(id: string): Promise<void>;
}
