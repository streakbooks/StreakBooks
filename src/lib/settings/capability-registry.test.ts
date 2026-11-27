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
      } else if (setting.route === "/settings") {
        expect(setting.moduleId).toBe("settings");
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
      SETTING_FIELD_COVERAGE.find((setting) => setting.key === "purchases.three_way_matching")
        ?.status,
    ).toBe("complete");
    expect(
      SETTING_CAPABILITY_REGISTRY.find((setting) => setting.key === "purchases.three_way_matching"),
    ).toMatchObject({
      moduleId: "purchases",
      permission: expect.stringContaining("company.settings.edit"),
      persistence: expect.stringContaining("organisation_config.purchases"),
      consumer: expect.stringContaining("fail closed"),
    });
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

  it("records base-currency consumer and ledger-safety evidence separately from other identity fields", () => {
    expect(
      SETTING_CAPABILITY_REGISTRY.find((setting) => setting.key === "company.base_currency"),
    ).toMatchObject({
      moduleId: "settings",
      route: "/settings/organisation/overview",
      permission: "company.settings.edit",
      persistence: expect.stringContaining("companies.base_currency"),
      test: expect.stringContaining("settings-company-identity-atomic.sql"),
    });
    expect(SETTINGS_GAPS.find((gap) => gap.key === "company.identity_and_locale")?.status).toBe(
      "partial",
    );
  });

  it("records document locale and date-format consumers separately from storage format", () => {
    for (const key of ["company.locale", "company.date_format"]) {
      expect(SETTING_CAPABILITY_REGISTRY.find((setting) => setting.key === key)).toMatchObject({
        route: "/settings/organisation/overview",
        permission: "company.settings.edit",
        persistence: expect.stringContaining("save_company_localisation_if_unchanged"),
        audit: expect.stringContaining("settings.localization"),
        test: expect.stringContaining("settings-company-identity-atomic.sql"),
      });
    }
  });

  it("records audited document numbering and allocation evidence", () => {
    expect(
      SETTING_CAPABILITY_REGISTRY.find((setting) => setting.key === "documents.number_sequences"),
    ).toMatchObject({
      route: "/settings",
      permission: expect.stringContaining("company.settings.edit"),
      persistence: expect.stringContaining("document_sequences"),
      audit: expect.stringContaining("before/after"),
      test: expect.stringContaining("settings-legacy-cas.sql"),
    });
  });

  it("promotes only the tested manual-journal backdate warning from Accounting settings", () => {
    expect(
      SETTING_CAPABILITY_REGISTRY.find(
        (setting) => setting.key === "accounting.warn_backdated_days",
      ),
    ).toMatchObject({
      moduleId: "accounting",
      route: "/settings/accounting/overview",
      permission: "company.settings.edit",
      consumer: expect.stringContaining("non-blocking warning"),
      test: expect.stringContaining("backdated-journal-warning.test.ts"),
    });
    expect(
      SETTING_FIELD_COVERAGE.find((setting) => setting.key === "accounting.warn_backdated_days")
        ?.status,
    ).toBe("complete");
  });

  it("requires verified notification sender and digest timing consumers for editable organisation fields", () => {
    const provenKeys = [
      "notifications.email_from_name",
      "notifications.reply_to",
      "notifications.quiet_hours_enabled",
      "notifications.quiet_hours_start",
      "notifications.quiet_hours_end",
    ];
    for (const key of provenKeys) {
      expect(SETTING_CAPABILITY_REGISTRY.find((setting) => setting.key === key)).toMatchObject({
        moduleId: "settings",
        route: "/settings/notifications/overview",
        permission: "company.settings.edit",
        persistence: expect.stringContaining("organisation_config.notifications"),
        audit: expect.stringContaining("settings_change_log"),
      });
      expect(SETTING_FIELD_COVERAGE.find((setting) => setting.key === key)?.status).toBe(
        "complete",
      );
    }
  });
});
