"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";

/**
 * The one modal in the app. There are no side sheets: a record and the form
 * that changes it both open centred, over the list the reader came from, so
 * nothing is pushed off-screen and the same shape works on a phone.
 *
 *   sm  420px  a confirmation, a single field
 *   md  560px  an ordinary form
 *   lg  800px  a form with line items
 *   xl 1100px  a full record: trail, fields, lines, activity
 *
 * Header and footer are sticky; only the body scrolls, capped at 90vh.
 */
export type DialogSize = "sm" | "md" | "lg" | "xl";

const SIZE_CLASS: Record<DialogSize, string> = {
  sm: "sm:max-w-[420px]",
  md: "sm:max-w-[560px]",
  lg: "sm:max-w-[800px]",
  xl: "sm:max-w-[1100px]",
};

const DiscardContext = React.createContext<{ requestClose: () => void }>({
  requestClose: () => {},
});

/** Closes the dialog the same way the X does — asking first if the form is dirty. */
export function useDialogClose() {
  return React.useContext(DiscardContext).requestClose;
}

export function AppDialog({
  open,
  onOpenChange,
  size = "md",
  /** When true, closing by Esc, backdrop or X asks before discarding. */
  dirty = false,
  className,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  size?: DialogSize;
  dirty?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [confirmDiscard, setConfirmDiscard] = React.useState(false);

  const requestClose = React.useCallback(() => {
    if (dirty) setConfirmDiscard(true);
    else onOpenChange(false);
  }, [dirty, onOpenChange]);

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (next) return onOpenChange(true);
      requestClose();
    },
    [onOpenChange, requestClose],
  );

  const ctx = React.useMemo(() => ({ requestClose }), [requestClose]);

  return (
    <DiscardContext.Provider value={ctx}>
      <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-foreground/20 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
          <DialogPrimitive.Popup
            data-slot="app-dialog"
            className={cn(
              "fixed top-1/2 left-1/2 z-50 flex max-h-[90vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-popover text-sm text-popover-foreground shadow-pop ring-1 ring-border outline-none duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
              SIZE_CLASS[size],
              className,
            )}
          >
            {children}
          </DialogPrimitive.Popup>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <DiscardPrompt
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        onDiscard={() => {
          setConfirmDiscard(false);
          onOpenChange(false);
        }}
      />
    </DiscardContext.Provider>
  );
}

/** Sticky header: the record's name, one line of context, and the close button. */
export function AppDialogHeader({
  title,
  context,
  right,
  className,
  children,
}: {
  title?: React.ReactNode;
  context?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  const requestClose = useDialogClose();
  return (
    <div
      data-slot="app-dialog-header"
      className={cn(
        "flex shrink-0 items-start gap-3 border-b border-border bg-popover px-5 py-4",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        {title !== undefined ? <AppDialogTitle>{title}</AppDialogTitle> : null}
        {context !== undefined ? (
          <AppDialogDescription>{context}</AppDialogDescription>
        ) : null}
        {children}
      </div>
      {right ? (
        <div className="flex shrink-0 items-center gap-2">{right}</div>
      ) : null}
      <Button
        variant="ghost"
        size="icon-sm"
        className="-mt-1 -mr-1 shrink-0"
        onClick={requestClose}
        aria-label="Close"
      >
        <XIcon />
      </Button>
    </div>
  );
}

/** The record's name. Use inside AppDialogHeader when composing by hand. */
export function AppDialogTitle({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <DialogPrimitive.Title
      className={cn(
        "text-[0.9375rem] leading-snug font-semibold text-foreground",
        className,
      )}
    >
      {children}
    </DialogPrimitive.Title>
  );
}

/** One line of context under the title. */
export function AppDialogDescription({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <DialogPrimitive.Description
      className={cn(
        "mt-0.5 text-xs leading-relaxed text-muted-foreground",
        className,
      )}
    >
      {children}
    </DialogPrimitive.Description>
  );
}

/** The only scrolling region. */
export function AppDialogBody({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      data-slot="app-dialog-body"
      className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-4", className)}
    >
      {children}
    </div>
  );
}

/**
 * Sticky footer. `info` sits left (a running total, a warning); the actions
 * sit right in the app's one hierarchy: ghost, outline, then the primary.
 */
export function AppDialogFooter({
  info,
  className,
  children,
}: {
  info?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      data-slot="app-dialog-footer"
      className={cn(
        "flex shrink-0 flex-col-reverse gap-3 border-t border-border bg-muted/40 px-5 py-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 text-xs text-muted-foreground">{info}</div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {children}
      </div>
    </div>
  );
}

/** Asks before throwing away a part-filled form. Its own root, so it stacks. */
function DiscardPrompt({
  open,
  onOpenChange,
  onDiscard,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDiscard: () => void;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-60 bg-foreground/20" />
        <DialogPrimitive.Popup className="fixed top-1/2 left-1/2 z-60 w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-popover p-5 shadow-pop ring-1 ring-border outline-none sm:max-w-[420px]">
          <DialogPrimitive.Title className="text-[0.9375rem] font-semibold">
            Discard your changes?
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-1.5 text-sm text-muted-foreground">
            What you have typed here has not been saved. Closing now loses it.
          </DialogPrimitive.Description>
          <div className="mt-5 flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Keep editing
            </Button>
            <Button variant="destructive" size="sm" onClick={onDiscard}>
              Discard
            </Button>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
