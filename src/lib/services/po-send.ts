import { ISSUING_COMPANY } from "@/config/po-document";
import { poFileName } from "@/lib/files/po-file-name";
import { formatDate } from "@/lib/format";

/**
 * What the "Issue to supplier" dialog opens with. Pure, so the dialog, the
 * service's fallback and the seed all write the same covering note.
 */
export function buildPoSendDefaults(input: {
  po_number: string;
  amend_no: number;
  expected_delivery_date: string;
  project_name: string;
  supplier_name: string;
  contact_person: string;
  supplier_email: string;
  sender_name: string;
  sender_email: string;
}) {
  const amended = input.amend_no > 0 ? ` (Amendment ${input.amend_no})` : "";
  return {
    from: input.sender_email,
    to: input.supplier_email,
    cc: "",
    bcc: "",
    subject: `Purchase Order ${input.po_number}${amended} — ${input.project_name}`,
    body: [
      `Dear ${input.contact_person || input.supplier_name},`,
      "",
      `Please find attached purchase order ${input.po_number}${amended} for ${input.project_name}. ` +
        `Kindly confirm acceptance and arrange delivery by ${formatDate(input.expected_delivery_date)}, ` +
        "as per the delivery schedule and terms printed on the order.",
      "",
      "Regards,",
      input.sender_name,
      ISSUING_COMPANY.name,
    ].join("\n"),
    attachment_name: poFileName(input.po_number, input.amend_no),
  };
}
