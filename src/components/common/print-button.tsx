"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Prints whatever is marked `data-print-area` on the page.
 *
 * A comparative, a measurement sheet and a ledger statement all get signed on
 * paper and filed; the PO and the RA bill already printed, and the rest had no
 * way out of the screen at all (audit, group 12).
 */
export function PrintButton({
  label = "Print",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      className={className}
      data-print-hide
      onClick={() => window.print()}
    >
      <Printer className="size-3.5" /> {label}
    </Button>
  );
}
