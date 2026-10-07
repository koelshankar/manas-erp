import { describe, expect, it } from "vitest";
import { rupeesInWords } from "@/lib/format";

/**
 * The line their purchase orders print under the grand total. Indian system —
 * lakh and crore, never million.
 */
describe("rupeesInWords", () => {
  it("writes the amount in the Indian system", () => {
    expect(rupeesInWords(0)).toBe("Rupees Zero Only");
    expect(rupeesInWords(7)).toBe("Rupees Seven Only");
    expect(rupeesInWords(19)).toBe("Rupees Nineteen Only");
    expect(rupeesInWords(250)).toBe("Rupees Two Hundred Fifty Only");
    expect(rupeesInWords(1_000)).toBe("Rupees One Thousand Only");
    expect(rupeesInWords(99_999)).toBe(
      "Rupees Ninety Nine Thousand Nine Hundred Ninety Nine Only",
    );
    expect(rupeesInWords(1_245_000)).toBe("Rupees Twelve Lakh Forty Five Thousand Only");
    expect(rupeesInWords(10_000_000)).toBe("Rupees One Crore Only");
    expect(rupeesInWords(12_34_56_789)).toBe(
      "Rupees Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine Only",
    );
  });

  it("rounds paise away and handles a negative", () => {
    expect(rupeesInWords(1_000.49)).toBe("Rupees One Thousand Only");
    expect(rupeesInWords(-500)).toBe("Minus Rupees Five Hundred Only");
  });
});

describe("money and date formats", () => {
  it("groups rupees the Indian way", async () => {
    const { formatInr, formatDate } = await import("@/lib/format");
    expect(formatInr(15_544_934)).toBe("₹1,55,44,934");
    expect(formatInr(1_245_000)).toBe("₹12,45,000");
    expect(formatDate("2026-10-07")).toBe("07 Oct 2026");
  });
});
