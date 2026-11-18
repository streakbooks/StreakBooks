import { describe, expect, it } from "vitest";
import {
  assertVersionHistory,
  MAX_FILE_VERSIONS,
  validateVersionReplacement,
} from "./file-versions";

describe("Files immutable versioning", () => {
  it("allows supported replacements with the same file extension", () => {
    expect(validateVersionReplacement(
      "June invoice.pdf",
      { name: "Corrected - June.PDF", size: 1024, type: "application/pdf" },
      1,
    )).toEqual({
      fileName: "Corrected - June.PDF",
      contentType: "application/pdf",
      sizeBytes: 1024,
    });
  });

  it("rejects format changes, unsafe names, missing MIME and malformed versions", () => {
    expect(() => validateVersionReplacement(
      "invoice.pdf",
      { name: "invoice.docx", size: 100, type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
      1,
    )).toThrow("Keep the original file extension");
    expect(() => validateVersionReplacement(
      "invoice.pdf", { name: "../invoice.pdf", size: 100, type: "application/pdf" }, 1,
    )).toThrow("valid file name");
    expect(() => validateVersionReplacement(
      "invoice.pdf", { name: "new.pdf", size: 100, type: "" }, 1,
    )).toThrow("recognized content type");
    expect(() => validateVersionReplacement(
      "invoice.pdf", { name: "new.pdf", size: 0, type: "application/pdf" }, 1,
    )).toThrow("1 byte");
    expect(() => validateVersionReplacement(
      "invoice.pdf", { name: "new.pdf", size: 20 * 1024 * 1024 + 1, type: "application/pdf" }, 1,
    )).toThrow("20 MB");
    expect(() => validateVersionReplacement(
      "invoice.pdf", { name: "new.pdf", size: 100, type: "application/pdf" }, 0,
    )).toThrow("Invalid document version");
  });

  it("caps uploaded versions without deleting earlier evidence", () => {
    expect(MAX_FILE_VERSIONS).toBe(50);
    expect(() => validateVersionReplacement(
      "invoice.pdf", { name: "invoice.pdf", size: 100, type: "application/pdf" }, 50,
    )).toThrow("50-version limit");
    expect(validateVersionReplacement(
      "invoice.pdf", { name: "invoice.pdf", size: 100, type: "application/pdf" }, 49,
    ).sizeBytes).toBe(100);
  });

  it("accepts complete history independent of display order", () => {
    expect(() => assertVersionHistory([{ version: 3 }, { version: 2 }, { version: 1 }], 3))
      .not.toThrow();
    expect(() => assertVersionHistory([{ version: 1 }], 1)).not.toThrow();
  });

  it("fails closed on gaps, duplicates, invalid count or missing rows", () => {
    expect(() => assertVersionHistory([{ version: 2 }, { version: 1 }], 3))
      .toThrow("incomplete");
    expect(() => assertVersionHistory([{ version: 2 }, { version: 2 }], 2))
      .toThrow("missing or duplicate");
    expect(() => assertVersionHistory([{ version: 0 }, { version: 2 }], 2))
      .toThrow("missing or duplicate");
    expect(() => assertVersionHistory([], 1)).toThrow("incomplete");
    expect(() => assertVersionHistory([{ version: 1 }], 51))
      .toThrow("Invalid current file version");
  });
});
