/**
 * Stand-ins for files a person would have attached, built as data URLs so the
 * demo opens on records that already carry their paper — a photographed
 * challan that actually shows, a drawing sheet that actually opens.
 *
 * Pure strings: no canvas, no `Buffer`, nothing the browser and the test
 * runner do not both have.
 */

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** An SVG as a data URL. */
function svgUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * A delivery challan, photographed on a site desk: a slightly crooked slip, the
 * supplier's printed head, the vehicle and the quantities in a hand, and the
 * site's "received" stamp. Enough to read as a photograph at thumbnail size and
 * to hold up when it is opened full size.
 */
export function challanPhoto(opts: { grn_number: string; date: string; vehicle?: string }): string {
  const { grn_number, date, vehicle = "GA-03-T-4471" } = opts;
  const hand = "font-family:'Segoe Print','Bradley Hand','Comic Sans MS',cursive;fill:#1d3a8a;";
  const printed = "font-family:Arial,Helvetica,sans-serif;fill:#222;";
  const rows = [
    ["1", "Cement OPC 53 grade", "240 bags"],
    ["2", "River sand", "6 brass"],
    ["3", "20 mm aggregate", "4 brass"],
  ];
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
<defs>
  <linearGradient id="desk" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b7355"/><stop offset="1" stop-color="#6e5a40"/></linearGradient>
  <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="4" dy="8" stdDeviation="8" flood-opacity=".45"/></filter>
</defs>
<rect width="800" height="600" fill="url(#desk)"/>
<g transform="rotate(-2.2 400 300)" filter="url(#shadow)">
  <rect x="90" y="40" width="620" height="520" fill="#fbfaf4"/>
  <rect x="90" y="40" width="620" height="64" fill="#e9e6d6"/>
  <text x="110" y="70" font-size="22" font-weight="700" style="${printed}">SHREE GANESH BUILDING MATERIALS</text>
  <text x="110" y="92" font-size="13" style="${printed}">Verna Industrial Estate, Salcete, Goa  ·  GSTIN 30AAAFS1234C1Z5</text>
  <text x="110" y="136" font-size="20" font-weight="700" style="${printed}" letter-spacing="2">DELIVERY CHALLAN</text>
  <text x="520" y="136" font-size="14" style="${printed}">No.</text>
  <text x="552" y="136" font-size="18" style="${hand}">DC-4187</text>
  <text x="110" y="172" font-size="14" style="${printed}">Date</text>
  <text x="156" y="172" font-size="18" style="${hand}">${esc(date)}</text>
  <text x="330" y="172" font-size="14" style="${printed}">Vehicle</text>
  <text x="392" y="172" font-size="18" style="${hand}">${esc(vehicle)}</text>
  <text x="110" y="206" font-size="14" style="${printed}">To</text>
  <text x="140" y="206" font-size="18" style="${hand}">Manas Developers — site store</text>
  <line x1="110" y1="226" x2="690" y2="226" stroke="#555" stroke-width="1.5"/>
  <text x="116" y="248" font-size="13" font-weight="700" style="${printed}">Sr</text>
  <text x="170" y="248" font-size="13" font-weight="700" style="${printed}">Description of goods</text>
  <text x="560" y="248" font-size="13" font-weight="700" style="${printed}">Quantity</text>
  <line x1="110" y1="258" x2="690" y2="258" stroke="#555" stroke-width="1"/>
  ${rows
    .map(
      (r, i) => `<text x="120" y="${292 + i * 44}" font-size="20" style="${hand}">${r[0]}</text>
  <text x="170" y="${292 + i * 44}" font-size="20" style="${hand}">${esc(r[1])}</text>
  <text x="560" y="${292 + i * 44}" font-size="20" style="${hand}">${esc(r[2])}</text>
  <line x1="110" y1="${306 + i * 44}" x2="690" y2="${306 + i * 44}" stroke="#bbb" stroke-width="1"/>`,
    )
    .join("\n  ")}
  <text x="110" y="470" font-size="14" style="${printed}">Received in good order</text>
  <text x="110" y="500" font-size="22" style="${hand}">~ R. Naik</text>
  <line x1="110" y1="508" x2="300" y2="508" stroke="#555"/>
  <text x="110" y="528" font-size="12" style="${printed}">Receiver's signature</text>
  <g transform="rotate(-12 570 480)">
    <circle cx="570" cy="480" r="62" fill="none" stroke="#b3261e" stroke-width="4"/>
    <circle cx="570" cy="480" r="53" fill="none" stroke="#b3261e" stroke-width="1.5"/>
    <text x="570" y="470" font-size="15" font-weight="700" text-anchor="middle" style="font-family:Arial;fill:#b3261e;">RECEIVED</text>
    <text x="570" y="492" font-size="13" text-anchor="middle" style="font-family:Arial;fill:#b3261e;">SITE STORE</text>
    <text x="570" y="510" font-size="12" text-anchor="middle" style="font-family:Arial;fill:#b3261e;">${esc(grn_number.split("/").pop() ?? "")}</text>
  </g>
</g>
</svg>`);
}

/** A plain photograph of a loaded vehicle at the gate, for a gate pass. */
export function gateVehiclePhoto(label: string): string {
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
<rect width="800" height="600" fill="#9db4c4"/>
<rect y="380" width="800" height="220" fill="#7a7468"/>
<rect x="110" y="250" width="430" height="150" rx="6" fill="#e3a72f"/>
<rect x="540" y="300" width="130" height="100" rx="8" fill="#c0841c"/>
<rect x="580" y="316" width="70" height="40" fill="#cfe6f2"/>
<circle cx="220" cy="410" r="40" fill="#222"/><circle cx="220" cy="410" r="16" fill="#888"/>
<circle cx="450" cy="410" r="40" fill="#222"/><circle cx="450" cy="410" r="16" fill="#888"/>
<circle cx="620" cy="410" r="40" fill="#222"/><circle cx="620" cy="410" r="16" fill="#888"/>
<g fill="#5b5b5b"><rect x="130" y="205" width="90" height="45"/><rect x="230" y="215" width="70" height="35"/><rect x="310" y="195" width="110" height="55"/></g>
<text x="400" y="560" font-size="26" text-anchor="middle" style="font-family:Arial;fill:#fff;">${esc(label)}</text>
</svg>`);
}

/**
 * A one-page PDF with a title block and a few lines, hand-assembled so its
 * cross-reference table is correct and a browser's viewer opens it without
 * repairing it. ASCII only.
 */
export function samplePdf(title: string, lines: string[]): string {
  const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, "-").replace(/([()\\])/g, "\\$1");
  const text = [
    "BT /F1 20 Tf 56 760 Td (" + ascii(title) + ") Tj ET",
    ...lines.map((l, i) => `BT /F1 12 Tf 56 ${720 - i * 20} Td (${ascii(l)}) Tj ET`),
    "0.6 w 56 745 m 556 745 l S",
    "0.6 w 56 80 500 560 re S",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => {
    body += `${String(o).padStart(10, "0")} 00000 n \n`;
  });
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return `data:application/pdf;base64,${btoa(body)}`;
}
