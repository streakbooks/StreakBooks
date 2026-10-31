-- Audited communication delivery separate from financial document email permission.
-- Uses the authenticated verified mailbox rather than accepting a client-supplied recipient.
CREATE OR REPLACE FUNCTION public.record_communication_delivery(
  _company_id uuid,
  _template text,
  _subject text,
  _status text,
  _provider_message_id text DEFAULT NULL,
  _error text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _verified_email text;
  _id uuid;
BEGIN
  IF _uid IS NULL OR NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Organisation membership required';
  END IF;
  IF _template NOT IN ('notification_test', 'notification_digest') THEN
    RAISE EXCEPTION 'Unsupported communication template';
  END IF;
  IF _template = 'notification_test' AND NOT public.has_company_permission(_company_id, 'company.settings.edit') THEN
    RAISE EXCEPTION 'Company settings permission required';
  END IF;
  IF _template = 'notification_digest' AND EXISTS (
    SELECT 1 FROM public.companies WHERE id = _company_id AND is_demo
  ) THEN
    RAISE EXCEPTION 'Financial digests disabled for demo organisations';
  END IF;
  IF _status NOT IN ('sent','failed')
    OR length(coalesce(_subject,'')) NOT BETWEEN 1 AND 300
    OR length(coalesce(_provider_message_id,'')) > 200
    OR length(coalesce(_error,'')) > 500 THEN
    RAISE EXCEPTION 'Invalid delivery details';
  END IF;
  SELECT email INTO _verified_email FROM auth.users
  WHERE id = _uid AND email_confirmed_at IS NOT NULL;
  IF _verified_email IS NULL THEN RAISE EXCEPTION 'Verified recipient required'; END IF;

  INSERT INTO public.email_outbox (
    company_id, entity_type, entity_id, template,
    to_addresses, subject, provider, provider_message_id,
    status, error, sent_by
  ) VALUES (
    _company_id, 'company', _company_id, _template,
    ARRAY[_verified_email], _subject, 'resend',
    NULLIF(_provider_message_id,''), _status, NULLIF(_error,''), _uid
  )
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;
REVOKE ALL ON FUNCTION public.record_communication_delivery(uuid,text,text,text,text,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_communication_delivery(uuid,text,text,text,text,text)
  TO authenticated;

DROP POLICY IF EXISTS communication_own_outbox_read ON public.email_outbox;
CREATE POLICY communication_own_outbox_read ON public.email_outbox
FOR SELECT TO authenticated
USING (
  entity_type = 'company'
  AND sent_by = (SELECT auth.uid())
  AND public.is_company_member(company_id)
);
