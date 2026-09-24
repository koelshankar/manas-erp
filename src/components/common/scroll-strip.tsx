"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "cn";

/**
 * One horizontally scrolling row that never wraps.
 *
 * Tab strips wrapped to three rows on a phone because `flex-wrap` beat
 * `overflow-x-auto` (audit S1); this owns the behaviour instead of leaving it
 * to whoever writes the next strip. It fades whichever edge has more content
 * beyond it, and scrolls the active item into view on mount so the tab you are
 * on is never the one clipped off the right (audit S2).
 */
export function ScrollStrip({
  children,
  className,
  /** Selector for the item to bring into view on mount. */
  activeSelector = "[data-active='true']",
}: {
  children: ReactNode;
  className?: string;
  activeSelector?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges({ start: el.scrollLeft > 4, end: max > 4 && el.scrollLeft < max - 4 });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const active = el.querySelector(activeSelector);
    // `nearest` keeps the page still: `center` would scroll the whole window.
    active?.scrollIntoView({ block: "nearest", inline: "nearest" });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [activeSelector, measure, children]);

  return (
    <div className="relative min-w-0">
      <div
        ref={ref}
        onScroll={measure}
        className={cn(
          "flex flex-nowrap overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          className,
        )}
      >
        {children}
      </div>
      <Fade side="left" show={edges.start} />
      <Fade side="right" show={edges.end} />
    </div>
  );
}

/** Says "there is more this way" without taking a row of its own. */
function Fade({ side, show }: { side: "left" | "right"; show: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-y-0 w-8 transition-opacity duration-150",
        side === "left"
          ? "left-0 bg-gradient-to-r from-background to-transparent"
          : "right-0 bg-gradient-to-l from-background to-transparent",
        show ? "opacity-100" : "opacity-0",
      )}
    />
  );
}
