import type { StepCode, Team } from "@/lib/domain/enums";

export type TeamMeta = {
  key: Team;
  label: string;
  /** Short label for tags. */
  short: string;
  /** The team accent, matching the --team-* token in globals.css. */
  hex: string;
  /** Tailwind classes driven by the --team-* CSS tokens. */
  token: string;
};

/** Colours match the client-approved workflow chart legend. */
export const TEAM_META: Record<Team, TeamMeta> = {
  project_budget: {
    key: "project_budget",
    label: "Project & Budget",
    short: "Project & Budget",
    hex: "#6F66B8",
    token: "budget",
  },
  site_execution: {
    key: "site_execution",
    label: "Site Execution",
    short: "Site Execution",
    hex: "#C7812F",
    token: "site",
  },
  purchase_stores: {
    key: "purchase_stores",
    label: "Purchase & Stores",
    short: "Purchase & Stores",
    hex: "#3A7D5C",
    token: "purchase",
  },
  billing_certification: {
    key: "billing_certification",
    label: "Billing & Certification",
    short: "Billing & Certification",
    hex: "#2A7F86",
    token: "billing",
  },
  accounts: {
    key: "accounts",
    label: "Accounts",
    short: "Accounts",
    hex: "#4A5561",
    token: "accounts",
  },
};

/** Step code -> human label, verbatim from the workflow chart. */
export const STEP_LABELS: Record<StepCode, string> = {
  A1: "Work planning — upcoming task to site task",
  A2: "Material request — raise indent to purchase",
  A3: "Site monitoring — daily progress, labour strength",
  A4: "Execution breakdown — work completed, balance",
  A5: "Material inventory — site stock updated via GRN",
  B1: "Quote comparison — vendor quotes, comparative",
  B2: "Management approval",
  B3: "PO generation based on approval",
  B4: "Procurement — send PO to vendors",
  B5: "Delivery — material received on site",
  B6: "Receipt verification — GRN updates site stock",
  B7: "Invoice handling — vendor bill after site confirms",
  B8: "Accounting handover — verified, sent to accounts",
  C1: "Measurement — site joint measurement",
  C2: "Bill preparation — contractor submits bill",
  C3: "Bill verification — Project Head and Project QS",
  C4: "Management approval — QS Head, then HoD",
  C5: "Final handover — to accounts for payment",
};

export function teamColorVar(team: Team): string {
  return `var(--team-${TEAM_META[team].token})`;
}
