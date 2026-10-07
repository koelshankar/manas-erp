import type { DocumentSeen } from "@/lib/domain";
import type { CrudRepository } from "./base";

export interface DocumentSeenRepository extends CrudRepository<DocumentSeen> {
  listByUser(user_id: string): Promise<DocumentSeen[]>;
}
