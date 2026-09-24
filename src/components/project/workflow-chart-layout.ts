import type { FlowNodeId } from "@/lib/services/queries";

/**
 * The client-approved chart, transcribed.
 *
 * Coordinates are in the diagram's own units and match the relative positions
 * on docs/manas-workflow-chart.pdf; the SVG scales them with a viewBox. Node
 * boxes are drawn from their centre.
 */
export const CHART_WIDTH = 1840;
export const CHART_HEIGHT = 1260;
export const NODE_W = 300;
export const NODE_H = 78;

export type ChartNode = { id: FlowNodeId; x: number; y: number; w?: number };

export const CHART_NODES: ChartNode[] = [
  { id: "boq", x: 530, y: 92 },
  { id: "work_orders", x: 1226, y: 92 },
  { id: "site_tasks", x: 1066, y: 251 },
  { id: "vendor_comparative", x: 206, y: 404 },
  { id: "indent_approval", x: 551, y: 404, w: 232 },
  { id: "material_indent", x: 876, y: 404 },
  { id: "dpr", x: 1356, y: 404 },
  { id: "approval_to_purchase", x: 206, y: 568 },
  { id: "work_done", x: 1116, y: 556 },
  { id: "joint_measurement", x: 1576, y: 556 },
  { id: "purchase_order", x: 206, y: 708 },
  { id: "ra_bill", x: 1576, y: 708 },
  { id: "grn", x: 206, y: 858 },
  { id: "site_stock", x: 676, y: 858 },
  { id: "certified_bill", x: 1576, y: 858 },
  { id: "vendor_bill", x: 206, y: 1011 },
  { id: "supplier_ledger", x: 206, y: 1154 },
  { id: "budget_vs_actual", x: 920, y: 1163 },
  { id: "accounts_handover", x: 1300, y: 1163 },
];

export type ChartEdge = {
  from: FlowNodeId;
  to: FlowNodeId;
  label?: string;
  /** Waypoints between the two boxes, in chart units. */
  via?: Array<[number, number]>;
  dashed?: boolean;
  /** Where to anchor the label, when the midpoint is not right. */
  labelAt?: [number, number];
  labelAnchor?: "start" | "middle" | "end";
};

export const CHART_EDGES: ChartEdge[] = [
  { from: "boq", to: "work_orders", label: "Scope & Rates Agreed" },
  {
    from: "work_orders",
    to: "site_tasks",
    label: "Work order reaches site",
    via: [[1226, 170]],
    labelAt: [1248, 172],
    labelAnchor: "start",
  },
  {
    from: "site_tasks",
    to: "material_indent",
    label: "Material Needed",
    via: [[876, 320]],
    labelAt: [866, 342],
    labelAnchor: "end",
  },
  {
    from: "site_tasks",
    to: "dpr",
    label: "Work Starts",
    via: [[1356, 320]],
    labelAt: [1222, 300],
    labelAnchor: "start",
  },
  {
    from: "material_indent",
    to: "indent_approval",
    label: "Checked against WO",
    labelAt: [712, 460],
    labelAnchor: "middle",
  },
  {
    from: "indent_approval",
    to: "vendor_comparative",
    label: "Indent sent to Purchase",
    labelAt: [400, 340],
    labelAnchor: "middle",
  },
  { from: "vendor_comparative", to: "approval_to_purchase", label: "Vendor Rate Fixed", labelAnchor: "start", labelAt: [222, 486] },
  { from: "approval_to_purchase", to: "purchase_order", label: "Vendor Chosen", labelAnchor: "start", labelAt: [222, 638] },
  { from: "purchase_order", to: "grn", label: "Vendor Delivers", labelAnchor: "start", labelAt: [222, 784] },
  { from: "grn", to: "site_stock", label: "Added to Stock", labelAnchor: "middle", labelAt: [430, 900] },
  { from: "grn", to: "vendor_bill", label: "Vendor bills against GRN", labelAnchor: "start", labelAt: [222, 930] },
  { from: "vendor_bill", to: "supplier_ledger", label: "Posted to supplier account", labelAnchor: "start", labelAt: [222, 1085] },
  {
    from: "supplier_ledger",
    to: "accounts_handover",
    label: "Vendor Bill for Payment",
    via: [
      [206, 1232],
      [1300, 1232],
    ],
    labelAt: [560, 1222],
    labelAnchor: "start",
  },
  {
    from: "dpr",
    to: "work_done",
    label: "Daily Entries Recorded",
    via: [[1116, 478]],
    labelAt: [1132, 490],
    labelAnchor: "start",
  },
  { from: "work_done", to: "joint_measurement", label: "Work Ready to Measure", labelAnchor: "middle", labelAt: [1358, 505] },
  { from: "joint_measurement", to: "ra_bill", label: "Signed by contractor & QS", labelAnchor: "start", labelAt: [1594, 630] },
  { from: "ra_bill", to: "certified_bill", label: "Check by QS & PH, then HoD approval", labelAnchor: "start", labelAt: [1594, 786] },
  {
    from: "certified_bill",
    to: "accounts_handover",
    label: "Approved Bill",
    via: [
      [1576, 1090],
      [1300, 1090],
    ],
    labelAt: [1396, 1078],
    labelAnchor: "start",
  },
  {
    from: "certified_bill",
    to: "budget_vs_actual",
    label: "Certified Amount Recorded",
    via: [
      [1500, 1062],
      [990, 1062],
    ],
    labelAt: [1028, 1050],
    labelAnchor: "start",
  },
  {
    from: "site_stock",
    to: "budget_vs_actual",
    label: "Material Issued to a Work Order",
    via: [
      [676, 1062],
      [860, 1062],
    ],
    labelAt: [686, 990],
    labelAnchor: "start",
  },
  {
    from: "site_stock",
    to: "work_done",
    label: "Issued v. Measured",
    dashed: true,
    via: [
      [676, 742],
      [1116, 742],
    ],
    labelAt: [900, 730],
    labelAnchor: "middle",
  },
];

/** The order the mobile list walks the chart in, grouped by team. */
export const MOBILE_GROUPS: Array<{ label: string; ids: FlowNodeId[] }> = [
  { label: "Project & Budget", ids: ["boq", "work_orders", "indent_approval", "budget_vs_actual"] },
  {
    label: "Site Execution",
    ids: ["site_tasks", "material_indent", "dpr", "work_done", "grn", "site_stock"],
  },
  {
    label: "Purchase & Stores",
    ids: [
      "vendor_comparative",
      "approval_to_purchase",
      "purchase_order",
      "vendor_bill",
      "supplier_ledger",
    ],
  },
  {
    label: "Billing & Certification",
    ids: ["joint_measurement", "ra_bill", "certified_bill"],
  },
  { label: "Accounts", ids: ["accounts_handover"] },
];
