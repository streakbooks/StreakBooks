import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import {
  assertMessagingUuid,
  normaliseGroupTitle,
  normaliseMessageBody,
} from "@/lib/messaging/validation";
import type {
  MessagingConversation,
  MessagingInboxFilter,
  MessagingMessage,
  MessagingParticipant,
  MessagingSettings,
  MessagingVisibility,
} from "@/lib/messaging/types";
import { getMessagingRecordAdapter } from "@/lib/messaging/module-adapters";

function asError(error: { message: string } | null): never {
  throw new Error(error?.message ?? "Messaging request failed");
}

export const getMessagingSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({
    companyId: assertUuid(input?.companyId),
  }))
  .handler(async ({ data, context }): Promise<MessagingSettings> => {
    const { supabase } = context;
    try {
      await assertCompanyPermission(supabase, data.companyId, "messaging.view");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Pre-migration / unsynced permission catalogue: fail closed as disabled, not a crash.
      if (/messaging\.view|permission|does not exist|Could not find/i.test(message)) {
        return {
          company_id: data.companyId,
          enabled: false,
          allow_internal: true,
          allow_employee: true,
          allow_customer: false,
          allow_vendor: false,
          allow_accountant: true,
          allow_advisor: true,
          allow_group_create: true,
          allow_external_invite: false,
          allow_file_share: true,
          allow_ai_assist: false,
          allow_voice_video: false,
          max_attachment_bytes: 5_242_880,
          retention_days: null,
        };
      }
      throw error;
    }
    const { data: ensured, error: ensureError } = await supabase.rpc(
      "messaging_ensure_settings" as never,
      { _company_id: data.companyId } as never,
    );
    if (ensureError) {
      const message = ensureError.message ?? "";
      if (/does not exist|Could not find the function|schema cache/i.test(message)) {
        return {
          company_id: data.companyId,
          enabled: false,
          allow_internal: true,
          allow_employee: true,
          allow_customer: false,
          allow_vendor: false,
          allow_accountant: true,
          allow_advisor: true,
          allow_group_create: true,
          allow_external_invite: false,
          allow_file_share: true,
          allow_ai_assist: false,
          allow_voice_video: false,
          max_attachment_bytes: 5_242_880,
          retention_days: null,
        };
      }
      asError(ensureError);
    }
    const row = (ensured ?? null) as MessagingSettings | null;
    if (row) return row;
    const { data: settings, error } = await supabase
      .from("messaging_settings" as never)
      .select("*")
      .eq("company_id" as never, data.companyId as never)
      .maybeSingle();
    if (error) asError(error);
    return (settings ?? {
      company_id: data.companyId,
      enabled: false,
      allow_internal: true,
      allow_employee: true,
      allow_customer: false,
      allow_vendor: false,
      allow_accountant: true,
      allow_advisor: true,
      allow_group_create: true,
      allow_external_invite: false,
      allow_file_share: true,
      allow_ai_assist: false,
      allow_voice_video: false,
      max_attachment_bytes: 5_242_880,
      retention_days: null,
    }) as MessagingSettings;
  });

export const setMessagingEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; enabled: boolean }) => ({
    companyId: assertUuid(input?.companyId),
    enabled: Boolean(input?.enabled),
  }))
  .handler(async ({ data, context }): Promise<MessagingSettings> => {
    const { supabase } = context;
    await assertCompanyPermission(supabase, data.companyId, "messaging.manage_settings");
    const { data: row, error } = await supabase.rpc("messaging_set_enabled" as never, {
      _company_id: data.companyId,
      _enabled: data.enabled,
    } as never);
    if (error) asError(error);
    return row as MessagingSettings;
  });

export const setMessagingCollaborationFlags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      allowAiAssist?: boolean;
      allowFileShare?: boolean;
      allowCustomer?: boolean;
      allowVendor?: boolean;
      allowGroupCreate?: boolean;
    }) => ({
      companyId: assertUuid(input?.companyId),
      allowAiAssist: typeof input?.allowAiAssist === "boolean" ? input.allowAiAssist : null,
      allowFileShare: typeof input?.allowFileShare === "boolean" ? input.allowFileShare : null,
      allowCustomer: typeof input?.allowCustomer === "boolean" ? input.allowCustomer : null,
      allowVendor: typeof input?.allowVendor === "boolean" ? input.allowVendor : null,
      allowGroupCreate: typeof input?.allowGroupCreate === "boolean" ? input.allowGroupCreate : null,
    }),
  )
  .handler(async ({ data, context }): Promise<MessagingSettings> => {
    const { supabase } = context;
    await assertCompanyPermission(supabase, data.companyId, "messaging.manage_settings");
    const { data: row, error } = await supabase.rpc(
      "messaging_set_collaboration_flags" as never,
      {
        _company_id: data.companyId,
        _allow_ai_assist: data.allowAiAssist,
        _allow_file_share: data.allowFileShare,
        _allow_customer: data.allowCustomer,
        _allow_vendor: data.allowVendor,
        _allow_group_create: data.allowGroupCreate,
      } as never,
    );
    if (error) asError(error);
    return row as MessagingSettings;
  });

export const previewMessagingDigest = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { companyId: string; frequency?: "daily" | "weekly" }) => ({
      companyId: assertUuid(input?.companyId),
      frequency: input?.frequency === "weekly" ? ("weekly" as const) : ("daily" as const),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertCompanyPermission(supabase, data.companyId, "messaging.view");
    const { buildMessagingDigestPreview } = await import("@/lib/messaging/digests");

    const { data: memberships } = await supabase
      .from("messaging_conversation_members" as never)
      .select("conversation_id, last_read_seq, status" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("user_id" as never, context.userId as never)
      .eq("status" as never, "active" as never);
    const memRows = (memberships ?? []) as Array<{
      conversation_id: string;
      last_read_seq: number;
    }>;
    const ids = memRows.map((m) => m.conversation_id);
    if (!ids.length) {
      return buildMessagingDigestPreview({
        companyName: "Organisation",
        frequency: data.frequency,
        candidates: [],
      });
    }
    const { data: rows } = await supabase
      .from("messaging_conversations" as never)
      .select("id,title,visibility,last_message_preview,last_message_at" as never)
      .eq("company_id" as never, data.companyId as never)
      .in("id" as never, ids as never);
    const memById = new Map(memRows.map((m) => [m.conversation_id, m]));
    const { data: seqRows } = await supabase
      .from("messaging_messages" as never)
      .select("conversation_id, seq" as never)
      .in("conversation_id" as never, ids as never)
      .order("seq" as never, { ascending: false });
    const maxSeq = new Map<string, number>();
    for (const row of (seqRows ?? []) as Array<{ conversation_id: string; seq: number }>) {
      if (!maxSeq.has(row.conversation_id)) maxSeq.set(row.conversation_id, Number(row.seq));
    }
    const candidates = ((rows ?? []) as Array<Record<string, unknown>>).map((c) => {
      const id = String(c["id"]);
      const mem = memById.get(id);
      const max = maxSeq.get(id) ?? 0;
      const unreadCount = Math.max(0, max - Number(mem?.last_read_seq ?? 0));
      return {
        conversationId: id,
        title: (c["title"] as string | null) ?? null,
        preview: (c["last_message_preview"] as string | null) ?? null,
        unreadCount,
        visibility: String(c["visibility"] ?? "internal"),
        lastMessageAt: (c["last_message_at"] as string | null) ?? null,
      };
    });
    return buildMessagingDigestPreview({
      companyName: "Organisation",
      frequency: data.frequency,
      candidates,
    });
  });

export const getMessagingUnreadCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({
    companyId: assertUuid(input?.companyId),
  }))
  .handler(async ({ data, context }): Promise<number> => {
    const { supabase } = context;
    await assertCompanyPermission(supabase, data.companyId, "messaging.view");
    const { data: count, error } = await supabase.rpc("messaging_unread_count" as never, {
      _company_id: data.companyId,
    } as never);
    if (error) asError(error);
    return Number(count ?? 0);
  });

export const listEligibleMessagingParticipants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; search?: string }) => ({
    companyId: assertUuid(input?.companyId),
    search: typeof input?.search === "string" ? input.search.trim().slice(0, 80) : "",
  }))
  .handler(async ({ data, context }): Promise<MessagingParticipant[]> => {
    const { supabase, userId } = context;
    await assertCompanyPermission(supabase, data.companyId, "messaging.create");
    const { data: rows, error } = await supabase
      .from("company_members")
      .select("user_id, role, status")
      .eq("company_id", data.companyId)
      .eq("status", "active")
      .order("created_at");
    if (error) asError(error);
    const ids = (rows ?? []).map((r) => r.user_id).filter((id) => id !== userId);
    if (!ids.length) return [];
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", ids);
    if (profileError) asError(profileError);
    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
    const search = data.search.toLowerCase();
    return (rows ?? [])
      .filter((r) => r.user_id !== userId)
      .map((r) => ({
        user_id: r.user_id,
        role: r.role,
        status: r.status,
        full_name: byId.get(r.user_id)?.full_name ?? "",
        email: byId.get(r.user_id)?.email ?? "",
      }))
      .filter((p) => {
        if (!search) return true;
        return (
          p.full_name.toLowerCase().includes(search) || p.email.toLowerCase().includes(search)
        );
      })
      .slice(0, 50);
  });

export const listMessagingConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; filter?: MessagingInboxFilter; q?: string }) => ({
    companyId: assertUuid(input?.companyId),
    filter: (input?.filter ?? "inbox") as MessagingInboxFilter,
    q: typeof input?.q === "string" ? input.q.trim().slice(0, 120) : "",
  }))
  .handler(async ({ data, context }): Promise<MessagingConversation[]> => {
    const { supabase, userId } = context;
    await assertCompanyPermission(supabase, data.companyId, "messaging.view");

    const { data: memberships, error: memError } = await supabase
      .from("messaging_conversation_members" as never)
      .select(
        "conversation_id, last_read_seq, is_starred, is_archived, muted_until, status" as never,
      )
      .eq("company_id" as never, data.companyId as never)
      .eq("user_id" as never, userId as never)
      .eq("status" as never, "active" as never);
    if (memError) asError(memError);
    const memRows = (memberships ?? []) as Array<{
      conversation_id: string;
      last_read_seq: number;
      is_starred: boolean;
      is_archived: boolean;
      muted_until: string | null;
      status: string;
    }>;
    if (!memRows.length) return [];

    const wantArchived = data.filter === "archived";
    const filteredMem = memRows.filter((m) => (wantArchived ? m.is_archived : !m.is_archived));
    const ids = filteredMem.map((m) => m.conversation_id);
    if (!ids.length) return [];

    const { data: conversations, error } = await supabase
      .from("messaging_conversations" as never)
      .select(
        "id,company_id,conversation_type,visibility,title,description,dm_pair_key,channel_epoch,is_archived,last_message_at,last_message_preview,created_at,updated_at" as never,
      )
      .eq("company_id" as never, data.companyId as never)
      .in("id" as never, ids as never)
      .order("last_message_at" as never, { ascending: false, nullsFirst: false });
    if (error) asError(error);

    const memById = new Map(filteredMem.map((m) => [m.conversation_id, m]));
    let rows = ((conversations ?? []) as Array<Record<string, unknown>>).map((c) => {
      const mem = memById.get(String(c["id"]))!;
      const previewSeqGuess = c["last_message_at"] ? 1 : 0;
      const provisionalUnread = previewSeqGuess > 0 && Number(mem.last_read_seq) === 0;
      return {
        ...(c as unknown as MessagingConversation),
        unread: provisionalUnread,
        unread_count: provisionalUnread ? 1 : 0,
        is_starred: mem.is_starred,
        member_archived: mem.is_archived,
        muted_until: mem.muted_until,
      };
    });

    // Refine unread using max seq when possible
    const { data: seqRows } = await supabase
      .from("messaging_messages" as never)
      .select("conversation_id, seq" as never)
      .in("conversation_id" as never, ids as never)
      .order("seq" as never, { ascending: false });
    const maxSeq = new Map<string, number>();
    for (const row of (seqRows ?? []) as Array<{ conversation_id: string; seq: number }>) {
      if (!maxSeq.has(row.conversation_id)) maxSeq.set(row.conversation_id, Number(row.seq));
    }
    rows = rows.map((c) => {
      const mem = memById.get(c.id)!;
      const max = maxSeq.get(c.id) ?? 0;
      const unreadCount = Math.max(0, max - Number(mem.last_read_seq));
      return {
        ...c,
        unread: unreadCount > 0,
        unread_count: unreadCount,
      };
    });

    if (data.filter === "mentions") {
      const { data: mentionIds, error: mentionError } = await supabase.rpc(
        "messaging_list_mention_conversation_ids" as never,
        { _company_id: data.companyId } as never,
      );
      if (mentionError) asError(mentionError);
      const allowed = new Set(
        ((mentionIds ?? []) as Array<{ conversation_id: string }>).map((r) => r.conversation_id),
      );
      rows = rows.filter((c) => allowed.has(c.id));
    }

    switch (data.filter) {
      case "dm":
        rows = rows.filter((c) => c.conversation_type === "dm");
        break;
      case "groups":
        rows = rows.filter((c) =>
          ["group", "channel"].includes(c.conversation_type),
        );
        break;
      case "starred":
        rows = rows.filter((c) => c.is_starred);
        break;
      case "unread":
        rows = rows.filter((c) => c.unread);
        break;
      case "files":
        {
          const { data: fileRows } = await supabase
            .from("messaging_attachments" as never)
            .select("conversation_id" as never)
            .eq("company_id" as never, data.companyId as never)
            .in("conversation_id" as never, ids as never);
          const withFiles = new Set(
            ((fileRows ?? []) as Array<{ conversation_id: string }>).map((r) => r.conversation_id),
          );
          rows = rows.filter((c) => withFiles.has(c.id));
        }
        break;
      case "transactions":
        rows = rows.filter((c) =>
          ["record", "customer", "vendor", "accountant_client", "advisor_engagement"].includes(
            c.conversation_type,
          ),
        );
        break;
      case "mentions":
        break;
      default:
        break;
    }

    if (data.q) {
      const q = data.q.toLowerCase();
      rows = rows.filter(
        (c) =>
          (c.title ?? "").toLowerCase().includes(q) ||
          (c.last_message_preview ?? "").toLowerCase().includes(q),
      );
    }

    return rows;
  });

export const listMessagingMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      conversationId: string;
      afterSeq?: number;
      beforeSeq?: number;
      limit?: number;
    }) => ({
      companyId: assertUuid(input?.companyId),
      conversationId: assertMessagingUuid(input?.conversationId, "conversationId"),
      afterSeq: typeof input?.afterSeq === "number" && input.afterSeq >= 0 ? input.afterSeq : 0,
      beforeSeq:
        typeof input?.beforeSeq === "number" && input.beforeSeq > 0
          ? Math.floor(input.beforeSeq)
          : 0,
      limit:
        typeof input?.limit === "number" && input.limit > 0 && input.limit <= 200
          ? Math.floor(input.limit)
          : 200,
    }),
  )
  .handler(async ({ data, context }): Promise<MessagingMessage[]> => {
    const { supabase } = context;
    await assertCompanyPermission(supabase, data.companyId, "messaging.view");
    let query = supabase
      .from("messaging_messages" as never)
      .select(
        "id,company_id,conversation_id,seq,author_user_id,author_kind,body,body_format,reply_to_message_id,idempotency_key,is_edited,is_redacted,is_pinned,created_at,edited_at" as never,
      )
      .eq("company_id" as never, data.companyId as never)
      .eq("conversation_id" as never, data.conversationId as never)
      .limit(data.limit);

    // beforeSeq: page older history; afterSeq: catch-up; else latest window.
    if (data.beforeSeq > 0) {
      query = query
        .lt("seq" as never, data.beforeSeq as never)
        .order("seq" as never, { ascending: false });
    } else if (data.afterSeq > 0) {
      query = query
        .gt("seq" as never, data.afterSeq as never)
        .order("seq" as never, { ascending: true });
    } else {
      query = query.order("seq" as never, { ascending: false });
    }

    const { data: rows, error } = await query;
    if (error) asError(error);
    let messages = (rows ?? []) as MessagingMessage[];
    if (data.beforeSeq > 0 || data.afterSeq === 0) {
      messages = [...messages].sort((a, b) => a.seq - b.seq);
    }
    const authorIds = [...new Set(messages.map((m) => m.author_user_id).filter(Boolean))] as string[];
    const { data: profiles } = authorIds.length
      ? await supabase.from("profiles").select("id, full_name").in("id", authorIds)
      : { data: [] as { id: string; full_name: string }[] };
    const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
    return messages.map((m) => ({
      ...m,
      body: m.is_redacted ? "[Message removed]" : m.body,
      author_name: m.author_user_id ? (names.get(m.author_user_id) ?? "Member") : "System",
    }));
  });

/** In-conversation message search (authorised membership only). */
export const searchMessagingMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { companyId: string; conversationId: string; q: string; limit?: number }) => ({
      companyId: assertUuid(input?.companyId),
      conversationId: assertMessagingUuid(input?.conversationId, "conversationId"),
      q: typeof input?.q === "string" ? input.q.trim().slice(0, 120) : "",
      limit:
        typeof input?.limit === "number" && input.limit > 0 && input.limit <= 100
          ? Math.floor(input.limit)
          : 40,
    }),
  )
  .handler(async ({ data, context }): Promise<MessagingMessage[]> => {
    const { supabase } = context;
    await assertCompanyPermission(supabase, data.companyId, "messaging.view");
    if (!data.q) return [];
    const { data: rows, error } = await supabase
      .from("messaging_messages" as never)
      .select(
        "id,company_id,conversation_id,seq,author_user_id,author_kind,body,body_format,reply_to_message_id,idempotency_key,is_edited,is_redacted,is_pinned,created_at,edited_at" as never,
      )
      .eq("company_id" as never, data.companyId as never)
      .eq("conversation_id" as never, data.conversationId as never)
      .eq("is_redacted" as never, false as never)
      .ilike("body" as never, `%${data.q.replace(/[%_]/g, "")}%` as never)
      .order("seq" as never, { ascending: false })
      .limit(data.limit);
    if (error) asError(error);
    return ((rows ?? []) as MessagingMessage[]).map((m) => ({
      ...m,
      body: m.is_redacted ? "[Message removed]" : m.body,
    }));
  });

export type MessagingGlobalSearchHit = MessagingMessage & {
  conversation_title: string | null;
  conversation_type: string;
};

/** Cross-conversation search limited to the caller's active memberships. */
export const searchMessagingAcrossConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; q: string; limit?: number }) => ({
    companyId: assertUuid(input?.companyId),
    q: typeof input?.q === "string" ? input.q.trim().slice(0, 120) : "",
    limit:
      typeof input?.limit === "number" && input.limit > 0 && input.limit <= 50
        ? Math.floor(input.limit)
        : 25,
  }))
  .handler(async ({ data, context }): Promise<MessagingGlobalSearchHit[]> => {
    const { supabase, userId } = context;
    await assertCompanyPermission(supabase, data.companyId, "messaging.view");
    if (!data.q || data.q.length < 2) return [];

    const { data: memberships, error: memError } = await supabase
      .from("messaging_conversation_members" as never)
      .select("conversation_id" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("user_id" as never, userId as never)
      .eq("status" as never, "active" as never);
    if (memError) asError(memError);
    const conversationIds = [
      ...new Set(
        ((memberships ?? []) as Array<{ conversation_id: string }>).map((row) => row.conversation_id),
      ),
    ];
    if (!conversationIds.length) return [];

    const safeQ = data.q.replace(/[%_]/g, "");
    const { data: rows, error } = await supabase
      .from("messaging_messages" as never)
      .select(
        "id,company_id,conversation_id,seq,author_user_id,author_kind,body,body_format,reply_to_message_id,idempotency_key,is_edited,is_redacted,is_pinned,created_at,edited_at" as never,
      )
      .eq("company_id" as never, data.companyId as never)
      .in("conversation_id" as never, conversationIds as never)
      .eq("is_redacted" as never, false as never)
      .ilike("body" as never, `%${safeQ}%` as never)
      .order("created_at" as never, { ascending: false })
      .limit(data.limit);
    if (error) asError(error);
    const messages = (rows ?? []) as MessagingMessage[];
    if (!messages.length) return [];

    const hitConversationIds = [...new Set(messages.map((m) => m.conversation_id))];
    const { data: conversations, error: conversationError } = await supabase
      .from("messaging_conversations" as never)
      .select("id, title, conversation_type" as never)
      .eq("company_id" as never, data.companyId as never)
      .in("id" as never, hitConversationIds as never);
    if (conversationError) asError(conversationError);
    const meta = new Map(
      ((conversations ?? []) as Array<{ id: string; title: string | null; conversation_type: string }>).map(
        (row) => [row.id, row] as const,
      ),
    );

    return messages.map((m) => {
      const conversation = meta.get(m.conversation_id);
      return {
        ...m,
        body: m.is_redacted ? "[Message removed]" : m.body,
        conversation_title: conversation?.title ?? null,
        conversation_type: conversation?.conversation_type ?? "group",
      };
    });
  });

export const createDirectConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; peerUserId: string }) => ({
    companyId: assertUuid(input?.companyId),
    peerUserId: assertMessagingUuid(input?.peerUserId, "peerUserId"),
  }))
  .handler(async ({ data, context }): Promise<{ conversationId: string }> => {
    const { supabase } = context;
    await assertCompanyPermission(supabase, data.companyId, "messaging.create");
    const { data: id, error } = await supabase.rpc("messaging_create_dm" as never, {
      _company_id: data.companyId,
      _peer_user_id: data.peerUserId,
    } as never);
    if (error) asError(error);
    return { conversationId: String(id) };
  });

export const createGroupConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      title: string;
      description?: string;
      memberUserIds?: string[];
    }) => ({
      companyId: assertUuid(input?.companyId),
      title: normaliseGroupTitle(input?.title),
      description:
        typeof input?.description === "string" ? input.description.trim().slice(0, 2000) : "",
      memberUserIds: Array.isArray(input?.memberUserIds)
        ? input.memberUserIds.filter((id) => isFiniteUuid(id)).slice(0, 50)
        : [],
    }),
  )
  .handler(async ({ data, context }): Promise<{ conversationId: string }> => {
    const { supabase } = context;
    await assertCompanyPermission(supabase, data.companyId, "messaging.create_group");
    const { data: id, error } = await supabase.rpc("messaging_create_group" as never, {
      _company_id: data.companyId,
      _title: data.title,
      _description: data.description || null,
      _member_user_ids: data.memberUserIds,
    } as never);
    if (error) asError(error);
    return { conversationId: String(id) };
  });

export const createChannelConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      title: string;
      description?: string;
      memberUserIds?: string[];
    }) => ({
      companyId: assertUuid(input?.companyId),
      title: normaliseGroupTitle(input?.title),
      description:
        typeof input?.description === "string" ? input.description.trim().slice(0, 2000) : "",
      memberUserIds: Array.isArray(input?.memberUserIds)
        ? input.memberUserIds.filter((id) => isFiniteUuid(id)).slice(0, 50)
        : [],
    }),
  )
  .handler(async ({ data, context }): Promise<{ conversationId: string }> => {
    const { supabase } = context;
    await assertCompanyPermission(supabase, data.companyId, "messaging.create_group");
    const { data: id, error } = await supabase.rpc("messaging_create_channel" as never, {
      _company_id: data.companyId,
      _title: data.title,
      _description: data.description || null,
      _member_user_ids: data.memberUserIds,
    } as never);
    if (error) asError(error);
    return { conversationId: String(id) };
  });

export const listStarredMessagingMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({
    companyId: assertUuid(input?.companyId),
  }))
  .handler(async ({ data, context }): Promise<MessagingMessage[]> => {
    const { supabase, userId } = context;
    await assertCompanyPermission(supabase, data.companyId, "messaging.view");
    const { data: stars, error } = await supabase
      .from("messaging_starred_messages" as never)
      .select("message_id, created_at" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("user_id" as never, userId as never)
      .order("created_at" as never, { ascending: false })
      .limit(50);
    if (error) asError(error);
    const ids = ((stars ?? []) as Array<{ message_id: string }>).map((row) => row.message_id);
    if (!ids.length) return [];
    const { data: rows, error: messageError } = await supabase
      .from("messaging_messages" as never)
      .select(
        "id,company_id,conversation_id,seq,author_user_id,author_kind,body,body_format,reply_to_message_id,idempotency_key,is_edited,is_redacted,is_pinned,created_at,edited_at" as never,
      )
      .eq("company_id" as never, data.companyId as never)
      .in("id" as never, ids as never);
    if (messageError) asError(messageError);
    const byId = new Map(((rows ?? []) as MessagingMessage[]).map((row) => [row.id, row] as const));
    return ids
      .map((id) => byId.get(id))
      .filter((row): row is MessagingMessage => Boolean(row))
      .map((row) => ({
        ...row,
        body: row.is_redacted ? "[Message removed]" : row.body,
      }));
  });

function isFiniteUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value);
}

export const sendMessagingMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      conversationId: string;
      body: string;
      idempotencyKey: string;
      replyToMessageId?: string | null;
    }) => ({
      companyId: assertUuid(input?.companyId),
      conversationId: assertMessagingUuid(input?.conversationId, "conversationId"),
      body: normaliseMessageBody(input?.body),
      idempotencyKey: assertMessagingUuid(input?.idempotencyKey, "idempotencyKey"),
      replyToMessageId: input?.replyToMessageId
        ? assertMessagingUuid(input.replyToMessageId, "replyToMessageId")
        : null,
    }),
  )
  .handler(async ({ data, context }): Promise<MessagingMessage> => {
    const { supabase } = context;
    await assertCompanyPermission(supabase, data.companyId, "messaging.send");
    const { data: row, error } = await supabase.rpc("messaging_send_message" as never, {
      _company_id: data.companyId,
      _conversation_id: data.conversationId,
      _body: data.body,
      _idempotency_key: data.idempotencyKey,
      _reply_to_message_id: data.replyToMessageId,
      _body_format: "plain",
    } as never);
    if (error) asError(error);
    return row as MessagingMessage;
  });

export const markMessagingRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; conversationId: string; seq: number }) => ({
    companyId: assertUuid(input?.companyId),
    conversationId: assertMessagingUuid(input?.conversationId, "conversationId"),
    seq: Number.isFinite(input?.seq) ? Math.max(0, Math.floor(input.seq)) : 0,
  }))
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const { supabase } = context;
    await assertCompanyPermission(supabase, data.companyId, "messaging.view");
    const { data: ok, error } = await supabase.rpc("messaging_mark_read" as never, {
      _company_id: data.companyId,
      _conversation_id: data.conversationId,
      _seq: data.seq,
    } as never);
    if (error) asError(error);
    return { ok: Boolean(ok) };
  });

export const updateMessagingMembership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      conversationId: string;
      action: "mute" | "unmute" | "archive" | "unarchive" | "star" | "unstar" | "leave";
      muteHours?: number;
    }) => ({
      companyId: assertUuid(input?.companyId),
      conversationId: assertMessagingUuid(input?.conversationId, "conversationId"),
      action: input?.action,
      muteHours:
        typeof input?.muteHours === "number" && input.muteHours > 0 && input.muteHours <= 24 * 365
          ? Math.floor(input.muteHours)
          : null,
    }),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const { supabase } = context;
    await assertCompanyPermission(supabase, data.companyId, "messaging.view");
    const allowed = new Set([
      "mute",
      "unmute",
      "archive",
      "unarchive",
      "star",
      "unstar",
      "leave",
    ]);
    if (!allowed.has(data.action)) throw new Error("Invalid membership action");
    const mutedUntil =
      data.action === "mute"
        ? new Date(
            Date.now() + (data.muteHours ?? 24 * 365) * 60 * 60 * 1000,
          ).toISOString()
        : null;
    const { data: ok, error } = await supabase.rpc("messaging_update_membership" as never, {
      _company_id: data.companyId,
      _conversation_id: data.conversationId,
      _action: data.action,
      _muted_until: mutedUntil,
    } as never);
    if (error) asError(error);
    return { ok: Boolean(ok) };
  });

export const renameMessagingConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; conversationId: string; title: string }) => ({
    companyId: assertUuid(input?.companyId),
    conversationId: assertMessagingUuid(input?.conversationId, "conversationId"),
    title: normaliseGroupTitle(input?.title),
  }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertCompanyPermission(supabase, data.companyId, "messaging.view");
    const { data: row, error } = await supabase.rpc("messaging_rename_conversation" as never, {
      _company_id: data.companyId,
      _conversation_id: data.conversationId,
      _title: data.title,
    } as never);
    if (error) asError(error);
    return row as MessagingConversation;
  });

export const removeMessagingInternalMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { companyId: string; conversationId: string; memberUserId: string }) => ({
      companyId: assertUuid(input?.companyId),
      conversationId: assertMessagingUuid(input?.conversationId, "conversationId"),
      memberUserId: assertMessagingUuid(input?.memberUserId, "memberUserId"),
    }),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const { supabase } = context;
    await assertCompanyPermission(supabase, data.companyId, "messaging.invite_internal");
    const { data: ok, error } = await supabase.rpc("messaging_remove_internal_member" as never, {
      _company_id: data.companyId,
      _conversation_id: data.conversationId,
      _member_user_id: data.memberUserId,
    } as never);
    if (error) asError(error);
    return { ok: Boolean(ok) };
  });

export const openPortalDiscussion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      portalRole: "customer" | "supplier";
      contactId: string;
      recordType: string;
      recordId: string;
      title?: string;
      deepLinkPath?: string;
    }) => ({
      companyId: assertUuid(input?.companyId),
      portalRole: input?.portalRole === "supplier" ? "supplier" : "customer",
      contactId: assertMessagingUuid(input?.contactId, "contactId"),
      recordType: String(input?.recordType ?? "").trim().slice(0, 80),
      recordId: assertMessagingUuid(input?.recordId, "recordId"),
      title: typeof input?.title === "string" ? input.title.trim().slice(0, 120) : "",
      deepLinkPath:
        typeof input?.deepLinkPath === "string" ? input.deepLinkPath.trim().slice(0, 400) : "",
    }),
  )
  .handler(async ({ data, context }): Promise<{ conversationId: string }> => {
    const { supabase } = context;
    await assertCompanyPermission(supabase, data.companyId, "messaging.link_records");
    const { data: id, error } = await supabase.rpc("messaging_open_portal_discussion" as never, {
      _company_id: data.companyId,
      _portal_role: data.portalRole,
      _contact_id: data.contactId,
      _record_type: data.recordType,
      _record_id: data.recordId,
      _title: data.title || null,
      _deep_link_path: data.deepLinkPath || null,
    } as never);
    if (error) asError(error);
    return { conversationId: String(id) };
  });

export const openRecordDiscussion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      recordType: string;
      recordId: string;
      visibility?: MessagingVisibility;
      title?: string;
    }) => ({
      companyId: assertUuid(input?.companyId),
      recordType: String(input?.recordType ?? "").trim().slice(0, 80),
      recordId: assertMessagingUuid(input?.recordId, "recordId"),
      visibility: (input?.visibility ?? "internal") as MessagingVisibility,
      title: typeof input?.title === "string" ? input.title.trim().slice(0, 120) : "",
    }),
  )
  .handler(async ({ data, context }): Promise<{ conversationId: string; path: string }> => {
    const { supabase } = context;
    await assertCompanyPermission(supabase, data.companyId, "messaging.link_records");
    const adapter = getMessagingRecordAdapter(data.recordType);
    if (!adapter) throw new Error("Unsupported record type for discussion");
    await assertCompanyPermission(
      supabase,
      data.companyId,
      adapter.requiredViewPermission as never,
    );
    if (data.visibility !== "internal" && data.visibility !== adapter.defaultVisibility) {
      if (["customer", "vendor"].includes(data.visibility) && !adapter.allowExternal) {
        throw new Error("External discussion is not enabled for this record type");
      }
    }
    const deepLink = adapter.buildDeepLink(data.recordId);
    const { data: id, error } = await supabase.rpc("messaging_open_record_discussion" as never, {
      _company_id: data.companyId,
      _record_type: data.recordType,
      _record_id: data.recordId,
      _visibility: data.visibility || adapter.defaultVisibility,
      _title: data.title || adapter.label,
      _deep_link_path: deepLink,
    } as never);
    if (error) asError(error);
    return { conversationId: String(id), path: `/messages?conversation=${id}` };
  });

export const registerMessagingAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      conversationId: string;
      messageId?: string | null;
      storagePath: string;
      fileName: string;
      mimeType: string;
      byteSize: number;
    }) => ({
      companyId: assertUuid(input?.companyId),
      conversationId: assertMessagingUuid(input?.conversationId, "conversationId"),
      messageId: input?.messageId ? assertMessagingUuid(input.messageId, "messageId") : null,
      storagePath: String(input?.storagePath ?? "").trim().slice(0, 500),
      fileName: String(input?.fileName ?? "").trim().slice(0, 180),
      mimeType: String(input?.mimeType ?? "").trim().slice(0, 120),
      byteSize: Math.floor(Number(input?.byteSize) || 0),
    }),
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { supabase } = context;
    const { data: row, error } = await supabase.rpc("messaging_register_attachment" as never, {
      _company_id: data.companyId,
      _conversation_id: data.conversationId,
      _message_id: data.messageId,
      _storage_path: data.storagePath,
      _file_name: data.fileName,
      _mime_type: data.mimeType,
      _byte_size: data.byteSize,
    } as never);
    if (error) asError(error);
    return { id: String((row as { id: string }).id) };
  });

export const listMessagingAttachments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; conversationId: string }) => ({
    companyId: assertUuid(input?.companyId),
    conversationId: assertMessagingUuid(input?.conversationId, "conversationId"),
  }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertCompanyPermission(supabase, data.companyId, "messaging.view");
    const { data: rows, error } = await supabase
      .from("messaging_attachments" as never)
      .select(
        "id,company_id,conversation_id,message_id,file_name,mime_type,byte_size,storage_path,created_at" as never,
      )
      .eq("company_id" as never, data.companyId as never)
      .eq("conversation_id" as never, data.conversationId as never)
      .order("created_at" as never, { ascending: false });
    if (error) asError(error);
    return rows ?? [];
  });

export const editMessagingMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; messageId: string; body: string }) => ({
    companyId: assertUuid(input?.companyId),
    messageId: assertMessagingUuid(input?.messageId, "messageId"),
    body: normaliseMessageBody(input?.body),
  }))
  .handler(async ({ data, context }): Promise<MessagingMessage> => {
    const { supabase } = context;
    const { data: row, error } = await supabase.rpc("messaging_edit_message" as never, {
      _company_id: data.companyId,
      _message_id: data.messageId,
      _body: data.body,
    } as never);
    if (error) asError(error);
    return row as MessagingMessage;
  });

export const redactMessagingMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; messageId: string }) => ({
    companyId: assertUuid(input?.companyId),
    messageId: assertMessagingUuid(input?.messageId, "messageId"),
  }))
  .handler(async ({ data, context }): Promise<MessagingMessage> => {
    const { supabase } = context;
    const { data: row, error } = await supabase.rpc("messaging_redact_message" as never, {
      _company_id: data.companyId,
      _message_id: data.messageId,
    } as never);
    if (error) asError(error);
    return row as MessagingMessage;
  });

export const reactMessagingMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; messageId: string; emoji: string }) => ({
    companyId: assertUuid(input?.companyId),
    messageId: assertMessagingUuid(input?.messageId, "messageId"),
    emoji: String(input?.emoji ?? "").trim().slice(0, 16),
  }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (!data.emoji) throw new Error("Emoji required");
    const { data: row, error } = await supabase.rpc("messaging_react_message" as never, {
      _company_id: data.companyId,
      _message_id: data.messageId,
      _emoji: data.emoji,
    } as never);
    if (error) asError(error);
    return row;
  });

export const openHrPrivateConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; title: string; peerUserId?: string }) => ({
    companyId: assertUuid(input?.companyId),
    title: normaliseGroupTitle(input?.title || "Private HR discussion"),
    peerUserId: input?.peerUserId
      ? assertMessagingUuid(input.peerUserId, "peerUserId")
      : null,
  }))
  .handler(async ({ data, context }): Promise<{ conversationId: string }> => {
    const { supabase } = context;
    const { data: id, error } = await supabase.rpc("messaging_open_hr_private" as never, {
      _company_id: data.companyId,
      _title: data.title,
      _peer_user_id: data.peerUserId,
    } as never);
    if (error) asError(error);
    return { conversationId: String(id) };
  });

export const openAccountantClientConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; title: string; peerUserId: string }) => ({
    companyId: assertUuid(input?.companyId),
    title: normaliseGroupTitle(input?.title || "Accountant discussion"),
    peerUserId: assertMessagingUuid(input?.peerUserId, "peerUserId"),
  }))
  .handler(async ({ data, context }): Promise<{ conversationId: string }> => {
    const { supabase } = context;
    const { data: id, error } = await supabase.rpc("messaging_open_accountant_client" as never, {
      _company_id: data.companyId,
      _title: data.title,
      _peer_user_id: data.peerUserId,
    } as never);
    if (error) asError(error);
    return { conversationId: String(id) };
  });

export const requestMessagingFormalApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      conversationId: string;
      assigneeUserId: string;
      kind: string;
      recordType: string;
      recordId: string;
      note?: string;
      targetPath?: string;
    }) => ({
      companyId: assertUuid(input?.companyId),
      conversationId: assertMessagingUuid(input?.conversationId, "conversationId"),
      assigneeUserId: assertMessagingUuid(input?.assigneeUserId, "assigneeUserId"),
      kind: String(input?.kind ?? "").trim().slice(0, 80),
      recordType: String(input?.recordType ?? "").trim().slice(0, 80),
      recordId: assertMessagingUuid(input?.recordId, "recordId"),
      note: typeof input?.note === "string" ? input.note.trim().slice(0, 500) : "",
      targetPath:
        typeof input?.targetPath === "string" ? input.targetPath.trim().slice(0, 400) : "",
    }),
  )
  .handler(async ({ data, context }): Promise<{ notificationId: string }> => {
    const { supabase } = context;
    await assertCompanyPermission(supabase, data.companyId, "messaging.send");
    if (looksLikeInformalOnly(data.note)) {
      // Notes that are only "approved" still create a review request — never an approval.
    }
    const { data: id, error } = await supabase.rpc("messaging_request_formal_approval" as never, {
      _company_id: data.companyId,
      _conversation_id: data.conversationId,
      _assignee_user_id: data.assigneeUserId,
      _kind: data.kind || "task_assignment",
      _record_type: data.recordType,
      _record_id: data.recordId,
      _note: data.note || "Review requested from Messages",
      _target_path: data.targetPath || null,
    } as never);
    if (error) asError(error);
    return { notificationId: String(id) };
  });

function looksLikeInformalOnly(note: string): boolean {
  return /^(approved|approve|lgtm|ok|okay)[.!]*$/i.test(note.trim());
}

export const portalOpenInvoiceDiscussion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { membershipId: string; invoiceId: string }) => ({
    membershipId: assertMessagingUuid(input?.membershipId, "membershipId"),
    invoiceId: assertMessagingUuid(input?.invoiceId, "invoiceId"),
  }))
  .handler(async ({ data, context }): Promise<{ conversationId: string }> => {
    const { supabase } = context;
    const { data: id, error } = await supabase.rpc(
      "messaging_portal_open_invoice_discussion" as never,
      {
        _membership_id: data.membershipId,
        _invoice_id: data.invoiceId,
      } as never,
    );
    if (error) asError(error);
    return { conversationId: String(id) };
  });

export const portalOpenPurchaseOrderDiscussion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { membershipId: string; orderId: string }) => ({
    membershipId: assertMessagingUuid(input?.membershipId, "membershipId"),
    orderId: assertMessagingUuid(input?.orderId, "orderId"),
  }))
  .handler(async ({ data, context }): Promise<{ conversationId: string }> => {
    const { supabase } = context;
    const { data: id, error } = await supabase.rpc("messaging_portal_open_po_discussion" as never, {
      _membership_id: data.membershipId,
      _order_id: data.orderId,
    } as never);
    if (error) asError(error);
    return { conversationId: String(id) };
  });

export const portalSendMessagingMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      membershipId: string;
      conversationId: string;
      body: string;
      idempotencyKey: string;
    }) => ({
      membershipId: assertMessagingUuid(input?.membershipId, "membershipId"),
      conversationId: assertMessagingUuid(input?.conversationId, "conversationId"),
      body: normaliseMessageBody(input?.body),
      idempotencyKey: assertMessagingUuid(input?.idempotencyKey, "idempotencyKey"),
    }),
  )
  .handler(async ({ data, context }): Promise<MessagingMessage> => {
    const { supabase } = context;
    const { data: row, error } = await supabase.rpc("messaging_portal_send_message" as never, {
      _membership_id: data.membershipId,
      _conversation_id: data.conversationId,
      _body: data.body,
      _idempotency_key: data.idempotencyKey,
    } as never);
    if (error) asError(error);
    return row as MessagingMessage;
  });

export const openAdvisorEngagementConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; title: string; peerUserId: string }) => ({
    companyId: assertUuid(input?.companyId),
    title: normaliseGroupTitle(input?.title || "Advisor engagement"),
    peerUserId: assertMessagingUuid(input?.peerUserId, "peerUserId"),
  }))
  .handler(async ({ data, context }): Promise<{ conversationId: string }> => {
    const { supabase } = context;
    const { data: id, error } = await supabase.rpc("messaging_open_advisor_engagement" as never, {
      _company_id: data.companyId,
      _title: data.title,
      _peer_user_id: data.peerUserId,
    } as never);
    if (error) asError(error);
    return { conversationId: String(id) };
  });

export const markMessagingUnread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; conversationId: string }) => ({
    companyId: assertUuid(input?.companyId),
    conversationId: assertMessagingUuid(input?.conversationId, "conversationId"),
  }))
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const { supabase } = context;
    const { data: ok, error } = await supabase.rpc("messaging_mark_unread" as never, {
      _company_id: data.companyId,
      _conversation_id: data.conversationId,
    } as never);
    if (error) asError(error);
    return { ok: Boolean(ok) };
  });

/** Mark every active membership as read up to the conversation max seq. */
export const markAllMessagingRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({
    companyId: assertUuid(input?.companyId),
  }))
  .handler(async ({ data, context }): Promise<{ marked: number }> => {
    const { supabase, userId } = context;
    await assertCompanyPermission(supabase, data.companyId, "messaging.view");
    const { data: memberships, error: memError } = await supabase
      .from("messaging_conversation_members" as never)
      .select("conversation_id, last_read_seq" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("user_id" as never, userId as never)
      .eq("status" as never, "active" as never)
      .eq("is_archived" as never, false as never);
    if (memError) asError(memError);
    const memRows = (memberships ?? []) as Array<{
      conversation_id: string;
      last_read_seq: number;
    }>;
    if (!memRows.length) return { marked: 0 };

    const ids = memRows.map((row) => row.conversation_id);
    const { data: seqRows, error: seqError } = await supabase
      .from("messaging_messages" as never)
      .select("conversation_id, seq" as never)
      .in("conversation_id" as never, ids as never)
      .order("seq" as never, { ascending: false });
    if (seqError) asError(seqError);
    const maxSeq = new Map<string, number>();
    for (const row of (seqRows ?? []) as Array<{ conversation_id: string; seq: number }>) {
      if (!maxSeq.has(row.conversation_id)) maxSeq.set(row.conversation_id, Number(row.seq));
    }

    let marked = 0;
    for (const mem of memRows) {
      const max = maxSeq.get(mem.conversation_id) ?? 0;
      if (max <= Number(mem.last_read_seq)) continue;
      const { error } = await supabase.rpc("messaging_mark_read" as never, {
        _company_id: data.companyId,
        _conversation_id: mem.conversation_id,
        _seq: max,
      } as never);
      if (error) asError(error);
      marked += 1;
    }
    return { marked };
  });

export type MessagingRecordLink = {
  record_type: string;
  record_id: string;
  deep_link_path: string | null;
};

export const getMessagingConversationRecordLink = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; conversationId: string }) => ({
    companyId: assertUuid(input?.companyId),
    conversationId: assertMessagingUuid(input?.conversationId, "conversationId"),
  }))
  .handler(async ({ data, context }): Promise<MessagingRecordLink | null> => {
    const { supabase } = context;
    await assertCompanyPermission(supabase, data.companyId, "messaging.view");
    const { data: rows, error } = await supabase
      .from("messaging_record_links" as never)
      .select("record_type, record_id, deep_link_path" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("conversation_id" as never, data.conversationId as never)
      .limit(1);
    if (error) asError(error);
    const row = ((rows ?? []) as MessagingRecordLink[])[0];
    return row ?? null;
  });

export const getMessagingNotificationPreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({
    companyId: assertUuid(input?.companyId),
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCompanyPermission(supabase, data.companyId, "messaging.view");
    const { data: row, error } = await supabase
      .from("messaging_notification_preferences" as never)
      .select(
        "company_id,user_id,email_enabled,push_enabled,mention_only,digest_frequency,quiet_hours_start,quiet_hours_end,updated_at" as never,
      )
      .eq("company_id" as never, data.companyId as never)
      .eq("user_id" as never, userId as never)
      .maybeSingle();
    if (error) asError(error);
    return (
      row ?? {
        company_id: data.companyId,
        user_id: userId,
        email_enabled: true,
        push_enabled: false,
        mention_only: false,
        digest_frequency: "off",
        quiet_hours_start: null,
        quiet_hours_end: null,
        updated_at: null,
      }
    );
  });

export const saveMessagingNotificationPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      emailEnabled?: boolean;
      pushEnabled?: boolean;
      mentionOnly?: boolean;
      digestFrequency?: "off" | "daily" | "weekly";
      quietHoursStart?: string | null;
      quietHoursEnd?: string | null;
    }) => ({
      companyId: assertUuid(input?.companyId),
      emailEnabled: input?.emailEnabled !== false,
      pushEnabled: Boolean(input?.pushEnabled),
      mentionOnly: Boolean(input?.mentionOnly),
      digestFrequency:
        input?.digestFrequency === "daily" || input?.digestFrequency === "weekly"
          ? input.digestFrequency
          : "off",
      quietHoursStart:
        typeof input?.quietHoursStart === "string" && input.quietHoursStart
          ? input.quietHoursStart.slice(0, 8)
          : null,
      quietHoursEnd:
        typeof input?.quietHoursEnd === "string" && input.quietHoursEnd
          ? input.quietHoursEnd.slice(0, 8)
          : null,
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertCompanyPermission(supabase, data.companyId, "messaging.view");
    const { data: row, error } = await supabase.rpc(
      "messaging_upsert_notification_preferences" as never,
      {
        _company_id: data.companyId,
        _email_enabled: data.emailEnabled,
        _push_enabled: data.pushEnabled,
        _mention_only: data.mentionOnly,
        _digest_frequency: data.digestFrequency,
        _quiet_hours_start: data.quietHoursStart,
        _quiet_hours_end: data.quietHoursEnd,
      } as never,
    );
    if (error) asError(error);
    return row;
  });

export const pinMessagingMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; messageId: string; pinned?: boolean }) => ({
    companyId: assertUuid(input?.companyId),
    messageId: assertMessagingUuid(input?.messageId, "messageId"),
    pinned: input?.pinned !== false,
  }))
  .handler(async ({ data, context }): Promise<MessagingMessage> => {
    const { supabase } = context;
    const { data: row, error } = await supabase.rpc("messaging_pin_message" as never, {
      _company_id: data.companyId,
      _message_id: data.messageId,
      _pinned: data.pinned,
    } as never);
    if (error) asError(error);
    return row as MessagingMessage;
  });

export const starMessagingMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; messageId: string; starred?: boolean }) => ({
    companyId: assertUuid(input?.companyId),
    messageId: assertMessagingUuid(input?.messageId, "messageId"),
    starred: input?.starred !== false,
  }))
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const { supabase } = context;
    const { data: ok, error } = await supabase.rpc("messaging_star_message" as never, {
      _company_id: data.companyId,
      _message_id: data.messageId,
      _starred: data.starred,
    } as never);
    if (error) asError(error);
    return { ok: Boolean(ok) };
  });

export const addMessagingInternalMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { companyId: string; conversationId: string; memberUserIds: string[] }) => ({
      companyId: assertUuid(input?.companyId),
      conversationId: assertMessagingUuid(input?.conversationId, "conversationId"),
      memberUserIds: Array.isArray(input?.memberUserIds)
        ? input.memberUserIds
            .slice(0, 40)
            .map((id) => assertMessagingUuid(id, "memberUserId"))
        : [],
    }),
  )
  .handler(async ({ data, context }): Promise<{ added: number }> => {
    const { supabase } = context;
    await assertCompanyPermission(supabase, data.companyId, "messaging.invite_internal");
    if (!data.memberUserIds.length) return { added: 0 };
    const { data: added, error } = await supabase.rpc(
      "messaging_add_internal_members" as never,
      {
        _company_id: data.companyId,
        _conversation_id: data.conversationId,
        _member_user_ids: data.memberUserIds,
      } as never,
    );
    if (error) asError(error);
    return { added: Number(added ?? 0) };
  });

export const listPinnedMessagingMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; conversationId: string }) => ({
    companyId: assertUuid(input?.companyId),
    conversationId: assertMessagingUuid(input?.conversationId, "conversationId"),
  }))
  .handler(async ({ data, context }): Promise<MessagingMessage[]> => {
    const { supabase } = context;
    await assertCompanyPermission(supabase, data.companyId, "messaging.view");
    const { data: rows, error } = await supabase
      .from("messaging_messages" as never)
      .select(
        "id,company_id,conversation_id,seq,author_user_id,author_kind,body,body_format,reply_to_message_id,idempotency_key,is_edited,is_redacted,is_pinned,created_at,edited_at" as never,
      )
      .eq("company_id" as never, data.companyId as never)
      .eq("conversation_id" as never, data.conversationId as never)
      .eq("is_pinned" as never, true as never)
      .eq("is_redacted" as never, false as never)
      .order("seq" as never, { ascending: false })
      .limit(20);
    if (error) asError(error);
    return ((rows ?? []) as MessagingMessage[]).map((m) => ({
      ...m,
      body: m.is_redacted ? "[Message removed]" : m.body,
    }));
  });

export const listMessagingConversationMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; conversationId: string }) => ({
    companyId: assertUuid(input?.companyId),
    conversationId: assertMessagingUuid(input?.conversationId, "conversationId"),
  }))
  .handler(async ({ data, context }): Promise<MessagingParticipant[]> => {
    const { supabase } = context;
    await assertCompanyPermission(supabase, data.companyId, "messaging.view");
    const { data: members, error } = await supabase
      .from("messaging_conversation_members" as never)
      .select("user_id, member_role, status, participant_kind" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("conversation_id" as never, data.conversationId as never)
      .eq("status" as never, "active" as never);
    if (error) asError(error);
    const userIds = [
      ...new Set(
        ((members ?? []) as Array<{ user_id: string | null }>)
          .map((row) => row.user_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (!userIds.length) return [];
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", userIds);
    if (profileError) asError(profileError);
    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
    const roleById = new Map(
      ((members ?? []) as Array<{ user_id: string | null; member_role: string }>).map((m) => [
        String(m.user_id),
        m.member_role,
      ]),
    );
    return userIds.map((userId) => {
      const profile = byId.get(userId);
      return {
        user_id: userId,
        full_name: profile?.full_name ?? "Member",
        email: profile?.email ?? "",
        role: roleById.get(userId) ?? "member",
        status: "active",
      };
    });
  });

export const listMessagingMessageReceipts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; messageId: string }) => ({
    companyId: assertUuid(input?.companyId),
    messageId: assertMessagingUuid(input?.messageId, "messageId"),
  }))
  .handler(
    async ({
      data,
      context,
    }): Promise<Array<{ user_id: string; full_name: string; read_at: string }>> => {
      const { supabase } = context;
      await assertCompanyPermission(supabase, data.companyId, "messaging.view");
      const { data: rows, error } = await supabase
        .from("messaging_message_receipts" as never)
        .select("user_id, read_at" as never)
        .eq("company_id" as never, data.companyId as never)
        .eq("message_id" as never, data.messageId as never)
        .not("read_at" as never, "is" as never, null as never)
        .order("read_at" as never, { ascending: true })
        .limit(40);
      if (error) asError(error);
      const receipts = (rows ?? []) as Array<{ user_id: string; read_at: string }>;
      const ids = receipts.map((row) => row.user_id);
      if (!ids.length) return [];
      const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name ?? "Member"]));
      return receipts.map((row) => ({
        user_id: row.user_id,
        full_name: names.get(row.user_id) ?? "Member",
        read_at: row.read_at,
      }));
    },
  );

export const blockMessagingUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; blockedUserId: string; reason?: string }) => ({
    companyId: assertUuid(input?.companyId),
    blockedUserId: assertMessagingUuid(input?.blockedUserId, "blockedUserId"),
    reason: typeof input?.reason === "string" ? input.reason.trim().slice(0, 500) : "",
  }))
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const { supabase } = context;
    await assertCompanyPermission(supabase, data.companyId, "messaging.view");
    const { data: ok, error } = await supabase.rpc("messaging_block_user" as never, {
      _company_id: data.companyId,
      _blocked_user_id: data.blockedUserId,
      _reason: data.reason || null,
    } as never);
    if (error) asError(error);
    return { ok: Boolean(ok) };
  });

export const unblockMessagingUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; blockedUserId: string }) => ({
    companyId: assertUuid(input?.companyId),
    blockedUserId: assertMessagingUuid(input?.blockedUserId, "blockedUserId"),
  }))
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const { supabase } = context;
    await assertCompanyPermission(supabase, data.companyId, "messaging.view");
    const { data: ok, error } = await supabase.rpc("messaging_unblock_user" as never, {
      _company_id: data.companyId,
      _blocked_user_id: data.blockedUserId,
    } as never);
    if (error) asError(error);
    return { ok: Boolean(ok) };
  });

export const setMessagingRetentionDays = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; retentionDays: number | null }) => ({
    companyId: assertUuid(input?.companyId),
    retentionDays:
      input?.retentionDays == null
        ? null
        : Number.isFinite(input.retentionDays)
          ? Math.floor(Number(input.retentionDays))
          : null,
  }))
  .handler(async ({ data, context }): Promise<MessagingSettings> => {
    const { supabase } = context;
    await assertCompanyPermission(supabase, data.companyId, "messaging.manage_retention");
    const { data: row, error } = await supabase.rpc("messaging_set_retention_days" as never, {
      _company_id: data.companyId,
      _retention_days: data.retentionDays,
    } as never);
    if (error) asError(error);
    return row as MessagingSettings;
  });

export const reportMessagingMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; messageId: string; reason?: string }) => ({
    companyId: assertUuid(input?.companyId),
    messageId: assertMessagingUuid(input?.messageId, "messageId"),
    reason: typeof input?.reason === "string" ? input.reason.trim().slice(0, 500) : "reported",
  }))
  .handler(async ({ data, context }): Promise<{ reportId: string }> => {
    const { supabase } = context;
    await assertCompanyPermission(supabase, data.companyId, "messaging.view");
    const { data: id, error } = await supabase.rpc("messaging_report_message" as never, {
      _company_id: data.companyId,
      _message_id: data.messageId,
      _reason: data.reason,
    } as never);
    if (error) asError(error);
    return { reportId: String(id) };
  });

export const listBlockedMessagingUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({
    companyId: assertUuid(input?.companyId),
  }))
  .handler(
    async ({
      data,
      context,
    }): Promise<Array<{ blocked_user_id: string; full_name: string; email: string; reason: string | null; created_at: string }>> => {
      const { supabase, userId } = context;
      await assertCompanyPermission(supabase, data.companyId, "messaging.view");
      const { data: rows, error } = await supabase
        .from("messaging_user_blocks" as never)
        .select("blocked_user_id, reason, created_at" as never)
        .eq("company_id" as never, data.companyId as never)
        .eq("blocker_user_id" as never, userId as never)
        .order("created_at" as never, { ascending: false });
      if (error) asError(error);
      const blocks = (rows ?? []) as Array<{
        blocked_user_id: string;
        reason: string | null;
        created_at: string;
      }>;
      const ids = blocks.map((row) => row.blocked_user_id);
      if (!ids.length) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);
      const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
      return blocks.map((row) => {
        const profile = byId.get(row.blocked_user_id);
        return {
          blocked_user_id: row.blocked_user_id,
          full_name: profile?.full_name ?? "Member",
          email: profile?.email ?? "",
          reason: row.reason,
          created_at: row.created_at,
        };
      });
    },
  );

export const previewMessagingRetentionPurge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({
    companyId: assertUuid(input?.companyId),
  }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertCompanyPermission(supabase, data.companyId, "messaging.manage_retention");
    const { data: settings, error } = await supabase
      .from("messaging_settings" as never)
      .select("retention_days" as never)
      .eq("company_id" as never, data.companyId as never)
      .maybeSingle();
    if (error) asError(error);
    const retentionDays =
      (settings as { retention_days: number | null } | null)?.retention_days ?? null;
    if (retentionDays == null) {
      return { retentionDays: null, candidateCount: 0 };
    }
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);
    const { count, error: countError } = await supabase
      .from("messaging_messages" as never)
      .select("id" as never, { count: "exact", head: true })
      .eq("company_id" as never, data.companyId as never)
      .eq("is_redacted" as never, false as never)
      .lt("created_at" as never, cutoff.toISOString() as never);
    if (countError) asError(countError);
    return { retentionDays, candidateCount: count ?? 0 };
  });

export const getMessagingAnalyticsSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; days?: number }) => ({
    companyId: assertUuid(input?.companyId),
    days:
      typeof input?.days === "number" && input.days > 0 && input.days <= 90
        ? Math.floor(input.days)
        : 14,
  }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertCompanyPermission(supabase, data.companyId, "messaging.manage_settings");
    const { summariseMessagingVolume } = await import("@/lib/messaging/analytics");
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - data.days);
    const { data: rows, error } = await supabase
      .from("messaging_messages" as never)
      .select("created_at, conversation_id" as never)
      .eq("company_id" as never, data.companyId as never)
      .gte("created_at" as never, since.toISOString() as never)
      .limit(5_000);
    if (error) asError(error);
    const messageRows = (rows ?? []) as Array<{ created_at: string; conversation_id: string }>;
    const conversationIds = [...new Set(messageRows.map((row) => row.conversation_id))];
    const visibilityById = new Map<string, string>();
    if (conversationIds.length) {
      const { data: conversations, error: conversationError } = await supabase
        .from("messaging_conversations" as never)
        .select("id, visibility" as never)
        .eq("company_id" as never, data.companyId as never)
        .in("id" as never, conversationIds as never);
      if (conversationError) asError(conversationError);
      for (const row of (conversations ?? []) as Array<{ id: string; visibility: string }>) {
        visibilityById.set(row.id, row.visibility);
      }
    }
    const safeRows = messageRows.filter((row) => {
      const visibility = visibilityById.get(row.conversation_id) ?? "internal";
      return visibility !== "hr_private" && visibility !== "payroll_restricted";
    });
    const volume = summariseMessagingVolume(safeRows);
    return {
      days: data.days,
      totalMessages: safeRows.length,
      volume,
      note: "HR/private and payroll-restricted conversations are excluded from analytics.",
    };
  });
