-- Isolated RLS regression for account-wide, user-owned appearance preferences.
-- Run only through scripts/test-workflows-postgres.mjs, never against a hosted project.
INSERT INTO auth.users(id) VALUES
  ('00000000-0000-4000-8000-000000000051'),
  ('00000000-0000-4000-8000-000000000052')
ON CONFLICT (id) DO NOTHING;

SET ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000051"}', false);
INSERT INTO public.user_global_preferences(user_id, preference_key, preference_value)
VALUES ('00000000-0000-4000-8000-000000000051', 'personal_appearance', '{"theme":"dark"}');

SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000052"}', false);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.user_global_preferences
             WHERE user_id='00000000-0000-4000-8000-000000000051') THEN
    RAISE EXCEPTION 'A different user read another account’s global preferences';
  END IF;
  BEGIN
    INSERT INTO public.user_global_preferences(user_id, preference_key, preference_value)
    VALUES ('00000000-0000-4000-8000-000000000051', 'personal_appearance', '{"theme":"light"}');
    RAISE EXCEPTION 'A different user wrote another account’s global preferences';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END $$;

INSERT INTO public.user_global_preferences(user_id, preference_key, preference_value)
VALUES ('00000000-0000-4000-8000-000000000052', 'personal_appearance', '{"theme":"light"}');
DO $$
BEGIN
  IF (SELECT preference_value->>'theme' FROM public.user_global_preferences
      WHERE user_id='00000000-0000-4000-8000-000000000052') <> 'light' THEN
    RAISE EXCEPTION 'The user could not read its own global preference';
  END IF;
END $$;

RESET ROLE;
