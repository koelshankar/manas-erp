import { describe, expect, it } from "vitest";
import {
  excelSerialToDate,
  guessColumnMapping,
  mapSheetRows,
  normalizeSheetDate,
  parseCsv,
} from "@/lib/services/programme-import";

describe("parseCsv", () => {
  it("splits a simple comma sheet into rows", () => {
    const rows = parseCsv("ID,Task Name,Start,Finish,Duration\n1,Tower A,01/03/2026,30/06/2026,120\n");
    expect(rows).toEqual([
      ["ID", "Task Name", "Start", "Finish", "Duration"],
      ["1", "Tower A", "01/03/2026", "30/06/2026", "120"],
    ]);
  });

  it("keeps a comma inside a quoted field", () => {
    const rows = parseCsv('ID,Name\n1,"Tiling, 1st stage"\n');
    expect(rows[1]).toEqual(["1", "Tiling, 1st stage"]);
  });
});

describe("normalizeSheetDate", () => {
  it("accepts an ISO date", () => {
    expect(normalizeSheetDate("2026-03-01")).toBe("2026-03-01");
  });

  it("reads dd/mm/yyyy as day-first", () => {
    expect(normalizeSheetDate("25/12/2026")).toBe("2026-12-25");
  });

  it("falls back to month-first when the first number can't be a day", () => {
    expect(normalizeSheetDate("12/25/2026")).toBe("2026-12-25");
  });

  it("converts an Excel serial number", () => {
    // Excel serial 45000 is 2023-02-05 (allowing for the epoch's Dec-30-1899 base).
    expect(normalizeSheetDate(45000)).toBe(
      new Date(excelSerialToDate(45000)).toISOString().slice(0, 10),
    );
  });

  it("returns null for text that isn't a date", () => {
    expect(normalizeSheetDate("not a date")).toBeNull();
    expect(normalizeSheetDate("")).toBeNull();
  });
});

describe("guessColumnMapping", () => {
  it("matches headers by keyword", () => {
    const mapping = guessColumnMapping(["Task ID", "Activity Name", "Start Date", "Finish Date", "Duration (Days)"]);
    expect(mapping.wbs_code).toBe("Task ID");
    expect(mapping.name).toBe("Activity Name");
    expect(mapping.start_date).toBe("Start Date");
    expect(mapping.end_date).toBe("Finish Date");
    expect(mapping.duration_days).toBe("Duration (Days)");
  });
});

describe("mapSheetRows", () => {
  const headers = ["ID", "Name", "Start", "Finish", "Duration"];
  const mapping = { wbs_code: "ID", name: "Name", start_date: "Start", end_date: "Finish", duration_days: "Duration" };

  it("produces a valid row when everything parses", () => {
    const [row] = mapSheetRows(headers, [["1.1", "Block work", "2026-01-01", "2026-01-10", "9"]], mapping);
    expect(row.valid).toBe(true);
    expect(row.start_date).toBe("2026-01-01");
    expect(row.duration_days).toBe(9);
  });

  it("derives duration from the dates when the column is blank", () => {
    const [row] = mapSheetRows(headers, [["1.1", "Block work", "2026-01-01", "2026-01-10", ""]], mapping);
    expect(row.duration_days).toBe(10);
  });

  it("flags a row with an unparsable date, with the row number for the preview", () => {
    const [row] = mapSheetRows(headers, [["1.1", "Block work", "not a date", "2026-01-10", "9"]], mapping);
    expect(row.valid).toBe(false);
    expect(row.error).toMatch(/start/);
    expect(row.row_number).toBe(2);
  });

  it("flags a row that finishes before it starts", () => {
    const [row] = mapSheetRows(headers, [["1.1", "Block work", "2026-02-01", "2026-01-10", "9"]], mapping);
    expect(row.valid).toBe(false);
    expect(row.error).toMatch(/before/);
  });
});
