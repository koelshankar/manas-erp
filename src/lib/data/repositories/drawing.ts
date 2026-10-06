import type { Drawing, DrawingRevision } from "@/lib/domain";
import type { NewOf, ProjectScopedRepository } from "./base";

export interface DrawingRepository extends ProjectScopedRepository<Drawing> {
  listRevisions(): Promise<DrawingRevision[]>;
  listRevisionsByProject(project_id: string): Promise<DrawingRevision[]>;
  listRevisionsByDrawing(drawing_id: string): Promise<DrawingRevision[]>;
  createRevision(input: NewOf<DrawingRevision>): Promise<DrawingRevision>;
}
