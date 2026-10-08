import {
  ISSUING_COMPANY,
  PO_BALANCE_SCHEDULE_NOTE,
  PO_SIGNATURE_LABELS,
  PO_STANDING_LINE,
} from "@/config/po-document";
import { PO_SIGNATURE_BLOCKS } from "@/lib/domain";
import type {
  Indent,
  PoDeliverySchedule,
  PoDeliveryScheduleLine,
  PoLine,
  PoTerm,
  Project,
  PurchaseOrder,
  Supplier,
} from "@/lib/domain";
import { poLineCharges } from "@/lib/services/po-math";
import { formatDate, formatInr, formatNumber, rupeesInWords } from "@/lib/format";
import { poFileName } from "./po-file-name";

/**
 * The purchase order as a real PDF — drawn, not printed.
 *
 * `window.print()` hands the page to the browser, whose output depends on the
 * browser and the paper dialog. This builds the same document directly on A4
 * with jsPDF, so the file is the same everywhere and a table row is never cut
 * between two sheets (`rowPageBreak: "avoid"`).
 *
 * It mirrors `<PoDocument>` section for section: title band and issuing
 * company, Indent Details, supplier and delivery blocks, the standing line,
 * Material Details with the tax columns, Additional Charges and the grand total
 * in words, every Delivery Schedule, the numbered terms, and the four signature
 * blocks. A value-blind role gets the same file with the money columns absent.
 *
 * The body face is Noto Sans, fetched from `/fonts` on first use, because
 * jsPDF's built-in Helvetica has no rupee sign.
 */
export type PoPdfInput = {
  po: PurchaseOrder;
  lines: PoLine[];
  schedules: PoDeliverySchedule[];
  scheduleLines: PoDeliveryScheduleLine[];
  terms: PoTerm[];
  project?: Project;
  supplier?: Supplier;
  indents: Indent[];
  preparedBy: string;
  recommendedBy: string | null;
  authorisedBy: string | null;
  showValues: boolean;
  materialLabel: (id: string) => string;
  materialSpec: (id: string) => string;
};

const FONT = "NotoSans";
const MARGIN = 14;
const PAGE_W = 210;
const PAGE_H = 297;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BOTTOM = PAGE_H - 16;
/* Greys only: a PDF that is printed on a mono laser has to read the same. */
const INK: [number, number, number] = [26, 26, 26];
const MUTED: [number, number, number] = [96, 96, 96];
const RULE: [number, number, number] = [150, 150, 150];
const BAND: [number, number, number] = [238, 238, 238];

const fontCache = new Map<string, string>();

async function fontBase64(file: string): Promise<string> {
  const hit = fontCache.get(file);
  if (hit) return hit;
  const res = await fetch(`/fonts/${file}`);
  if (!res.ok) throw new Error(`The PDF font ${file} could not be loaded.`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const b64 = btoa(binary);
  fontCache.set(file, b64);
  return b64;
}

export async function buildPoPdf(input: PoPdfInput): Promise<{ blob: Blob; fileName: string }> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const { po, lines, schedules, scheduleLines, terms, project, supplier, indents, showValues } =
    input;

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  doc.addFileToVFS("NotoSans-Regular.ttf", await fontBase64("NotoSans-Regular.ttf"));
  doc.addFileToVFS("NotoSans-Bold.ttf", await fontBase64("NotoSans-Bold.ttf"));
  doc.addFont("NotoSans-Regular.ttf", FONT, "normal");
  doc.addFont("NotoSans-Bold.ttf", FONT, "bold");
  doc.setProperties({
    title: `Purchase Order ${po.po_number}`,
    subject: project?.name ?? "",
    author: ISSUING_COMPANY.name,
  });

  let y = MARGIN;

  const font = (style: "normal" | "bold", size: number, color = INK) => {
    doc.setFont(FONT, style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };
  const ensure = (needed: number) => {
    if (y + needed > BOTTOM) {
      doc.addPage();
      y = MARGIN;
    }
  };
  const lastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  /** A small-caps section caption, kept with the first line of what follows. */
  const caption = (text: string, keepWith = 16) => {
    ensure(keepWith);
    font("bold", 8, MUTED);
    doc.text(text.toUpperCase(), MARGIN, y + 3);
    y += 5.5;
  };
  /** Wrapped text at a width; returns the height used. */
  const paragraph = (
    text: string,
    x: number,
    width: number,
    opts: { style?: "normal" | "bold"; size?: number; color?: [number, number, number] } = {},
  ) => {
    font(opts.style ?? "normal", opts.size ?? 9, opts.color ?? INK);
    const wrapped = doc.splitTextToSize(text, width) as string[];
    const lineH = (opts.size ?? 9) * 0.45;
    doc.text(wrapped, x, y + lineH);
    return wrapped.length * lineH + 0.8;
  };

  const baseTable = {
    theme: "grid" as const,
    margin: { left: MARGIN, right: MARGIN, top: MARGIN, bottom: PAGE_H - BOTTOM },
    rowPageBreak: "avoid" as const,
    showHead: "everyPage" as const,
    styles: {
      font: FONT,
      fontSize: 8.5,
      textColor: INK,
      lineColor: RULE,
      lineWidth: 0.2,
      cellPadding: { top: 1.6, bottom: 1.6, left: 1.8, right: 1.8 },
      overflow: "linebreak" as const,
      valign: "top" as const,
    },
    headStyles: {
      font: FONT,
      fontStyle: "bold" as const,
      fillColor: BAND,
      textColor: MUTED,
    },
    footStyles: { font: FONT, fontStyle: "bold" as const, fillColor: BAND, textColor: INK },
  };

  /* --- title band ------------------------------------------------------ */
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  font("bold", 12, INK);
  doc.text("P U R C H A S E   O R D E R", PAGE_W / 2, y + 6.2, { align: "center" });
  doc.line(MARGIN, y + 9, PAGE_W - MARGIN, y + 9);
  y += 14;

  const headTop = y;
  font("bold", 12.5);
  doc.text(ISSUING_COMPANY.name, MARGIN, y + 4);
  y += 6;
  const companyH = paragraph(
    `${ISSUING_COMPANY.address}\nTel ${ISSUING_COMPANY.phone} · ${ISSUING_COMPANY.website}\nGST No. ${ISSUING_COMPANY.gstin}`,
    MARGIN,
    105,
    { size: 8.5, color: MUTED },
  );
  const headLeftEnd = y + companyH;

  const rightX = PAGE_W - MARGIN - 62;
  const headFields: Array<[string, string]> = [
    ["PO No.", po.po_number],
    ["PO Date", formatDate(po.po_date)],
    ["PO Amend No.", po.amend_no > 0 ? String(po.amend_no) : "—"],
  ];
  headFields.forEach(([label, value], i) => {
    const fy = headTop + 4 + i * 5.2;
    font("normal", 8.5, MUTED);
    doc.text(label, rightX, fy);
    font("bold", 9);
    doc.text(value, PAGE_W - MARGIN, fy, { align: "right" });
  });
  y = Math.max(headLeftEnd, headTop + 4 + 3 * 5.2) + 3;

  /* --- indent details -------------------------------------------------- */
  caption("Indent Details", 18);
  if (indents.length === 0) {
    y += paragraph("This order is raised directly, against no indent.", MARGIN, CONTENT_W, {
      size: 8.5,
      color: MUTED,
    });
  } else {
    autoTable(doc, {
      ...baseTable,
      startY: y,
      head: [["Sl No", "Indent No", "Indent Date"]],
      body: indents.map((indent, i) => [i + 1, indent.indent_number, formatDate(indent.raised_date)]),
      columnStyles: { 0: { cellWidth: 16 }, 2: { cellWidth: 34 } },
    });
    y = lastY();
  }
  y += 5;

  /* --- supplier and delivery ------------------------------------------- */
  const supplierText = [
    supplier?.address ?? "",
    `${supplier?.city ?? ""}, ${supplier?.state ?? ""}`,
    `PAN No. ${supplier?.pan || "—"}`,
    `GST No. ${supplier?.gstin || "—"}`,
    `${supplier?.contact_person ?? ""} · ${supplier?.phone ?? ""}`,
    supplier?.email ?? "",
  ].join("\n");
  const deliveryText = [
    po.delivery_address,
    po.delivery_contact_name || po.delivery_contact_phone
      ? `Site contact: ${po.delivery_contact_name || "—"}${
          po.delivery_contact_phone ? ` · ${po.delivery_contact_phone}` : ""
        }`
      : "",
    `Expected by ${formatDate(po.expected_delivery_date)}`,
  ]
    .filter(Boolean)
    .join("\n");

  const colW = (CONTENT_W - 8) / 2;
  const block = (title: string, name: string, text: string, x: number) => {
    const save = y;
    font("bold", 8, MUTED);
    doc.text(title.toUpperCase(), x, y + 3);
    y += 5.5;
    y += paragraph(name, x, colW, { style: "bold", size: 9.5 });
    y += paragraph(text, x, colW, { size: 8.5, color: MUTED });
    const used = y - save;
    y = save;
    return used;
  };
  // Measured first so the pair is kept on one sheet, then drawn.
  const measure = (name: string, text: string) => {
    font("bold", 9.5);
    const a = (doc.splitTextToSize(name, colW) as string[]).length * 9.5 * 0.45 + 0.8;
    font("normal", 8.5);
    const b = (doc.splitTextToSize(text, colW) as string[]).length * 8.5 * 0.45 + 0.8;
    return 5.5 + a + b;
  };
  const blockH = Math.max(
    measure(supplier?.name ?? "", supplierText),
    measure(project?.name ?? "", deliveryText),
  );
  ensure(blockH);
  const usedL = block("Supplier Name & Address", supplier?.name ?? "", supplierText, MARGIN);
  const usedR = block("Delivery Address", project?.name ?? "", deliveryText, MARGIN + colW + 8);
  y += Math.max(usedL, usedR) + 4;

  ensure(10);
  y += paragraph(PO_STANDING_LINE, MARGIN, CONTENT_W, { size: 8.5 }) + 3;

  /* --- material details ------------------------------------------------- */
  const state = supplier?.state ?? "Goa";
  const withBrand = lines.some((l) => l.brand.trim().length > 0);
  const charges = lines.map((l) => poLineCharges(l, state));
  const materialValue = charges.reduce((s, c) => s + c.basic_amount, 0);
  const materialTax = charges.reduce(
    (s, c) => s + c.cgst_amount + c.sgst_amount + c.igst_amount,
    0,
  );
  const freight = po.freight_amount + po.transportation_charge;
  const freightTax = Math.max(0, po.cgst_amount + po.sgst_amount + po.igst_amount - materialTax);

  caption("Material Details", 22);
  const head: string[] = ["Sl No", "Material"];
  if (withBrand) head.push("Brand");
  head.push("UOM", "Quantity");
  if (showValues) {
    head.push("Rate");
    if (po.is_interstate) head.push("IGST");
    else head.push("CGST", "SGST");
    head.push("Net Amount");
  }
  const rightFrom = head.indexOf("Quantity");
  const body = lines.map((line, i) => {
    const c = charges[i];
    const spec = line.specification || input.materialSpec(line.material_id);
    const row: Array<string | number> = [
      i + 1,
      spec ? `${input.materialLabel(line.material_id)}\n${spec}` : input.materialLabel(line.material_id),
    ];
    if (withBrand) row.push(line.brand || "—");
    row.push(line.unit, formatNumber(line.ordered_qty, 2));
    if (showValues) {
      row.push(formatInr(line.rate));
      if (po.is_interstate) row.push(formatInr(c.igst_amount));
      else row.push(formatInr(c.cgst_amount), formatInr(c.sgst_amount));
      row.push(formatInr(c.net_amount));
    }
    return row;
  });
  const columnStyles: Record<number, Record<string, unknown>> = { 0: { cellWidth: 12 } };
  head.forEach((h, i) => {
    if (i >= rightFrom) columnStyles[i] = { halign: "right", cellWidth: h === "Net Amount" ? 28 : 22 };
    if (h === "UOM") columnStyles[i] = { cellWidth: 13 };
    if (h === "Brand") columnStyles[i] = { cellWidth: 22 };
  });
  autoTable(doc, {
    ...baseTable,
    startY: y,
    head: [head],
    body,
    foot: showValues
      ? [
          [
            {
              content: "Taxable Total",
              colSpan: head.length - 1,
              styles: { halign: "right" as const },
            },
            { content: formatInr(materialValue), styles: { halign: "right" as const } },
          ],
        ]
      : undefined,
    showFoot: "lastPage",
    columnStyles,
    didParseCell: (data) => {
      if (data.section === "head" && data.column.index >= rightFrom) data.cell.styles.halign = "right";
    },
  });
  y = lastY() + 4;
  if (!showValues) {
    y += paragraph(
      "Rates and values are not shown on this document for your role.",
      MARGIN,
      CONTENT_W,
      { size: 8, color: MUTED },
    );
  }

  /* --- additional charges ---------------------------------------------- */
  if (showValues) {
    caption("Additional Charges", 40);
    const rows: Array<[string, string]> = [
      ["Material Value", formatInr(materialValue)],
      ["Transportation Charge", formatInr(freight)],
    ];
    if (po.is_interstate) rows.push(["IGST on freight", formatInr(freightTax)]);
    else {
      rows.push(["CGST on freight", formatInr(freightTax / 2)]);
      rows.push(["SGST on freight", formatInr(freightTax - freightTax / 2)]);
    }
    if (po.is_interstate) rows.push(["IGST", formatInr(po.igst_amount)]);
    else {
      rows.push(["CGST", formatInr(po.cgst_amount)]);
      rows.push(["SGST", formatInr(po.sgst_amount)]);
    }
    autoTable(doc, {
      ...baseTable,
      startY: y,
      tableWidth: 100,
      body: rows,
      foot: [["Total Cost", { content: formatInr(po.total_amount), styles: { halign: "right" as const } }]],
      showFoot: "lastPage",
      columnStyles: { 0: { textColor: MUTED }, 1: { halign: "right" } },
    });
    y = lastY() + 4;

    // Grand total box: kept whole.
    font("normal", 8.5);
    const words = doc.splitTextToSize(rupeesInWords(po.total_amount), CONTENT_W - 6) as string[];
    const boxH = 11 + words.length * 4;
    ensure(boxH + 10);
    doc.setFillColor(...BAND);
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.2);
    doc.rect(MARGIN, y, CONTENT_W, boxH, "FD");
    font("bold", 8.5);
    doc.text("GRAND TOTAL", MARGIN + 3, y + 5.5);
    font("bold", 12);
    doc.text(formatInr(po.total_amount), PAGE_W - MARGIN - 3, y + 6, { align: "right" });
    font("normal", 8.5);
    doc.text(words, MARGIN + 3, y + 11.2);
    y += boxH + 2.5;
    y += paragraph(
      po.is_interstate
        ? `Inter-state supply from ${supplier?.state} — IGST applies.`
        : "Intra-state supply within Goa — CGST and SGST apply.",
      MARGIN,
      CONTENT_W,
      { size: 8, color: MUTED },
    );
    y += 3;
  }

  /* --- delivery schedules ---------------------------------------------- */
  schedules.forEach((schedule, si) => {
    const own = scheduleLines.filter((l) => l.po_delivery_schedule_id === schedule.id);
    caption(schedule.title || `Delivery Schedule ${si + 1}`, 22);
    const cols = schedule.is_balance
      ? ["Material", "UOM", "Quantity"]
      : ["Material", "UOM", "Quantity", "Delivery Date"];
    autoTable(doc, {
      ...baseTable,
      startY: y,
      head: [cols],
      body: own.map((l) => {
        const row = [input.materialLabel(l.material_id), l.unit, formatNumber(l.quantity, 2)];
        if (!schedule.is_balance) row.push(formatDate(l.delivery_date));
        return row;
      }),
      columnStyles: {
        1: { cellWidth: 16 },
        2: { cellWidth: 26, halign: "right" },
        ...(schedule.is_balance ? {} : { 3: { cellWidth: 34 } }),
      },
      didParseCell: (data) => {
        if (data.section === "head" && data.column.index === 2) data.cell.styles.halign = "right";
      },
    });
    y = lastY() + 2;
    const note = schedule.is_balance ? schedule.note || PO_BALANCE_SCHEDULE_NOTE : schedule.note;
    if (note) y += paragraph(note, MARGIN, CONTENT_W, { size: 8.5, color: schedule.is_balance ? INK : MUTED });
    y += 3;
  });

  /* --- terms ------------------------------------------------------------ */
  if (terms.length > 0) {
    // Flows on after the schedules; the caption stays with the first clauses.
    caption("Terms and Conditions", 24);
    autoTable(doc, {
      ...baseTable,
      theme: "plain",
      startY: y,
      body: terms.map((t) => [`${t.sequence}.`, t.text]),
      showHead: "never",
      styles: { ...baseTable.styles, lineWidth: 0, fontSize: 8.5, cellPadding: { top: 1, bottom: 1.4, left: 0.5, right: 1 } },
      columnStyles: { 0: { cellWidth: 9, halign: "right", textColor: MUTED }, 1: { cellWidth: "auto" } },
    });
    y = lastY() + 6;
  }

  /* --- order acceptance -------------------------------------------------- */
  caption("Order Acceptance", 36);
  ensure(30);
  const sigW = (CONTENT_W - 3 * 6) / 4;
  PO_SIGNATURE_BLOCKS.forEach((blockKey, i) => {
    const x = MARGIN + i * (sigW + 6);
    const name =
      blockKey === "prepared_by"
        ? input.preparedBy
        : blockKey === "recommended_by"
          ? input.recommendedBy
          : blockKey === "authorised_signatory"
            ? input.authorisedBy
            : null;
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.3);
    doc.line(x, y + 16, x + sigW, y + 16);
    font("bold", 8.5);
    doc.text(PO_SIGNATURE_LABELS[blockKey], x, y + 20.5);
    if (name) {
      font("normal", 8, MUTED);
      doc.text(doc.splitTextToSize(name, sigW) as string[], x, y + 24.5);
    }
  });
  y += 30;

  /* --- footer on every sheet -------------------------------------------- */
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, PAGE_H - 12, PAGE_W - MARGIN, PAGE_H - 12);
    font("normal", 7.5, MUTED);
    doc.text(
      `${po.po_number}${po.amend_no > 0 ? ` · Amendment ${po.amend_no}` : ""} · ${ISSUING_COMPANY.name}`,
      MARGIN,
      PAGE_H - 8,
    );
    doc.text(`Page ${p} of ${pages}`, PAGE_W - MARGIN, PAGE_H - 8, { align: "right" });
  }

  return { blob: doc.output("blob"), fileName: poFileName(po.po_number, po.amend_no) };
}

/** Saves the blob under its file name — a download, not a print dialog. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
