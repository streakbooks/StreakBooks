/**
 * Premium form density contract (Batch 40).
 * Heights/widths are CSS tokens in `styles.css`; these constants document the
 * acceptance band for tests and shared shells.
 */
export const FORM_DENSITY = {
  /** Standard input / select / button height (px). */
  controlHeightMin: 36,
  controlHeightMax: 40,
  /** Compact spreadsheet cell control height (px). */
  tableControlHeightMin: 30,
  tableControlHeightMax: 34,
  /** Primary button height ceiling (px). */
  primaryButtonMax: 40,
  /** Supplier / customer selector preferred width (px). */
  contactWidthMin: 280,
  contactWidthMax: 420,
  /** Date field preferred width (px). */
  dateWidthMin: 150,
  dateWidthMax: 180,
  /** Currency / quantity preferred width (px). */
  moneyWidthMin: 100,
  moneyWidthMax: 160,
  /** Field gap band (px). */
  fieldGapMin: 12,
  fieldGapMax: 16,
  /** Standard table row height band (px). */
  tableRowMin: 36,
  tableRowMax: 44,
} as const;

export type FormControlWidth = "contact" | "date" | "money" | "currency" | "full" | "default";
