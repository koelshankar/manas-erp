"use client";

import { HydrationGate } from "@/components/common";
import { PoEditor } from "@/components/purchase/po-editor";
import { useProjectId } from "@/lib/hooks";

/** B3 — a new purchase order, full page. */
export default function NewPurchaseOrderPage() {
  const projectId = useProjectId();
  return (
    <HydrationGate>
      <PoEditor projectId={projectId} />
    </HydrationGate>
  );
}
