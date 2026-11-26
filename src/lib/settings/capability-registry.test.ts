import { describe, expect, it } from "vitest";
import { MODULE_REGISTRY } from "@/lib/modules/registry";
import {
  MODULE_SETTINGS_COVERAGE,
  SETTING_CAPABILITY_REGISTRY,
  SETTING_FIELD_COVERAGE,
  SETTINGS_GAPS,
  validateSettingsCapabilityRegistry,
} from "./capability-registry";

describe("Settings capability coverage registry", () => {
  it("requires UI, defaults, validation, permission, persistence, audit, consumer and test evidence for every complete setting", () => {
    expect(validateSettingsCapabilityRegistry()).toEqual([]);
    for (const setting of SETTING_CAPABILITY_REGISTRY) {
      // The rate/code master is edited in the canonical Tax workspace linked from Settings.
      if (setting.route === "/tax") {
        expect(setting.moduleId).toBe("tax");
      } else {
        expect(setting.route).toMatch(/^\/settings\//);
      }
      expect(setting.defaultValue.trim()).not.toBe("");
      expect(setting.validation.trim()).not.toBe("");
      expect(setting.permission.trim()).not.toBe("");
      expect(setting.persistence.trim()).not.toBe("");
      expect(setting.audit.trim()).not.toBe("");
      expect(setting.consumer.trim()).not.toBe("");
      expect(setting.test.trim()).not.toBe("");
    }
  });

  it("tracks every module in the runtime module registry, even when its settings are missing", () => {
    expect(MODULE_SETTINGS_COVERAGE.map((item) => item.moduleId).sort()).toEqual(
      MODULE_REGISTRY.map((module) => module.id).sort(),
    );
  });

  it("keeps incomplete and unavailable settings outside the complete registry", () => {
    const completeKeys = new Set(SETTING_CAPABILITY_REGISTRY.map((setting) => setting.key));
    expect(SETTINGS_GAPS.length).toBeGreaterThan(0);
    for (const gap of SETTINGS_GAPS) {
      expect(completeKeys.has(gap.key), gap.key).toBe(false);
      expect(gap.missingEvidence.length, gap.key).toBeGreaterThan(0);
    }
  });

  it("keeps regional tax settings partial until their source of truth and effects are tested", () => {
    expect(SETTINGS_GAPS.find((gap) => gap.key === "tax.regional_configuration")).toMatchObject({
      moduleId: "tax",
      status: "partial",
      route: "/settings/tax/overview",
    });
  });

  it("accounts for typed fields and marks unproven controls partial", () => {
    expect(SETTING_FIELD_COVERAGE.length).toBeGreaterThan(0);
    expect(
      SETTING_FIELD_COVERAGE.find((setting) => setting.key === "accounting.reporting_basis")
        ?.status,
    ).toBe("complete");
    expect(
      SETTING_FIELD_COVERAGE.find((setting) => setting.key === "sales.late_fees_enabled")?.status,
    ).toBe("partial");
    expect(
      SETTING_FIELD_COVERAGE.find(
        (setting) => setting.key === "purchases.show_supplier_summary_default",
      )?.status,
    ).toBe("complete");
    expect(
      SETTING_CAPABILITY_REGISTRY.find((setting) => setting.key === "purchases.require_po"),
    ).toMatchObject({
      moduleId: "purchases",
      permission: "company.settings.edit",
      persistence: expect.stringContaining("purchases_require_po"),
    });
    expect(
      SETTING_FIELD_COVERAGE.find((setting) => setting.key === "reports.default_comparison")
        ?.status,
    ).toBe("complete");
  });
});
