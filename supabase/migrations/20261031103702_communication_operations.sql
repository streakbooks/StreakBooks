-- Communications operations: rate limits and user-owned digest preferences.
-- All sending is performed by authenticated server functions; database claims only prevent abuse.
CREATE TABLE IF NOT EXISTS public.communication_send_claims (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('test_email','digest_manual')),
  window_start timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id,user_id,kind,window_start)
);
ALTER TABLE public.communication_send_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.communication_send_claims FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.communication_send_claims TO service_role;

CREATE TABLE IF NOT EXISTS public.communication_digest_preferences (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  frequency text NOT NULL DEFAULT 'off' CHECK (frequency IN ('off','daily','weekly')),
  weekday integer NOT NULL DEFAULT 1 CHECK (weekday BETWEEN 0 AND 6),
  hour_local integer NOT NULL DEFAULT 8 CHECK (hour_local BETWEEN 0 AND 23),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id,user_id)
);
ALTER TABLE public.communication_digest_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS communication_digest_preferences_select ON public.communication_digest_preferences;
CREATE POLICY communication_digest_preferences_select ON public.communication_digest_preferences
 FOR SELECT TO authenticated USING (
   user_id=(select auth.uid()) AND public.is_company_member(company_id)
 );
DROP POLICY IF EXISTS communication_digest_preferences_insert ON public.communication_digest_preferences;
CREATE POLICY communication_digest_preferences_insert ON public.communication_digest_preferences
 FOR INSERT TO authenticated WITH CHECK (
   user_id=(select auth.uid()) AND public.is_company_member(company_id)
 );
DROP POLICY IF EXISTS communication_digest_preferences_update ON public.communication_digest_preferences;
CREATE POLICY communication_digest_preferences_update ON public.communication_digest_preferences
 FOR UPDATE TO authenticated
 USING (user_id=(select auth.uid()) AND public.is_company_member(company_id))
 WITH CHECK (user_id=(select auth.uid()) AND public.is_company_member(company_id));
REVOKE ALL ON public.communication_digest_preferences FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.communication_digest_preferences TO authenticated;
GRANT ALL ON public.communication_digest_preferences TO service_role;

CREATE OR REPLACE FUNCTION public.claim_communication_send(_company_id uuid,_kind text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE _uid uuid:=auth.uid(); _window timestamptz; _changed integer;
BEGIN
 IF _uid IS NULL OR NOT public.is_company_member(_company_id) THEN
   RAISE EXCEPTION 'Not permitted to send communications';
 END IF;
 IF _kind NOT IN ('test_email','digest_manual') THEN RAISE EXCEPTION 'Invalid delivery type'; END IF;
 IF _kind='test_email' AND NOT public.has_company_permission(_company_id,'company.settings.edit') THEN
   RAISE EXCEPTION 'Not permitted to send test messages';
 END IF;
 IF _kind='digest_manual'
    AND EXISTS (SELECT 1 FROM public.companies WHERE id=_company_id AND is_demo) THEN
   RAISE EXCEPTION 'Demo financial digests are disabled';
 END IF;
 -- Test mail: one per five-minute window. Manual digest: one per hour.
 _window := CASE WHEN _kind='test_email'
   THEN date_trunc('hour',now()) + (floor(extract(minute from now())/5)*interval '5 minutes')
   ELSE date_trunc('hour',now()) END;
 INSERT INTO public.communication_send_claims(company_id,user_id,kind,window_start)
 VALUES (_company_id,_uid,_kind,_window)
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS _changed=ROW_COUNT;
 RETURN _changed=1;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_communication_send(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.claim_communication_send(uuid,text) TO authenticated;

CREATE INDEX IF NOT EXISTS communication_send_claims_cleanup_idx
  ON public.communication_send_claims(created_at);
-- Retain at most 90 days of rate-limit tokens through regular database maintenance.

-- Company administrators can inspect notification emails in the existing real email_outbox.
DROP POLICY IF EXISTS communication_email_outbox_select ON public.email_outbox;
CREATE POLICY communication_email_outbox_select ON public.email_outbox FOR SELECT TO authenticated
  USING (entity_type='company'
    AND public.has_company_permission(company_id,'company.settings.edit'));
