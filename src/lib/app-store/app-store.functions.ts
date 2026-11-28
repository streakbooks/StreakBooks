import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import {
  DEFAULT_MARKETPLACE_APPS,
  normalizeMarketplaceApps,
  type MarketplaceAppDefinition,
  type MarketplaceCatalogueSource,
} from "@/lib/app-store/catalogue";
import { nativePriorityRoadmap } from "@/lib/app-store/adapters/registry";
import {
  PUBLIC_API_SCOPES,
  type PublicApiScopeDefinition,
} from "@/lib/app-store/public-api-scopes";
import { callRpc, companyIdOf, isMissingRelation } from "@/lib/planning/rpc";
import { assertUuid } from "@/lib/company-validation";

export type PublicMarketplaceCatalogue = {
  ready: boolean;
  source: MarketplaceCatalogueSource;
  apps: MarketplaceAppDefinition[];
  nativeRoadmap: ReturnType<typeof nativePriorityRoadmap>;
};

export type CompanyMarketplaceApp = MarketplaceAppDefinition & {
  installStatus: "not_installed" | "installed" | "disabled" | "error" | null;
  installId: string | null;
  connectionStatus: string | null;
  connectionHealth: string | null;
};

export type CompanyMarketplaceCatalogue = {
  ready: boolean;
  source: MarketplaceCatalogueSource;
  apps: CompanyMarketplaceApp[];
  nativeRoadmap: ReturnType<typeof nativePriorityRoadmap>;
};

export type InstallRequestResult = {
  id: string;
  appCode: string;
  status: string;
  implementationStatus: string;
  realCustomerDataEnabled: boolean;
  securityReviewPassed: boolean;
  canActivate: boolean;
};

const MARKETPLACE_MIGRATION =
  "App Store catalogue is not available yet: apply migration 20261107157000_marketplace_catalogue_foundation.";

function mapInstallFields(app: MarketplaceAppDefinition, rows: unknown): CompanyMarketplaceApp {
  const row = Array.isArray(rows)
    ? (rows as Record<string, unknown>[]).find((r) => r["code"] === app.code)
    : undefined;
  const rawStatus = row?.["installStatus"] ?? row?.["install_status"];
  const installStatus =
    rawStatus === "installed" ||
    rawStatus === "disabled" ||
    rawStatus === "error" ||
    rawStatus === "not_installed"
      ? rawStatus
      : "not_installed";
  const installId =
    typeof row?.["installId"] === "string"
      ? row["installId"]
      : typeof row?.["install_id"] === "string"
        ? row["install_id"]
        : null;
  const connectionStatus =
    typeof row?.["connectionStatus"] === "string"
      ? row["connectionStatus"]
      : typeof row?.["connection_status"] === "string"
        ? row["connection_status"]
        : "disconnected";
  const connectionHealth =
    typeof row?.["connectionHealth"] === "string"
      ? row["connectionHealth"]
      : typeof row?.["connection_health"] === "string"
        ? row["connection_health"]
        : "unknown";
  return { ...app, installStatus, installId, connectionStatus, connectionHealth };
}

export const listPublicMarketplaceCatalogue = createServerFn({ method: "GET" })
  .validator((input?: { fingerprint?: string | null }) => ({
    fingerprint: String(input?.fingerprint ?? "")
      .trim()
      .slice(0, 128),
  }))
  .handler(async ({ data }): Promise<PublicMarketplaceCatalogue> => {
    setResponseHeader("Cache-Control", "private, no-store");
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key || url.includes(".invalid")) {
      return {
        ready: false,
        source: "defaults",
        apps: [...DEFAULT_MARKETPLACE_APPS],
        nativeRoadmap: nativePriorityRoadmap(),
      };
    }
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const client = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: rpcData, error } = await client.rpc(
        "list_public_marketplace_catalogue" as never,
        (data.fingerprint
          ? { _client_fingerprint: data.fingerprint }
          : { _client_fingerprint: null }) as never,
      );
      if (error) {
        if (
          error.code === "42883" ||
          error.code === "PGRST202" ||
          error.code === "42P01" ||
          error.message.toLowerCase().includes("fetch")
        ) {
          return {
            ready: false,
            source: "defaults",
            apps: [...DEFAULT_MARKETPLACE_APPS],
            nativeRoadmap: nativePriorityRoadmap(),
          };
        }
        throw new Error(error.message);
      }
      return {
        ready: true,
        source: "database",
        apps: normalizeMarketplaceApps(rpcData),
        nativeRoadmap: nativePriorityRoadmap(),
      };
    } catch {
      return {
        ready: false,
        source: "defaults",
        apps: [...DEFAULT_MARKETPLACE_APPS],
        nativeRoadmap: nativePriorityRoadmap(),
      };
    }
  });

export const listCompanyMarketplaceApps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
  .handler(async ({ data, context }): Promise<CompanyMarketplaceCatalogue> => {
    await assertCompanyMember(context.supabase, data.companyId);
    await assertCompanyPermission(context.supabase, data.companyId, "appstore.view");
    try {
      const rows = await callRpc(
        context.supabase,
        "list_company_marketplace_apps",
        { _company_id: data.companyId },
        MARKETPLACE_MIGRATION,
      );
      const apps = normalizeMarketplaceApps(rows).map((app) => mapInstallFields(app, rows));
      return {
        ready: true,
        source: "database",
        apps,
        nativeRoadmap: nativePriorityRoadmap(),
      };
    } catch (error) {
      if (
        isMissingRelation(error as { code?: string; message?: string }) ||
        (error instanceof Error && error.message === MARKETPLACE_MIGRATION)
      ) {
        return {
          ready: false,
          source: "defaults",
          apps: DEFAULT_MARKETPLACE_APPS.map((app) => ({
            ...app,
            installStatus: "not_installed" as const,
            installId: null,
            connectionStatus: "disconnected",
            connectionHealth: "unknown",
          })),
          nativeRoadmap: nativePriorityRoadmap(),
        };
      }
      throw error;
    }
  });

export const requestMarketplaceAppInstall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; appCode: string }) => ({
    companyId: assertUuid(input.companyId),
    appCode: String(input.appCode ?? "")
      .trim()
      .slice(0, 80),
  }))
  .handler(async ({ data, context }): Promise<InstallRequestResult> => {
    if (!data.appCode) throw new Error("App code is required.");
    await assertCompanyMember(context.supabase, data.companyId);
    try {
      await assertCompanyPermission(context.supabase, data.companyId, "appstore.install");
    } catch {
      await assertCompanyPermission(context.supabase, data.companyId, "appstore.request_install");
    }
    const result = await callRpc(
      context.supabase,
      "request_marketplace_app_install",
      { _company_id: data.companyId, _app_code: data.appCode },
      MARKETPLACE_MIGRATION,
    );
    const row = (result ?? {}) as Record<string, unknown>;
    return {
      id: String(row["id"] ?? ""),
      appCode: String(row["appCode"] ?? row["app_code"] ?? data.appCode),
      status: String(row["status"] ?? "requested"),
      implementationStatus: String(
        row["implementationStatus"] ?? row["implementation_status"] ?? "catalogue_only",
      ),
      realCustomerDataEnabled: Boolean(
        row["realCustomerDataEnabled"] ?? row["real_customer_data_enabled"] ?? false,
      ),
      securityReviewPassed: Boolean(
        row["securityReviewPassed"] ?? row["security_review_passed"] ?? false,
      ),
      canActivate: Boolean(row["canActivate"] ?? row["can_activate"] ?? false),
    };
  });

export const listPublicApiScopes = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ ready: boolean; scopes: PublicApiScopeDefinition[] }> => {
    setResponseHeader("Cache-Control", "private, no-store");
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key || url.includes(".invalid")) {
      return { ready: false, scopes: [...PUBLIC_API_SCOPES] };
    }
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const client = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await client.rpc("list_public_api_scopes" as never);
      if (error || !Array.isArray(data) || data.length === 0) {
        return { ready: false, scopes: [...PUBLIC_API_SCOPES] };
      }
      return {
        ready: true,
        scopes: data.map((row: Record<string, unknown>) => ({
          key: String(row["key"]),
          label: String(row["label"]),
          description: String(row["description"] ?? ""),
          module: String(row["module"]),
          access: row["access"] === "write" ? "write" : "read",
        })),
      };
    } catch {
      return { ready: false, scopes: [...PUBLIC_API_SCOPES] };
    }
  },
);

export type IntegrationConnectionRow = {
  id: string;
  companyId: string;
  appCode: string;
  provider: string;
  externalAccountLabel: string | null;
  externalAccountId: string | null;
  authMethod: string;
  scopes: string[];
  status: string;
  health: string;
  tokenExpiresAt: string | null;
  lastValidatedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AppInstallRequestRow = {
  id: string;
  companyId: string;
  appCode: string;
  status: string;
  justification: string;
  remarks: string;
  createdAt: string;
  updatedAt: string;
};

const CONNECTIONS_MIGRATION =
  "Integration connections are not available yet: apply migration 20261107158000_marketplace_connections_foundation.";

export const listCompanyIntegrationConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
  .handler(async ({ data, context }): Promise<IntegrationConnectionRow[]> => {
    await assertCompanyMember(context.supabase, data.companyId);
    try {
      await assertCompanyPermission(
        context.supabase,
        data.companyId,
        "appstore.manage_connections",
      );
    } catch {
      await assertCompanyPermission(context.supabase, data.companyId, "appstore.view");
    }
    try {
      const rows = await callRpc(
        context.supabase,
        "list_company_integration_connections",
        { _company_id: data.companyId },
        CONNECTIONS_MIGRATION,
      );
      if (!Array.isArray(rows)) return [];
      return rows.map((row) => {
        const r = row as Record<string, unknown>;
        return {
          id: String(r["id"] ?? ""),
          companyId: String(r["companyId"] ?? r["company_id"] ?? data.companyId),
          appCode: String(r["appCode"] ?? r["app_code"] ?? ""),
          provider: String(r["provider"] ?? ""),
          externalAccountLabel:
            typeof r["externalAccountLabel"] === "string"
              ? r["externalAccountLabel"]
              : typeof r["external_account_label"] === "string"
                ? r["external_account_label"]
                : null,
          externalAccountId:
            typeof r["externalAccountId"] === "string"
              ? r["externalAccountId"]
              : typeof r["external_account_id"] === "string"
                ? r["external_account_id"]
                : null,
          authMethod: String(r["authMethod"] ?? r["auth_method"] ?? "none"),
          scopes: Array.isArray(r["scopes"])
            ? r["scopes"].filter((s): s is string => typeof s === "string")
            : [],
          status: String(r["status"] ?? "disconnected"),
          health: String(r["health"] ?? "unknown"),
          tokenExpiresAt:
            typeof r["tokenExpiresAt"] === "string"
              ? r["tokenExpiresAt"]
              : typeof r["token_expires_at"] === "string"
                ? r["token_expires_at"]
                : null,
          lastValidatedAt:
            typeof r["lastValidatedAt"] === "string"
              ? r["lastValidatedAt"]
              : typeof r["last_validated_at"] === "string"
                ? r["last_validated_at"]
                : null,
          lastSuccessfulSyncAt:
            typeof r["lastSuccessfulSyncAt"] === "string"
              ? r["lastSuccessfulSyncAt"]
              : typeof r["last_successful_sync_at"] === "string"
                ? r["last_successful_sync_at"]
                : null,
          lastError:
            typeof r["lastError"] === "string"
              ? r["lastError"]
              : typeof r["last_error"] === "string"
                ? r["last_error"]
                : null,
          createdAt: String(r["createdAt"] ?? r["created_at"] ?? ""),
          updatedAt: String(r["updatedAt"] ?? r["updated_at"] ?? ""),
        };
      });
    } catch (error) {
      if (error instanceof Error && error.message === CONNECTIONS_MIGRATION) return [];
      throw error;
    }
  });

export type FirmAppRecommendationRow = {
  id: string;
  firmId: string;
  clientCompanyId: string;
  appCode: string;
  status: string;
  rationale: string;
  clientResponse: string;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const listFirmAppRecommendations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { firmId: string }) => ({ firmId: assertUuid(input.firmId) }))
  .handler(async ({ data, context }): Promise<FirmAppRecommendationRow[]> => {
    await assertCompanyMember(context.supabase, data.firmId);
    await assertCompanyPermission(context.supabase, data.firmId, "appstore.advise");
    try {
      const rows = await callRpc(
        context.supabase,
        "list_firm_app_recommendations",
        { _firm_id: data.firmId },
        "Accountant advisory is not available yet: apply migration 20261107159000_marketplace_xero_parity_addendum.",
      );
      if (!Array.isArray(rows)) return [];
      return rows.map((row) => {
        const r = row as Record<string, unknown>;
        return {
          id: String(r["id"] ?? ""),
          firmId: String(r["firmId"] ?? r["firm_id"] ?? data.firmId),
          clientCompanyId: String(r["clientCompanyId"] ?? r["client_company_id"] ?? ""),
          appCode: String(r["appCode"] ?? r["app_code"] ?? ""),
          status: String(r["status"] ?? "draft"),
          rationale: String(r["rationale"] ?? ""),
          clientResponse: String(r["clientResponse"] ?? r["client_response"] ?? ""),
          decidedAt:
            typeof r["decidedAt"] === "string"
              ? r["decidedAt"]
              : typeof r["decided_at"] === "string"
                ? r["decided_at"]
                : null,
          createdAt: String(r["createdAt"] ?? r["created_at"] ?? ""),
          updatedAt: String(r["updatedAt"] ?? r["updated_at"] ?? ""),
        };
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("20261107159000_marketplace_xero_parity_addendum")
      ) {
        return [];
      }
      throw error;
    }
  });

export const listCompanyAppInstallRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
  .handler(async ({ data, context }): Promise<AppInstallRequestRow[]> => {
    await assertCompanyMember(context.supabase, data.companyId);
    try {
      await assertCompanyPermission(context.supabase, data.companyId, "appstore.request_install");
    } catch {
      await assertCompanyPermission(context.supabase, data.companyId, "appstore.view");
    }
    try {
      const rows = await callRpc(
        context.supabase,
        "list_company_app_install_requests",
        { _company_id: data.companyId },
        CONNECTIONS_MIGRATION,
      );
      if (!Array.isArray(rows)) return [];
      return rows.map((row) => {
        const r = row as Record<string, unknown>;
        return {
          id: String(r["id"] ?? ""),
          companyId: String(r["companyId"] ?? r["company_id"] ?? data.companyId),
          appCode: String(r["appCode"] ?? r["app_code"] ?? ""),
          status: String(r["status"] ?? "submitted"),
          justification: String(r["justification"] ?? ""),
          remarks: String(r["remarks"] ?? ""),
          createdAt: String(r["createdAt"] ?? r["created_at"] ?? ""),
          updatedAt: String(r["updatedAt"] ?? r["updated_at"] ?? ""),
        };
      });
    } catch (error) {
      if (error instanceof Error && error.message === CONNECTIONS_MIGRATION) return [];
      throw error;
    }
  });
export type SyncJobRow = {
  id: string;
  companyId: string;
  connectionId: string | null;
  appCode: string;
  direction: string;
  trigger: string;
  status: string;
  cursorCheckpoint: string | null;
  correlationId: string;
  discovered: number;
  imported: number;
  skipped: number;
  failed: number;
  retryCount: number;
  lastError: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
};

const ENGINE_MIGRATION =
  "Sync jobs are not available yet: apply migration 20261107160000_marketplace_integration_engine.";

const SECURITY_MIGRATION =
  "Marketplace security controls are not available yet: apply migration 20261107161000_marketplace_security_controls.";

export type AppConsentRow = {
  id: string;
  companyId: string;
  appCode: string;
  connectionId: string | null;
  grantedScopes: string[];
  status: string;
  consentVersion: string;
  consentedAt: string;
  revokedAt: string | null;
  revokeReason: string | null;
};

export type MarketplaceSecurityAlertMeta = {
  [key: string]: string | number | boolean | null;
};

export type MarketplaceSecurityAlertRow = {
  id: string;
  companyId: string | null;
  appCode: string | null;
  severity: string;
  alertType: string;
  message: string;
  metadata: MarketplaceSecurityAlertMeta;
  acknowledgedAt: string | null;
  createdAt: string;
};

function toSerializableAlertMeta(raw: unknown): MarketplaceSecurityAlertMeta {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: MarketplaceSecurityAlertMeta = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      out[key] = value;
    } else {
      out[key] = JSON.stringify(value);
    }
  }
  return out;
}

export const listCompanyAppConsents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
  .handler(async ({ data, context }): Promise<AppConsentRow[]> => {
    await assertCompanyMember(context.supabase, data.companyId);
    try {
      await assertCompanyPermission(
        context.supabase,
        data.companyId,
        "appstore.manage_connections",
      );
    } catch {
      await assertCompanyPermission(context.supabase, data.companyId, "appstore.view");
    }
    try {
      const rows = await callRpc(
        context.supabase,
        "list_company_app_consents",
        { _company_id: data.companyId },
        SECURITY_MIGRATION,
      );
      if (!Array.isArray(rows)) return [];
      return rows.map((row) => {
        const r = row as Record<string, unknown>;
        return {
          id: String(r["id"] ?? ""),
          companyId: String(r["companyId"] ?? r["company_id"] ?? data.companyId),
          appCode: String(r["appCode"] ?? r["app_code"] ?? ""),
          connectionId:
            typeof r["connectionId"] === "string"
              ? r["connectionId"]
              : typeof r["connection_id"] === "string"
                ? r["connection_id"]
                : null,
          grantedScopes: Array.isArray(r["grantedScopes"] ?? r["granted_scopes"])
            ? ((r["grantedScopes"] ?? r["granted_scopes"]) as unknown[]).filter(
                (s): s is string => typeof s === "string",
              )
            : [],
          status: String(r["status"] ?? "active"),
          consentVersion: String(r["consentVersion"] ?? r["consent_version"] ?? "1"),
          consentedAt: String(r["consentedAt"] ?? r["consented_at"] ?? ""),
          revokedAt:
            typeof r["revokedAt"] === "string"
              ? r["revokedAt"]
              : typeof r["revoked_at"] === "string"
                ? r["revoked_at"]
                : null,
          revokeReason:
            typeof r["revokeReason"] === "string"
              ? r["revokeReason"]
              : typeof r["revoke_reason"] === "string"
                ? r["revoke_reason"]
                : null,
        };
      });
    } catch (error) {
      if (error instanceof Error && error.message === SECURITY_MIGRATION) return [];
      throw error;
    }
  });

export const revokeMarketplaceAppAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; appCode: string; reason?: string }) => ({
    companyId: assertUuid(input.companyId),
    appCode: String(input.appCode ?? "")
      .trim()
      .slice(0, 80),
    reason: String(input.reason ?? "customer_revoked")
      .trim()
      .slice(0, 200),
  }))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ appCode: string; revoked: boolean; connectionsUpdated: number }> => {
      if (!data.appCode) throw new Error("App code is required.");
      await assertCompanyMember(context.supabase, data.companyId);
      await assertCompanyPermission(
        context.supabase,
        data.companyId,
        "appstore.manage_connections",
      );
      const result = await callRpc(
        context.supabase,
        "revoke_marketplace_app_access",
        {
          _company_id: data.companyId,
          _app_code: data.appCode,
          _reason: data.reason,
        },
        SECURITY_MIGRATION,
      );
      const row = (result ?? {}) as Record<string, unknown>;
      return {
        appCode: String(row["appCode"] ?? row["app_code"] ?? data.appCode),
        revoked: Boolean(row["revoked"] ?? true),
        connectionsUpdated: Number(row["connectionsUpdated"] ?? row["connections_updated"] ?? 0),
      };
    },
  );

export const suspendMarketplaceAppForCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; appCode: string; reason: string }) => ({
    companyId: assertUuid(input.companyId),
    appCode: String(input.appCode ?? "")
      .trim()
      .slice(0, 80),
    reason: String(input.reason ?? "")
      .trim()
      .slice(0, 200),
  }))
  .handler(
    async ({ data, context }): Promise<{ appCode: string; suspendedForCompany: boolean }> => {
      if (!data.appCode) throw new Error("App code is required.");
      if (!data.reason) throw new Error("Suspension reason is required.");
      await assertCompanyMember(context.supabase, data.companyId);
      try {
        await assertCompanyPermission(
          context.supabase,
          data.companyId,
          "appstore.manage_connections",
        );
      } catch {
        await assertCompanyPermission(context.supabase, data.companyId, "appstore.install");
      }
      const result = await callRpc(
        context.supabase,
        "suspend_marketplace_app_for_company",
        {
          _company_id: data.companyId,
          _app_code: data.appCode,
          _reason: data.reason,
        },
        SECURITY_MIGRATION,
      );
      const row = (result ?? {}) as Record<string, unknown>;
      return {
        appCode: String(row["appCode"] ?? row["app_code"] ?? data.appCode),
        suspendedForCompany: Boolean(
          row["suspendedForCompany"] ?? row["suspended_for_company"] ?? true,
        ),
      };
    },
  );

export const listCompanyMarketplaceSecurityAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
  .handler(async ({ data, context }): Promise<MarketplaceSecurityAlertRow[]> => {
    await assertCompanyMember(context.supabase, data.companyId);
    try {
      await assertCompanyPermission(context.supabase, data.companyId, "audit.view");
    } catch {
      await assertCompanyPermission(context.supabase, data.companyId, "appstore.view");
    }
    try {
      const rows = await callRpc(
        context.supabase,
        "list_company_marketplace_security_alerts",
        { _company_id: data.companyId },
        SECURITY_MIGRATION,
      );
      if (!Array.isArray(rows)) return [];
      return rows.map((row) => {
        const r = row as Record<string, unknown>;
        return {
          id: String(r["id"] ?? ""),
          companyId:
            typeof r["companyId"] === "string"
              ? r["companyId"]
              : typeof r["company_id"] === "string"
                ? r["company_id"]
                : null,
          appCode:
            typeof r["appCode"] === "string"
              ? r["appCode"]
              : typeof r["app_code"] === "string"
                ? r["app_code"]
                : null,
          severity: String(r["severity"] ?? "low"),
          alertType: String(r["alertType"] ?? r["alert_type"] ?? ""),
          message: String(r["message"] ?? ""),
          metadata: toSerializableAlertMeta(r["metadata"]),
          acknowledgedAt:
            typeof r["acknowledgedAt"] === "string"
              ? r["acknowledgedAt"]
              : typeof r["acknowledged_at"] === "string"
                ? r["acknowledged_at"]
                : null,
          createdAt: String(r["createdAt"] ?? r["created_at"] ?? ""),
        };
      });
    } catch (error) {
      if (error instanceof Error && error.message === SECURITY_MIGRATION) return [];
      throw error;
    }
  });

export const listCompanySyncJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
  .handler(async ({ data, context }): Promise<SyncJobRow[]> => {
    await assertCompanyMember(context.supabase, data.companyId);
    try {
      await assertCompanyPermission(context.supabase, data.companyId, "appstore.view_sync");
    } catch {
      await assertCompanyPermission(context.supabase, data.companyId, "appstore.view");
    }
    try {
      const rows = await callRpc(
        context.supabase,
        "list_company_sync_jobs",
        { _company_id: data.companyId },
        ENGINE_MIGRATION,
      );
      if (!Array.isArray(rows)) return [];
      return rows.map((row) => {
        const r = row as Record<string, unknown>;
        return {
          id: String(r["id"] ?? ""),
          companyId: String(r["companyId"] ?? r["company_id"] ?? data.companyId),
          connectionId:
            typeof r["connectionId"] === "string"
              ? r["connectionId"]
              : typeof r["connection_id"] === "string"
                ? r["connection_id"]
                : null,
          appCode: String(r["appCode"] ?? r["app_code"] ?? ""),
          direction: String(r["direction"] ?? "inbound"),
          trigger: String(r["trigger"] ?? "manual"),
          status: String(r["status"] ?? "pending"),
          cursorCheckpoint:
            typeof r["cursorCheckpoint"] === "string"
              ? r["cursorCheckpoint"]
              : typeof r["cursor_checkpoint"] === "string"
                ? r["cursor_checkpoint"]
                : null,
          correlationId: String(r["correlationId"] ?? r["correlation_id"] ?? ""),
          discovered: Number(r["discovered"] ?? 0),
          imported: Number(r["imported"] ?? 0),
          skipped: Number(r["skipped"] ?? 0),
          failed: Number(r["failed"] ?? 0),
          retryCount: Number(r["retryCount"] ?? r["retry_count"] ?? 0),
          lastError:
            typeof r["lastError"] === "string"
              ? r["lastError"]
              : typeof r["last_error"] === "string"
                ? r["last_error"]
                : null,
          startedAt:
            typeof r["startedAt"] === "string"
              ? r["startedAt"]
              : typeof r["started_at"] === "string"
                ? r["started_at"]
                : null,
          finishedAt:
            typeof r["finishedAt"] === "string"
              ? r["finishedAt"]
              : typeof r["finished_at"] === "string"
                ? r["finished_at"]
                : null,
          createdAt: String(r["createdAt"] ?? r["created_at"] ?? ""),
        };
      });
    } catch (error) {
      if (error instanceof Error && error.message === ENGINE_MIGRATION) return [];
      throw error;
    }
  });

const APPROVAL_MIGRATION =
  "Marketplace security approval is not available yet: apply migration 20261107162000_marketplace_oauth_approval_consent.";

export type SecurityReviewRow = {
  id: string;
  appCode: string;
  applicationId: string | null;
  status: string;
  checklistJson: string;
  submitterNotes: string;
  reviewerNotes: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const grantAppConnectionConsent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      companyId: string;
      appCode: string;
      connectionId?: string | null;
      grantedScopes: string[];
      consentVersion?: string;
    }) => ({
      companyId: assertUuid(input.companyId),
      appCode: String(input.appCode ?? "")
        .trim()
        .slice(0, 80),
      connectionId: input.connectionId ? assertUuid(input.connectionId) : null,
      grantedScopes: Array.isArray(input.grantedScopes)
        ? input.grantedScopes
            .filter((s): s is string => typeof s === "string")
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 40)
        : [],
      consentVersion: String(input.consentVersion ?? "1")
        .trim()
        .slice(0, 40),
    }),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      id: string;
      appCode: string;
      status: string;
      grantedScopes: string[];
      consentVersion: string;
    }> => {
      if (!data.appCode) throw new Error("App code is required.");
      if (data.grantedScopes.length === 0) throw new Error("At least one scope is required.");
      await assertCompanyMember(context.supabase, data.companyId);
      await assertCompanyPermission(
        context.supabase,
        data.companyId,
        "appstore.manage_connections",
      );
      const result = await callRpc(
        context.supabase,
        "grant_app_connection_consent",
        {
          _company_id: data.companyId,
          _app_code: data.appCode,
          _connection_id: data.connectionId,
          _granted_scopes: data.grantedScopes,
          _consent_version: data.consentVersion,
        },
        APPROVAL_MIGRATION,
      );
      const row = (result ?? {}) as Record<string, unknown>;
      const scopesRaw = row["grantedScopes"] ?? row["granted_scopes"];
      return {
        id: String(row["id"] ?? ""),
        appCode: String(row["appCode"] ?? row["app_code"] ?? data.appCode),
        status: String(row["status"] ?? "active"),
        grantedScopes: Array.isArray(scopesRaw)
          ? scopesRaw.filter((s): s is string => typeof s === "string")
          : data.grantedScopes,
        consentVersion: String(row["consentVersion"] ?? row["consent_version"] ?? "1"),
      };
    },
  );

export const submitMarketplaceSecurityReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { appCode: string; checklist: Record<string, boolean>; submitterNotes?: string }) => ({
      appCode: String(input.appCode ?? "")
        .trim()
        .slice(0, 80),
      checklist: input.checklist ?? {},
      submitterNotes: String(input.submitterNotes ?? "")
        .trim()
        .slice(0, 2000),
    }),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      id: string;
      appCode: string;
      status: string;
      realCustomerDataEnabled: boolean;
      securityReviewPassed: boolean;
    }> => {
      if (!data.appCode) throw new Error("App code is required.");
      const result = await callRpc(
        context.supabase,
        "submit_marketplace_security_review",
        {
          _app_code: data.appCode,
          _checklist: data.checklist,
          _submitter_notes: data.submitterNotes,
        },
        APPROVAL_MIGRATION,
      );
      const row = (result ?? {}) as Record<string, unknown>;
      return {
        id: String(row["id"] ?? ""),
        appCode: String(row["appCode"] ?? row["app_code"] ?? data.appCode),
        status: String(row["status"] ?? "submitted"),
        realCustomerDataEnabled: false,
        securityReviewPassed: Boolean(row["securityReviewPassed"] ?? false),
      };
    },
  );

export const listMarketplaceSecurityReviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
  .handler(async ({ data, context }): Promise<SecurityReviewRow[]> => {
    await assertCompanyMember(context.supabase, data.companyId);
    await assertCompanyPermission(
      context.supabase,
      data.companyId,
      "appstore.manage_certification",
    );
    try {
      const rows = await callRpc(
        context.supabase,
        "list_marketplace_security_reviews",
        { _company_id: data.companyId },
        APPROVAL_MIGRATION,
      );
      if (!Array.isArray(rows)) return [];
      return rows.map((row) => {
        const r = row as Record<string, unknown>;
        const checklist = r["checklist"];
        return {
          id: String(r["id"] ?? ""),
          appCode: String(r["appCode"] ?? r["app_code"] ?? ""),
          applicationId:
            typeof r["applicationId"] === "string"
              ? r["applicationId"]
              : typeof r["application_id"] === "string"
                ? r["application_id"]
                : null,
          status: String(r["status"] ?? "draft"),
          checklistJson:
            typeof checklist === "string" ? checklist : JSON.stringify(checklist ?? {}),
          submitterNotes: String(r["submitterNotes"] ?? r["submitter_notes"] ?? ""),
          reviewerNotes: String(r["reviewerNotes"] ?? r["reviewer_notes"] ?? ""),
          submittedAt:
            typeof r["submittedAt"] === "string"
              ? r["submittedAt"]
              : typeof r["submitted_at"] === "string"
                ? r["submitted_at"]
                : null,
          reviewedAt:
            typeof r["reviewedAt"] === "string"
              ? r["reviewedAt"]
              : typeof r["reviewed_at"] === "string"
                ? r["reviewed_at"]
                : null,
          createdAt: String(r["createdAt"] ?? r["created_at"] ?? ""),
          updatedAt: String(r["updatedAt"] ?? r["updated_at"] ?? ""),
        };
      });
    } catch (error) {
      if (error instanceof Error && error.message === APPROVAL_MIGRATION) return [];
      throw error;
    }
  });

export const decideMarketplaceSecurityReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { companyId: string; reviewId: string; approve: boolean; reviewerNotes?: string }) => ({
      companyId: assertUuid(input.companyId),
      reviewId: assertUuid(input.reviewId),
      approve: Boolean(input.approve),
      reviewerNotes: String(input.reviewerNotes ?? "")
        .trim()
        .slice(0, 2000),
    }),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      id: string;
      appCode: string;
      status: string;
      securityReviewPassed: boolean;
      realCustomerDataEnabled: boolean;
    }> => {
      await assertCompanyMember(context.supabase, data.companyId);
      await assertCompanyPermission(
        context.supabase,
        data.companyId,
        "appstore.manage_certification",
      );
      const result = await callRpc(
        context.supabase,
        "decide_marketplace_security_review",
        {
          _review_id: data.reviewId,
          _company_id: data.companyId,
          _approve: data.approve,
          _reviewer_notes: data.reviewerNotes,
        },
        APPROVAL_MIGRATION,
      );
      const row = (result ?? {}) as Record<string, unknown>;
      return {
        id: String(row["id"] ?? data.reviewId),
        appCode: String(row["appCode"] ?? row["app_code"] ?? ""),
        status: String(row["status"] ?? (data.approve ? "approved" : "rejected")),
        securityReviewPassed: Boolean(row["securityReviewPassed"] ?? data.approve),
        realCustomerDataEnabled: false,
      };
    },
  );

const HARDENING_MIGRATION =
  "Marketplace OAuth/suspend controls are not available yet: apply migration 20261107163000_marketplace_oauth_suspend_catalogue_hardening.";

export const createMarketplaceOAuthState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      companyId: string;
      appCode: string;
      redirectUri: string;
      codeChallenge: string;
      state: string;
      ttlSeconds?: number;
    }) => ({
      companyId: assertUuid(input.companyId),
      appCode: String(input.appCode ?? "")
        .trim()
        .slice(0, 80),
      redirectUri: String(input.redirectUri ?? "")
        .trim()
        .slice(0, 500),
      codeChallenge: String(input.codeChallenge ?? "")
        .trim()
        .slice(0, 128),
      state: String(input.state ?? "")
        .trim()
        .slice(0, 128),
      ttlSeconds: Math.min(900, Math.max(60, Number(input.ttlSeconds ?? 600) || 600)),
    }),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ state: string; expiresAt: string; codeChallengeMethod: string }> => {
      if (!data.appCode) throw new Error("App code is required.");
      await assertCompanyMember(context.supabase, data.companyId);
      await assertCompanyPermission(
        context.supabase,
        data.companyId,
        "appstore.manage_connections",
      );
      const result = await callRpc(
        context.supabase,
        "create_marketplace_oauth_state",
        {
          _company_id: data.companyId,
          _app_code: data.appCode,
          _redirect_uri: data.redirectUri,
          _code_challenge: data.codeChallenge,
          _state: data.state,
          _ttl_seconds: data.ttlSeconds,
        },
        HARDENING_MIGRATION,
      );
      const row = (result ?? {}) as Record<string, unknown>;
      return {
        state: String(row["state"] ?? data.state),
        expiresAt: String(row["expiresAt"] ?? row["expires_at"] ?? ""),
        codeChallengeMethod: String(
          row["codeChallengeMethod"] ?? row["code_challenge_method"] ?? "S256",
        ),
      };
    },
  );

export const consumeMarketplaceOAuthState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { companyId: string; appCode: string; state: string; redirectUri: string }) => ({
      companyId: assertUuid(input.companyId),
      appCode: String(input.appCode ?? "")
        .trim()
        .slice(0, 80),
      state: String(input.state ?? "")
        .trim()
        .slice(0, 128),
      redirectUri: String(input.redirectUri ?? "")
        .trim()
        .slice(0, 500),
    }),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      ok: boolean;
      codeChallenge: string;
      codeChallengeMethod: string;
      redirectUri: string;
      appCode: string;
      companyId: string;
    }> => {
      await assertCompanyMember(context.supabase, data.companyId);
      await assertCompanyPermission(
        context.supabase,
        data.companyId,
        "appstore.manage_connections",
      );
      const result = await callRpc(
        context.supabase,
        "consume_marketplace_oauth_state",
        {
          _company_id: data.companyId,
          _app_code: data.appCode,
          _state: data.state,
          _redirect_uri: data.redirectUri,
        },
        HARDENING_MIGRATION,
      );
      const row = (result ?? {}) as Record<string, unknown>;
      return {
        ok: Boolean(row["ok"] ?? true),
        codeChallenge: String(row["codeChallenge"] ?? row["code_challenge"] ?? ""),
        codeChallengeMethod: String(
          row["codeChallengeMethod"] ?? row["code_challenge_method"] ?? "S256",
        ),
        redirectUri: String(row["redirectUri"] ?? row["redirect_uri"] ?? data.redirectUri),
        appCode: String(row["appCode"] ?? row["app_code"] ?? data.appCode),
        companyId: String(row["companyId"] ?? row["company_id"] ?? data.companyId),
      };
    },
  );

export const suspendMarketplaceAppListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; appCode: string; reason: string }) => ({
    companyId: assertUuid(input.companyId),
    appCode: String(input.appCode ?? "")
      .trim()
      .slice(0, 80),
    reason: String(input.reason ?? "")
      .trim()
      .slice(0, 2000),
  }))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ appCode: string; suspended: boolean; realCustomerDataEnabled: boolean }> => {
      if (!data.appCode) throw new Error("App code is required.");
      if (data.reason.length < 8) throw new Error("Suspension reason is required.");
      await assertCompanyMember(context.supabase, data.companyId);
      await assertCompanyPermission(
        context.supabase,
        data.companyId,
        "appstore.manage_certification",
      );
      const result = await callRpc(
        context.supabase,
        "suspend_marketplace_app_listing",
        {
          _company_id: data.companyId,
          _app_code: data.appCode,
          _reason: data.reason,
        },
        HARDENING_MIGRATION,
      );
      const row = (result ?? {}) as Record<string, unknown>;
      return {
        appCode: String(row["appCode"] ?? row["app_code"] ?? data.appCode),
        suspended: Boolean(row["suspended"] ?? true),
        realCustomerDataEnabled: false,
      };
    },
  );

export type EnqueueSyncAttemptResult = {
  enqueued: false;
  reason: string;
};

/**
 * Attempt to enqueue a sync job. Always fail-closed until E2E + vault + activation gates.
 * Does not insert fabricated job rows.
 */
export const attemptEnqueueMarketplaceSyncJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      companyId: string;
      appCode: string;
      connectionId?: string | null;
      trigger?: "manual" | "scheduled" | "webhook";
    }) => ({
      companyId: companyIdOf(input),
      appCode: String(input.appCode ?? "")
        .trim()
        .slice(0, 80),
      connectionId:
        typeof input.connectionId === "string" && input.connectionId.trim()
          ? assertUuid(input.connectionId)
          : null,
      trigger: (input.trigger ?? "manual") as "manual" | "scheduled" | "webhook",
    }),
  )
  .handler(async ({ data, context }): Promise<EnqueueSyncAttemptResult> => {
    if (!data.appCode) throw new Error("App code is required.");
    await assertCompanyMember(context.supabase, data.companyId);
    try {
      await assertCompanyPermission(context.supabase, data.companyId, "appstore.view_sync");
    } catch {
      await assertCompanyPermission(context.supabase, data.companyId, "appstore.view");
    }

    const { decideEnqueueSyncJob } = await import("@/lib/app-store/engine/enqueue");
    const { DEFAULT_MARKETPLACE_APPS } = await import("@/lib/app-store/catalogue");
    type Impl = (typeof DEFAULT_MARKETPLACE_APPS)[number]["implementationStatus"];

    let implementationStatus: Impl =
      DEFAULT_MARKETPLACE_APPS.find((a) => a.code === data.appCode)?.implementationStatus ??
      "catalogue_only";
    let securityReviewPassed = false;
    let realCustomerDataEnabled = false;
    let suspended = false;

    try {
      const rows = await callRpc(
        context.supabase,
        "list_company_marketplace_apps",
        { _company_id: data.companyId },
        MARKETPLACE_MIGRATION,
      );
      const match = Array.isArray(rows)
        ? (rows as Record<string, unknown>[]).find((r) => String(r["code"] ?? "") === data.appCode)
        : undefined;
      if (match) {
        const rawStatus = String(
          match["implementationStatus"] ?? match["implementation_status"] ?? implementationStatus,
        );
        implementationStatus = (rawStatus as Impl) || implementationStatus;
        securityReviewPassed = Boolean(
          match["securityReviewPassed"] ?? match["security_review_passed"] ?? false,
        );
        realCustomerDataEnabled = Boolean(
          match["realCustomerDataEnabled"] ?? match["real_customer_data_enabled"] ?? false,
        );
        suspended = Boolean(match["suspended"] ?? false);
      }
    } catch {
      // defaults remain fail-closed
    }

    let hasInstallPermission = false;
    try {
      await assertCompanyPermission(context.supabase, data.companyId, "appstore.install");
      hasInstallPermission = true;
    } catch {
      hasInstallPermission = false;
    }

    const decision = decideEnqueueSyncJob({
      companyId: data.companyId,
      appCode: data.appCode,
      connectionId: data.connectionId,
      trigger: data.trigger,
      implementationStatus,
      securityReviewPassed,
      realCustomerDataEnabled,
      suspended,
      hasInstallPermission,
      oauthVaultConfigured: Boolean(
        process.env["MARKETPLACE_OAUTH_VAULT_KEY"]?.trim() ||
        process.env["APP_STORE_OAUTH_VAULT_CONFIGURED"] === "true",
      ),
    });

    if (!decision.allowed) {
      return { enqueued: false, reason: decision.reason };
    }

    // Live persistence requires a claim/enqueue RPC + worker — not invented here.
    return {
      enqueued: false,
      reason:
        "FAIL CLOSED: sync worker persistence is not enabled; gates passed but no job was written.",
    };
  });
