import type { Material } from "@/lib/domain";
import type { CrudRepository } from "./base";

export interface MaterialRepository extends CrudRepository<Material> {
}
