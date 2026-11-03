import type { CSSProperties } from "react";
import type { DocumentBranding } from "../types";
import { normalizeTheme } from "./contracts";
import { safeAccentColor, readableTextOn } from "../helpers";
export function themePresentation(branding: DocumentBranding) {
  const c = normalizeTheme(branding.layout);
  const accent = safeAccentColor(branding.accentColor);
  const header = c.table_header_color ?? accent;
  const style = {
    "--doc-accent": accent,
    "--doc-secondary": c.secondary_color ?? "#F3F4F6",
    "--doc-heading": c.heading_color ?? "#111827",
    "--doc-text": c.text_color ?? "#111827",
    "--doc-bg": c.background_color ?? "#FFFFFF",
    "--doc-table-header": header,
    "--doc-table-text": readableTextOn(header),
    "--doc-font-size": `${c.font_size}px`,
    "--doc-heading-size": `${c.heading_size}px`,
    "--doc-line-height": c.line_height,
    "--doc-cell-padding": `${c.cell_padding}px`,
    "--doc-body-weight": c.body_weight,
    "--doc-heading-weight": c.heading_weight,
    fontFamily: {
      sans: "Arial, Helvetica, sans-serif",
      serif: "Georgia, 'Times New Roman', serif",
      mono: "'Courier New', monospace",
    }[c.font_family],
    width: `${c.orientation === "portrait" ? (c.page_size === "A4" ? 210 : 215.9) : c.page_size === "A4" ? 297 : 279.4}mm`,
    maxWidth: "100%",
    padding: `${c.margin_mm}mm`,
  } as CSSProperties;
  return {
    config: c,
    style,
    pageCss: `@media print { @page { size: ${c.page_size} ${c.orientation}; margin: ${c.margin_mm}mm; } }`,
  };
}
