-- AI Assistant conversation entries: strictly per-user and per-organisation.
-- No provider secrets, full ledger context, or session tokens are retained here.
-- Applied by Supabase migration workflow; do not assume Git commit means deployed.

CREATE TABLE IF NOT EXISTS public.ai_conversation_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  intent text NOT NULL CHECK (
    intent IN ('ask', 'explain', 'categorise', 'draft', 'duplicates', 'reconcile', 'unusual', 'navigate')
  ),
  question text NOT NULL CHECK (char_length(question) BETWEEN 1 AND 4000),
  reply_markdown text NOT NULL CHECK (char_length(reply_markdown) BETWEEN 1 AND 20000),
  mode text NOT NULL CHECK (mode IN ('model', 'calculated')),
  facts jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(facts) = 'array'),
  suggestion_id uuid REFERENCES public.ai_suggestions(id) ON DELETE SET NULL,
  injection_flagged boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_conversation_entries_owner_recent_idx
  ON public.ai_conversation_entries (company_id, user_id, created_at DESC, id DESC);

ALTER TABLE public.ai_conversation_entries ENABLE ROW LEVEL SECURITY;

-- The user can only view their own entries in organisations where AI access remains granted.
CREATE POLICY "AI conversation entries are private to their creator"
  ON public.ai_conversation_entries FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'ai.use')
  );

CREATE POLICY "Users save their own AI conversations"
  ON public.ai_conversation_entries FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'ai.use')
  );

CREATE POLICY "Users may delete their own AI conversations"
  ON public.ai_conversation_entries FOR DELETE TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'ai.use')
  );

-- No UPDATE grant: past responses cannot be silently rewritten.
REVOKE ALL ON public.ai_conversation_entries FROM PUBLIC, anon;
GRANT SELECT, INSERT, DELETE ON public.ai_conversation_entries TO authenticated;

-- Match the existing MFA requirement applied to the other RLS-protected tables.
CREATE POLICY mfa_aal2_required ON public.ai_conversation_entries
  AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT private.mfa_requirement_met()))
  WITH CHECK ((SELECT private.mfa_requirement_met()));

-- Rollback when no longer required:
-- DROP TABLE IF EXISTS public.ai_conversation_entries;
