"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { HydrationGate } from "@/components/common";
import { PoEditor } from "@/components/purchase/po-editor";
import { useProjectId, useProjectRows } from "@/lib/hooks";
import type { PurchaseOrder } from "@/lib/domain";

/** Editing a draft purchase order. Anything issued is amended, not edited. */
export default function EditPurchaseOrderPage() {
  const projectId = useProjectId();
  const params = useParams<{ poId: string }>();
  const rows = useProjectRows("purchase_orders", projectId) as PurchaseOrder[];
  const po = rows.find((p) => p.id === params?.poId);
  const backHref = `/projects/${projectId}/procurement/purchase-orders`;

  return (
    <HydrationGate>
      {!po ? (
        <Card className="px-6 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            That purchase order is not on this project.{" "}
            <Link href={backHref} className="underline underline-offset-4">
              Back to purchase orders
            </Link>
          </p>
        </Card>
      ) : po.status !== "draft" ? (
        <Card className="px-6 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            <span className="font-mono">{po.po_number}</span> has left draft, so it is amended rather
            than edited — an issued order is a document the supplier holds us to.{" "}
            <Link href={backHref} className="underline underline-offset-4">
              Back to purchase orders
            </Link>
          </p>
        </Card>
      ) : (
        <PoEditor projectId={projectId} existing={po} />
      )}
    </HydrationGate>
  );
}
