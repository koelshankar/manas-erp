/**
 * What a person reads when a service refuses. Pure, so it can be tested.
 *
 * Services throw messages written for developers and tests — "lines.2.material_id:
 * pick a material", "cannot move from "approved" to "draft"". This is the one
 * place those become sentences that say what to do. The services keep their
 * messages; only the screen's wording is decided here.
 */
import { ServiceError } from "./types";

export type ErrorCopy = { title: string; description: string };

const GENERIC = "Refresh the page and try again. If it keeps happening, tell the office.";

/** "lines.2.material_id: pick a material" -> "Line 3: pick a material". */
function plainValidation(message: string): string {
  const match = message.match(/^([\w.]+): (.*)$/s);
  if (!match) return capitalise(message);
  const [, path, body] = match;
  const line = path.match(/(?:lines|labour|progress|schedules)\.(\d+)/);
  const text = capitalise(body);
  return line ? `Line ${Number(line[1]) + 1}: ${text}` : text;
}

function capitalise(s: string): string {
  const t = s.trim();
  if (!t) return t;
  const out = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?]$/.test(out) ? out : `${out}.`;
}

export function errorCopy(error: unknown): ErrorCopy {
  if (error instanceof ServiceError) {
    switch (error.name) {
      case "PermissionError":
        return {
          title: "Not allowed",
          description: "Your role cannot do this. Ask the person who owns this step.",
        };
      case "TransitionError":
        return {
          title: "Cannot do this now",
          description: "This has already moved on. Refresh the page to see where it stands.",
        };
      case "NotFoundError":
        return {
          title: "Cannot find it",
          description: "This is no longer available. Refresh the page and try again.",
        };
      case "ValidationError": {
        const text = plainValidation(error.message);
        /* zod's own defaults ("Invalid input: expected number...") help nobody. */
        const stock = /^(Required|Invalid|Expected|Too (small|big))/i.test(text.replace(/^Line \d+: /, ""));
        return {
          title: "Check the form",
          description: stock ? "Fill in every required field and check the figures." : text,
        };
      }
      default:
        return { title: "Could not save", description: capitalise(error.message) };
    }
  }
  return { title: "Something went wrong", description: GENERIC };
}
