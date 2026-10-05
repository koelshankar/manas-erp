import type { DocumentKind, DocumentSeries, PoClause } from "@/lib/domain";
import type { CrudRepository } from "./base";

/** The purchase order terms clause library, held in Masters. */
export interface PoClauseRepository extends CrudRepository<PoClause> {
  listActive(): Promise<PoClause[]>;
  getByCode(code: string): Promise<PoClause | null>;
}

/** Per-document-kind numbering settings, also held in Masters. */
export interface DocumentSeriesRepository extends CrudRepository<DocumentSeries> {
  getByKind(kind: DocumentKind): Promise<DocumentSeries | null>;
}
