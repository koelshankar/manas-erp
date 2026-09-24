import type { Comparative, ComparativeLine, ComparativeStatus, Quote } from "@/lib/domain";
import type { ProjectScopedRepository, NewOf, PatchOf } from "./base";

export interface ComparativeRepository extends ProjectScopedRepository<Comparative> {
  listByStatus(status: ComparativeStatus): Promise<Comparative[]>;
  listByIndent(indent_id: string): Promise<Comparative[]>;

  listLines(): Promise<ComparativeLine[]>;
  listLinesByProject(project_id: string): Promise<ComparativeLine[]>;
  listLinesByComparative(comparative_id: string): Promise<ComparativeLine[]>;
  listLinesByIndentLine(indent_line_id: string): Promise<ComparativeLine[]>;
  createLine(input: NewOf<ComparativeLine>): Promise<ComparativeLine>;
  updateLine(id: string, patch: PatchOf<ComparativeLine>): Promise<ComparativeLine>;
  removeLine(id: string): Promise<void>;

  listQuotes(): Promise<Quote[]>;
  listQuotesByProject(project_id: string): Promise<Quote[]>;
  listQuotesByComparative(comparative_id: string): Promise<Quote[]>;
  listQuotesByLine(comparative_line_id: string): Promise<Quote[]>;
  createQuote(input: NewOf<Quote>): Promise<Quote>;
  updateQuote(id: string, patch: PatchOf<Quote>): Promise<Quote>;
  removeQuote(id: string): Promise<void>;
}
