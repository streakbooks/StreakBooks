import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  normalizeAdminPayload,
  validateAdminPayload,
  type AdvisorCatalogueAuditRow,
  type AdvisorCataloguePayload,
  type AdvisorCatalogueVersionSummary,
} from "@/lib/advisors/admin-catalogue";

type RpcClient = {
  rpc: (
    fn: never,
    args?: never,
  ) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>;
};

async function callRpc(client: unknown, fn: string, args?: Record<string, unknown>) {
  const { data, error } = await (client as RpcClient).rpc(fn as never, args as never);
  if (error) {
    const message = error.message ?? "Advisors admin request failed.";
    if (
      message.includes("schema cache") ||
      message.includes("Could not find the function") ||
      message.includes("PGRST202")
    ) {
      throw new Error(
        "Advisors catalogue admin is not available in this database yet. Apply the Advisors SQL migrations (AD-01/AD-02), then reload the API schema cache and try again.",
      );
    }
    throw new Error(message);
  }
  return data;
}

const reasonSchema = z.string().trim().min(3).max(500);
const saveDraftSchema = z
  .object({
    payload: z.unknown(),
    label: z.string().trim().max(120).optional(),
    reason: reasonSchema,
  })
  .strict();

export type AdvisorsCatalogueAdmin = {
  role: string;
  live: AdvisorCataloguePayload;
  draft: {
    id: string;
    versionNumber: number;
    status: "draft";
    label: string;
    payload: AdvisorCataloguePayload;
    updatedAt: string;
  } | null;
  versions: AdvisorCatalogueVersionSummary[];
  audit: AdvisorCatalogueAuditRow[];
};

function mapAdminResponse(raw: unknown): AdvisorsCatalogueAdmin {
  const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const draftRaw = row["draft"];
  const draft =
    draftRaw && typeof draftRaw === "object"
      ? (() => {
          const draftRow = draftRaw as Record<string, unknown>;
          return {
            id: String(draftRow["id"] ?? ""),
            versionNumber: Number(draftRow["versionNumber"] ?? 0),
            status: "draft" as const,
            label: String(draftRow["label"] ?? ""),
            payload: normalizeAdminPayload(draftRow["payload"]),
            updatedAt: String(draftRow["updatedAt"] ?? ""),
          };
        })()
      : null;
  const versions = Array.isArray(row["versions"])
    ? row["versions"].map((item) => {
        const version = (item ?? {}) as Record<string, unknown>;
        return {
          id: String(version["id"] ?? ""),
          versionNumber: Number(version["versionNumber"] ?? 0),
          status: (version["status"] as AdvisorCatalogueVersionSummary["status"]) ?? "archived",
          label: String(version["label"] ?? ""),
          publishedAt: typeof version["publishedAt"] === "string" ? version["publishedAt"] : null,
          createdAt: String(version["createdAt"] ?? ""),
          updatedAt: String(version["updatedAt"] ?? ""),
        } satisfies AdvisorCatalogueVersionSummary;
      })
    : [];
  const audit = Array.isArray(row["audit"])
    ? row["audit"].map((item) => {
        const entry = (item ?? {}) as Record<string, unknown>;
        return {
          id: String(entry["id"] ?? ""),
          action: String(entry["action"] ?? ""),
          versionId: typeof entry["versionId"] === "string" ? entry["versionId"] : null,
          reason: String(entry["reason"] ?? ""),
          createdAt: String(entry["createdAt"] ?? ""),
          actorUserId: typeof entry["actorUserId"] === "string" ? entry["actorUserId"] : null,
        } satisfies AdvisorCatalogueAuditRow;
      })
    : [];
  return {
    role: String(row["role"] ?? ""),
    live: normalizeAdminPayload(row["live"]),
    draft,
    versions,
    audit,
  };
}

export const getAdvisorsCatalogueAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const data = await callRpc(context.supabase, "platform_advisors_catalogue_admin");
    return mapAdminResponse(data);
  });

export const saveAdvisorsCatalogueDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => saveDraftSchema.parse(input))
  .handler(async ({ data, context }) => {
    const payload = normalizeAdminPayload(data.payload);
    const errors = validateAdminPayload(payload);
    if (errors.length) throw new Error(errors[0]);
    const result = await callRpc(context.supabase, "platform_advisors_save_draft", {
      _payload: payload,
      _label: data.label ?? "",
      _reason: data.reason,
    });
    const row = (result ?? {}) as Record<string, unknown>;
    return {
      id: String(row["id"] ?? ""),
      versionNumber: Number(row["versionNumber"] ?? 0),
      status: "draft" as const,
      label: String(row["label"] ?? ""),
      payload: normalizeAdminPayload(row["payload"]),
      updatedAt: String(row["updatedAt"] ?? ""),
    };
  });

export const publishAdvisorsCatalogueDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ reason: reasonSchema }).strict().parse(input))
  .handler(async ({ data, context }) => {
    const result = await callRpc(context.supabase, "platform_advisors_publish_draft", {
      _reason: data.reason,
    });
    return result as {
      id: string;
      versionNumber: number;
      status: string;
      publishedAt: string;
      note: string;
    };
  });

export const restoreAdvisorsCatalogueVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ versionId: z.string().uuid(), reason: reasonSchema }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    const result = await callRpc(context.supabase, "platform_advisors_restore_version", {
      _version_id: data.versionId,
      _reason: data.reason,
    });
    const row = (result ?? {}) as Record<string, unknown>;
    return {
      id: String(row["id"] ?? ""),
      versionNumber: Number(row["versionNumber"] ?? 0),
      status: "draft" as const,
      label: String(row["label"] ?? ""),
      payload: normalizeAdminPayload(row["payload"]),
      updatedAt: String(row["updatedAt"] ?? ""),
    };
  });
