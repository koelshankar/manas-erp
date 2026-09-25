import { describe, expect, it } from "vitest";
import { consumptionBand } from "@/lib/services/budget-service";

describe("consumptionBand", () => {
  it("is amber at 80-100% only while spend runs ahead of the work", () => {
    expect(consumptionBand(85, 40)).toBe("amber");
    expect(consumptionBand(83, 100)).toBe("neutral");
    expect(consumptionBand(79, 10)).toBe("neutral");
  });

  it("is red past the budget however much is done", () => {
    expect(consumptionBand(104, 100)).toBe("red");
  });
});
