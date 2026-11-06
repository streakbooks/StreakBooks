import { describe, expect, it } from "vitest";
import {
  fileFormatMimeTypes,
  filePreviewKind,
  fileSortOrder,
  parseFileFormat,
  parseFileSort,
  validateFileRename,
} from "./file-workspace";

describe("Files workspace", () => {
  it("allows only known sort columns and keeps a stable default", () => {
    expect(parseFileSort("name")).toBe("name");
    expect(parseFileSort("largest")).toBe("largest");
    expect(parseFileSort("company_id")).toBe("newest");
    expect(parseFileSort(null)).toBe("newest");
    expect(fileSortOrder("name")).toEqual({ column: "file_name", ascending: true });
    expect(fileSortOrder("largest")).toEqual({ column: "size_bytes", ascending: false });
    expect(fileSortOrder("oldest")).toEqual({ column: "created_at", ascending: true });
  });

  it("previews supported files only when MIME and extension agree", () => {
    expect(filePreviewKind("application/pdf", "bill.pdf")).toBe("pdf");
    expect(filePreviewKind("image/jpeg", "photo.JPEG")).toBe("image");
    expect(filePreviewKind("text/plain; charset=utf-8", "notes.txt")).toBe("text");
    expect(filePreviewKind("text/csv", "ledger.csv")).toBe("text");
    expect(filePreviewKind("text/html", "invoice.html")).toBeNull();
    expect(filePreviewKind("image/svg+xml", "invoice.svg")).toBeNull();
    expect(filePreviewKind("application/pdf", "invoice.html")).toBeNull();
    expect(filePreviewKind(null, "invoice.pdf")).toBeNull();
  });
  it("restricts filters to named MIME groups", () => {
    expect(parseFileFormat("pdf")).toBe("pdf");
    expect(parseFileFormat("images")).toBe("images");
    expect(parseFileFormat("file_name")).toBe("all");
    expect(parseFileFormat(undefined)).toBe("all");
    expect(fileFormatMimeTypes("all")).toEqual([]);
    expect(fileFormatMimeTypes("pdf")).toEqual(["application/pdf"]);
    expect(fileFormatMimeTypes("spreadsheets")).toContain("text/csv");
    expect(fileFormatMimeTypes("word")).toContain(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(fileFormatMimeTypes("images")).toContain("image/webp");
    expect(fileFormatMimeTypes("text")).toEqual(["text/plain"]);
  });

  it("permits metadata-only renaming while preserving the file format", () => {
    expect(validateFileRename("receipt.PDF", "October receipt.pdf")).toBe("October receipt.pdf");
    expect(validateFileRename("backup", "New backup")).toBe("New backup");
    expect(validateFileRename("report.csv", "  report-final.csv  ")).toBe("report-final.csv");
    expect(() => validateFileRename("report.csv", "report.pdf")).toThrow("extension");
    expect(() => validateFileRename("report.csv", "../report.csv")).toThrow("valid file name");
    expect(() => validateFileRename("report.csv", "report\\evil.csv")).toThrow("valid file name");
    expect(() => validateFileRename("report.csv", "a\u202e.pdf.csv")).toThrow("valid file name");
    expect(() => validateFileRename("report.csv", "  ")).toThrow("valid file name");
    expect(() => validateFileRename("report.csv", "x".repeat(256) + ".csv")).toThrow("valid file name");
  });
});
