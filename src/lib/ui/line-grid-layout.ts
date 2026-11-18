/**
 * Shared column width styles for spreadsheet transaction grids.
 * Fluid columns absorb leftover container width so tables fill 100%.
 */
export function lineGridColumnStyle(options: {
  widthPx?: number;
  minWidthPx?: number;
  fluid?: boolean;
}): { width?: number | "auto"; minWidth: number } {
  const min = options.minWidthPx ?? options.widthPx ?? 72;
  if (options.fluid) {
    return { minWidth: min, width: "auto" };
  }
  if (options.widthPx != null) {
    return { width: options.widthPx, minWidth: min };
  }
  return { minWidth: min };
}

export function lineGridTableMinWidth(
  columns: ReadonlyArray<{ widthPx?: number; minWidthPx?: number; fluid?: boolean }>,
): number {
  return columns.reduce((sum, column) => {
    if (column.fluid) return sum + (column.minWidthPx ?? column.widthPx ?? 160);
    return sum + (column.widthPx ?? column.minWidthPx ?? 100);
  }, 0);
}
