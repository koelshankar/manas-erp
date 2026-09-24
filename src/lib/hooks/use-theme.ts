"use client";

import { useCallback, useEffect, useState } from "react";

export type ThemeChoice = "light" | "dark";

const STORAGE_KEY = "manas-erp-theme";

/**
 * The light/dark choice, kept on `<html class="dark">`.
 *
 * `ThemeScript` has already applied the stored choice before paint, so this
 * reads the class back rather than deciding again — which keeps the first
 * client render in step with the server markup.
 */
export function useTheme(): { theme: ThemeChoice; setTheme: (t: ThemeChoice) => void; toggle: () => void } {
  const [theme, setThemeState] = useState<ThemeChoice>("light");

  useEffect(() => {
    setThemeState(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  const setTheme = useCallback((next: ThemeChoice) => {
    setThemeState(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Blocked storage only costs us the memory of the choice.
    }
  }, []);

  const toggle = useCallback(
    () => setTheme(document.documentElement.classList.contains("dark") ? "light" : "dark"),
    [setTheme],
  );

  return { theme, setTheme, toggle };
}
