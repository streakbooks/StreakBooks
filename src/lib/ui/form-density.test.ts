import { describe, expect, it } from "vitest";
import { FORM_DENSITY } from "@/lib/ui/form-density";
import { DEFAULT_DOCUMENT_LINE_ROWS } from "@/lib/ui/document-line-defaults";

describe("form density contract", () => {
  it("keeps control heights in the premium acceptance band", () => {
    expect(FORM_DENSITY.controlHeightMin).toBe(36);
    expect(FORM_DENSITY.controlHeightMax).toBe(40);
    expect(FORM_DENSITY.tableControlHeightMin).toBeGreaterThanOrEqual(30);
    expect(FORM_DENSITY.tableControlHeightMax).toBeLessThanOrEqual(34);
    expect(FORM_DENSITY.primaryButtonMax).toBe(40);
  });

  it("constrains contact and date preferred widths", () => {
    expect(FORM_DENSITY.contactWidthMin).toBe(280);
    expect(FORM_DENSITY.contactWidthMax).toBe(420);
    expect(FORM_DENSITY.dateWidthMin).toBe(150);
    expect(FORM_DENSITY.dateWidthMax).toBe(180);
    expect(FORM_DENSITY.moneyWidthMax).toBeLessThanOrEqual(160);
  });

  it("defaults new documents to two empty line rows", () => {
    expect(DEFAULT_DOCUMENT_LINE_ROWS).toBe(2);
    expect(DEFAULT_DOCUMENT_LINE_ROWS).toBeLessThanOrEqual(5);
  });
});
