import { describe, expect, it } from "vitest";
import { navItems } from "@/lib/nav";
import {
  MODULE_REGISTRY,
  assertRegistryMatchesNav,
  getModuleById,
  getModuleByPath,
} from "@/lib/modules/registry";
import {
  isKnownDomainStatus,
  peekUnmappedStatuses,
  resolveDomainStatus,
} from "@/lib/modules/status-semantics";

describe("MODULE_REGISTRY", () => {
  it("stays synchronized with sidebar navItems", () => {
    expect(assertRegistryMatchesNav()).toEqual([]);
    expect(MODULE_REGISTRY.filter((module) => module.inSidebar)).toHaveLength(navItems.length);
  });

  it("has unique stable ids", () => {
    const ids = MODULE_REGISTRY.map((module) => module.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("resolves known modules by id and path", () => {
    expect(getModuleById("banking")?.path).toBe("/banking");
    expect(getModuleByPath("/sales")?.id).toBe("sales");
  });
});

describe("domain status semantics", () => {
  it("never treats unknown statuses as success/paid", () => {
    const result = resolveDomainStatus("totally_invented_status_xyz");
    expect(result.unmapped).toBe(true);
    expect(result.tone).toBe("neutral");
    expect(peekUnmappedStatuses()).toContain("totally_invented_status_xyz");
  });

  it("recognises core mapped statuses", () => {
    expect(isKnownDomainStatus("paid")).toBe(true);
    expect(resolveDomainStatus("paid").unmapped).toBe(false);
    expect(resolveDomainStatus("paid").tone).toBe("success");
  });
});
