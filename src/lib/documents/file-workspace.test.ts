import { describe, expect, it } from "vitest";
import {
  combinePossibleDuplicateFlags,
  fileFormatMimeTypes,
  fileListProjection,
  filePreviewKind,
  internalFileUrl,
  lastFilePage,
  safeFilePage,
  fileSortOrder,
  parseFileFormat,
  parseFileSort,
  repeatedUploadFlags,
  selectUploadIndexes,
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
  it("copies only a private application file route, never a Storage URL", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    expect(internalFileUrl("https://books.example.com/", id)).toBe(
      "https://books.example.com/files?file=123e4567-e89b-12d3-a456-426614174000",
    );
    expect(() => internalFileUrl("https://books.example.com/", "javascript:alert(1)")).toThrow(
      "Invalid file identifier",
    );
    expect(() => internalFileUrl("file:///tmp/app", id)).toThrow("Invalid application origin");
  });

  it("bounds input page offsets and clamps empty pages after file deletions", () => {
    expect(safeFilePage(undefined)).toBe(0);
    expect(safeFilePage(-1)).toBe(0);
    expect(safeFilePage(NaN)).toBe(0);
    expect(safeFilePage(Infinity)).toBe(0);
    expect(safeFilePage("1000000000")).toBe(1000);
    expect(safeFilePage("2")).toBe(2);
    expect(safeFilePage(2.5)).toBe(0);
    expect(lastFilePage(0, 25)).toBe(0);
    expect(lastFilePage(1, 25)).toBe(0);
    expect(lastFilePage(25, 25)).toBe(0);
    expect(lastFilePage(26, 25)).toBe(1);
    expect(lastFilePage(51, 25)).toBe(2);
    expect(lastFilePage(-1, 25)).toBe(0);
    expect(lastFilePage(25, 0)).toBe(0);
  });

  it("uses RLS-aware tag relationship joins without huge in-list URLs", () => {
    const base = "id, company_id, file_name";
    expect(fileListProjection(base, null)).toBe(base);
    expect(fileListProjection(base, "123e4567-e89b-12d3-a456-426614174000")).toBe(
      "id, company_id, file_name, tag_match:document_attachment_tags!inner(tag_id)",
    );
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

  it("combines existing-visible and within-batch possible duplicates by file order", () => {
    expect(combinePossibleDuplicateFlags([false, true, false], [true, false, false])).toEqual([
      true,
      true,
      false,
    ]);
    expect(() => combinePossibleDuplicateFlags([false, true], [true])).toThrow("incomplete");
  });

  it("flags repeated names and sizes within a single upload batch", () => {
    const flags = repeatedUploadFlags([
      { name: "Bill.PDF", size: 120 },
      { name: "bill.pdf", size: 120 },
      { name: "bill.pdf", size: 121 },
      { name: "Other.pdf", size: 120 },
      { name: " BILL.pdf ", size: 120 },
    ]);
    expect(flags).toEqual([false, true, false, false, true]);
    expect(selectUploadIndexes(flags, false)).toEqual([0, 2, 3]);
    expect(selectUploadIndexes(flags, true)).toEqual([0, 1, 2, 3, 4]);
    expect(selectUploadIndexes([true, true], false)).toEqual([]);
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
