import { z } from "zod";
import { getRepositories } from "@/lib/data";
import type { Store } from "@/lib/domain";
import { assertCan, parseInput, required } from "./guards";
import { ValidationError, type ActingUser } from "./types";

/**
 * The store master.
 *
 * A store belongs to a project and a project may have more than one, which is
 * the model that answers the question Manas have not settled yet — one store
 * per site, or a shared one. Nothing here assumes which.
 *
 * `is_primary` is a default, not an authority: it is the store a GRN lands in
 * when nobody is asked, and exactly one store per project holds it.
 */

export const storeInput = z.object({
  project_id: z.string().min(1, "pick the project it belongs to"),
  code: z.string().min(2, "a short code is required"),
  name: z.string().min(2, "a name is required"),
  location: z.string().default(""),
  keeper_name: z.string().default(""),
  is_primary: z.boolean().default(false),
  is_active: z.boolean().default(true),
});

export type StoreInput = z.input<typeof storeInput>;

export async function createStore(input: StoreInput, actor: ActingUser): Promise<Store> {
  assertCan(actor, "create", "stores");
  const data = parseInput(storeInput, input);
  const repos = getRepositories();
  required(await repos.projects.getById(data.project_id), "Project");
  await assertCodeIsFree(data.code, null);

  const mine = await repos.stores.listByProject(data.project_id);
  // The first store on a project is its primary one whether or not anybody
  // ticked the box, because a GRN has to land somewhere.
  const is_primary = data.is_primary || mine.length === 0;
  if (is_primary) await clearPrimary(data.project_id, null);

  return repos.stores.create({ ...data, is_primary });
}

export async function updateStore(
  id: string,
  input: StoreInput,
  actor: ActingUser,
): Promise<Store> {
  assertCan(actor, "edit", "stores");
  const data = parseInput(storeInput, input);
  const repos = getRepositories();
  const existing = required(await repos.stores.getById(id), "Store");
  await assertCodeIsFree(data.code, id);

  if (data.project_id !== existing.project_id) {
    throw new ValidationError(
      "project_id: a store cannot be moved to another project. Close it and open one there.",
    );
  }
  if (data.is_primary) await clearPrimary(existing.project_id, id);

  /* Deactivating the project's only store would leave its GRNs with nowhere
     to land, which `resolveStore` would then refuse at the gate. */
  if (!data.is_active) {
    const others = (await repos.stores.listByProject(existing.project_id)).filter(
      (s) => s.id !== id && s.is_active,
    );
    if (others.length === 0) {
      throw new ValidationError(
        "is_active: this is the project's only open store. Open another one before closing it.",
      );
    }
  }

  return repos.stores.update(id, data);
}

/**
 * A store is only deleted while nothing has ever moved through it. Once there
 * is a movement, a gate pass or a transfer against it, deactivate it instead —
 * deleting it would leave a stock row pointing at a store with no name.
 */
export async function deleteStore(id: string, actor: ActingUser): Promise<void> {
  assertCan(actor, "delete", "stores");
  const repos = getRepositories();
  const store = required(await repos.stores.getById(id), "Store");

  const [movements, passes, transfers, issues, grns] = await Promise.all([
    repos.stock.listByStore(id),
    repos.gatePasses.list(),
    repos.materialTransfers.list(),
    repos.stock.listIssues(),
    repos.grns.list(),
  ]);
  const referenced =
    movements.length > 0 ||
    passes.some((p) => p.store_id === id) ||
    transfers.some((t) => t.from_store_id === id || t.to_store_id === id) ||
    issues.some((i) => i.store_id === id) ||
    grns.some((g) => g.store_id === id);

  if (referenced) {
    throw new ValidationError(
      `${store.name} has documents against it. Close it instead of deleting it.`,
    );
  }
  await repos.stores.remove(id);
}

async function assertCodeIsFree(code: string, exceptId: string | null): Promise<void> {
  const clash = (await getRepositories().stores.list()).some(
    (s) => s.id !== exceptId && s.code.toLowerCase() === code.toLowerCase(),
  );
  if (clash) throw new ValidationError(`code: ${code} is already a store`);
}

/** Exactly one primary store per project. */
async function clearPrimary(project_id: string, exceptId: string | null): Promise<void> {
  const repos = getRepositories();
  for (const store of await repos.stores.listByProject(project_id)) {
    if (store.id !== exceptId && store.is_primary) {
      await repos.stores.update(store.id, { is_primary: false });
    }
  }
}
