import { emptyDatabase, type DemoDatabase } from "../database";
import { PROJECT_CATALOG } from "./catalog";
import { buildMasters } from "./masters";
import { seedProject, type Counters } from "./project-seed";
import { seedStoresThread } from "./stores-seed";
import { orderStockLedger } from "./stock-order";
import { seedProgramme } from "./programme-seed";
import { seedDrawings } from "./drawings-seed";


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
  db.material_names.push(...masters.material_names);
  db.material_types.push(...masters.material_types);
  db.materials.push(...masters.materials);
  db.suppliers.push(...masters.suppliers);
  db.supplier_rates.push(...masters.supplier_rates);
  db.po_clauses.push(...masters.po_clauses);
  db.document_series.push(...masters.document_series);

  const counters: Counters = {};
  PROJECT_CATALOG.forEach((plan, i) => {
    seedProject(db, plan, i, masters, counters);
  });

  /*
   * Every project gets a programme, laid out from its own start and target
   * dates, because the schedule is on every project's Overview and an empty
   * panel there is the first thing a visitor to the second site would see. It
   * is a three-tower sample, not the client's real 2,284-row WBS.
   */
  PROJECT_CATALOG.forEach((plan, i) => {
    seedProgramme(db, db.projects[i].id, plan, counters);
  });

  /*
   * The drawing register, likewise seeded for Manas Sapphire only.
   */
  seedDrawings(db, db.projects[0], PROJECT_CATALOG[0], counters, masters);

  /*
   * Gate passes and transfer orders come last, in one pass over every project.
   * A transfer order crosses projects, so the receiving store has to exist
   * before anything can be posted into it — which it does not while the
   * project that owns it is still being seeded.
   */
  seedStoresThread(db, masters, counters);
  db.projects.forEach((p) => orderStockLedger(db, p.id));

  return db;
}
