/**
 * The PDF's file name, built from the PO number: `MSP/PO/26-27/0007` becomes
 * `MSP-PO-26-27-0007.pdf`, and an amended order carries its version —
 * `MSP-PO-26-27-0007-A1.pdf` — so two versions never share a name in a download
 * folder. Pure, so the email dialog and the PDF generator agree on it.
 */
export function poFileName(poNumber: string, amendNo = 0): string {
  const base = poNumber.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${base || "purchase-order"}${amendNo > 0 ? `-A${amendNo}` : ""}.pdf`;
}
