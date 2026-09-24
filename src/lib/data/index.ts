import type { Repositories } from "./repositories";
import { createLocalRepositories } from "./local";

export type DataSource = "local" | "supabase";

export const DATA_SOURCE: DataSource =
  (process.env.NEXT_PUBLIC_DATA_SOURCE as DataSource | undefined) ?? "local";

let cached: Repositories | null = null;

/**
 * The single entry point to data. Services and hooks call this; nothing else
 * knows which implementation is behind it.
 */
export function getRepositories(): Repositories {
  if (cached) return cached;

  switch (DATA_SOURCE) {
    /* ================================================================
     * TODO(supabase): implement src/lib/data/supabase/ and return it here.
     *
     *   case "supabase":
     *     cached = createSupabaseRepositories(createClient());
     *     return cached;
     *
     * Nothing outside this switch should need to change — every repository
     * method is already async, and the domain field names already match the
     * intended Postgres columns.
     * ================================================================ */
    case "supabase":
      throw new Error(
        "NEXT_PUBLIC_DATA_SOURCE=supabase is not implemented yet. See src/lib/data/supabase/.",
      );
    case "local":
    default:
      cached = createLocalRepositories();
      return cached;
  }
}

export type { Repositories };
export * from "./repositories";
export type { DemoDatabase, TableName } from "./database";
export { resetDemo } from "./local";
