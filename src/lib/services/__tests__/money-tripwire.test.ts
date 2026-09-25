import { describe, expect, it, vi } from "vitest";
import { assertNoMoney } from "@/lib/services/queries";

describe("the dev tripwire", () => {
  it("names the field and the page when money reaches a value-blind role", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const leaks = assertNoMoney(
      "site_engineer",
      { rows: [{ po_number: "MSP/PO/26-27/0001", total_amount: 412_000 }] },
      "purchase orders",
    );
    expect(leaks).toEqual(["rows[].total_amount"]);
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain("purchase orders");
    expect(spy.mock.calls[0][0]).toContain("total_amount");
    spy.mockRestore();
  });

  it("does not count an empty list or a null as a leak", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(assertNoMoney("site_engineer", { payables: [], total_amount: null }, "dashboard")).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("says nothing for a role that may see values", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(assertNoMoney("project_head", { total_amount: 1 }, "anywhere")).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
