import Link from "next/link";
import { ChevronRight } from "lucide-react";

/**
 * The breadcrumb an editor keeps.
 *
 * List pages inside the project workspace drop theirs because the tab strips
 * already say where they are (audit C3); an editor has no tab strip, so this
 * is the only way back.
 */
export function Breadcrumbish({ crumbs }: { crumbs: Array<{ label: string; href?: string }> }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs">
      {crumbs.map((c, i) => (
        <span key={`${c.label}-${i}`} className="flex items-center gap-1">
          {i > 0 ? <ChevronRight className="size-3 text-muted-foreground/60" aria-hidden /> : null}
          {c.href && i < crumbs.length - 1 ? (
            <Link
              href={c.href}
              className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {c.label}
            </Link>
          ) : (
            <span
              className={i === crumbs.length - 1 ? "font-medium text-foreground" : "text-muted-foreground"}
              aria-current={i === crumbs.length - 1 ? "page" : undefined}
            >
              {c.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
