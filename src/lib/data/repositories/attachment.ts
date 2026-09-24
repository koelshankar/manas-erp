import type { Attachment, AttachmentEntityType } from "@/lib/domain";
import type { ProjectScopedRepository } from "./base";

export interface AttachmentRepository extends ProjectScopedRepository<Attachment> {
  listByEntity(entity_type: AttachmentEntityType, entity_id: string): Promise<Attachment[]>;
}
