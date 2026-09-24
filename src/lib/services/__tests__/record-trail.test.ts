import { beforeEach, describe, expect, it } from "vitest";
import { getRecordTrail, type TrailEntityType } from "@/lib/services/queries";
import type { Role } from "@/lib/domain";
import { project, reset, repos } from "./helpers";

beforeEach(reset);

/** Which position in the chain a record type sits at. */
async function trailFor(type: TrailEntityType, id: string, role: Role = "project_head") {
  const trail = await getRecordTrail(type, id, role);
  return {
    trail,
    keys: trail.steps.map((s) => s.key),
    step: (key: string) => trail.steps.find((s) => s.key === key),
  };
}

describe("getRecordTrail — the material chain", () => {
  it("walks a received indent all the way to the BOQ line", async () => {
    const p = await project();
    // The seeded indent that produced a PO, a GRN and a vendor bill.
    const indent = (await repos().indents.listByProject(p.id)).find(
      (i) => i.status === "partially_received" || i.status === "received",
    )!;

    const { keys, step } = await trailFor("indent", indent.id);
    expect(keys).toEqual(
      expect.arrayContaining(["indent", "comparative", "po", "grn", "vendor_bill", "boq"]),
    );

    expect(step("indent")!.nodes[0].number).toBe(indent.indent_number);
    expect(step("indent")!.is_current).toBe(true);
    expect(step("indent")!.nodes[0].step_code).toBe("A2");
    expect(step("indent")!.nodes[0].team).toBe("site_execution");

    expect(step("comparative")!.nodes[0].step_code).toBe("B1");
    expect(step("comparative")!.nodes[0].team).toBe("purchase_stores");
    expect(step("po")!.nodes[0].step_code).toBe("B3");
    expect(step("grn")!.nodes[0].step_code).toBe("B5");
    // The chart colours GRN green; the site owns it here.
    expect(step("grn")!.nodes[0].team).toBe("site_execution");
    expect(step("vendor_bill")!.nodes[0].step_code).toBe("B7");
  });

  it("reaches the same chain from the far end — the vendor bill", async () => {
    const p = await project();
    const bill = (await repos().vendorBills.listByProject(p.id))[0];

    const { keys, step } = await trailFor("vendor_bill", bill.id);
    expect(keys).toEqual(expect.arrayContaining(["indent", "po", "grn", "vendor_bill"]));
    expect(step("vendor_bill")!.is_current).toBe(true);
    expect(step("vendor_bill")!.nodes[0].number).toBe(bill.bill_number);
  });

  it("carries the vendor branch through the ledger to the handover", async () => {
    const p = await project();
    const handed = (await repos().vendorBills.listByProject(p.id)).find(
      (b) => b.status === "handed_over",
    )!;

    const { step } = await trailFor("vendor_bill", handed.id);
    expect(step("ledger")!.nodes.length).toBeGreaterThan(0);
    expect(step("ledger")!.nodes[0].team).toBe("purchase_stores");
    expect(step("handover")!.nodes[0].step_code).toBe("B8");
    expect(step("handover")!.nodes[0].team).toBe("accounts");
  });

  it("hangs the return off the GRN it came from", async () => {
    const p = await project();
    const ret = (await repos().returns.listByProject(p.id))[0];
    const { step } = await trailFor("grn", ret.grn_id);
    expect(step("return")!.nodes.some((n) => n.id === ret.id)).toBe(true);
    expect(step("return")!.nodes[0].number).toBe(ret.return_number);
  });

  it("collapses a one-to-many position into a single group", async () => {
    const p = await project();
    const indent = (await repos().indents.listByProject(p.id)).find(
      (i) => i.status === "partially_received",
    )!;
    const { step } = await trailFor("indent", indent.id);
    // The PO in this chain delivered several materials, so several issues hang off it.
    expect(step("issue")!.nodes.length).toBeGreaterThan(0);
    step("issue")!.nodes.forEach((n) => expect(n.step_code).toBe("A5"));
  });
});

describe("getRecordTrail — the billing chain", () => {
  it("walks a handed-over RA bill from the work order to Accounts", async () => {
    const p = await project();
    const bill = (await repos().raBills.listByProject(p.id)).find(
      (b) => b.status === "handed_over",
    )!;

    const { keys, step } = await trailFor("ra_bill", bill.id);
    expect(keys).toEqual(
      expect.arrayContaining([
        "wo_line",
        "measurement",
        "ra_bill",
        "certification",
        "handover",
        "boq",
      ]),
    );

    expect(step("ra_bill")!.is_current).toBe(true);
    expect(step("ra_bill")!.nodes[0].number).toBe(bill.bill_number);
    expect(step("ra_bill")!.nodes[0].step_code).toBe("C2");
    expect(step("measurement")!.nodes[0].step_code).toBe("C1");
    expect(step("handover")!.nodes[0].step_code).toBe("C5");
    expect(step("boq")!.nodes[0].team).toBe("project_budget");
  });

  it("renders the C3–C4 chain as four steps, the Project Head's in purple", async () => {
    const p = await project();
    const bill = (await repos().raBills.listByProject(p.id)).find(
      (b) => b.status === "handed_over",
    )!;
    const { step } = await trailFor("ra_bill", bill.id);
    const chain = step("certification")!.nodes;

    expect(chain).toHaveLength(4);
    expect(chain.map((n) => n.step_code)).toEqual(["C3", "C3", "C4", "C4"]);
    expect(chain.every((n) => n.status === "approved")).toBe(true);
    // Only the Project Head's step belongs to another team.
    expect(chain.filter((n) => n.team === "project_budget")).toHaveLength(1);
  });

  it("reaches the same chain from a joint measurement", async () => {
    const p = await project();
    const measurement = (await repos().measurements.listByProject(p.id)).find(
      (m) => m.status === "billed",
    )!;
    const { step } = await trailFor("joint_measurement", measurement.id);
    expect(step("measurement")!.is_current).toBe(true);
    expect(step("ra_bill")!.nodes.length).toBeGreaterThan(0);
    expect(step("wo_line")!.nodes.length).toBeGreaterThan(0);
  });

  it("picks up the site task planned against the same work-order line", async () => {
    const p = await project();
    const task = (await repos().siteTasks.listByProject(p.id)).find(
      (t) => t.work_order_line_id,
    )!;
    const { step } = await trailFor("work_order_line", task.work_order_line_id!);
    expect(step("task")!.nodes.some((n) => n.id === task.id)).toBe(true);
    expect(step("task")!.nodes[0].step_code).toBe("A1");
  });
});

describe("getRecordTrail — permissions", () => {
  it("blanks every value for the Site Engineer but keeps the chain", async () => {
    const p = await project();
    const bill = (await repos().raBills.listByProject(p.id)).find(
      (b) => b.status === "handed_over",
    )!;

    const forQs = await getRecordTrail("ra_bill", bill.id, "project_qs");
    const forSite = await getRecordTrail("ra_bill", bill.id, "site_engineer");

    // Same chain, same chips.
    expect(forSite.steps.map((s) => s.key)).toEqual(forQs.steps.map((s) => s.key));
    expect(forQs.steps.flatMap((s) => s.nodes).some((n) => n.value !== null)).toBe(true);
    forSite.steps
      .flatMap((s) => s.nodes)
      .forEach((n) => expect(n).not.toHaveProperty("value"));
  });
});
