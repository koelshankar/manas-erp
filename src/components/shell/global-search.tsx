"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import {
  scopeFor,
  searchRecords,
  type SearchHit,
} from "@/lib/services/queries";
import { useSession } from "@/lib/session";
import { Input } from "@/components/ui/input";

/**
 * Cmd/Ctrl+K. Document numbers first, then the masters.
 *
 * Scoped by the user's posting like every other read, so a Site Engineer
 * cannot find another site's purchase order by typing its number.
 */
export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [cursor, setCursor] = useState(0);
  const { user } = useSession();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) {
      setTerm("");
      setHits([]);
      setCursor(0);
    }
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    if (!user || term.trim().length < 2) {
      setHits([]);
      return;
    }
    searchRecords(scopeFor(user), term).then((rows) => {
      if (!cancelled) {
        setHits(rows);
        setCursor(0);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [term, user]);

  const grouped = useMemo(() => {
    const out = new Map<string, SearchHit[]>();
    hits.forEach((h) => out.set(h.kind, [...(out.get(h.kind) ?? []), h]));
    return [...out.entries()];
  }, [hits]);

  function go(hit: SearchHit) {
    setOpen(false);
    router.push(hit.href);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search"
        className="flex h-8 items-center gap-2 rounded-lg border border-border px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <Search className="size-3.5" />
        <span className="hidden lg:inline">Search</span>
        <kbd className="num hidden rounded border border-border px-1 text-[10px] lg:inline">
          ⌘K
        </kbd>
      </button>

      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-foreground/20 supports-backdrop-filter:backdrop-blur-xs" />
          <DialogPrimitive.Popup
            initialFocus={inputRef}
            className="fixed top-[12vh] left-1/2 z-50 flex max-h-[70vh] w-[calc(100vw-2rem)] -translate-x-1/2 flex-col overflow-hidden rounded-2xl bg-popover shadow-pop ring-1 ring-border outline-none sm:max-w-[560px]"
          >
            <DialogPrimitive.Title className="sr-only">
              Search
            </DialogPrimitive.Title>
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <Input
                ref={inputRef}
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setCursor((c) => Math.min(c + 1, hits.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setCursor((c) => Math.max(c - 1, 0));
                  } else if (e.key === "Enter" && hits[cursor]) {
                    go(hits[cursor]);
                  }
                }}
                placeholder="Document number, material, supplier or contractor"
                className="h-8 border-0 px-0 shadow-none focus-visible:border-0 focus-visible:ring-0"
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto py-2">
              {term.trim().length < 2 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                  Type at least two characters — try a document number like
                  0042, or a material.
                </p>
              ) : hits.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                  Nothing matches “{term}” in the projects you are posted to.
                </p>
              ) : (
                grouped.map(([kind, rows]) => (
                  <div key={kind} className="mb-1">
                    <p className="px-4 py-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                      {kind}
                    </p>
                    {rows.map((hit) => {
                      const index = hits.indexOf(hit);
                      return (
                        <button
                          key={`${kind}-${hit.id}`}
                          type="button"
                          onMouseEnter={() => setCursor(index)}
                          onClick={() => go(hit)}
                          className={`flex w-full items-baseline gap-3 px-4 py-2 text-left text-sm ${
                            index === cursor ? "bg-muted" : ""
                          }`}
                        >
                          <span className="font-medium text-foreground">
                            {hit.title}
                          </span>
                          {hit.subtitle ? (
                            <span className="truncate text-xs text-muted-foreground">
                              {hit.subtitle}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </DialogPrimitive.Popup>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
