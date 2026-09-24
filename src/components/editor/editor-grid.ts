"use client";

import { useCallback, type KeyboardEvent } from "react";

/**
 * Keyboard for a line grid.
 *
 * Tab still moves across fields — never trapped, because that is the one key
 * every data-entry clerk relies on. On top of it:
 *
 *   Enter       adds a row (and focuses its first cell)
 *   ↑ / ↓       move down the same column
 *   ← / →       move across a row, but only from the ends of the text, so
 *               they still work inside a half-typed number
 *
 * Cells are found by their `data-cell="<row>:<col>"` attribute rather than by
 * refs, so a grid can add and remove rows without re-wiring anything.
 */
export function useGridKeys(onAddRow?: () => void) {
  const focusCell = useCallback((row: number, col: number) => {
    const el = document.querySelector<HTMLElement>(`[data-cell="${row}:${col}"]`);
    if (!el) return false;
    el.focus();
    if (el instanceof HTMLInputElement) el.select();
    return true;
  }, []);

  return useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      const target = event.target as HTMLElement;
      const cell = target.dataset.cell;
      if (!cell) return;
      const [row, col] = cell.split(":").map(Number);

      if (event.key === "Enter" && onAddRow) {
        event.preventDefault();
        onAddRow();
        // The new row lands after this render.
        requestAnimationFrame(() => focusCell(row + 1, 0));
        return;
      }

      if (event.key === "ArrowDown") {
        if (focusCell(row + 1, col)) event.preventDefault();
        return;
      }
      if (event.key === "ArrowUp") {
        if (focusCell(row - 1, col)) event.preventDefault();
        return;
      }

      // Horizontal arrows belong to the text until the caret reaches its end.
      const input = target as HTMLInputElement;
      const atStart = input.selectionStart === 0 && input.selectionEnd === 0;
      const atEnd =
        input.selectionStart === input.value?.length && input.selectionEnd === input.value?.length;

      if (event.key === "ArrowRight" && (atEnd || input.value === undefined)) {
        if (focusCell(row, col + 1)) event.preventDefault();
      } else if (event.key === "ArrowLeft" && (atStart || input.value === undefined)) {
        if (focusCell(row, col - 1)) event.preventDefault();
      }
    },
    [focusCell, onAddRow],
  );
}

/** The attributes every grid cell needs for the keys above to find it. */
export function cellProps(row: number, col: number) {
  return { "data-cell": `${row}:${col}` } as const;
}
