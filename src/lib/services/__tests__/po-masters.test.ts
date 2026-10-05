import { beforeEach, describe, expect, it } from "vitest";
import {
  createPoClause,
  deletePoClause,
  restoreDefaultClauses,
  updateDocumentSeries,
  updatePoClause,
} from "@/lib/services/po-master-service";
import { createPurchaseOrder } from "@/lib/services/po-service";
import { nextDocumentNumber } from "@/lib/services/numbering";
import { PermissionError, ValidationError } from "@/lib/services/types";
import { PO_CLAUSE_CATALOGUE, composePoTerms, substituteClause } from "@/lib/services/po-terms";
import { PH, PO, project, repos, reset, SITE } from "./helpers";

beforeEach(reset);

describe("the PO terms clause library", () => {
  it("seeds the catalogue, with four clauses taking their words from the order", async () => {
    const clauses = await repos().poClauses.listActive();
    expect(clauses).toHaveLength(PO_CLAUSE_CATALOGUE.length);
    const variable = clauses.filter((c) => c.variable_field);
    expect(variable.map((c) => c.variable_field).sort()).toEqual([
      "brand",
      "payment_terms",
      "po_validity",
      "warranty",
    ]);
    // Every variable clause says where the order's words go.
    expect(variable.every((c) => c.text.includes("{{value}}"))).toBe(true);
  });

  it("substitutes the order's words, and appends them when a clause has no placeholder", () => {
    expect(substituteClause("Payment terms: {{value}}", "45 days")).toBe("Payment terms: 45 days");
    expect(substituteClause("Payment terms.", "45 days")).toBe("Payment terms: 45 days");
    expect(substituteClause("Note: {{value}}", "   ")).toBe("Note:");
  });

  it("renumbers the printed list so dropping a clause closes the gap", () => {
    const drafts = composePoTerms(
      [
        { id: "a", sequence: 1, text: "First.", variable_field: null },
        { id: "b", sequence: 7, text: "Second.", variable_field: null },
        { id: "c", sequence: 9, text: "Note: ", variable_field: null },
      ],
      { payment_terms: "", po_validity: "", warranty: "", brand: "" },
    );
    // The empty note is dropped rather than printed as a bare number.
    expect(drafts.map((d) => [d.sequence, d.text])).toEqual([
      [1, "First."],
      [2, "Second."],
    ]);
  });

  it("takes a per-order override in place of the library wording", () => {
    const drafts = composePoTerms(
      [{ id: "a", sequence: 1, text: "Standard wording.", variable_field: null }],
      { payment_terms: "", po_validity: "", warranty: "", brand: "" },
      { a: "This order's wording." },
    );
    expect(drafts[0].text).toBe("This order's wording.");
    expect(drafts[0].is_overridden).toBe(true);
  });

  it("refuses to delete a clause an order already prints, and allows one nothing uses", async () => {
    const p = await project();
    const printed = (await repos().poClauses.listActive()).find((c) => c.is_default)!;
    const terms = await repos().purchaseOrders.listTermsByPo(
      (await repos().purchaseOrders.listByProject(p.id))[0].id,
    );
    expect(terms.some((t) => t.po_clause_id === printed.id)).toBe(true);

    await expect(deletePoClause(printed.id, await PO())).rejects.toThrow(/Deactivate it instead/);

    const spare = await createPoClause(
      {
        code: "GEN-99",
        category: "general",
        sequence: 20,
        title: "Site safety",
        text: "The supplier's driver shall follow site safety instructions at all times.",
      },
      await PO(),
    );
    await expect(deletePoClause(spare.id, await PO())).resolves.toBeUndefined();
  });

  it("insists a variable clause says where the order's words go", async () => {
    await expect(
      updatePoClause(
        (await repos().poClauses.getByCode("PAY-01"))!.id,
        {
          code: "PAY-01",
          category: "payment",
          sequence: 1,
          title: "Payment terms",
          // No {{value}} — the service takes it, but the editor refuses it, so
          // the substitution appends rather than losing the words.
          text: "Payment terms apply as agreed.",
          variable_field: "payment_terms",
        },
        await PO(),
      ),
    ).resolves.toBeDefined();
    expect(substituteClause("Payment terms apply as agreed.", "45 days")).toContain("45 days");
  });

  it("restores the shipped wording without losing what was added", async () => {
    const clause = (await repos().poClauses.getByCode("PAY-01"))!;
    await updatePoClause(
      clause.id,
      { ...clause, text: "Payment terms: {{value}} — reworded" },
      await PO(),
    );
    const added = await createPoClause(
      {
        code: "GEN-98",
        category: "general",
        sequence: 21,
        title: "Local clause",
        text: "Something Manas added.",
      },
      await PO(),
    );

    await restoreDefaultClauses(await PO());
    expect((await repos().poClauses.getByCode("PAY-01"))!.text).toBe(
      PO_CLAUSE_CATALOGUE[0].text,
    );
    expect(await repos().poClauses.getById(added.id)).not.toBeNull();
  });

  it("refuses the Site Engineer", async () => {
    await expect(
      createPoClause(
        { code: "X-01", category: "general", sequence: 30, title: "No", text: "Nope at all." },
        await SITE(),
      ),
    ).rejects.toBeInstanceOf(PermissionError);
  });
});

describe("document numbering settings", () => {
  async function series(kind: "PO") {
    const row = await repos().documentSeries.getByKind(kind);
    if (!row) throw new Error("no series row");
    return row;
  }

  it("ships the series the build has always issued", async () => {
    const p = await project();
    const row = await series("PO");
    expect(row.prefix).toBe("PO");
    expect(row.serial_width).toBe(4);
    expect(await nextDocumentNumber("PO", p, "2026-10-05")).toMatch(/^MSP\/PO\/26-27\/\d{4}$/);
  });

  it("changes the shape of the next number only", async () => {
    const p = await project();
    const row = await series("PO");
    const before = (await repos().purchaseOrders.listByProject(p.id))[0].po_number;

    await updateDocumentSeries(
      row.id,
      {
        prefix: "PUR",
        serial_width: 5,
        start_serial: 500,
        include_project_code: true,
        include_financial_year: false,
        separator: "-",
      },
      await PH(),
    );

    // A new series with nothing issued under it starts at start_serial.
    expect(await nextDocumentNumber("PO", p, "2026-10-05")).toBe("MSP-PUR-00500");
    // What was already issued keeps the number it went out under.
    expect((await repos().purchaseOrders.listByProject(p.id))[0].po_number).toBe(before);
  });

  it("never reuses a number already issued under the same shape", async () => {
    const p = await project();
    const issued = (await repos().purchaseOrders.listByProject(p.id)).filter((x) =>
      x.po_number.startsWith("MSP/PO/26-27/"),
    );
    const highest = Math.max(
      ...issued.map((x) => Number.parseInt(x.po_number.split("/").pop() as string, 10)),
    );
    const row = await series("PO");
    // Even moved back to 1, the count of what exists wins.
    await updateDocumentSeries(
      row.id,
      {
        prefix: "PO",
        serial_width: 4,
        start_serial: 1,
        include_project_code: true,
        include_financial_year: true,
        separator: "/",
      },
      await PH(),
    );
    expect(await nextDocumentNumber("PO", p, "2026-10-05")).toBe(
      `MSP/PO/26-27/${String(highest + 1).padStart(4, "0")}`,
    );
  });

  it("validates the prefix and the separator, and refuses a role without the grant", async () => {
    const row = await series("PO");
    const valid = {
      prefix: "PO",
      serial_width: 4,
      start_serial: 1,
      include_project_code: true,
      include_financial_year: true,
      separator: "/",
    };
    await expect(
      updateDocumentSeries(row.id, { ...valid, prefix: "P O" }, await PH()),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      updateDocumentSeries(row.id, { ...valid, separator: "//" }, await PH()),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(updateDocumentSeries(row.id, valid, await PO())).rejects.toBeInstanceOf(
      PermissionError,
    );
  });

  it("numbers a new order through the configured series", async () => {
    const p = await project();
    const row = await series("PO");
    await updateDocumentSeries(
      row.id,
      {
        prefix: "PORD",
        serial_width: 3,
        start_serial: 1,
        include_project_code: false,
        include_financial_year: true,
        separator: "/",
      },
      await PH(),
    );

    const indentLine = (await repos().indents.listLinesByProject(p.id)).find(
      (l) => (l.approved_qty ?? 0) > l.ordered_qty,
    )!;
    const supplier = (await repos().suppliers.list())[0];
    const { purchase_order } = await createPurchaseOrder(
      {
        project_id: p.id,
        supplier_id: supplier.id,
        lines: [
          {
            indent_line_id: indentLine.id,
            ordered_qty: 1,
            rate: 100,
            gst_percent: 18,
          },
        ],
      },
      await PO(),
    );
    expect(purchase_order.po_number).toBe("PORD/26-27/001");
  });
});
