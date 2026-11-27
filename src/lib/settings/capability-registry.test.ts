import { describe, expect, it } from "vitest";
import { MODULE_REGISTRY } from "@/lib/modules/registry";
import {
  MODULE_SETTINGS_COVERAGE,
  SETTING_CAPABILITY_REGISTRY,
  SETTING_FIELD_COVERAGE,
  SETTINGS_GAPS,
  isSettingsFieldComplete,
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
      } else if (setting.route === "/payroll/settings") {
        expect(setting.moduleId).toBe("payroll");
      } else if (setting.route === "/expense-management/settings") {
        expect(setting.moduleId).toBe("expense-management");
      } else if (setting.route === "/expense-management/approvals") {
        expect(setting.moduleId).toBe("expense-management");
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

  it("registers payroll configuration only with server validation, permission, audit and consumer evidence", () => {
    expect(
      SETTINGS_GAPS.find((gap) => gap.key === "payroll.settings_audit_coverage"),
    ).toBeUndefined();
    expect(
      SETTING_CAPABILITY_REGISTRY.find((setting) => setting.key === "payroll.configuration"),
    ).toMatchObject({
      moduleId: "payroll",
      route: "/payroll/settings",
      permission: expect.stringContaining("payroll.settings.edit"),
      audit: expect.stringContaining("same-transaction"),
      consumer: expect.stringContaining("payroll-run"),
      test: expect.stringContaining("payroll-settings-audit.sql"),
    });
  });

  it("proves the saved employee payable account reaches the reimbursement journal", () => {
    expect(
      SETTING_CAPABILITY_REGISTRY.find(
        (setting) => setting.key === "expense-management.reimbursement_account",
      ),
    ).toMatchObject({
      moduleId: "expense-management",
      route: "/expense-management/settings",
      persistence: expect.stringContaining("employee_payable_account_id"),
      audit: expect.stringContaining("same transaction"),
      consumer: expect.stringContaining("public.post_journal"),
      test: expect.stringContaining("expense-reimbursement-settings.sql"),
    });
    expect(
      SETTINGS_GAPS.find((gap) => gap.key === "expense-management.typed_configuration")
        ?.missingEvidence,
    ).not.toContain(
      "integration evidence that the configured employee payable account reaches the actual reimbursement journal",
    );
  });

  it("keeps MFA, idle-timeout and support-access consent read-only until enforcement exists", () => {
    for (const key of [
      "users.force_mfa_for_owners",
      "users.session_idle_minutes",
      "users.support_access_consent",
    ]) {
      expect(SETTING_FIELD_COVERAGE.find((setting) => setting.key === key)?.status).toBe("partial");
      expect(isSettingsFieldComplete(key)).toBe(false);
    }
    expect(
      SETTINGS_GAPS.find((gap) => gap.key === "users.security_preferences")?.missingEvidence,
    ).toEqual([
      "enforcement proof for MFA and idle timeout",
      "client-controlled approval flow before support access",
    ]);
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
      SETTING_CAPABILITY_REGISTRY.find(
        (setting) => setting.key === "purchases.duplicate_detection",
      ),
    ).toMatchObject({
      moduleId: "purchases",
      permission: expect.stringContaining("purchases.view"),
      persistence: expect.stringContaining("organisation_config.purchases"),
      audit: expect.stringContaining("settings_change_log"),
      consumer: expect.stringContaining("database uniqueness guard"),
      test: expect.stringContaining("duplicate-detection-preference.test.ts"),
    });
    expect(
      SETTING_FIELD_COVERAGE.find((setting) => setting.key === "purchases.duplicate_detection")
        ?.status,
    ).toBe("complete");
    expect(
      SETTING_CAPABILITY_REGISTRY.find((setting) => setting.key === "banking.import_formats"),
    ).toMatchObject({
      moduleId: "banking",
      permission: expect.stringContaining("banking.feeds.manage"),
      persistence: expect.stringContaining("organisation_config.banking"),
      audit: expect.stringContaining("settings_change_log"),
      consumer: expect.stringContaining("file types"),
      test: expect.stringContaining("import-format-preference.test.ts"),
    });
    expect(
      SETTING_FIELD_COVERAGE.find((setting) => setting.key === "banking.import_formats")?.status,
    ).toBe("complete");
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
    expect(SETTINGS_GAPS.find((gap) => gap.key === "company.identity_and_locale")).toBeUndefined();
  });

  it("records Tax registration only with audit, compare-and-set and business consumers", () => {
    expect(
      SETTING_CAPABILITY_REGISTRY.find((setting) => setting.key === "tax.registration_summary"),
    ).toMatchObject({
      moduleId: "tax",
      route: "/tax",
      permission: "tax.settings",
      persistence: expect.stringContaining("updateTaxSettings"),
      audit: expect.stringContaining("same transaction"),
      validation: expect.stringContaining("compare-and-set"),
      consumer: expect.stringContaining("inclusive versus exclusive pricing"),
      test: expect.stringContaining("company-tax-settings-audit.sql"),
    });
    expect(SETTINGS_GAPS.find((gap) => gap.key === "company.identity_and_locale")).toBeUndefined();
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

  it("records the audited legal-name field and document branding consumer", () => {
    expect(
      SETTING_CAPABILITY_REGISTRY.find((setting) => setting.key === "company.legal_name"),
    ).toMatchObject({
      route: "/settings/organisation/overview",
      permission: "company.settings.edit",
      persistence: expect.stringContaining("companies.legal_name"),
      audit: expect.stringContaining("before/after"),
      consumer: expect.stringContaining("document branding"),
      test: expect.stringContaining("documents-loader.test.ts"),
    });
  });

  it("records fiscal-year-end validation and report consumer evidence", () => {
    expect(
      SETTING_CAPABILITY_REGISTRY.find((setting) => setting.key === "company.fiscal_year_end"),
    ).toMatchObject({
      route: "/settings/organisation/overview",
      permission: "company.settings.edit",
      persistence: expect.stringContaining("fiscal_year_end_month"),
      audit: expect.stringContaining("before/after"),
      consumer: expect.stringContaining("period-close"),
      test: expect.stringContaining("ledger-data.test.ts"),
    });
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
