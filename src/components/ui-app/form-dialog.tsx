"use client";

import * as React from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AppDialog,
  AppDialogBody,
  AppDialogFooter,
  AppDialogHeader,
  type DialogSize,
} from "./app-dialog";

/**
 * Every form in the app.
 *
 * The submit button is disabled while the form is invalid, and says why on
 * hover — a greyed-out button with no explanation is the single most common
 * dead end in an ERP.
 */
export function FormDialog({
  open,
  onOpenChange,
  size = "md",
  title,
  context,
  dirty = false,
  /** Why the form cannot be submitted yet. Undefined means it can. */
  invalidReason,
  submitLabel = "Save",
  submitting = false,
  onSubmit,
  onSaveDraft,
  saveDraftLabel = "Save draft",
  footerInfo,
  className,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  size?: DialogSize;
  title: React.ReactNode;
  context?: React.ReactNode;
  dirty?: boolean;
  invalidReason?: string;
  submitLabel?: string;
  submitting?: boolean;
  onSubmit: () => void;
  onSaveDraft?: () => void;
  saveDraftLabel?: string;
  footerInfo?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const invalid = Boolean(invalidReason);

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      size={size}
      dirty={dirty && !submitting}
    >
      <AppDialogHeader title={title} context={context} />
      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          if (!invalid && !submitting) onSubmit();
        }}
      >
        <AppDialogBody className={cn("space-y-5", className)}>
          {children}
        </AppDialogBody>
        <AppDialogFooter info={footerInfo}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          {onSaveDraft ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onSaveDraft}
            >
              {saveDraftLabel}
            </Button>
          ) : null}
          <SubmitButton
            label={submitLabel}
            invalidReason={invalidReason}
            submitting={submitting}
          />
        </AppDialogFooter>
      </form>
    </AppDialog>
  );
}

/**
 * A primary action that says why it cannot be used.
 *
 * A greyed-out button with no explanation is the most common dead end in an
 * ERP (audit C7). Every disabled primary action in the app goes through this,
 * whether it sits in a `FormDialog` footer or a hand-built one.
 */
export function SubmitButton({
  label,
  invalidReason,
  submitting = false,
  busyLabel = "Saving\u2026",
  type = "submit",
  onClick,
  children,
}: {
  label?: string;
  /** Why the action cannot be taken yet. Undefined means it can. */
  invalidReason?: string;
  submitting?: boolean;
  busyLabel?: string;
  type?: "button" | "submit";
  onClick?: () => void;
  /** Icon plus label, where a caller wants more than a word. */
  children?: React.ReactNode;
}) {
  const button = (
    <Button
      type={type}
      size="sm"
      onClick={onClick}
      disabled={Boolean(invalidReason) || submitting}
    >
      {submitting ? busyLabel : (children ?? label)}
    </Button>
  );

  if (!invalidReason) return button;
  return (
    <Tooltip>
      {/* A disabled button swallows pointer events, so the trigger wraps it. */}
      <TooltipTrigger
        render={<span className="inline-flex cursor-not-allowed" />}
      >
        {button}
      </TooltipTrigger>
      <TooltipContent>{invalidReason}</TooltipContent>
    </Tooltip>
  );
}

/** One field's inline validation message, under the control it belongs to. */
export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return <p className="mt-1 text-xs text-destructive">{children}</p>;
}
