import { beforeEach, describe, expect, it } from "vitest";
import {
  buildProgrammeTasks,
  clearProgramme,
  importProgramme,
  parentWbsCode,
  programmeTaskState,
} from "@/lib/services/programme-service";
import { PermissionError, ValidationError } from "@/lib/services/types";
import { PH, project, repos, reset, SITE } from "./helpers";

beforeEach(reset);

const ROWS = [
  { wbs_code: "1", name: "Tower A", start_date: "2026-01-01", end_date: "2026-06-30", duration_days: 180 },
  { wbs_code: "1.1", name: "Structural work", start_date: "2026-01-01", end_date: "2026-03-31", duration_days: 90 },
  { wbs_code: "1.2", name: "Internal plastering", start_date: "2026-03-01", end_date: "2026-04-15", duration_days: 45 },
  { wbs_code: "1.2.1", name: "1st Stage", start_date: "2026-03-01", end_date: "2026-03-20", duration_days: 20 },
  { wbs_code: "1.2.2", name: "2nd Stage", start_date: "2026-03-21", end_date: "2026-04-15", duration_days: 25 },
];

describe("parentWbsCode", () => {
  it("trims the last dotted segment", () => {
    expect(parentWbsCode("1.2.3")).toBe("1.2");
    expect(parentWbsCode("1")).toBeNull();
  });
});

describe("buildProgrammeTasks", () => {
  it("wires parent_id from the wbs hierarchy, preserving sheet order as sequence", () => {
    const tasks = buildProgrammeTasks("proj-1", ROWS);
    const byCode = new Map(tasks.map((t) => [t.wbs_code, t]));

    expect(byCode.get("1")!.parent_id).toBeNull();
    expect(byCode.get("1.1")!.parent_id).toBe(byCode.get("1")!.id);
    expect(byCode.get("1.2.1")!.parent_id).toBe(byCode.get("1.2")!.id);
    expect(tasks.map((t) => t.sequence)).toEqual([0, 1, 2, 3, 4]);
  });

  it("imports a flat sheet (no dotted ids) as a flat list rather than failing", () => {
    const flat = [
      { wbs_code: "A", name: "One", start_date: "2026-01-01", end_date: "2026-01-10", duration_days: 9 },
      { wbs_code: "B", name: "Two", start_date: "2026-01-05", end_date: "2026-01-15", duration_days: 10 },
    ];
    const tasks = buildProgrammeTasks("proj-1", flat);
    expect(tasks.every((t) => t.parent_id === null)).toBe(true);
  });

  it("refuses a row that finishes before it starts", () => {
    const bad = [
      { wbs_code: "1", name: "Broken", start_date: "2026-03-01", end_date: "2026-02-01", duration_days: 5 },
    ];
    expect(() => buildProgrammeTasks("proj-1", bad)).toThrow(ValidationError);
  });
});

describe("programmeTaskState", () => {
  const span = { start_date: "2026-03-01", end_date: "2026-03-20" };
  it("is not_started before the span, in_progress within it, completed after", () => {
    expect(programmeTaskState(span, "2026-02-15")).toBe("not_started");
    expect(programmeTaskState(span, "2026-03-10")).toBe("in_progress");
    expect(programmeTaskState(span, "2026-04-01")).toBe("completed");
  });
});

describe("importProgramme", () => {
  it("writes the hierarchy for the project, replacing whatever was there", async () => {
    const p = await project();
    const first = await importProgramme({ project_id: p.id, rows: ROWS }, await SITE());
    expect(first).toHaveLength(5);

    const second = await importProgramme(
      { project_id: p.id, rows: ROWS.slice(0, 2) },
      await SITE(),
    );
    expect(second).toHaveLength(2);
    expect(await repos().programme.listByProject(p.id)).toHaveLength(2);
  });

  it("is refused for a role that does not hold the grant", async () => {
    const p = await project();
    await expect(
      importProgramme({ project_id: p.id, rows: ROWS }, await PH()),
    ).rejects.toThrow(PermissionError);
  });

  it("rejects a sheet with no rows", async () => {
    const p = await project();
    await expect(
      importProgramme({ project_id: p.id, rows: [] }, await SITE()),
    ).rejects.toThrow(ValidationError);
  });
});

describe("clearProgramme", () => {
  it("empties the project's programme", async () => {
    const p = await project();
    await importProgramme({ project_id: p.id, rows: ROWS }, await SITE());
    await clearProgramme(p.id, await SITE());
    expect(await repos().programme.listByProject(p.id)).toHaveLength(0);
  });
});
