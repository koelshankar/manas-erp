# Supabase implementation — not built yet

This directory is the seam. To switch the demo onto a real backend:

1. Add `createSupabaseRepositories(client): Repositories` here, mirroring
   `src/lib/data/local/repositories.ts` one aggregate at a time.
2. Fill in the `case "supabase":` branch in `src/lib/data/index.ts`.
3. Set `NEXT_PUBLIC_DATA_SOURCE=supabase`.

Nothing outside this directory and that one switch statement should need to
change: every repository method is already async, and the domain field names in
`src/lib/domain/` already match the intended Postgres columns.

See §6 of `CLAUDE.md` for the full migration checklist, including how
`permissions.ts` maps onto RLS.
