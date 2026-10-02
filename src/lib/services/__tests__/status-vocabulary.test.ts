import { describe, expect, it } from "vitest";
import { STATUS_MAP, statusLabel } from "@/config/status";
import {
  COMPARATIVE_STATUSES,
  GRN_STATUSES,
  INDENT_STATUSES,
  PO_STATUSES,
  RA_BILL_STATUSES,
  RETURN_STATUSES,
  VENDOR_BILL_STATUSES,
  MEASUREMENT_STATUSES,
  SITE_TASK_STATUSES,
} from "@/lib/domain/enums";

/**
 * One vocabulary across every module.
 *
 * The thing that went wrong before was drift: an indent said "Awaiting
 * approval", an approval row said "Pending", and nobody noticed because the
 * two strings were typed out in different parts of one long table. These
 * tests are about the words, not the tones.
 */
describe("the status vocabulary", () => {
  const ALL = [
    ...INDENT_STATUSES,
    ...COMPARATIVE_STATUSES,
    ...PO_STATUSES,
    ...GRN_STATUSES,
    ...VENDOR_BILL_STATUSES,
    ...RETURN_STATUSES,
    ...MEASUREMENT_STATUSES,
    ...RA_BILL_STATUSES,
    ...SITE_TASK_STATUSES,
  ];

  it("has a label for every status any entity can hold", () => {
    const missing = ALL.filter((s) => !(s in STATUS_MAP));
    expect(missing).toEqual([]);
  });

  it("never renders a raw value", () => {
    ALL.forEach((s) => {
      expect(statusLabel(s)).not.toMatch(/_/);
      expect(statusLabel(s)).not.toBe(s);
    });
  });

  it("says one thing for waiting on a decision, wherever it happens", () => {
    // Indent, comparative and the generic approval row are three modules
    // describing the same state.
    const waiting = ["submitted", "pending_approval", "pending"];
    const labels = new Set(waiting.map(statusLabel));
    expect([...labels]).toEqual(["Awaiting approval"]);
  });

  it("says one thing for goods arriving, wherever it happens", () => {
    // The indent closing, the PO closing, the GRN posting and the stock
    // movement are the same event seen from four tables.
    const arrived = ["received", "posted", "receipt"];
    expect(new Set(arrived.map(statusLabel)).size).toBe(1);
  });

  it("says one thing for sent back and one for rejected", () => {
    expect(statusLabel("sent_back")).toBe("Sent back");
    expect(statusLabel("rejected")).toBe("Rejected");
  });

  it("keeps states that differ in substance distinct", () => {
    // "Part received" is not "In progress": a storeman needs to know half the
    // load is still on the road.
    expect(statusLabel("partially_received")).not.toBe(statusLabel("received"));
    expect(statusLabel("partially_approved")).not.toBe(statusLabel("approved"));
  });
});
