import { describe, expect, it } from "vitest";
import {
  DEFAULT_DOCUMENT_LINE_ROWS,
  createEmptyDocumentLines,
} from "@/lib/ui/document-line-defaults";

describe("document-line-defaults", () => {
  it("creates two empty rows by default", () => {
    const rows = createEmptyDocumentLines(() => ({ id: "x" }));
    expect(rows).toHaveLength(DEFAULT_DOCUMENT_LINE_ROWS);
    expect(DEFAULT_DOCUMENT_LINE_ROWS).toBe(2);
  });
});
