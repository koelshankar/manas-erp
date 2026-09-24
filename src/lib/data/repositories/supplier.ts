import type { Supplier, SupplierRate } from "@/lib/domain";
import type { CrudRepository, NewOf, PatchOf } from "./base";

export interface SupplierRepository extends CrudRepository<Supplier> {
  listRates(): Promise<SupplierRate[]>;
  listRatesBySupplier(supplier_id: string): Promise<SupplierRate[]>;
  listRatesByMaterial(material_id: string): Promise<SupplierRate[]>;
  createRate(input: NewOf<SupplierRate>): Promise<SupplierRate>;
  updateRate(id: string, patch: PatchOf<SupplierRate>): Promise<SupplierRate>;
  removeRate(id: string): Promise<void>;
}
