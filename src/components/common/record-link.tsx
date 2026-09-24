import Link from "next/link";
import { cn } from "cn";

/**
 * A plain link to an upstream or downstream record. The styled record trail
 * comes later; for now every foreign key on screen is at least clickable.
 */
export function RecordLink({
  href,
  label,
  className,
}: {
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "font-mono text-xs text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground",
        className,
      )}
    >
      {label}
    </Link>
  );
}

/** The same thing when there is nothing to link to. */
export function RecordRef({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return <span className={cn("font-mono text-xs", className)}>{label}</span>;
}

/** Labelled row used inside detail sheets. */
export function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <dt className="shrink-0 text-xs tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="min-w-0 text-right text-sm text-foreground">{children}</dd>
    </div>
  );
}
