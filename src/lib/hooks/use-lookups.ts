"use client";

import { useMemo } from "react";
import { useAllRows } from "./use-repository";

/**
 * Name lookups for the read-only tables. Joins live here rather than in the
 * pages, so a Supabase swap can replace them with real joins in one place.
 */
export function useLookups() {
  const contractors = useAllRows("contractors");
  const materials = useAllRows("materials");
  const suppliers = useAllRows("suppliers");
  const users = useAllRows("users");
  const projects = useAllRows("projects");
  const boqLines = useAllRows("boq_lines");
  const workOrders = useAllRows("work_orders");
  const purchaseOrders = useAllRows("purchase_orders");
  const indents = useAllRows("indents");
  const grns = useAllRows("grns");
  const workOrderLines = useAllRows("work_order_lines");
  const comparatives = useAllRows("comparatives");
  const raBills = useAllRows("ra_bills");
  const measurements = useAllRows("joint_measurements");

  return useMemo(() => {
    const byId = <T extends { id: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]));
    const c = byId(contractors);
    const m = byId(materials);
    const s = byId(suppliers);
    const u = byId(users);
    const p = byId(projects);
    const b = byId(boqLines);
    const w = byId(workOrders);
    const po = byId(purchaseOrders);
    const ind = byId(indents);
    const g = byId(grns);
    const wl = byId(workOrderLines);
    const cmp = byId(comparatives);
    const rab = byId(raBills);
    const jm = byId(measurements);

    return {
      contractor: (id: string | null) => (id ? (c.get(id)?.name ?? "—") : "—"),
      material: (id: string | null) => (id ? (m.get(id)?.name ?? "—") : "—"),
      materialCode: (id: string | null) => (id ? (m.get(id)?.code ?? "—") : "—"),
      materialHsn: (id: string | null) => (id ? (m.get(id)?.hsn_code ?? "—") : "—"),
      materialUnit: (id: string | null) => (id ? (m.get(id)?.unit ?? "") : ""),
      supplier: (id: string | null) => (id ? (s.get(id)?.name ?? "—") : "—"),
      supplierState: (id: string | null) => (id ? (s.get(id)?.state ?? "—") : "—"),
      user: (id: string | null) => (id ? (u.get(id)?.full_name ?? "—") : "—"),
      project: (id: string | null) => (id ? (p.get(id)?.name ?? "—") : "—"),
      projectCode: (id: string | null) => (id ? (p.get(id)?.code ?? "—") : "—"),
      boqItem: (id: string | null) => (id ? (b.get(id)?.item_code ?? "—") : "—"),
      boqDescription: (id: string | null) => (id ? (b.get(id)?.description ?? "—") : "—"),
      workOrder: (id: string | null) => (id ? (w.get(id)?.wo_number ?? "—") : "—"),
      workOrderLineDescription: (id: string | null) =>
        id ? (wl.get(id)?.description ?? "—") : "—",
      poNumber: (id: string | null) => (id ? (po.get(id)?.po_number ?? "—") : "—"),
      indentNumber: (id: string | null) => (id ? (ind.get(id)?.indent_number ?? "—") : "—"),
      grnNumber: (id: string | null) => (id ? (g.get(id)?.grn_number ?? "—") : "—"),
      comparativeNumber: (id: string | null) =>
        id ? (cmp.get(id)?.comparative_number ?? "—") : "—",
      raBillNumber: (id: string | null) => (id ? (rab.get(id)?.bill_number ?? "—") : "—"),
      measurementNumber: (id: string | null) =>
        id ? (jm.get(id)?.measurement_number ?? "—") : "—",
      contractorType: (id: string | null) => (id ? (c.get(id)?.type ?? "—") : "—"),
    };
  }, [
    contractors,
    materials,
    suppliers,
    users,
    projects,
    boqLines,
    workOrders,
    purchaseOrders,
    indents,
    grns,
    workOrderLines,
    comparatives,
    raBills,
    measurements,
  ]);
}
