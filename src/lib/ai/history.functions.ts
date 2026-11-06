import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import type { AiIntent } from "@/lib/ai/ai.functions";

import type { AiConversationMode } from "@/lib/ai/history-store";

export type AiConversationRow = {
  id: string;
  company_id: string;
  user_id: string;
  intent: AiIntent;
  question: string;
  reply_markdown: string;
  mode: AiConversationMode;
  facts: Array<{ kind: string; title: string; body: string }>;
  suggestion_id: string | null;
  injection_flagged: boolean;
  created_at: string;
};

export const listAiConversationHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({
    companyId: assertUuid(input.companyId),
  }))
  .handler(async ({ data, context }): Promise<AiConversationRow[]> => {
    await assertCompanyPermission(context.supabase, data.companyId, "ai.use");
    const { data: rows, error } = await context.supabase
      .from("ai_conversation_entries" as never)
      .select(
        "id, company_id, user_id, intent, question, reply_markdown, mode, facts, suggestion_id, injection_flagged, created_at" as never,
      )
      .eq("company_id" as never, data.companyId as never)
      .eq("user_id" as never, context.userId as never)
      .order("created_at" as never, { ascending: false })
      .limit(50);
    if (error) throw new Error("Conversation history is unavailable. Check the AI history migration.");
    return (rows ?? []) as AiConversationRow[];
  });

export const deleteAiConversationHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; entryId?: string; all?: boolean }) => {
    if (input.all !== true && !input.entryId) {
      throw new Error("Choose a conversation to delete or explicitly select all");
    }
    if (input.all === true && input.entryId) {
      throw new Error("Specify one deletion scope");
    }
    return {
      companyId: assertUuid(input.companyId),
      entryId: input.entryId ? assertUuid(input.entryId, "conversation entry") : null,
      all: input.all === true,
    };
  })
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "ai.use");
    let query = context.supabase
      .from("ai_conversation_entries" as never)
      .delete()
      .eq("company_id" as never, data.companyId as never)
      .eq("user_id" as never, context.userId as never);

    if (!data.all && data.entryId) {
      query = query.eq("id" as never, data.entryId as never);
    }
    const { data: deleted, error } = await query.select("id" as never);
    if (error) throw new Error("Could not delete conversation history");
    return { deletedCount: (deleted ?? []).length };
  });
