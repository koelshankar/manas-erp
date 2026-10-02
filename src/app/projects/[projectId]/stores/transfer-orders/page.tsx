"use client";

import { StubPage } from "@/components/common";
import { ArrowLeftRight } from "lucide-react";

/** Stock moving between the company's own sites. */
export default function TransferOrdersPage() {
  return (
    <StubPage
      resource="transfer_orders"
      description="Stock moved between sites, and what is in transit."
      message="Nothing has been transferred. A transfer order moves stock from this store to another project's, issuing it here and receiving it there against the same document."
      icon={ArrowLeftRight}
    />
  );
}
