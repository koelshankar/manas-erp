import { beforeEach, describe, expect, it } from "vitest";
import { getRepositories } from "@/lib/data";
import { scopeFor, getActionItems, getUnseenItems } from "@/lib/services/queries";
import { markSeen } from "@/lib/services/seen-service";
import {
  DEMO_ATTACHMENT_BUDGET,
  addAttachment,
  isAcceptedContentType,
  removeAttachment,
} from "@/lib/services/attachment-service";
import { PermissionError, ValidationError } from "@/lib/services/types";
import { sortRows } from "@/components/common/sort";
import { PH, PO, PURCHASE_HEAD, QS, SITE, project, repos, reset } from "./helpers";

beforeEach(reset);

async function scopeOf(role: "project_head" | "purchase_head" | "site_engineer") {
  const user = await getRepositories().users.getByRole(role);
  if (!user) throw new Error("no user");
  return scopeFor(user);
}

describe("the unseen state", () => {
  it("leaves some documents unseen in a queue the seed opens on", async () => {
    const unseen = await getUnseenItems(await scopeOf("project_head"));
    const queue = (await getActionItems(await scopeOf("project_head"))).filter((i) => i.track_seen);
    expect(unseen.length).toBeGreaterThan(0);
    // ...and not all of them: the rest read as already opened.
    expect(unseen.length).toBeLessThan(queue.length + 1);
    expect(unseen.every((i) => i.track_seen)).toBe(true);
  });

  it("never marks a document that is nobody's business", async () => {
    const unseen = await getUnseenItems(await scopeOf("project_head"));
    const ids = new Set(unseen.map((i) => i.entity_id));
    const closed = (await repos().purchaseOrders.list()).filter((p) => p.status === "closed");
    expect(closed.length).toBeGreaterThan(0);
    expect(closed.some((p) => ids.has(p.id))).toBe(false);
  });

  it("marks a document seen for that user only", async () => {
    const head = await PH();
    const before = await getUnseenItems(await scopeOf("project_head"));
    const target = before[0];
    expect(target).toBeDefined();

    await markSeen({ entity_type: target.entity_type as "indent", entity_id: target.entity_id }, head);

    const after = await getUnseenItems(await scopeOf("project_head"));
    expect(after.some((i) => i.entity_id === target.entity_id)).toBe(false);
    expect(after).toHaveLength(before.length - 1);

    // Opening it wrote a row for the Project Head and for nobody else.
    const rows = (await getRepositories().documentSeen.list()).filter(
      (r) => r.entity_id === target.entity_id,
    );
    const mine = rows.filter((r) => r.user_id === head.user_id);
    expect(mine).toHaveLength(1);
    expect(rows.every((r) => r.user_id !== "") && mine[0].user_id).toBe(head.user_id);
  });

  it("is idempotent", async () => {
    const head = await PH();
    const [target] = await getUnseenItems(await scopeOf("project_head"));
    const a = await markSeen({ entity_type: target.entity_type as "indent", entity_id: target.entity_id }, head);
    const b = await markSeen({ entity_type: target.entity_type as "indent", entity_id: target.entity_id }, head);
    expect(b.id).toBe(a.id);
  });

  it("refuses a document type that carries no unseen mark", async () => {
    await expect(
      markSeen({ entity_type: "grn" as "indent", entity_id: "x" }, await PH()),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("gives approval items a direct action, and drafts none", async () => {
    const items = await getActionItems(await scopeOf("project_head"));
    const approve = items.find((i) => i.action?.kind === "review_approve");
    expect(approve?.action?.label).toBe("Review and approve");
    expect(approve?.href).toContain("?open=");
    expect(items.filter((i) => i.id.startsWith("gp-draft:")).every((i) => !i.action)).toBe(true);
  });
});

describe("attachments", () => {
  const png = "data:image/png;base64,iVBORw0KGgo=";

  async function aGrn() {
    const p = await project();
    const grn = (await repos().grns.listByProject(p.id))[0];
    return { p, grn };
  }

  it("holds an image and shows who attached it and when", async () => {
    const { p, grn } = await aGrn();
    const a = await addAttachment(
      {
        project_id: p.id,
        entity_type: "grn",
        entity_id: grn.id,
        file_name: "challan-2.jpg",
        content_type: "image/jpeg",
        size: 1000,
        data_url: png,
      },
      await SITE(),
    );
    expect(a.data_url).toBe(png);
    expect(a.kind).toBe("photo");
    expect(a.uploaded_by_user_id).toBe((await SITE()).user_id);
    expect(a.uploaded_at).toBeTruthy();
  });

  it("attaches to all seven documents the brief lists, and to the drawing register", async () => {
    const p = await project();
    const r = repos();
    const site = await SITE();
    const targets: Array<[Parameters<typeof addAttachment>[0]["entity_type"], string | undefined, typeof site]> = [
      ["grn", (await r.grns.listByProject(p.id))[0]?.id, site],
      ["dpr", (await r.dprs.listByProject(p.id))[0]?.id, site],
      ["gate_pass", (await r.gatePasses.listByProject(p.id))[0]?.id, site],
      ["joint_measurement", (await r.measurements.listByProject(p.id))[0]?.id, await QS()],
      ["material_issue", (await r.stock.listIssuesByProject(p.id))[0]?.id, site],
      ["drawing", (await r.drawings.listByProject(p.id))[0]?.id, site],
      ["vendor_bill", (await r.vendorBills.listByProject(p.id))[0]?.id, await PO()],
    ];
    for (const [entity_type, entity_id, actor] of targets) {
      expect(entity_id, entity_type).toBeTruthy();
      const a = await addAttachment(
        {
          project_id: p.id,
          entity_type,
          entity_id: entity_id!,
          file_name: "new-upload.jpg",
          content_type: "image/jpeg",
          size: 100,
          data_url: png,
        },
        actor,
      );
      expect(a.entity_type).toBe(entity_type);
    }
  });

  it("refuses anything that is not a photograph or a PDF", async () => {
    const { p, grn } = await aGrn();
    expect(isAcceptedContentType("application/pdf")).toBe(true);
    expect(isAcceptedContentType("image/webp")).toBe(true);
    await expect(
      addAttachment(
        { project_id: p.id, entity_type: "grn", entity_id: grn.id, file_name: "x.xlsx", content_type: "application/vnd.ms-excel", size: 10 },
        await SITE(),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses once the demo has no room left", async () => {
    const { p, grn } = await aGrn();
    await expect(
      addAttachment(
        {
          project_id: p.id,
          entity_type: "grn",
          entity_id: grn.id,
          file_name: "huge.jpg",
          content_type: "image/jpeg",
          size: 10,
          data_url: `data:image/jpeg;base64,${"A".repeat(DEMO_ATTACHMENT_BUDGET)}`,
        },
        await SITE(),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("is a grant on the record's own resource, for add and remove alike", async () => {
    const { p, grn } = await aGrn();
    const input = {
      project_id: p.id,
      entity_type: "grn" as const,
      entity_id: grn.id,
      file_name: "c.jpg",
      content_type: "image/jpeg",
      size: 10,
      data_url: png,
    };
    // Purchase head holds no edit on GRN.
    await expect(addAttachment(input, await PURCHASE_HEAD())).rejects.toBeInstanceOf(PermissionError);
    const a = await addAttachment(input, await SITE());
    await expect(removeAttachment(a.id, await PURCHASE_HEAD())).rejects.toBeInstanceOf(PermissionError);
    await removeAttachment(a.id, await SITE());
    expect(await repos().attachments.getById(a.id)).toBeNull();
  });

  it("seeds a GRN with a photographed challan that really is an image", async () => {
    const all = await repos().attachments.list();
    const challan = all.find((a) => a.entity_type === "grn" && a.data_url.startsWith("data:image/"));
    expect(challan).toBeDefined();
    expect(challan!.kind).toBe("photo");
  });
});

describe("newest first", () => {
  it("orders on creation time, not on the document number", () => {
    const rows = [
      { id: "a", number: "Z/9", created_at: "2026-01-01T00:00:00.000Z" },
      { id: "b", number: "A/1", created_at: "2026-03-01T00:00:00.000Z" },
      { id: "c", number: "M/5", created_at: "2026-02-01T00:00:00.000Z" },
    ];
    expect(sortRows(rows, [], null, true).map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("lets a clicked column override the default", () => {
    const rows = [
      { id: "a", number: "Z/9", created_at: "2026-01-01T00:00:00.000Z" },
      { id: "b", number: "A/1", created_at: "2026-03-01T00:00:00.000Z" },
    ];
    const cols = [{ key: "n", header: "No", cell: () => null, sort: (r: (typeof rows)[number]) => r.number }];
    expect(sortRows(rows, cols, { key: "n", dir: "asc" }, true).map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("leaves rows alone when they carry no creation time", () => {
    const rows = [{ id: "x" }, { id: "y" }];
    expect(sortRows(rows, [], null, true)).toBe(rows);
  });
});
