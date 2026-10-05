/**
 * The density and accessibility pass, checked rather than eyeballed.
 *
 * Every screen, for every role, at 390px — the width the pass was done at,
 * because the people who use this are on mid-range Android phones. For each
 * one it asserts the rules that are meant to hold everywhere:
 *
 *   - no horizontal scroll on the page body (a table may scroll; the page
 *     may not)
 *   - no rendered text below 13px
 *   - no tap target below 44x44
 *   - no table showing more than 10 columns at rest
 *   - no dashboard showing more than 4 tiles
 *
 * A rule that only holds on the screens someone remembered to look at is not
 * a rule, which is the whole reason this is a script and not a checklist.
 *
 *   npm run audit            against http://localhost:3000
 *   BASE_URL=... npm run audit
 *   AUDIT_ROLE=site_engineer npm run audit     one role, while fixing
 *
 * The dev server must already be running.
 */
import { chromium, type Page } from "playwright";
import {
  ALL_ROLES,
  RESOURCE_META,
  projectNavFor,
  topNavFor,
  type Resource,
} from "../src/config/permissions";
import type { Role } from "../src/lib/domain/enums";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PHONE = { width: 390, height: 844 };
const ROLE_KEY = "manas-erp-role";

/** The floors the brief sets. */
const MIN_FONT_PX = 13;
const MIN_TARGET_PX = 44;
const MAX_TABLE_COLUMNS = 10;
const MAX_DASHBOARD_TILES = 4;

type Finding = { rule: string; detail: string };

/** The `…/new` editors, which no nav links to. */
const EDITOR_ROUTES: Array<[string, string]> = [
  ["New comparative", "/procurement/comparatives/new"],
  ["New purchase order", "/procurement/purchase-orders/new"],
  ["New joint measurement", "/billing/measurements/new"],
  ["New RA bill", "/billing/ra-bills/new"],
];

function routesFor(role: Role, projectId: string): Array<{ name: string; url: string }> {
  const seen = new Set<string>();
  const out: Array<{ name: string; url: string }> = [];
  const add = (name: string, url: string) => {
    if (seen.has(url)) return;
    seen.add(url);
    out.push({ name, url });
  };

  topNavFor(role).forEach((item) => {
    (item.children?.length ? item.children : [item]).forEach((entry) => {
      if (entry.href) add(entry.label, entry.href);
    });
  });

  add("Project overview", `/projects/${projectId}/overview`);

  /*
   * The full-page editors are not in anybody's nav — they are reached from a
   * list's primary action — so the sweep would never see them, and they are the
   * widest screens in the build. They open read-only for a role that may not
   * write, which is still a page that must not scroll sideways.
   */
  EDITOR_ROUTES.forEach(([name, segment]) =>
    add(name, `/projects/${projectId}${segment}`),
  );
  projectNavFor(role).forEach((resource: Resource) => {
    const meta = RESOURCE_META[resource];
    add(
      meta.label,
      meta.project_scoped ? `/projects/${projectId}${meta.href}` : meta.href,
    );
  });

  return out;
}

/**
 * Everything the page breaks, read out of the DOM in one pass.
 *
 * It runs in the page because that is the only place the *rendered* size of a
 * thing is knowable — a 13px floor is about what the reader sees, not what a
 * class name says.
 */
/**
 * Everything the page breaks, read out of the DOM in one pass.
 *
 * It is a string rather than a function because tsx compiles with esbuild's
 * `keepNames`, which rewrites every function it sees to call a `__name` helper
 * — a helper that does not exist inside the page, so a passed function throws
 * `__name is not defined` the moment Playwright serialises it. Source text is
 * handed over untouched.
 *
 * It runs in the page because that is the only place the *rendered* size of a
 * thing is knowable: a 13px floor is about what the reader sees, not what a
 * class name says.
 */
const AUDIT_SCRIPT = `(() => {
  const MIN_FONT_PX = ${MIN_FONT_PX};
  const MIN_TARGET_PX = ${MIN_TARGET_PX};
  const MAX_TABLE_COLUMNS = ${MAX_TABLE_COLUMNS};
  const MAX_DASHBOARD_TILES = ${MAX_DASHBOARD_TILES};

  const findings = [];
  function visible(el) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const s = getComputedStyle(el);
    return s.visibility !== "hidden" && s.display !== "none" && s.opacity !== "0";
  }

  // 1. The page itself must not scroll sideways. A table may; the body may not.
  const doc = document.documentElement;
  if (doc.scrollWidth > doc.clientWidth + 1) {
    const culprits = Array.from(document.querySelectorAll("body *"))
      .filter(function (el) {
        const r = el.getBoundingClientRect();
        return r.right > doc.clientWidth + 1 && visible(el);
      })
      .slice(0, 3)
      .map(function (el) {
        return el.tagName.toLowerCase() + "." + String(el.className || "").split(" ")[0];
      });
    findings.push({
      rule: "horizontal-scroll",
      detail: "page scrolls to " + doc.scrollWidth + "px (viewport " + doc.clientWidth + "px); widest: " + (culprits.join(", ") || "unknown"),
    });
  }

  // 2. Nothing below the font floor, measured as rendered.
  const small = new Map();
  document.querySelectorAll("body *").forEach(function (el) {
    const hasText = Array.from(el.childNodes).some(function (n) {
      return n.nodeType === Node.TEXT_NODE && (n.textContent || "").trim().length > 0;
    });
    if (!hasText || !visible(el)) return;
    const px = parseFloat(getComputedStyle(el).fontSize);
    if (px < MIN_FONT_PX) {
      const key = el.tagName.toLowerCase() + " " + px + "px \\"" + (el.textContent || "").trim().slice(0, 24) + "\\"";
      small.set(key, (small.get(key) || 0) + 1);
    }
  });
  Array.from(small.keys()).slice(0, 5).forEach(function (detail) {
    findings.push({ rule: "text-below-13px", detail: detail });
  });

  // 3. Tap targets. Anchors count only where they are standalone controls,
  //    never a link inside a sentence.
  const smallTargets = new Map();
  document
    .querySelectorAll('button, [role="switch"], [role="tab"], [role="menuitem"], input:not([type="hidden"]), select, textarea, a[class*="min-h"]')
    .forEach(function (el) {
      if (!visible(el)) return;
      const r = el.getBoundingClientRect();
      if (r.height < MIN_TARGET_PX - 0.5 || r.width < MIN_TARGET_PX - 0.5) {
        const label = (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 24);
        const key = el.tagName.toLowerCase() + " " + Math.round(r.width) + "x" + Math.round(r.height) + " \\"" + label + "\\"";
        smallTargets.set(key, (smallTargets.get(key) || 0) + 1);
      }
    });
  Array.from(smallTargets.keys()).slice(0, 5).forEach(function (detail) {
    findings.push({ rule: "tap-target-below-44px", detail: detail });
  });

  // 4. Table width, counted from the header row.
  document.querySelectorAll("table").forEach(function (table, i) {
    const cols = table.querySelectorAll("thead tr:first-child > *:not([data-chrome])").length;
    if (cols > MAX_TABLE_COLUMNS) {
      findings.push({ rule: "table-over-10-columns", detail: "table " + (i + 1) + " has " + cols + " columns" });
    }
  });

  // 5. Dashboard tiles.
  const grid = document.querySelector("[data-dashboard-grid]");
  if (grid && grid.children.length > MAX_DASHBOARD_TILES) {
    findings.push({ rule: "dashboard-over-4-tiles", detail: grid.children.length + " tiles" });
  }

  return findings;
})()`;

async function auditPage(page: Page): Promise<Finding[]> {
  return page.evaluate(AUDIT_SCRIPT) as Promise<Finding[]>;
}

async function main(): Promise<void> {
  const only = process.env.AUDIT_ROLE as Role | undefined;
  const roles = only ? [only] : [...ALL_ROLES];

  const browser = await chromium.launch();
  let total = 0;

  for (const role of roles) {
    const context = await browser.newContext({
      viewport: PHONE,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();

    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.evaluate(
      ([key, value]) => {
        window.localStorage.clear();
        window.localStorage.setItem(key, value);
      },
      [ROLE_KEY, role] as const,
    );
    await page.reload({ waitUntil: "networkidle" });

    await page.goto(`${BASE}/projects`, { waitUntil: "networkidle" });
    const href = await page.locator('a[href^="/projects/"]').first().getAttribute("href");
    const projectId = href?.split("/")[2];
    if (!projectId) throw new Error(`No project for ${role} — is the seed loaded?`);

    let roleFindings = 0;
    for (const route of routesFor(role, projectId)) {
      await page.goto(`${BASE}${route.url}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      const findings = await auditPage(page);
      if (findings.length > 0) {
        console.log(`\n  ${route.name}  ${route.url}`);
        findings.forEach((f) => console.log(`    ${f.rule}: ${f.detail}`));
        roleFindings += findings.length;
      }
    }

    console.log(
      roleFindings === 0 ? `${role}: clean` : `${role}: ${roleFindings} findings`,
    );
    total += roleFindings;
    await context.close();
  }

  await browser.close();
  console.log(`\n${total === 0 ? "No findings." : `${total} findings in total.`}`);
  if (total > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
