import { beforeEach, describe, expect, it } from "vitest";
import { daysAheadDate } from "@/lib/clock";
import { createIndent, approveIndent } from "@/lib/services/indent-service";
import { PermissionError, ValidationError } from "@/lib/services/types";
import {
  boqLineByCode,
  materialByCode,
  PH,
  project,
  reset,
  repos,
  SITE,
} from "./helpers";

beforeEach(reset);

async function draftInput() {
  const p = await project();
  const boq = await boqLineByCode(p.id, "BOQ-07");
  const cement = await materialByCode("MAT-001");
  return {
    project_id: p.id,
    lines: [
      {
        boq_line_id: boq.id,
        material_id: cement.id,
        requested_qty: 120,
        required_by: daysAheadDate(13),
        remarks: "",
      },
    ],
  };
}

describe("createIndent (A2)", () => {
  it("raises a submitted indent, numbers it, and opens the A2 approval", async () => {
    const before = (await repos().indents.list()).length;
    const { indent, lines, approval } = await createIndent(await draftInput(), await SITE());

    expect(indent.status).toBe("submitted");
    expect(indent.indent_number).toMatch(/^MSP\/IND\/26-27\/\d{4}$/);
    expect(indent.required_by_date).toBe(daysAheadDate(13));
    expect(lines).toHaveLength(1);
    expect(lines[0].approved_qty).toBeNull();
    expect(lines[0].unit).toBe("bag");

    expect(approval.entity_type).toBe("indent");
    expect(approval.step_code).toBe("A2");
    expect(approval.required_role).toBe("project_head");
    expect(approval.status).toBe("pending");

    expect((await repos().indents.list()).length).toBe(before + 1);
  });

  it("allows a request beyond the BOQ balance — the screen warns, the PH decides", async () => {
    const input = await draftInput();
    input.lines[0].requested_qty = 999_999;
    const { indent } = await createIndent(input, await SITE());
    expect(indent.status).toBe("submitted");
  });
});

describe("createIndent — permission", () => {
  it("refuses a role without the grant", async () => {
    await expect(createIndent(await draftInput(), await PH())).rejects.toBeInstanceOf(
      PermissionError,
    );
  });
});

describe("createIndent — validation", () => {
  it("rejects an indent with no lines", async () => {
    const input = await draftInput();
    await expect(
      createIndent({ ...input, lines: [] }, await SITE()),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects the same BOQ line and material twice", async () => {
    const input = await draftInput();
    input.lines.push({ ...input.lines[0] });
    await expect(createIndent(input, await SITE())).rejects.toThrow(/already on this indent/);
  });

  it("rejects a zero quantity", async () => {
    const input = await draftInput();
    input.lines[0].requested_qty = 0;
    await expect(createIndent(input, await SITE())).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("approveIndent (A2)", () => {
  it("approves every line in full and closes the gate", async () => {
    const { indent, lines } = await createIndent(await draftInput(), await SITE());
    const result = await approveIndent(
      {
        indent_id: indent.id,
        comment: "Within budget.",
        lines: lines.map((l) => ({ indent_line_id: l.id, decision: "approve" as const })),
      },
      await PH(),
    );

    expect(result.indent.status).toBe("approved");
    expect(result.indent.approval_comment).toBe("Within budget.");
    expect(result.lines[0].approved_qty).toBe(120);
    expect(result.approval.status).toBe("approved");
    expect(result.approval.acted_at).not.toBeNull();
  });

  it("marks the indent partially_approved when a line is cut back", async () => {
    const input = await draftInput();
    const p = await project();
    const sand = await materialByCode("MAT-005");
    input.lines.push({
      boq_line_id: (await boqLineByCode(p.id, "BOQ-07")).id,
      material_id: sand.id,
      requested_qty: 10,
      required_by: daysAheadDate(13),
      remarks: "",
    });
    const { indent, lines } = await createIndent(input, await SITE());

    const result = await approveIndent(
      {
        indent_id: indent.id,
        comment: "Cement reduced to the slab requirement.",
        lines: [
          { indent_line_id: lines[0].id, decision: "reduce", approved_qty: 80 },
          { indent_line_id: lines[1].id, decision: "approve" },
        ],
      },
      await PH(),
    );

    expect(result.indent.status).toBe("partially_approved");
    expect(result.lines[0].approved_qty).toBe(80);
    expect(result.lines[1].approved_qty).toBe(10);
  });

  it("marks the indent rejected when every line is rejected", async () => {
    const { indent, lines } = await createIndent(await draftInput(), await SITE());
    const result = await approveIndent(
      {
        indent_id: indent.id,
        comment: "Stock already on site.",
        lines: lines.map((l) => ({
          indent_line_id: l.id,
          decision: "reject" as const,
          rejection_reason: "Sufficient stock on site",
        })),
      },
      await PH(),
    );
    expect(result.indent.status).toBe("rejected");
    expect(result.lines[0].approved_qty).toBe(0);
    expect(result.approval.status).toBe("rejected");
  });

  it("refuses a second decision on an already-decided indent", async () => {
    const { indent, lines } = await createIndent(await draftInput(), await SITE());
    const decide = {
      indent_id: indent.id,
      comment: "",
      lines: lines.map((l) => ({ indent_line_id: l.id, decision: "approve" as const })),
    };
    await approveIndent(decide, await PH());
    await expect(approveIndent(decide, await PH())).rejects.toThrow(/cannot move from "approved"/);
  });
});

describe("approveIndent — permission", () => {
  it("refuses the Site Engineer", async () => {
    const { indent, lines } = await createIndent(await draftInput(), await SITE());
    await expect(
      approveIndent(
        {
          indent_id: indent.id,
          comment: "",
          lines: lines.map((l) => ({ indent_line_id: l.id, decision: "approve" as const })),
        },
        await SITE(),
      ),
    ).rejects.toBeInstanceOf(PermissionError);
  });
});

describe("approveIndent — validation", () => {
  it("rejects a reduced quantity above what was requested", async () => {
    const { indent, lines } = await createIndent(await draftInput(), await SITE());
    await expect(
      approveIndent(
        {
          indent_id: indent.id,
          comment: "",
          lines: [{ indent_line_id: lines[0].id, decision: "reduce", approved_qty: 500 }],
        },
        await PH(),
      ),
    ).rejects.toThrow(/exceeds the requested/);
  });

  it("requires a reason when a line is rejected", async () => {
    const { indent, lines } = await createIndent(await draftInput(), await SITE());
    await expect(
      approveIndent(
        {
          indent_id: indent.id,
          comment: "",
          lines: [{ indent_line_id: lines[0].id, decision: "reject" }],
        },
        await PH(),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("requires every line to be decided", async () => {
    const input = await draftInput();
    const p = await project();
    input.lines.push({
      boq_line_id: (await boqLineByCode(p.id, "BOQ-07")).id,
      material_id: (await materialByCode("MAT-005")).id,
      requested_qty: 5,
      required_by: daysAheadDate(13),
      remarks: "",
    });
    const { indent, lines } = await createIndent(input, await SITE());
    await expect(
      approveIndent(
        {
          indent_id: indent.id,
          comment: "",
          lines: [{ indent_line_id: lines[0].id, decision: "approve" }],
        },
        await PH(),
      ),
    ).rejects.toThrow(/every line must be decided/);
  });
});
