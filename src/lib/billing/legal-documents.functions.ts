import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Legal documents. Wording is written and reviewed by people; StreakBooks only versions it, keeps
 * reviewed text immutable and requires a second platform owner to approve it.
 */
export const LEGAL_DOCUMENT_KINDS = [
  "TERMS_OF_SERVICE",
  "PRIVACY_POLICY",
  "REFUND_POLICY",
  "CANCELLATION_POLICY",
  "RECURRING_PAYMENT_AUTHORISATION",
  "PARTNER_TERMS",
  "PARTNER_DISCLOSURE",
] as const;

export type LegalDocument = {
  id: string;
  kind: (typeof LEGAL_DOCUMENT_KINDS)[number];
  locale: string;
  version: number;
  title: string;
  status: "draft" | "approved" | "published" | "retired";
  requiresLegalReview: boolean;
  bodySha256: string;
  createdBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  body?: string;
};

type RpcClient = {
  rpc: (
    fn: never,
    args?: never,
  ) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>;
};

async function callRpc(client: unknown, fn: string, args?: Record<string, unknown>) {
  const { data, error } = await (client as RpcClient).rpc(fn as never, args as never);
  if (error) throw new Error(error.message);
  return data;
}

const reason = z.string().trim().min(3).max(500);
const draftInput = z
  .object({
    kind: z.enum(LEGAL_DOCUMENT_KINDS),
    locale: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/),
    title: z.string().trim().min(3).max(200),
    body: z.string().min(20).max(200000),
    reason,
  })
  .strict();
const actionInput = z
  .object({
    id: z.string().uuid(),
    action: z.enum(["approve", "publish", "retire"]),
    reason,
  })
  .strict();

export const listPublishedLegalDocuments = createServerFn({ method: "GET" }).handler(async () => {
  setResponseHeader("Cache-Control", "public, max-age=300");
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return [] as LegalDocument[];
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.rpc(
    "billing_published_legal_documents" as never,
    {
      _kinds: null,
      _locale: "en",
    } as never,
  );
  if (error) {
    if (error.code === "42883" || error.code === "PGRST202") return [] as LegalDocument[];
    throw new Error(error.message);
  }
  return (data ?? []) as LegalDocument[];
});

export const getLegalDocumentsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({ context }) =>
      (await callRpc(context.supabase, "platform_legal_documents")) as LegalDocument[],
  );

export const draftLegalDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => draftInput.parse(input))
  .handler(async ({ data, context }) => {
    const result = (await callRpc(context.supabase, "platform_draft_legal_document", {
      _kind: data.kind,
      _locale: data.locale,
      _title: data.title,
      _body: data.body,
      _reason: data.reason,
    })) as LegalDocument;
    return result;
  });

export const actOnLegalDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => actionInput.parse(input))
  .handler(async ({ data, context }) => {
    const fn = {
      approve: "platform_approve_legal_document",
      publish: "platform_publish_legal_document",
      retire: "platform_retire_legal_document",
    }[data.action];
    return (await callRpc(context.supabase, fn, {
      _id: data.id,
      _reason: data.reason,
    })) as LegalDocument;
  });
