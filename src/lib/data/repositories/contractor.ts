import type { Contractor } from "@/lib/domain";
import type { CrudRepository } from "./base";

export interface ContractorRepository extends CrudRepository<Contractor> {
}
