import type { PoClause, PoVariableField } from "@/lib/domain";

/**
 * The purchase order terms clause library, as plain data.
 *
 * Pure on purpose — like `pricing.ts` — so the deterministic seed can lay the
 * library down without importing the data layer, and the services can reseed or
 * reset it from the same source.
 *
 * The clauses are the ones common to the three orders Manas sent us. Four of
 * them read differently every time, so their wording carries a `{{value}}`
 * placeholder and the words come off the PO itself; the rest are fixed text an
 * officer may still override on a single order.
 */

export type PoClauseSeed = Omit<PoClause, "id" | "created_at" | "updated_at">;

/** Where a variable clause's words come from, when the PO leaves it blank. */
export const PO_VARIABLE_DEFAULTS: Record<PoVariableField, string> = {
  payment_terms: "30 days from the date of receipt of invoice along with the material at site.",
  po_validity: "This purchase order is valid for 90 days from the date of issue.",
  warranty:
    "Material is warranted against manufacturing defects for 12 months from the date of delivery at site.",
  brand: "Only the brand or make specified against each line item is acceptable.",
};

/**
 * `{{value}}` is where the order's own words go. A clause with no placeholder
 * takes the words appended, so a library edit can never silently drop them.
 */
export function substituteClause(text: string, value: string): string {
  const words = value.trim();
  if (!words) return text.replace("{{value}}", "").replace(/\s+/g, " ").trim();
  if (text.includes("{{value}}")) return text.replace("{{value}}", words);
  return `${text.replace(/\.?$/, ":")} ${words}`;
}

/**
 * Sixteen clauses, in the order they print. `sequence` is the printed clause
 * number on a PO that carries all of them; dropping one closes the gap, because
 * `po_terms` is renumbered when the order is written.
 */
export const PO_CLAUSE_CATALOGUE: PoClauseSeed[] = [
  {
    code: "PAY-01",
    category: "payment",
    sequence: 1,
    title: "Payment terms",
    text: "Payment terms: {{value}}",
    variable_field: "payment_terms",
    is_default: true,
    is_active: true,
  },
  {
    code: "PAY-02",
    category: "payment",
    sequence: 2,
    title: "Credit period starts on receipt",
    text: "The credit period shall commence from the date of receipt of the invoice or the material at site, whichever is later.",
    variable_field: null,
    is_default: true,
    is_active: true,
  },
  {
    code: "PAY-03",
    category: "payment",
    sequence: 3,
    title: "Payment against certified quantity",
    text: "Payment shall be released against the actual quantity received and certified by the project team, and not against the ordered quantity.",
    variable_field: null,
    is_default: true,
    is_active: true,
  },
  {
    code: "TRN-01",
    category: "transport",
    sequence: 4,
    title: "Transportation",
    text: "Transportation to site is in the supplier's scope and is included in the rates unless shown separately as a transportation charge in this order.",
    variable_field: null,
    is_default: true,
    is_active: true,
  },
  {
    code: "TRN-02",
    category: "transport",
    sequence: 5,
    title: "Loading and unloading",
    text: "Loading at the supplier's works and unloading at site are in the supplier's scope and are included in the rates.",
    variable_field: null,
    is_default: true,
    is_active: true,
  },
  {
    code: "TRN-03",
    category: "transport",
    sequence: 6,
    title: "Unloading at designated place",
    text: "Material shall be unloaded at the place designated by the site engineer within the project premises.",
    variable_field: null,
    is_default: true,
    is_active: true,
  },
  {
    code: "DLV-01",
    category: "delivery",
    sequence: 7,
    title: "Delivery as per site requirement",
    text: "Delivery shall be made as per the delivery schedule attached to this order and as per the site requirement conveyed from time to time.",
    variable_field: null,
    is_default: true,
    is_active: true,
  },
  {
    code: "DLV-02",
    category: "delivery",
    sequence: 8,
    title: "Time is of the essence",
    text: "Time is of the essence of this order. Delay in delivery entitles us to cancel the balance quantity and to procure it elsewhere at the supplier's risk and cost.",
    variable_field: null,
    is_default: true,
    is_active: true,
  },
  {
    code: "DOC-01",
    category: "general",
    sequence: 9,
    title: "PO number on invoices and challans",
    text: "This purchase order number must appear on all invoices, delivery challans, e-way bills and test certificates. Documents without it will not be accepted at the gate.",
    variable_field: null,
    is_default: true,
    is_active: true,
  },
  {
    code: "QLT-01",
    category: "inspection",
    sequence: 10,
    title: "Inspection and approval",
    text: "All material is subject to inspection and approval at site. Material not conforming to the specification shall be rejected.",
    variable_field: null,
    is_default: true,
    is_active: true,
  },
  {
    code: "QLT-02",
    category: "quality",
    sequence: 11,
    title: "Replacement of rejected material",
    text: "Rejected or damaged material shall be replaced by the supplier at the supplier's cost within seven days of intimation, and shall be lifted from site by the supplier.",
    variable_field: null,
    is_default: true,
    is_active: true,
  },
  {
    code: "QLT-03",
    category: "brand",
    sequence: 12,
    title: "Brand",
    text: "Brand or make: {{value}}",
    variable_field: "brand",
    is_default: true,
    is_active: true,
  },
  {
    code: "WAR-01",
    category: "warranty",
    sequence: 13,
    title: "Warranty",
    text: "Warranty: {{value}}",
    variable_field: "warranty",
    is_default: true,
    is_active: true,
  },
  {
    code: "STA-01",
    category: "statutory",
    sequence: 14,
    title: "Statutory deduction",
    text: "All statutory deductions, including tax deducted at source, shall be made from the payment as applicable.",
    variable_field: null,
    is_default: true,
    is_active: true,
  },
  {
    code: "VAL-01",
    category: "validity",
    sequence: 15,
    title: "PO validity",
    text: "Validity: {{value}}",
    variable_field: "po_validity",
    is_default: true,
    is_active: true,
  },
  {
    code: "GEN-01",
    category: "general",
    sequence: 16,
    title: "Note",
    text: "Note: ",
    variable_field: null,
    // A blank note is not printed, so it is off by default — an officer adds it
    // when this order needs a line of its own.
    is_default: false,
    is_active: true,
  },
];
