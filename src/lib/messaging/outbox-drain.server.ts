/**
 * Messaging outbox drain worker.
 * Marks durable outbox rows processed after realtime clients have had a chance
 * to observe them. Does not mutate ledger data.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type MessagingOutboxDrainSummary = {
  inspected: number;
  processed: number;
  skipped: number;
  failed: number;
};

export async function runMessagingOutboxDrain(input?: {
  limit?: number;
  olderThanSeconds?: number;
}): Promise<MessagingOutboxDrainSummary> {
  const limit = Math.min(Math.max(input?.limit ?? 200, 1), 1000);
  const olderThanSeconds = Math.min(Math.max(input?.olderThanSeconds ?? 60, 5), 3600);
  const cutoff = new Date(Date.now() - olderThanSeconds * 1000).toISOString();
  const db = supabaseAdmin;
  const summary: MessagingOutboxDrainSummary = {
    inspected: 0,
    processed: 0,
    skipped: 0,
    failed: 0,
  };

  const { data: rows, error } = await db
    .from("messaging_outbox_events" as never)
    .select("id, created_at, processed_at" as never)
    .is("processed_at" as never, null as never)
    .lt("created_at" as never, cutoff as never)
    .order("created_at" as never, { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);

  const events = (rows ?? []) as Array<{
    id: string;
    created_at: string;
    processed_at: string | null;
  }>;
  summary.inspected = events.length;
  if (!events.length) return summary;

  const ids = events.map((row) => row.id);
  const { error: updateError } = await db
    .from("messaging_outbox_events" as never)
    .update({ processed_at: new Date().toISOString() } as never)
    .in("id" as never, ids as never)
    .is("processed_at" as never, null as never);
  if (updateError) {
    summary.failed = events.length;
    throw new Error(updateError.message);
  }
  summary.processed = events.length;
  return summary;
}
