"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  AppDialog,
  AppDialogBody,
  AppDialogFooter,
  AppDialogHeader,
} from "./app-dialog";

/**
 * Confirmation, stated as the consequence rather than the verb.
 *
 * "This posts 120 bags of Cement to Manas Sapphire stock and marks
 * MSP/PO/26-27/0042 partially received" — never "Are you sure?". The reader is
 * about to move stock and money; they deserve to be told which.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  consequence,
  confirmLabel = "Confirm",
  tone = "default",
  submitting = false,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  consequence: React.ReactNode;
  confirmLabel?: string;
  /** `destructive` for reject, delete and anything that cannot be undone. */
  tone?: "default" | "destructive";
  submitting?: boolean;
  onConfirm: () => void;
  children?: React.ReactNode;
}) {
  return (
    <AppDialog open={open} onOpenChange={onOpenChange} size="sm">
      <AppDialogHeader title={title} />
      <AppDialogBody className="space-y-4">
        <p className="text-sm leading-relaxed text-muted-foreground">
          {consequence}
        </p>
        {children}
      </AppDialogBody>
      <AppDialogFooter>
        <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant={tone === "destructive" ? "destructive" : "default"}
          disabled={submitting}
          onClick={onConfirm}
        >
          {submitting ? "Working…" : confirmLabel}
        </Button>
      </AppDialogFooter>
    </AppDialog>
  );
}
