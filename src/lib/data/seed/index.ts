import { emptyDatabase, type DemoDatabase } from "../database";
import { PROJECT_CATALOG } from "./catalog";
import { buildMasters } from "./masters";
import { seedProject, type Counters } from "./project-seed";


export * from "./catalog";

/**
 * Builds the complete demo dataset. Deterministic: the same ids, dates and
 * amounts every time, so the demo looks identical on every machine.
 */
export function buildSeed(): DemoDatabase {
  const db = emptyDatabase();
  const masters = buildMasters();

  db.users.push(...masters.users);
  db.contractors.push(...masters.contractors);
  db.materials.push(...masters.materials);
  db.suppliers.push(...masters.suppliers);
  db.supplier_rates.push(...masters.supplier_rates);

  const counters: Counters = {};
  PROJECT_CATALOG.forEach((plan, i) => {
    seedProject(db, plan, i, masters, counters);
  });

  return db;
}
