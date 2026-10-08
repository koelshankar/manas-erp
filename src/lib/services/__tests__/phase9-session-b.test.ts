import { describe, expect, it } from "vitest";
import { awaitingStepText, handedOnText } from "@/config/permissions";
import { documentHeading } from "@/config/labels";
import { formatRequiredBy } from "@/lib/format";
import { poFileName } from "@/lib/files/po-file-name";

describe("formatRequiredBy", () => {
  it("prints one date, or a window with the year said once", () => {
    expect(formatRequiredBy("2026-10-20")).toBe("20 Oct 2026");
    expect(formatRequiredBy("2026-10-20", null)).toBe("20 Oct 2026");
    expect(formatRequiredBy("2026-10-20", "2026-10-20")).toBe("20 Oct 2026");
    expect(formatRequiredBy("2026-10-20", "2026-11-05")).toBe("20 Oct – 05 Nov 2026");
    expect(formatRequiredBy("2026-12-20", "2027-01-05")).toBe("20 Dec 2026 – 05 Jan 2027");
  });
});

describe("document headings", () => {
  it("title-cases headings that name a document, and leaves everything else alone", () => {
    expect(documentHeading("Purchase orders")).toBe("Purchase Orders");
    expect(documentHeading("Vendor bill check")).toBe("Vendor Bills");
    expect(documentHeading("Gate pass")).toBe("Gate Passes");
    expect(documentHeading("Material issue")).toBe("Material Issues");
    expect(documentHeading("Material transfer order")).toBe("Transfer Orders");
    expect(documentHeading("RA bills")).toBe("RA Bills");
    expect(documentHeading("Drawing register")).toBe("Drawing Register");
    expect(documentHeading("Awaiting decision")).toBe("Awaiting decision");
    expect(documentHeading("Stock position")).toBe("Stock position");
  });
});

describe("naming the awaited step", () => {
  it("names the act and the role on the PO and the RA bill", () => {
    expect(awaitingStepText("purchase_order", 1)).toBe("Awaiting recommendation by Manager procurement");
    expect(awaitingStepText("purchase_order", 2)).toBe("Awaiting authorisation by GM");
    expect(awaitingStepText("ra_bill", 1)).toBe("Awaiting QS verification by QS");
    expect(awaitingStepText("ra_bill", 4)).toBe("Awaiting final approval by GM");
    expect(awaitingStepText("ra_bill", null)).toBeNull();
  });

  it("says where a decision has sent the document, and nothing after the last step", () => {
    expect(handedOnText("purchase_order", 1)?.text).toBe("has gone to GM for authorisation");
    expect(handedOnText("ra_bill", 2)?.text).toBe("has gone to Billing head for approval");
    expect(handedOnText("purchase_order", 2)).toBeNull();
  });
});

describe("poFileName", () => {
  it("builds a filename from the PO number, with the amendment", () => {
    expect(poFileName("MSP/PO/26-27/0007")).toBe("MSP-PO-26-27-0007.pdf");
    expect(poFileName("MSP/PO/26-27/0007", 2)).toBe("MSP-PO-26-27-0007-A2.pdf");
  });
});
