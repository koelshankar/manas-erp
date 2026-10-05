import type { ContractorType, SupplierState, Trade, Unit } from "@/lib/domain";

/* ------------------------------------------------------------------ */
/* Users — Indian names; site staff posted to one project each        */
/* ------------------------------------------------------------------ */
/**
 * `projects` lists the PROJECT_CATALOG indices this user is posted to;
 * `"all"` means the whole portfolio.
 */
export const USER_CATALOG = [
  { full_name: "Rohan Kamat", role: "project_head", team: "project_budget", phone: "+91 98221 40311", projects: [0, 1] },
  { full_name: "Siddhesh Naik", role: "site_engineer", team: "site_execution", phone: "+91 98501 22784", projects: [0] },
  { full_name: "Ayesha Fernandes", role: "purchase_officer", team: "purchase_stores", phone: "+91 99234 66019", projects: "all" },
  { full_name: "Vikram Prabhu", role: "purchase_head", team: "purchase_stores", phone: "+91 98905 71120", projects: "all" },
  { full_name: "Neha Desai", role: "project_qs", team: "billing_certification", phone: "+91 97640 30988", projects: [0] },
  { full_name: "Anil Shetgaonkar", role: "qs_head", team: "billing_certification", phone: "+91 94220 15567", projects: "all" },
  { full_name: "Mahesh Dhond", role: "hod", team: "billing_certification", phone: "+91 98220 90042", projects: "all" },
  // The other sites' own staff. Listed after the seven above, so the role
  // switcher (first user per role) still signs in as the people above.
  { full_name: "Kunal Gawas", role: "site_engineer", team: "site_execution", phone: "+91 98604 51237", projects: [1] },
  { full_name: "Sonia D'Souza", role: "project_qs", team: "billing_certification", phone: "+91 97302 18846", projects: [1] },
  { full_name: "Clive Rodrigues", role: "project_head", team: "project_budget", phone: "+91 98233 07415", projects: [2] },
  { full_name: "Akshay Velip", role: "site_engineer", team: "site_execution", phone: "+91 99229 64180", projects: [2] },
  { full_name: "Pooja Harmalkar", role: "project_qs", team: "billing_certification", phone: "+91 90960 33572", projects: [2] },
] as const;

/* ------------------------------------------------------------------ */
/* Contractors                                                         */
/* ------------------------------------------------------------------ */
export const CONTRACTOR_CATALOG: Array<{
  code: string;
  name: string;
  trade: Trade;
  /** Constitution — decides the TDS rate on every RA bill. */
  type: ContractorType;
  contact_person: string;
  phone: string;
  pan: string;
  /** Blank for the small unregistered contractors. */
  gstin: string;
  address: string;
  default_retention_percent: number;
}> = [
  { code: "CON-001", name: "Shirodkar Constructions", trade: "rcc", type: "firm", contact_person: "Prakash Shirodkar", phone: "+91 98231 44510", pan: "AAFCS1234H", gstin: "30AACCS1234H1Z5", address: "Alto Porvorim, Bardez, Goa", default_retention_percent: 5 },
  { code: "CON-002", name: "Naik & Sons Masonry Works", trade: "masonry", type: "huf", contact_person: "Dattaram Naik", phone: "+91 99605 77321", pan: "AAEHN4411K", gstin: "30AAECN4411K1ZP", address: "Mapusa, Bardez, Goa", default_retention_percent: 5 },
  { code: "CON-003", name: "Coastal Finishers", trade: "plaster", type: "individual", contact_person: "Rupesh Gaonkar", phone: "+91 98902 31447", pan: "AFZPG9087M", gstin: "", address: "Margao, Salcete, Goa", default_retention_percent: 5 },
  { code: "CON-004", name: "Verlekar Waterproofing", trade: "waterproofing", type: "firm", contact_person: "Suhas Verlekar", phone: "+91 94043 12290", pan: "AACFV5521L", gstin: "30AACFV5521L1ZQ", address: "Ponda, Goa", default_retention_percent: 10 },
  { code: "CON-005", name: "Panjim Tiling Co.", trade: "flooring", type: "company", contact_person: "Ramnath Sawant", phone: "+91 98501 66203", pan: "AADCP7733J", gstin: "30AADCP7733J1ZX", address: "Panaji, Tiswadi, Goa", default_retention_percent: 5 },
  { code: "CON-006", name: "Colour Craft Painters", trade: "painting", type: "individual", contact_person: "Imtiaz Shaikh", phone: "+91 97670 88914", pan: "AHQPS2244N", gstin: "", address: "Vasco da Gama, Mormugao, Goa", default_retention_percent: 5 },
  { code: "CON-007", name: "Aqua Line Plumbing", trade: "plumbing", type: "firm", contact_person: "Joaquim Pereira", phone: "+91 99220 45178", pan: "AAGFA6612P", gstin: "30AAGCA6612P1ZR", address: "Porvorim, Bardez, Goa", default_retention_percent: 5 },
  { code: "CON-008", name: "Volt Edge Electricals", trade: "electrical", type: "company", contact_person: "Nitin Tendulkar", phone: "+91 98220 30765", pan: "AAECV8899Q", gstin: "30AAECV8899Q1ZD", address: "Bicholim, Goa", default_retention_percent: 5 },
];

/* ------------------------------------------------------------------ */
/* Materials                                                           */
/* ------------------------------------------------------------------ */
/**
 * The material master, three levels deep: **name -> type -> sub-type**.
 *
 * Every form Manas Developers sent us carries those three columns, so the
 * demo master is shaped the same way. The values are generic civil-trade
 * terminology and stay that way: no brand names, no vendor product codes, no
 * real rates. `base_rate` is indicative and exists only so the seeded quotes,
 * POs and issues have arithmetic to do.
 *
 * `sub_type: null` is a **two-level material** — river sand is Sand -> River
 * Sand and stops there. Three of these are seeded on purpose, because the
 * screens have to handle a material that does not fill all three columns.
 *
 * MAT-001 to MAT-015 are the original flat list, restructured in place. Their
 * codes, units and rates are unchanged, because the seeded indents, purchase
 * orders, receipts, issues and supplier rates all address them by code — a
 * renumbering here empties every queue in the demo.
 *
 * `supply_group` is **not** part of the hierarchy. It is the seed-only key
 * that matches a material to the suppliers who quote for it (see
 * SUPPLIER_CATALOG.categories), kept separate so the catalogue a buyer sees
 * and the tree a site engineer picks from can differ.
 */
export const MATERIAL_CATALOG: Array<{
  code: string;
  /** Level 1. */
  material_name: string;
  /** Level 2. */
  material_type: string;
  /** Level 3, or null for a two-level material. */
  sub_type: string | null;
  /** Free text — the spec paragraph their purchase orders print. */
  specification: string;
  unit: Unit;
  hsn_code: string;
  gst_percent: number;
  reorder_level: number;
  /** Seed-only: which suppliers quote for this. Not part of the hierarchy. */
  supply_group: string;
  /** Indicative landed rate, used to derive supplier rates and PO values. */
  base_rate: number;
}> = [
  /* --- Cement --- */
  { code: "MAT-001", material_name: "Cement", material_type: "OPC", sub_type: "53 Grade", specification: "IS 269:2015, ordinary portland cement, 53 grade, 50 kg bags", unit: "bag", hsn_code: "2523", gst_percent: 28, reorder_level: 200, supply_group: "Cement", base_rate: 395 },
  { code: "MAT-016", material_name: "Cement", material_type: "OPC", sub_type: "43 Grade", specification: "IS 269:2015, ordinary portland cement, 43 grade, 50 kg bags", unit: "bag", hsn_code: "2523", gst_percent: 28, reorder_level: 200, supply_group: "Cement", base_rate: 385 },
  { code: "MAT-017", material_name: "Cement", material_type: "PPC", sub_type: null, specification: "IS 1489 Part 1, portland pozzolana cement, fly ash based, 50 kg bags", unit: "bag", hsn_code: "2523", gst_percent: 28, reorder_level: 150, supply_group: "Cement", base_rate: 365 },

  /* --- Steel --- */
  { code: "MAT-002", material_name: "Steel", material_type: "TMT Bar", sub_type: "Fe500D 8mm", specification: "IS 1786, Fe500D thermo-mechanically treated bar, 8mm", unit: "mt", hsn_code: "7214", gst_percent: 18, reorder_level: 2, supply_group: "Steel", base_rate: 62500 },
  { code: "MAT-003", material_name: "Steel", material_type: "TMT Bar", sub_type: "Fe500D 12mm", specification: "IS 1786, Fe500D thermo-mechanically treated bar, 12mm", unit: "mt", hsn_code: "7214", gst_percent: 18, reorder_level: 3, supply_group: "Steel", base_rate: 61200 },
  { code: "MAT-004", material_name: "Steel", material_type: "TMT Bar", sub_type: "Fe500D 16mm", specification: "IS 1786, Fe500D thermo-mechanically treated bar, 16mm", unit: "mt", hsn_code: "7214", gst_percent: 18, reorder_level: 3, supply_group: "Steel", base_rate: 60800 },
  { code: "MAT-018", material_name: "Steel", material_type: "TMT Bar", sub_type: "Fe500D 20mm", specification: "IS 1786, Fe500D thermo-mechanically treated bar, 20mm", unit: "mt", hsn_code: "7214", gst_percent: 18, reorder_level: 2, supply_group: "Steel", base_rate: 60500 },
  { code: "MAT-019", material_name: "Steel", material_type: "Binding Wire", sub_type: null, specification: "18 gauge annealed mild steel binding wire", unit: "kg", hsn_code: "7217", gst_percent: 18, reorder_level: 100, supply_group: "Steel", base_rate: 78 },

  /* --- Sand --- */
  { code: "MAT-005", material_name: "Sand", material_type: "River Sand", sub_type: null, specification: "Natural river sand, washed and screened, silt content under 3%", unit: "brass", hsn_code: "2505", gst_percent: 5, reorder_level: 10, supply_group: "Aggregates", base_rate: 6800 },
  { code: "MAT-006", material_name: "Sand", material_type: "Manufactured Sand", sub_type: "Concreting Grade", specification: "IS 383 Zone II manufactured sand for concreting", unit: "brass", hsn_code: "2517", gst_percent: 5, reorder_level: 10, supply_group: "Aggregates", base_rate: 5400 },
  { code: "MAT-020", material_name: "Sand", material_type: "Manufactured Sand", sub_type: "Plastering Grade", specification: "Fine graded manufactured sand for internal and external plaster", unit: "brass", hsn_code: "2517", gst_percent: 5, reorder_level: 8, supply_group: "Aggregates", base_rate: 6200 },

  /* --- Aggregate --- */
  { code: "MAT-007", material_name: "Aggregate", material_type: "Coarse Aggregate", sub_type: "20mm", specification: "IS 383 crushed stone coarse aggregate, nominal size 20mm", unit: "brass", hsn_code: "2517", gst_percent: 5, reorder_level: 12, supply_group: "Aggregates", base_rate: 5100 },
  { code: "MAT-008", material_name: "Aggregate", material_type: "Coarse Aggregate", sub_type: "12mm", specification: "IS 383 crushed stone coarse aggregate, nominal size 12mm", unit: "brass", hsn_code: "2517", gst_percent: 5, reorder_level: 8, supply_group: "Aggregates", base_rate: 5300 },
  { code: "MAT-022", material_name: "Aggregate", material_type: "Stone Dust", sub_type: "Crusher Dust", specification: "Quarry crusher dust for filling and bedding", unit: "brass", hsn_code: "2517", gst_percent: 5, reorder_level: 6, supply_group: "Aggregates", base_rate: 4200 },

  /* --- Blocks --- */
  { code: "MAT-009", material_name: "Blocks", material_type: "AAC Block", sub_type: "600x200x150", specification: "IS 2185 Part 3 autoclaved aerated concrete block, 600 x 200 x 150 mm", unit: "nos", hsn_code: "6810", gst_percent: 12, reorder_level: 800, supply_group: "Masonry", base_rate: 78 },
  { code: "MAT-023", material_name: "Blocks", material_type: "AAC Block", sub_type: "600x200x100", specification: "IS 2185 Part 3 autoclaved aerated concrete block, 600 x 200 x 100 mm", unit: "nos", hsn_code: "6810", gst_percent: 12, reorder_level: 600, supply_group: "Masonry", base_rate: 62 },
  { code: "MAT-024", material_name: "Blocks", material_type: "Concrete Block", sub_type: "Solid 400x200x150", specification: "IS 2185 Part 1 solid concrete block, 400 x 200 x 150 mm", unit: "nos", hsn_code: "6810", gst_percent: 12, reorder_level: 500, supply_group: "Masonry", base_rate: 46 },
  { code: "MAT-025", material_name: "Blocks", material_type: "Fly Ash Brick", sub_type: "230x110x75", specification: "IS 12894 fly ash lime brick, 230 x 110 x 75 mm, class 75", unit: "nos", hsn_code: "6815", gst_percent: 12, reorder_level: 2000, supply_group: "Masonry", base_rate: 9 },

  /* --- Tiles --- */
  { code: "MAT-011", material_name: "Tiles", material_type: "Vitrified Tile", sub_type: "600x600", specification: "Double charged vitrified floor tile, 600 x 600 mm, matt finish", unit: "sqm", hsn_code: "6907", gst_percent: 18, reorder_level: 150, supply_group: "Finishes", base_rate: 640 },
  { code: "MAT-012", material_name: "Tiles", material_type: "Ceramic Tile", sub_type: "Wall 300x600", specification: "Glazed ceramic wall tile, 300 x 600 mm", unit: "sqm", hsn_code: "6907", gst_percent: 18, reorder_level: 120, supply_group: "Finishes", base_rate: 420 },
  { code: "MAT-027", material_name: "Tiles", material_type: "Ceramic Tile", sub_type: "Floor 300x300", specification: "Anti-skid ceramic floor tile, 300 x 300 mm, for toilets and balconies", unit: "sqm", hsn_code: "6907", gst_percent: 18, reorder_level: 100, supply_group: "Finishes", base_rate: 365 },

  /* --- Plumbing --- */
  { code: "MAT-014", material_name: "Plumbing", material_type: "CPVC Pipe", sub_type: "25mm", specification: "IS 15778 CPVC pipe, 25mm, SDR 11, for hot and cold water", unit: "rmt", hsn_code: "3917", gst_percent: 18, reorder_level: 200, supply_group: "Plumbing", base_rate: 185 },
  { code: "MAT-028", material_name: "Plumbing", material_type: "CPVC Pipe", sub_type: "20mm", specification: "IS 15778 CPVC pipe, 20mm, SDR 11, for hot and cold water", unit: "rmt", hsn_code: "3917", gst_percent: 18, reorder_level: 150, supply_group: "Plumbing", base_rate: 142 },
  { code: "MAT-029", material_name: "Plumbing", material_type: "PVC Pipe", sub_type: "110mm SWR", specification: "IS 13592 PVC soil waste and rain pipe, 110mm, Type B", unit: "rmt", hsn_code: "3917", gst_percent: 18, reorder_level: 120, supply_group: "Plumbing", base_rate: 215 },

  /* --- Electrical --- */
  { code: "MAT-010", material_name: "Electrical", material_type: "Copper Wire", sub_type: "2.5 sqmm FR", specification: "IS 694 flame retardant PVC insulated copper conductor, 2.5 sq mm", unit: "rmt", hsn_code: "8544", gst_percent: 18, reorder_level: 500, supply_group: "Electrical", base_rate: 42 },
  { code: "MAT-030", material_name: "Electrical", material_type: "Copper Wire", sub_type: "1.5 sqmm FR", specification: "IS 694 flame retardant PVC insulated copper conductor, 1.5 sq mm", unit: "rmt", hsn_code: "8544", gst_percent: 18, reorder_level: 400, supply_group: "Electrical", base_rate: 28 },

  /* --- Waterproofing --- */
  { code: "MAT-013", material_name: "Waterproofing", material_type: "Membrane", sub_type: "APP 3mm", specification: "APP modified bitumen membrane, 3mm, polyester reinforced, torch applied", unit: "sqm", hsn_code: "6807", gst_percent: 18, reorder_level: 100, supply_group: "Chemicals", base_rate: 310 },

  /* --- Admixtures --- */
  { code: "MAT-026", material_name: "Admixtures", material_type: "Plasticiser", sub_type: "Normal Range", specification: "IS 9103 normal range water reducing admixture for concrete", unit: "ltr", hsn_code: "3824", gst_percent: 18, reorder_level: 100, supply_group: "Chemicals", base_rate: 95 },

  /* --- Paints --- */
  { code: "MAT-015", material_name: "Paints", material_type: "Emulsion", sub_type: "Acrylic Interior", specification: "Acrylic emulsion for interior walls, washable matt finish", unit: "ltr", hsn_code: "3209", gst_percent: 18, reorder_level: 150, supply_group: "Finishes", base_rate: 265 },
  { code: "MAT-031", material_name: "Paints", material_type: "Primer", sub_type: "Cement Primer", specification: "Water based cement primer for plastered surfaces", unit: "ltr", hsn_code: "3209", gst_percent: 18, reorder_level: 120, supply_group: "Finishes", base_rate: 155 },
];

/* ------------------------------------------------------------------ */
/* Suppliers — Goa and Maharashtra                                     */
/* ------------------------------------------------------------------ */
export const SUPPLIER_CATALOG: Array<{
  code: string;
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  pan: string;
  gstin: string;
  address: string;
  city: string;
  state: SupplierState;
  payment_terms_days: number;
  /** Categories this supplier quotes for. */
  categories: string[];
  /** Multiplier applied to a material's base rate. */
  rate_factor: number;
  lead_time_days: number;
}> = [
  { code: "SUP-001", pan: "AAACZ1010B", name: "Zuari Cement Depot", contact_person: "Ganesh Pai", phone: "+91 83080 11220", email: "sales@zuaridepot.in", gstin: "30AAACZ1010B1Z9", address: "Sancoale Industrial Estate", city: "Sancoale", state: "Goa", payment_terms_days: 30, categories: ["Cement", "Chemicals", "Aggregates"], rate_factor: 1.0, lead_time_days: 3 },
  { code: "SUP-002", pan: "AAFCG2233D", name: "Goa Ispat Traders", contact_person: "Rajesh Chodankar", phone: "+91 98221 77450", email: "orders@goaispat.co.in", gstin: "30AAFCG2233D1ZK", address: "Baina Road, Vasco", city: "Vasco da Gama", state: "Goa", payment_terms_days: 45, categories: ["Steel", "Masonry", "Cement"], rate_factor: 0.98, lead_time_days: 6 },
  { code: "SUP-003", pan: "AAEFM5544C", name: "Mandovi Aggregates & Sand", contact_person: "Shrikant Parab", phone: "+91 99605 30012", email: "mandovi.agg@gmail.com", gstin: "30AAEFM5544C1ZT", address: "Sarvan, Bicholim", city: "Bicholim", state: "Goa", payment_terms_days: 21, categories: ["Aggregates", "Masonry", "Cement"], rate_factor: 1.03, lead_time_days: 2 },
  { code: "SUP-004", pan: "AAJCK9911E", name: "Konkan Building Materials", contact_person: "Mahadev Sawant", phone: "+91 94222 80190", email: "konkanbm@rediffmail.com", gstin: "27AAJCK9911E1ZM", address: "Sawantwadi MIDC", city: "Sawantwadi", state: "Maharashtra", payment_terms_days: 30, categories: ["Masonry", "Aggregates", "Cement", "Steel", "Chemicals", "Finishes", "Plumbing", "Electrical"], rate_factor: 0.96, lead_time_days: 5 },
  { code: "SUP-005", pan: "AADCS7766F", name: "Sahyadri Tiles & Sanitary", contact_person: "Prerna Kerkar", phone: "+91 97630 44528", email: "sales@sahyadritiles.in", gstin: "30AADCS7766F1ZG", address: "Mapusa Market Road", city: "Mapusa", state: "Goa", payment_terms_days: 30, categories: ["Finishes", "Plumbing", "Electrical", "Chemicals"], rate_factor: 1.02, lead_time_days: 7 },
  { code: "SUP-006", pan: "AAHCD3322G", name: "Deccan Electricals & Plumbing", contact_person: "Sameer Joshi", phone: "+91 90280 66341", email: "deccan.ep@outlook.com", gstin: "29AAHCD3322G1ZW", address: "Khanapur Road, Belagavi", city: "Belagavi", state: "Karnataka", payment_terms_days: 45, categories: ["Plumbing", "Electrical", "Finishes", "Steel"], rate_factor: 0.99, lead_time_days: 8 },
];

/* ------------------------------------------------------------------ */
/* BOQ template — reused per project with project-specific quantities   */
/* ------------------------------------------------------------------ */
export const BOQ_TEMPLATE: Array<{
  item_code: string;
  description: string;
  trade: Trade;
  unit: Unit;
  base_quantity: number;
  rate: number;
}> = [
  { item_code: "BOQ-01", description: "RCC M25 in foundation, footings and plinth beams", trade: "rcc", unit: "cum", base_quantity: 420, rate: 7850 },
  { item_code: "BOQ-02", description: "RCC M30 in columns and shear walls", trade: "rcc", unit: "cum", base_quantity: 310, rate: 8420 },
  { item_code: "BOQ-03", description: "RCC M30 in slabs, beams and staircases", trade: "rcc", unit: "cum", base_quantity: 690, rate: 8180 },
  { item_code: "BOQ-04", description: "Reinforcement steel Fe500D — cut, bend and place", trade: "rcc", unit: "mt", base_quantity: 148, rate: 78500 },
  { item_code: "BOQ-05", description: "AAC block masonry 150mm — external walls", trade: "masonry", unit: "sqm", base_quantity: 3850, rate: 1180 },
  { item_code: "BOQ-06", description: "AAC block masonry 100mm — internal partitions", trade: "masonry", unit: "sqm", base_quantity: 2940, rate: 1090 },
  { item_code: "BOQ-07", description: "Internal cement plaster 12mm, single coat", trade: "plaster", unit: "sqm", base_quantity: 11200, rate: 285 },
  { item_code: "BOQ-08", description: "External sand-faced plaster 20mm, double coat", trade: "plaster", unit: "sqm", base_quantity: 4600, rate: 410 },
  { item_code: "BOQ-09", description: "APP membrane waterproofing to terrace and toilets", trade: "waterproofing", unit: "sqm", base_quantity: 1850, rate: 720 },
  { item_code: "BOQ-10", description: "Vitrified tile flooring 600x600 with skirting", trade: "flooring", unit: "sqm", base_quantity: 5200, rate: 1080 },
  { item_code: "BOQ-11", description: "Ceramic wall tiling to toilets up to lintel", trade: "flooring", unit: "sqm", base_quantity: 1420, rate: 860 },
  { item_code: "BOQ-12", description: "Internal acrylic emulsion painting, two coats over putty", trade: "painting", unit: "sqm", base_quantity: 13100, rate: 195 },
  { item_code: "BOQ-13", description: "External texture and weather-coat painting", trade: "painting", unit: "sqm", base_quantity: 4600, rate: 265 },
  { item_code: "BOQ-14", description: "Internal plumbing, sanitary fixtures and drainage per flat", trade: "plumbing", unit: "nos", base_quantity: 48, rate: 96000 },
  { item_code: "BOQ-15", description: "Internal electrical wiring, DB and fixtures per flat", trade: "electrical", unit: "nos", base_quantity: 48, rate: 132000 },
];

/* ------------------------------------------------------------------ */
/* Projects                                                            */
/* ------------------------------------------------------------------ */
export const PROJECT_CATALOG = [
  {
    code: "MNS-SAP",
    short_code: "MSP",
    name: "Manas Sapphire",
    location: "Porvorim, Bardez, Goa",
    client_name: "Manas Developers LLP",
    status: "in_progress",
    /** Scales the BOQ template quantities. */
    scale: 1.0,
    started_days_ago: 520,
    target_days_ahead: 240,
    /**
     * Contractor codes engaged on this project, in the order the trades
     * reached site: frame, blockwork, plaster, tiling, then the services and
     * waterproofing. Painting has not been let yet. The first four carry the
     * showcase RA bills, so new trades are added after them.
     */
    contractors: ["CON-001", "CON-002", "CON-003", "CON-005", "CON-007", "CON-008", "CON-004"],
    /** How far down the workflow this project has travelled. */
    depth: "full",
    /**
     * Roughly how much of the budget this project has consumed — material
     * issued plus contractor certified, against material budget plus work
     * order value. The seed works backwards from this so the portfolio chart
     * shows three genuinely different projects rather than three 3% stubs.
     */
    consumed: 0.65,
  },
  {
    code: "MNS-GRN",
    short_code: "MGR",
    name: "Manas Greens",
    location: "Margao, Salcete, Goa",
    client_name: "Manas Developers LLP",
    status: "in_progress",
    scale: 0.72,
    started_days_ago: 310,
    target_days_ahead: 430,
    // Frame well along, blockwork following it, services being roughed in.
    contractors: ["CON-001", "CON-002", "CON-007", "CON-008"],
    depth: "mid",
    consumed: 0.3,
  },
  {
    code: "MNS-HTS",
    short_code: "MHT",
    name: "Manas Heights",
    location: "Panaji, Tiswadi, Goa",
    client_name: "Manas Developers LLP",
    // Three months in: foundations done, columns going up, nothing else let.
    status: "in_progress",
    scale: 0.55,
    started_days_ago: 95,
    target_days_ahead: 690,
    contractors: ["CON-001"],
    depth: "early",
    consumed: 0.08,
  },
] as const;

export type ProjectPlan = (typeof PROJECT_CATALOG)[number];
export type Depth = ProjectPlan["depth"];
