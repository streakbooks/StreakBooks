-- Ledger setup edits only its own fields. The separate policy controls retain their values.
CREATE FUNCTION public.nonprofit_save_ledger_setup(
  _company_id uuid, _expected_version integer, _enabled boolean,
  _framework text, _country text, _account_map jsonb
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  previous public.nonprofit_settings;
  saved public.nonprofit_settings;
BEGIN
  PERFORM public.nonprofit_require(_company_id, 'nonprofit.admin');
  IF _expected_version IS NULL OR _expected_version < 0 OR _enabled IS NULL OR
     _country IS NULL OR _country !~ '^[A-Z]{2}$' OR _framework IS NULL OR
     jsonb_typeof(_account_map) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid nonprofit setup values';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_each(_account_map) AS m(role, account)
    WHERE jsonb_typeof(m.account) <> 'string' OR
      (m.account <> '""'::jsonb AND NOT EXISTS (
        SELECT FROM public.accounts a
        WHERE a.company_id = _company_id AND a.id = NULLIF(m.account #>> '{}', '')::uuid
          AND a.is_active AND a.is_postable AND a.archived_at IS NULL
      ))
  ) THEN RAISE EXCEPTION 'Choose active posting accounts from this organisation'; END IF;

  IF _expected_version = 0 THEN
    INSERT INTO public.nonprofit_settings(company_id, enabled, accounting_framework, country_code, account_map)
      VALUES (_company_id, _enabled, _framework, _country, _account_map)
      ON CONFLICT (company_id) DO NOTHING RETURNING * INTO saved;
  ELSE
    SELECT * INTO previous FROM public.nonprofit_settings WHERE company_id = _company_id FOR UPDATE;
    UPDATE public.nonprofit_settings SET enabled = _enabled, accounting_framework = _framework,
      country_code = _country, account_map = _account_map, version = version + 1, updated_at = now()
      WHERE company_id = _company_id AND version = _expected_version RETURNING * INTO saved;
  END IF;
  IF saved.company_id IS NULL THEN RAISE EXCEPTION 'Nonprofit settings changed. Reload the latest setup before saving.'; END IF;
  INSERT INTO public.audit_events(company_id, actor_user_id, action, entity_type, entity_id, details)
    VALUES (_company_id, auth.uid(), 'nonprofit.settings.updated', 'nonprofit_settings', _company_id,
      jsonb_build_object('before', to_jsonb(previous), 'after', to_jsonb(saved)));
  RETURN saved.version;
END;
$$;
REVOKE ALL ON FUNCTION public.nonprofit_save_ledger_setup(uuid,integer,boolean,text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nonprofit_save_ledger_setup(uuid,integer,boolean,text,text,jsonb) TO authenticated;
