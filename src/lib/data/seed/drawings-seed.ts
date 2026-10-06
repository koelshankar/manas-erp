import type {
  Drawing,
  DrawingDiscipline,
  DrawingRevision,
  DrawingRevisionCode,
  DrawingSheetSize,
  Project,
  Transmittal,
  TransmittalDocumentType,
  TransmittalLine,
  TransmittalPurpose,
} from "@/lib/domain";
import type { DemoDatabase } from "../database";
import type { ProjectPlan } from "./catalog";
import { postedUserOrNull, type Masters } from "./masters";
import { daysAgoDate, daysAgoIso, sid } from "./ids";
import { seedDocumentNumber } from "@/lib/services/document-number";
import type { Counters } from "./project-seed";
import { next } from "./project-seed";

/**
 * The drawing register and its transmittals, seeded on Manas Sapphire only —
 * the one site this phase is shown against, same scope as the programme seed.
 *
 * Revision depth is deliberately uneven: a few drawings sit at R0 (just
 * logged), several have been revised two or three times, and the foundation
 * layout and the HVAC layout have gone all the way to R4, so the register's
 * row expander and the "no placeholder column" rule both have something real
 * to show.
 */
export function seedDrawings(
  db: DemoDatabase,
  project: Project,
  plan: ProjectPlan,
  counters: Counters,
  masters: Masters,
): void {
  const consultantOf: Record<DrawingDiscipline, string> = {
    architectural: "Context Architects & Planners",
    structural: "SMEC Structural Consultants",
    mep: "Thermax MEP Design Associates",
    plumbing: "AquaFlow Plumbing Consultants",
    electrical: "Voltage Electrical Consultants",
  };

  const specs: Array<{
    no: string;
    title: string;
    discipline: DrawingDiscipline;
    sheet_size: DrawingSheetSize;
    revisions: number;
  }> = [
    { no: "A-101", title: "Ground floor plan", discipline: "architectural", sheet_size: "A1", revisions: 3 },
    { no: "A-102", title: "First floor plan", discipline: "architectural", sheet_size: "A1", revisions: 2 },
    { no: "A-103", title: "Second floor plan", discipline: "architectural", sheet_size: "A1", revisions: 1 },
    { no: "A-104", title: "Elevations and sections", discipline: "architectural", sheet_size: "A1", revisions: 4 },
    { no: "S-201", title: "Foundation layout", discipline: "structural", sheet_size: "A1", revisions: 5 },
    { no: "S-202", title: "Column schedule", discipline: "structural", sheet_size: "A2", revisions: 3 },
    { no: "S-203", title: "Beam layout — ground floor", discipline: "structural", sheet_size: "A1", revisions: 2 },
    { no: "S-204", title: "Slab layout — ground floor", discipline: "structural", sheet_size: "A1", revisions: 1 },
    { no: "M-301", title: "HVAC ducting layout", discipline: "mep", sheet_size: "A1", revisions: 2 },
    { no: "M-302", title: "Fire fighting layout", discipline: "mep", sheet_size: "A1", revisions: 1 },
    { no: "M-303", title: "Services shaft details", discipline: "mep", sheet_size: "A2", revisions: 3 },
    { no: "M-304", title: "Chiller plant room layout", discipline: "mep", sheet_size: "A1", revisions: 5 },
    { no: "P-401", title: "Water supply layout", discipline: "plumbing", sheet_size: "A1", revisions: 2 },
    { no: "P-402", title: "Drainage layout", discipline: "plumbing", sheet_size: "A1", revisions: 1 },
    { no: "P-403", title: "Sanitary fixture details", discipline: "plumbing", sheet_size: "A2", revisions: 3 },
    { no: "E-501", title: "Lighting layout", discipline: "electrical", sheet_size: "A1", revisions: 2 },
    { no: "E-502", title: "Power layout", discipline: "electrical", sheet_size: "A1", revisions: 1 },
    { no: "E-503", title: "DB schedule and single line diagram", discipline: "electrical", sheet_size: "A2", revisions: 3 },
  ];

  const remarksCycle = [
    "Issued for construction",
    "Revised as per site query",
    "Updated after client comments",
    "Approved for construction",
    "For construction — revalidated",
  ];

  const drawings = new Map<string, Drawing>();

  specs.forEach((spec, i) => {
    const drawing_id = sid("drawing", next(counters, "drawing"));
    // Oldest revision furthest back; each later revision closes the gap, the
    // last one landing in the last couple of months.
    const firstAgo = 320 - i * 4;
    const stepDays = Math.max(20, Math.floor((firstAgo - 20) / Math.max(1, spec.revisions)));

    const drawing: Drawing = {
      id: drawing_id,
      project_id: project.id,
      created_at: daysAgoIso(firstAgo),
      updated_at: daysAgoIso(firstAgo),
      drawing_no: spec.no,
      title: spec.title,
      discipline: spec.discipline,
      sheet_size: spec.sheet_size,
      consultant: consultantOf[spec.discipline],
      current_revision_code: null,
      current_revision_date: null,
      current_status: "",
    };
    db.drawings.push(drawing);
    drawings.set(spec.no, drawing);

    let latest: DrawingRevision | undefined;
    for (let r = 0; r < spec.revisions; r++) {
      const ago = Math.max(5, firstAgo - r * stepDays);
      const code = `R${r}` as DrawingRevisionCode;
      const revision: DrawingRevision = {
        id: sid("drawing_revision", next(counters, "drawing_revision")),
        project_id: project.id,
        created_at: daysAgoIso(ago),
        updated_at: daysAgoIso(ago),
        drawing_id,
        revision_code: code,
        revision_date: daysAgoDate(ago),
        copies_received: 2 + ((i + r) % 4),
        remarks: remarksCycle[r % remarksCycle.length],
      };
      db.drawing_revisions.push(revision);
      latest = revision;
    }

    if (latest) {
      drawing.current_revision_code = latest.revision_code;
      drawing.current_revision_date = latest.revision_date;
      drawing.current_status = latest.remarks;
      drawing.updated_at = latest.created_at;
    }
  });

  seedTransmittals(db, project, plan, counters, masters, drawings);
}

/* ------------------------------------------------------------------ */
/* Transmittals                                                       */
/* ------------------------------------------------------------------ */

function seedTransmittals(
  db: DemoDatabase,
  project: Project,
  plan: ProjectPlan,
  counters: Counters,
  masters: Masters,
  drawings: Map<string, Drawing>,
): void {
  const siteEngineer = postedUserOrNull(masters.users, "site_engineer", project.id);
  const projectQs = postedUserOrNull(masters.users, "project_qs", project.id);
  const projectHead = postedUserOrNull(masters.users, "project_head", project.id);
  const raiser = siteEngineer ?? projectQs ?? projectHead ?? db.users[0];

  type LineSpec = { no: string; revision: DrawingRevisionCode; copies: number };

  const build = (opts: {
    days_ago: number;
    status: Transmittal["status"];
    to_name: string;
    to_company: string;
    to_address: string;
    from_name: string;
    from_designation: string;
    document_type: TransmittalDocumentType;
    purpose_of_issue: TransmittalPurpose;
    mode_of_transmission: string;
    lines: LineSpec[];
    received_days_ago?: number;
    remarks?: string;
  }): void => {
    const at = daysAgoIso(opts.days_ago);
    const transmittal_id = sid("transmittal", next(counters, "transmittal"));
    const issued = opts.status === "draft" ? null : at;
    const receivedAt =
      opts.status === "acknowledged" ? daysAgoIso(opts.received_days_ago ?? opts.days_ago - 2) : null;

    const transmittal: Transmittal = {
      id: transmittal_id,
      project_id: project.id,
      created_at: at,
      updated_at: receivedAt ?? issued ?? at,
      transmittal_number: seedDocumentNumber(
        plan.short_code,
        "DT",
        at,
        next(counters, `DT:${plan.code}`),
      ),
      transmittal_date: at.slice(0, 10),
      to_name: opts.to_name,
      to_company: opts.to_company,
      to_address: opts.to_address,
      from_name: opts.from_name,
      from_designation: opts.from_designation,
      document_type: opts.document_type,
      purpose_of_issue: opts.purpose_of_issue,
      mode_of_transmission: opts.mode_of_transmission,
      status: opts.status,
      raised_by_user_id: raiser.id,
      issued_by_user_id: issued ? raiser.id : null,
      issued_at: issued,
      received_by_name: receivedAt ? opts.to_name : "",
      received_at: receivedAt,
      remarks: opts.remarks ?? "",
    };
    db.transmittals.push(transmittal);

    opts.lines.forEach((spec) => {
      const drawing = drawings.get(spec.no);
      if (!drawing) return;
      const line: TransmittalLine = {
        id: sid("transmittal_line", next(counters, "transmittal_line")),
        project_id: project.id,
        created_at: at,
        updated_at: at,
        transmittal_id,
        drawing_id: drawing.id,
        drawing_no: drawing.drawing_no,
        drawing_title: drawing.title,
        revision_code: spec.revision,
        sheet_size: drawing.sheet_size,
        copies: spec.copies,
      };
      db.transmittal_lines.push(line);
    });
  };

  // Issued, not yet acknowledged — the one the outstanding view surfaces.
  build({
    days_ago: 3,
    status: "issued",
    to_name: "Prakash Shirodkar",
    to_company: "Shirodkar Constructions",
    to_address: "Alto Porvorim, Bardez, Goa",
    from_name: "Siddhesh Naik",
    from_designation: "Site Engineer",
    document_type: "drawing",
    purpose_of_issue: "for_construction",
    mode_of_transmission: "Hand delivery",
    lines: [
      { no: "A-104", revision: "R3", copies: 3 },
      { no: "S-202", revision: "R2", copies: 3 },
    ],
  });

  // Acknowledged, history.
  build({
    days_ago: 20,
    received_days_ago: 18,
    status: "acknowledged",
    to_name: "Rakesh Mestry",
    to_company: "Thermax MEP Design Associates",
    to_address: "Panaji, Tiswadi, Goa",
    from_name: "Siddhesh Naik",
    from_designation: "Site Engineer",
    document_type: "drawing",
    purpose_of_issue: "for_construction",
    mode_of_transmission: "Email",
    lines: [
      { no: "M-301", revision: "R1", copies: 2 },
      { no: "M-303", revision: "R2", copies: 2 },
    ],
  });

  // Draft, still being put together.
  build({
    days_ago: 1,
    status: "draft",
    to_name: "SMEC Structural Consultants",
    to_company: "SMEC Structural Consultants",
    to_address: "Mapusa, Bardez, Goa",
    from_name: "Neha Desai",
    from_designation: "Project QS",
    document_type: "drawing",
    purpose_of_issue: "for_approval",
    mode_of_transmission: "Email",
    lines: [{ no: "S-204", revision: "R0", copies: 2 }],
  });

  // Acknowledged, older.
  build({
    days_ago: 40,
    received_days_ago: 35,
    status: "acknowledged",
    to_name: "Vinayak Kundaikar",
    to_company: "Voltage Electrical Consultants",
    to_address: "Margao, Salcete, Goa",
    from_name: "Siddhesh Naik",
    from_designation: "Site Engineer",
    document_type: "drawing",
    purpose_of_issue: "for_information",
    mode_of_transmission: "Hand delivery",
    lines: [
      { no: "E-502", revision: "R0", copies: 1 },
      { no: "E-503", revision: "R2", copies: 2 },
    ],
  });
}
