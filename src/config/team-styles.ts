import type { Team } from "@/lib/domain";

/**
 * Static Tailwind class strings per team. They must be written out in full so
 * the Tailwind scanner can see them — never build these by interpolation.
 *
 * **Team colour is an accent, never a surface.** It may appear as the dot on a
 * team tag, the border and text of a step-code badge, or a 2–3px rule. It may
 * never fill a card, tint a page, colour a header or colour a button — those
 * all use the base palette, and status uses success / warning / destructive.
 * That is why there is no `soft` ground here any more.
 */
export type TeamStyle = {
  /** Team tag pill: neutral ground, the colour carried by `dot`. */
  tag: string;
  /** Solid dot for tags, legends and the role switcher. */
  dot: string;
  /** Step-code badge: thin team-coloured border and text on the card ground. */
  badge: string;
  /** 2–3px accent rule — card left border, header underline. */
  bar: string;
  /** Border colour on its own, for a left accent or an active tab underline. */
  line: string;
  /** Plain team-coloured text. */
  text: string;
  /** Active workspace tab: team underline, neutral everything else. */
  tabActive: string;
  /** Inactive workspace tab. */
  tabIdle: string;
  /** Sub-nav pill when active — neutral, the tab above carries the colour. */
  subNavActive: string;
};

export const TEAM_STYLES: Record<Team, TeamStyle> = {
  project_budget: {
    tag: "bg-card text-foreground ring-1 ring-border",
    dot: "bg-team-budget",
    badge: "bg-card text-team-budget ring-1 ring-team-budget/45",
    bar: "bg-team-budget",
    line: "border-team-budget",
    text: "text-team-budget",
    tabActive: "border-team-budget text-foreground",
    tabIdle: "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
    subNavActive: "bg-secondary text-secondary-foreground",
  },
  site_execution: {
    tag: "bg-card text-foreground ring-1 ring-border",
    dot: "bg-team-site",
    badge: "bg-card text-team-site ring-1 ring-team-site/45",
    bar: "bg-team-site",
    line: "border-team-site",
    text: "text-team-site",
    tabActive: "border-team-site text-foreground",
    tabIdle: "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
    subNavActive: "bg-secondary text-secondary-foreground",
  },
  purchase_stores: {
    tag: "bg-card text-foreground ring-1 ring-border",
    dot: "bg-team-purchase",
    badge: "bg-card text-team-purchase ring-1 ring-team-purchase/45",
    bar: "bg-team-purchase",
    line: "border-team-purchase",
    text: "text-team-purchase",
    tabActive: "border-team-purchase text-foreground",
    tabIdle: "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
    subNavActive: "bg-secondary text-secondary-foreground",
  },
  billing_certification: {
    tag: "bg-card text-foreground ring-1 ring-border",
    dot: "bg-team-billing",
    badge: "bg-card text-team-billing ring-1 ring-team-billing/45",
    bar: "bg-team-billing",
    line: "border-team-billing",
    text: "text-team-billing",
    tabActive: "border-team-billing text-foreground",
    tabIdle: "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
    subNavActive: "bg-secondary text-secondary-foreground",
  },
  accounts: {
    tag: "bg-card text-foreground ring-1 ring-border",
    dot: "bg-team-accounts",
    badge: "bg-card text-team-accounts ring-1 ring-team-accounts/45",
    bar: "bg-team-accounts",
    line: "border-team-accounts",
    text: "text-team-accounts",
    tabActive: "border-team-accounts text-foreground",
    tabIdle: "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
    subNavActive: "bg-secondary text-secondary-foreground",
  },
};
