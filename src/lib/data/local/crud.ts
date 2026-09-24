import type { BaseEntity } from "@/lib/domain";
import { newId, nowIso } from "@/lib/domain";
import type { DemoDatabase, TableName } from "../database";
import type { CrudRepository, NewOf, PatchOf, ProjectScopedRepository } from "../repositories";
import { readDb, writeDb } from "./store";

type RowOf<K extends TableName> = DemoDatabase[K][number];

function rows<T>(db: DemoDatabase, table: TableName): T[] {
  return db[table] as unknown as T[];
}

/** Generic table adapter. Every method is async to match the interfaces. */
export function makeCrud<K extends TableName>(table: K): CrudRepository<RowOf<K>> {
  type T = RowOf<K> & BaseEntity;
  return {
    async list() {
      return [...rows<T>(readDb(), table)];
    },
    async getById(id: string) {
      return rows<T>(readDb(), table).find((r) => r.id === id) ?? null;
    },
    async create(input: NewOf<RowOf<K>>) {
      const ts = nowIso();
      const row = { ...(input as object), id: newId(), created_at: ts, updated_at: ts } as T;
      writeDb((db) => {
        rows<T>(db, table).push(row);
      });
      return row;
    },
    async update(id: string, patch: PatchOf<RowOf<K>>) {
      let updated: T | null = null;
      writeDb((db) => {
        const list = rows<T>(db, table);
        const i = list.findIndex((r) => r.id === id);
        if (i === -1) return;
        updated = { ...list[i], ...(patch as object), updated_at: nowIso() } as T;
        list[i] = updated;
      });
      if (!updated) throw new Error(`${table}: no row with id ${id}`);
      return updated;
    },
    async remove(id: string) {
      writeDb((db) => {
        const list = rows<T>(db, table);
        const i = list.findIndex((r) => r.id === id);
        if (i !== -1) list.splice(i, 1);
      });
    },
  };
}

/** Table adapter for entities carrying project_id. */
export function makeProjectScopedCrud<K extends TableName>(
  table: K,
): ProjectScopedRepository<RowOf<K>> {
  const base = makeCrud(table);
  return {
    ...base,
    async listByProject(project_id: string) {
      const list = rows<RowOf<K> & { project_id: string }>(readDb(), table);
      return list.filter((r) => r.project_id === project_id);
    },
  };
}

/** Reads a child table filtered by a foreign key. */
export function childrenOf<K extends TableName>(
  table: K,
  key: string,
  value: string,
): RowOf<K>[] {
  const list = rows<Record<string, unknown>>(readDb(), table);
  return list.filter((r) => r[key] === value) as RowOf<K>[];
}

export function allOf<K extends TableName>(table: K): RowOf<K>[] {
  return [...rows<RowOf<K>>(readDb(), table)];
}
