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

export const listPublicMarketplaceCatalogue = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicMarketplaceCatalogue> => {
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
      const { data, error } = await client.rpc("list_public_marketplace_catalogue" as never);
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
        apps: normalizeMarketplaceApps(data),
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
  },
);

export const listCompanyMarketplaceApps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
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
  .inputValidator((input: { companyId: string; appCode: string }) => ({
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
  .inputValidator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
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
  .inputValidator((input: { firmId: string }) => ({ firmId: assertUuid(input.firmId) }))
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
  .inputValidator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
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

export const listCompanySyncJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({ companyId: companyIdOf(input) }))
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
