"use client";

import { useEffect, useRef, useState } from "react";
import { now } from "@/lib/clock";

const INTERVAL_MS = 20_000;

/**
 * Autosaves a draft every twenty seconds while it is dirty.
 *
 * A full-page editor holds several minutes of typing, and losing it to a
 * closed tab is the kind of thing people never forgive an ERP for. The
 * indicator is deliberately a timestamp rather than a spinner — "Saved 12:04"
 * tells the reader how much they stand to lose; "Saving…" does not.
 */
export function useAutosave(
  dirty: boolean,
  save: () => Promise<void> | void,
): { savedAt: string | null; saving: boolean; saveNow: () => void } {
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Held in a ref so a changing closure never restarts the interval.
  const latest = useRef(save);
  latest.current = save;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const run = useRef(async () => {
    if (!dirtyRef.current) return;
    setSaving(true);
    try {
      await latest.current();
      setSavedAt(now());
    } finally {
      setSaving(false);
    }
  });

  useEffect(() => {
    const id = window.setInterval(() => void run.current(), INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  return { savedAt, saving, saveNow: () => void run.current() };
}
