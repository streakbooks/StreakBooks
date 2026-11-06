import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { AiIntent } from "@/lib/ai/ai.functions";

export type AiConversationMode = "model" | "calculated";

export type AiExchangeToSave = {
  companyId: string;
  userId: string;
  intent: AiIntent;
  question: string;
  answer: string;
  mode: AiConversationMode;
  facts: Array<{ kind: string; title: string; body: string }>;
  suggestionId: string | null;
  injectionFlagged: boolean;
};

/**
 * Best-effort persistence: a failed history write must not discard a successful
 * calculated answer or the result of a paid provider request.
 */
export async function saveAiExchange(
  supabase: SupabaseClient<Database>,
  exchange: AiExchangeToSave,
): Promise<{ saved: boolean; historyId: string | null }> {
  try {
    const { data, error } = await supabase
      .from("ai_conversation_entries" as never)
      .insert({
        company_id: exchange.companyId,
        user_id: exchange.userId,
        intent: exchange.intent,
        question: exchange.question,
        reply_markdown: exchange.answer,
        mode: exchange.mode,
        facts: exchange.facts,
        suggestion_id: exchange.suggestionId,
        injection_flagged: exchange.injectionFlagged,
      } as never)
      .select("id" as never)
      .single();

    if (error || !data) return { saved: false, historyId: null };
    return { saved: true, historyId: (data as { id: string }).id };
  } catch {
    return { saved: false, historyId: null };
  }
}
