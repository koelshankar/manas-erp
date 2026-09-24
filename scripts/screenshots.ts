/**
 * Screenshots every screen, for every role, so a UX audit can be done against
 * pictures rather than memory.
 *
 * For each role it resets the demo, switches to that role, then visits every
 * item in that role's top bar and every page in its project workspace, opening
 * the page's create dialog where it has one (`?new=1`, the same route the
 * "+ New" menu uses).
 *
 *   npm run screenshots          against http://localhost:3000
 *   BASE_URL=… npm run screenshots
 *
 * The dev server must already be running.
 */
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { chromium, type Page } from "playwright";
import {
  ALL_ROLES,
  RESOURCE_META,
  createActionsFor,
  projectNavFor,
  topNavFor,
  type Resource,
} from "../src/config/permissions";
import type { Role } from "../src/lib/domain/enums";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = path.join(process.cwd(), "screenshots");
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

/** The role switcher and the store both read these back on load. */
const ROLE_KEY = "manas-erp-role";

type Shot = { name: string; url: string };

function slug(value: string): string {
  return value.replace(/^\//, "").replace(/[/?=&]/g, "-") || "home";
}

/** Every route this role can reach from its own bar, plus its workspace. */
function shotsFor(role: Role, projectId: string): Shot[] {
  const shots: Shot[] = [];
  const seen = new Set<string>();
  const add = (name: string, url: string) => {
    if (seen.has(url)) return;
    seen.add(url);
    shots.push({ name, url });
  };

  const resolve = (segment: string) => `/projects/${projectId}/${segment}`;

  // 1. The role's own top bar, children included.
  topNavFor(role).forEach((item) => {
    const entries = item.children?.length ? item.children : [item];
    entries.forEach((entry) => {
      const url = entry.project_segment
        ? resolve(entry.project_segment)
        : (entry.href ?? "/");
      add(`nav-${slug(entry.label.toLowerCase().replace(/\s+/g, "-"))}`, url);
    });
  });

  // 2. Every page of its project workspace.
  add("project-overview", resolve("overview"));
  projectNavFor(role).forEach((resource: Resource) => {
    const meta = RESOURCE_META[resource];
    const url = meta.project_scoped ? resolve(meta.href.replace(/^\//, "")) : meta.href;
    add(`workspace-${resource}`, url);
  });

  // 3. Each create action — a dialog on its list page, or a full-page editor.
  createActionsFor(role).forEach((action) => {
    const base = action.href ?? resolve(action.project_segment!);
    if (action.full_page) add(`editor-${action.resource}`, base);
    else add(`dialog-${action.resource}`, `${base}?new=1`);
  });

  return shots;
}

/** Clears the store so the next load rebuilds from the seed, then sets the role. */
async function resetDemoAndSetRole(page: Page, role: Role): Promise<void> {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ([key, value]) => {
      window.localStorage.clear();
      window.localStorage.setItem(key, value);
    },
    [ROLE_KEY, role] as const,
  );
  await page.reload({ waitUntil: "networkidle" });
}

/** Reads a project id out of the seeded store, so nothing is hard-coded. */
async function firstProjectId(page: Page): Promise<string> {
  await page.goto(`${BASE}/projects`, { waitUntil: "networkidle" });
  const href = await page
    .locator('a[href^="/projects/"]')
    .first()
    .getAttribute("href");
  const id = href?.split("/")[2];
  if (!id) throw new Error("No project link on /projects — is the seed loaded?");
  return id;
}

async function capture(page: Page, dir: string, shot: Shot): Promise<void> {
  await page.goto(`${BASE}${shot.url}`, { waitUntil: "networkidle" });
  // Let the store hydrate and any dialog finish its open transition.
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(dir, `${shot.name}.png`), fullPage: true });
}

async function main(): Promise<void> {
  await rm(OUT, { recursive: true, force: true });
  const browser = await chromium.launch();

  for (const role of ALL_ROLES) {
    const context = await browser.newContext({ viewport: DESKTOP });
    const page = await context.newPage();

    await resetDemoAndSetRole(page, role);
    const projectId = await firstProjectId(page);
    const shots = shotsFor(role, projectId);

    const dir = path.join(OUT, role);
    await mkdir(dir, { recursive: true });
    for (const shot of shots) await capture(page, dir, shot);
    console.log(`${role}: ${shots.length} screens`);

    await context.close();

    // The Site Engineer works off a phone all day; audit him at phone width too.
    if (role === "site_engineer") {
      const mobile = await browser.newContext({
        viewport: PHONE,
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      });
      const mobilePage = await mobile.newPage();
      await resetDemoAndSetRole(mobilePage, role);
      const mobileDir = path.join(OUT, `${role}-mobile`);
      await mkdir(mobileDir, { recursive: true });
      for (const shot of shots) await capture(mobilePage, mobileDir, shot);
      console.log(`${role} (390x844): ${shots.length} screens`);
      await mobile.close();
    }
  }

  await browser.close();
  console.log(`\nWritten to ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
