import type { PoSignatureBlock } from "@/lib/domain";

/**
 * The words printed on a purchase order, in one place.
 *
 * Manas sent three of their own orders as the format to build to. Everything
 * here is transcribed from them: the standing line above the material table,
 * the note a balance delivery schedule prints instead of dates, and the four
 * signature blocks across the footer.
 */

/** The issuing company block at the head of the order. */
export const ISSUING_COMPANY = {
  /** The company segment in the PO number, e.g. Pur/MD/VMP/26-27/0007. */
  code: "MD",
  name: "Manas Developers LLP",
  address: "3rd Floor, Manas Plaza, 18th June Road, Panaji, Goa 403001",
  phone: "+91 832 242 8800",
  gstin: "30AAJFM1234K1ZV",
  website: "www.manasdevelopers.in",
} as const;

/** Stands immediately above the Material Details table, verbatim. */
export const PO_STANDING_LINE =
  "We are pleased to place the following order with the terms and conditions printed over leaf.";

/** A balance schedule has no dates, so it prints this instead. */
export const PO_BALANCE_SCHEDULE_NOTE =
  "Delivery schedule for this will be confirmed as per site requirement.";

/**
 * The footer blocks.
 *
 * These are print labels, not approval state. Two of them are filled from the
 * approval chain and two are signed on paper: "Prepared By" is whoever raised
 * the order, "Recommended By" and "Authorised Signatory" come off the two chain
 * steps, and "Verified By" prints empty because no system step holds it.
 */
export const PO_SIGNATURE_LABELS: Record<PoSignatureBlock, string> = {
  prepared_by: "Prepared By",
  recommended_by: "Recommended By",
  verified_by: "Verified By",
  authorised_signatory: "Authorised Signatory",
};
