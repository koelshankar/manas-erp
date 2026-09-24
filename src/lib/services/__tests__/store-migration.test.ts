import { beforeEach, describe, expect, it } from "vitest";
import { buildSeed } from "@/lib/data/seed";
import { STORAGE_KEY } from "@/lib/data/local";
import { today } from "@/lib/clock";
import { userSchema } from "@/lib/domain";
import { reset, repos } from "./helpers";

beforeEach(reset);

/**
 * The persisted snapshot is versioned against the domain. A browser holding an
 * older shape must be rebuilt, not merged — code written against the current
 * types would otherwise read `undefined` off a row that predates the column.
 */
describe("the persisted snapshot", () => {
  it("is keyed and versioned so an older shape cannot survive a schema change", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/lib/data/local/store.ts", "utf8"),
    );
    expect(STORAGE_KEY).toBe("manas-erp-demo-v1");
    // The version must be a real number that someone has to bump, and the
    // migration must rebuild rather than try to patch.
    expect(source).toMatch(/const SCHEMA_VERSION = \d+;/);
    expect(source).toMatch(/version: SCHEMA_VERSION/);
    expect(source).toMatch(/migrate: \(\) => \(\{ db: buildSeed\(\)/);
  });

  it("stamps the day it was seeded for, so a stale day is rebuilt", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/lib/data/local/store.ts", "utf8"),
    );
    expect(source).toMatch(/seeded_on/);
    expect(source).toMatch(/function isStale/);
  });
});

/**
 * The failure that made this necessary: a snapshot written before
 * `assigned_project_ids` existed left `user.assigned_project_ids` undefined,
 * and the dashboard scope hook threw on `.includes`.
 */
describe("every seeded row matches the current domain shape", () => {
  it("gives every user an assignment", async () => {
    const users = await repos().users.list();
    expect(users.length).toBeGreaterThan(0);
    users.forEach((u) => {
      expect(Array.isArray(u.assigned_project_ids), u.role).toBe(true);
      expect(u.assigned_project_ids.length, u.role).toBeGreaterThan(0);
    });
  });

  it("parses every user against the schema, so no column is silently missing", async () => {
    const users = await repos().users.list();
    users.forEach((u) => expect(() => userSchema.parse(u)).not.toThrow());
  });

  it("lays the seed out for today", () => {
    const db = buildSeed();
    const dprDates = db.dprs.map((d) => d.report_date).sort();
    // The fortnight behind today, and never today itself.
    expect(dprDates[dprDates.length - 1] < today()).toBe(true);
    expect(dprDates).not.toContain(today());
  });
});
