import type { User, Role } from "@/lib/domain";
import type { CrudRepository } from "./base";

export interface UserRepository extends CrudRepository<User> {
  getByRole(role: Role): Promise<User | null>;
}
