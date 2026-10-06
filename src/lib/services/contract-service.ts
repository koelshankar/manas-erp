import { z } from "zod";
import { getRepositories } from "@/lib/data";
import { newId, TDS_PERCENT, type Contractor, type WorkOrder, type WorkOrderContract } from "@/lib/domain";
import { assertCan, parseInput, required } from "./guards";
import {
  DEFAULT_ADVANCE_RECOVERY_CEILING_PERCENT,
  DEFAULT_ADVANCE_RECOVERY_PERCENT,
  DEFAULT_DLP_MONTHS,
  DEFAULT_LD_CAP_PERCENT,
  DEFAULT_LD_PERCENT_PER_WEEK,
  DEFAULT_MIN_BILL_VALUE_FROM_SEQUENCE,
  DEFAULT_MOBILISATION_ADVANCE_PERCENT,
  DEFAULT_RELEASE_DAYS_1,
  DEFAULT_RELEASE_DAYS_2,
  DEFAULT_RELEASE_PERCENT_1,
  DEFAULT_RELEASE_PERCENT_2,
} from "./contract-math";
import type { ActingUser } from "./types";

/**
 * Phase 7 — the commercial terms a work order's RA bills are governed by.
 *
 * `contractFor()` is the one read every bill computation goes through. A work
 * order nobody has set up a contract for yet still bills correctly: it falls
 * back to the item-rate defaults from Manas's own work order, carrying the
 * work order's existing retention_percent and order_value forward so a
 * contract-less bill matches what createRaBill always computed.
 */

/**
 * Pure — no repository access — so a client component can mirror the same
 * fallback terms live, before the service call that actually writes the bill.
 */
export function defaultContractFor(workOrder: WorkOrder, contractor: Contractor): WorkOrderContract {
  const at = workOrder.updated_at;
  return {
    id: `default:${workOrder.id}`,
    created_at: at,
    updated_at: at,
    project_id: workOrder.project_id,
    work_order_id: workOrder.id,
    contract_value: workOrder.order_value,
    contract_type: "item_rate_remeasurable",
    mobilisation_advance_percent: DEFAULT_MOBILISATION_ADVANCE_PERCENT,
    mobilisation_instalments: [
      { id: "mob-1", label: "On acceptance", percent: 5, released_at: workOrder.issued_date },
      { id: "mob-2", label: "On milestone completion", percent: 5, released_at: workOrder.issued_date },
    ],
    advance_recovery_percent: DEFAULT_ADVANCE_RECOVERY_PERCENT,
    advance_recovery_ceiling_percent: DEFAULT_ADVANCE_RECOVERY_CEILING_PERCENT,
    retention_percent: workOrder.retention_percent,
    retention_release_stages: [
      { id: "ret-1", label: "On virtual completion", percent: 50 },
      { id: "ret-2", label: "Against bank guarantee (DLP)", percent: 50 },
    ],
    billing_cycle: "monthly_progressive",
    minimum_bill_value: 0,
    minimum_bill_value_from_sequence: DEFAULT_MIN_BILL_VALUE_FROM_SEQUENCE,
    payment_release_percent_1: DEFAULT_RELEASE_PERCENT_1,
    payment_release_days_1: DEFAULT_RELEASE_DAYS_1,
    payment_release_percent_2: DEFAULT_RELEASE_PERCENT_2,
    payment_release_days_2: DEFAULT_RELEASE_DAYS_2,
    defects_liability_months: DEFAULT_DLP_MONTHS,
    ld_percent_per_week: DEFAULT_LD_PERCENT_PER_WEEK,
    ld_cap_percent: DEFAULT_LD_CAP_PERCENT,
    statutory_deduction_heads: [
      { id: "tds", label: "TDS (s.194C)", percent: TDS_PERCENT[contractor.type] },
    ],
    remarks: "",
  };
}

/** The terms that govern this work order's bills — saved, or sensible defaults. */
export async function contractFor(work_order_id: string): Promise<WorkOrderContract> {
  const repos = getRepositories();
  const saved = await repos.workOrders.getContractByWorkOrder(work_order_id);
  if (saved) return saved;

  const workOrder = required(await repos.workOrders.getById(work_order_id), "Work order");
  const contractor = required(
    await repos.contractors.getById(workOrder.contractor_id),
    "Contractor",
  );
  return defaultContractFor(workOrder, contractor);
}

/** The mobilisation advance actually released, summed from its instalments. */
export function advancePaidTotal(contract: WorkOrderContract): number {
  const released = contract.mobilisation_instalments.filter((i) => i.released_at !== null);
  const percent = released.reduce((s, i) => s + i.percent, 0);
  return Math.round((contract.contract_value * percent) / 100);
}

/* ------------------------------------------------------------------ */
/* saveContract — Project & Budget writes the terms                    */
/* ------------------------------------------------------------------ */

const statutoryHeadInput = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  percent: z.number().min(0).max(100),
});

const mobilisationInstalmentInput = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  percent: z.number().min(0).max(100),
  released_at: z.string().nullable(),
});

const retentionStageInput = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  percent: z.number().min(0).max(100),
});

export const saveContractInput = z.object({
  project_id: z.string().min(1),
  work_order_id: z.string().min(1),
  contract_value: z.number().positive(),
  contract_type: z.enum(["item_rate_remeasurable", "lump_sum"]),
  mobilisation_advance_percent: z.number().min(0).max(100),
  mobilisation_instalments: z.array(mobilisationInstalmentInput).min(1),
  advance_recovery_percent: z.number().min(0).max(100),
  advance_recovery_ceiling_percent: z.number().min(0).max(100),
  retention_percent: z.number().min(0).max(100),
  retention_release_stages: z.array(retentionStageInput).min(1),
  billing_cycle: z.enum(["monthly_progressive"]),
  minimum_bill_value: z.number().min(0),
  minimum_bill_value_from_sequence: z.number().int().min(1),
  payment_release_percent_1: z.number().min(0).max(100),
  payment_release_days_1: z.number().int().min(0),
  payment_release_percent_2: z.number().min(0).max(100),
  payment_release_days_2: z.number().int().min(0),
  defects_liability_months: z.number().int().min(0),
  ld_percent_per_week: z.number().min(0).max(100),
  ld_cap_percent: z.number().min(0).max(100),
  statutory_deduction_heads: z.array(statutoryHeadInput),
  remarks: z.string().default(""),
});
export type SaveContractInput = z.input<typeof saveContractInput>;

/**
 * Creates the contract row the first time terms are set, or replaces it on a
 * later edit. One row per work order — writing again updates the existing
 * row rather than piling up history, because an issued bill has already
 * snapshotted the terms it was computed under.
 */
export async function saveContract(
  input: SaveContractInput,
  actor: ActingUser,
): Promise<WorkOrderContract> {
  assertCan(actor, "edit", "work_orders");
  const data = parseInput(saveContractInput, input);
  const repos = getRepositories();

  required(await repos.workOrders.getById(data.work_order_id), "Work order");

  const totalInstalments = data.mobilisation_instalments.reduce((s, i) => s + i.percent, 0);
  if (Math.round(totalInstalments) !== Math.round(data.mobilisation_advance_percent)) {
    throw new Error(
      `Mobilisation instalments total ${totalInstalments}%, not the advance's ${data.mobilisation_advance_percent}%.`,
    );
  }
  const totalRetentionStages = data.retention_release_stages.reduce((s, r) => s + r.percent, 0);
  if (Math.round(totalRetentionStages) !== 100) {
    throw new Error(`Retention release stages total ${totalRetentionStages}%, not 100%.`);
  }
  if (
    Math.round(data.payment_release_percent_1 + data.payment_release_percent_2) !== 100
  ) {
    throw new Error("The payment release split must total 100%.");
  }

  const existing = await repos.workOrders.getContractByWorkOrder(data.work_order_id);
  if (existing) {
    return repos.workOrders.updateContract(existing.id, data);
  }
  return repos.workOrders.createContract(data);
}

/** A fresh id for a new mobilisation instalment, retention stage or statutory head. */
export function newContractRowId(): string {
  return newId();
}
