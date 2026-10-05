import { describe, expect, it } from "vitest";
import {
  buildProgrammeTree,
  flattenProgrammeTree,
  type ProgrammeTreeNode,
} from "@/lib/services/programme-service";
import { barGeometry, pxPerDay, timelineRange, timelineTicks } from "@/lib/services/programme-timeline";
import type { ProgrammeTask } from "@/lib/domain";

function task(partial: Partial<ProgrammeTask> & { id: string }): ProgrammeTask {
  return {
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    project_id: "p1",
    parent_id: null,
    wbs_code: partial.id,
    sequence: 0,
    name: partial.id,
    start_date: "2026-01-01",
    end_date: "2026-01-10",
    duration_days: 9,
    boq_line_id: null,
    ...partial,
  };
}

describe("buildProgrammeTree / flattenProgrammeTree", () => {
  const tasks: ProgrammeTask[] = [
    task({ id: "a", parent_id: null, sequence: 0 }),
    task({ id: "a1", parent_id: "a", sequence: 0 }),
    task({ id: "a2", parent_id: "a", sequence: 1 }),
    task({ id: "b", parent_id: null, sequence: 1 }),
  ];

  it("nests children under their parent, siblings in sequence order", () => {
    const tree = buildProgrammeTree(tasks);
    expect(tree.map((n) => n.wbs_code)).toEqual(["a", "b"]);
    expect(tree[0].children.map((n: ProgrammeTreeNode) => n.wbs_code)).toEqual(["a1", "a2"]);
  });

  it("flattens depth-first, and skips a collapsed subtree", () => {
    const tree = buildProgrammeTree(tasks);
    const expanded = flattenProgrammeTree(tree, new Set());
    expect(expanded.map((r) => r.task.wbs_code)).toEqual(["a", "a1", "a2", "b"]);
    expect(expanded[0].has_children).toBe(true);

    const collapsed = flattenProgrammeTree(tree, new Set(["a"]));
    expect(collapsed.map((r) => r.task.wbs_code)).toEqual(["a", "b"]);
    expect(collapsed[0].collapsed).toBe(true);
  });
});

describe("programme-timeline", () => {
  const tasks: ProgrammeTask[] = [
    task({ id: "a", start_date: "2026-03-01", end_date: "2026-03-10" }),
    task({ id: "b", start_date: "2026-05-01", end_date: "2026-06-01" }),
  ];

  it("pads the range a week either side of the earliest/latest task", () => {
    const range = timelineRange(tasks);
    expect(range.start.toISOString().slice(0, 10)).toBe("2026-02-22");
    expect(range.end.toISOString().slice(0, 10)).toBe("2026-06-08");
  });

  it("places a bar's left edge at its start date and sizes it to its span", () => {
    const range = timelineRange(tasks);
    const bar = barGeometry(range, "week", tasks[0]);
    expect(bar.left).toBeGreaterThan(0);
    expect(bar.width).toBeCloseTo(10 * pxPerDay("week"), 0);
  });

  it("produces weekly ticks covering the whole range", () => {
    const range = timelineRange(tasks);
    const ticks = timelineTicks(range, "week");
    expect(ticks.length).toBeGreaterThan(10);
    expect(ticks[0].x).toBeLessThanOrEqual(0);
  });
});
