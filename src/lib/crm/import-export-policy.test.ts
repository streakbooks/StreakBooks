import { describe, expect, it } from "vitest";
import { resolveCrmImportExportPolicy } from "@/lib/crm/import-export-policy";

describe("resolveCrmImportExportPolicy", () => {
  it("blocks import/export when backend is not ready", () => {
    const policy = resolveCrmImportExportPolicy({
      hasImportPermission: true,
      hasExportPermission: true,
    });
    expect(policy.canImport).toBe(false);
    expect(policy.canExport).toBe(false);
  });

  it("honours permissions only after backendReady", () => {
    const policy = resolveCrmImportExportPolicy({
      backendReady: true,
      hasImportPermission: true,
      hasExportPermission: false,
    });
    expect(policy.canImport).toBe(true);
    expect(policy.canExport).toBe(false);
  });
});
