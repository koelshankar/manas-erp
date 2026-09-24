import type { BaseEntity } from "@/lib/domain";

/**
 * Every repository method is async even though the local implementation is
 * synchronous. That is deliberate: swapping in Supabase must not change a
 * single call site.
 */

export type NewOf<T extends BaseEntity> = Omit<T, "id" | "created_at" | "updated_at">;
export type PatchOf<T extends BaseEntity> = Partial<Omit<T, "id" | "created_at">>;

export interface ReadRepository<T extends BaseEntity> {
  list(): Promise<T[]>;
  getById(id: string): Promise<T | null>;
}

export interface CrudRepository<T extends BaseEntity> extends ReadRepository<T> {
  create(input: NewOf<T>): Promise<T>;
  update(id: string, patch: PatchOf<T>): Promise<T>;
  remove(id: string): Promise<void>;
}

/** Repositories for entities carrying project_id. */
export interface ProjectScopedRepository<T extends BaseEntity> extends CrudRepository<T> {
  listByProject(project_id: string): Promise<T[]>;
}
