import type { ReactNode } from "react";
import { cn } from "cn";

/** Label + control + optional hint, used by every dialog in the thread. */
export function Field({
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 flex items-center gap-1 text-xs font-medium text-foreground">
        {label}
        {required ? <span className="text-destructive">*</span> : null}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-destructive">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </label>
  );
}

/** Amber advisory that does not block submission. */
export function Warning({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs leading-relaxed text-warning ring-1 ring-warning/30">
      {children}
    </p>
  );
}
