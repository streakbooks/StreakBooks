-- Tighten direct-table grants on the new conversation history table.
-- Some Supabase schemas have default authenticated grants, so revoke explicitly.
-- RLS remains enforced; only SELECT, INSERT and DELETE are supported.
REVOKE ALL ON TABLE public.ai_conversation_entries FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.ai_conversation_entries TO authenticated;
