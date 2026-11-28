CREATE TABLE IF NOT EXISTS public.user_global_preferences (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  preference_key TEXT NOT NULL CHECK (length(trim(preference_key)) > 0),
  preference_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, preference_key)
);

ALTER TABLE public.user_global_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_global_preferences FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.user_global_preferences TO authenticated;

CREATE POLICY user_global_preferences_manage_own
  ON public.user_global_preferences
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
