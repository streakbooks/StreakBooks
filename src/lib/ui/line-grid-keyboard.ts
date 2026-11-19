/**
 * Spreadsheet-like keyboard helpers for editable line grids.
 * Pure helpers — wire from grid cell keydown handlers. Does not mutate accounting values.
 */

export type LineGridKeyAction =
  { type: "move"; rowDelta: number; colDelta: number } | { type: "add-row" } | { type: "none" };

/** Interpret common spreadsheet keys for a focused cell. */
export function interpretLineGridKey(
  key: string,
  options: {
    shiftKey?: boolean;
    atLastRow?: boolean;
    atLastCol?: boolean;
    allowAddRowOnEnter?: boolean;
  } = {},
): LineGridKeyAction {
  const {
    shiftKey = false,
    atLastRow = false,
    atLastCol = false,
    allowAddRowOnEnter = true,
  } = options;

  if (key === "Tab") {
    if (shiftKey) return { type: "move", rowDelta: 0, colDelta: -1 };
    if (atLastCol) return { type: "move", rowDelta: 1, colDelta: 0 };
    return { type: "move", rowDelta: 0, colDelta: 1 };
  }

  if (key === "Enter") {
    if (allowAddRowOnEnter && atLastRow) return { type: "add-row" };
    return { type: "move", rowDelta: shiftKey ? -1 : 1, colDelta: 0 };
  }

  if (key === "ArrowDown") return { type: "move", rowDelta: 1, colDelta: 0 };
  if (key === "ArrowUp") return { type: "move", rowDelta: -1, colDelta: 0 };
  // Left/right arrows are left to native caret movement inside text inputs.

  return { type: "none" };
}

/** Clamp a row/column index into a rectangular grid. */
export function clampGridFocus(
  row: number,
  col: number,
  rowCount: number,
  colCount: number,
): { row: number; col: number } {
  if (rowCount <= 0 || colCount <= 0) return { row: 0, col: 0 };
  let nextRow = row;
  let nextCol = col;
  if (nextCol < 0) {
    nextRow -= 1;
    nextCol = colCount - 1;
  } else if (nextCol >= colCount) {
    nextRow += 1;
    nextCol = 0;
  }
  nextRow = Math.max(0, Math.min(rowCount - 1, nextRow));
  nextCol = Math.max(0, Math.min(colCount - 1, nextCol));
  return { row: nextRow, col: nextCol };
}
