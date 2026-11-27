CREATE OR REPLACE FUNCTION public.invite_portal_user(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _uid UUID := auth.uid();
  _company UUID := NULLIF(payload->>'company_id', '')::UUID;
  _contact UUID := NULLIF(payload->>'contact_id', '')::UUID;
  _role TEXT := payload->>'role';
  _email TEXT := lower(btrim(COALESCE(payload->>'email', '')));
  _mfa BOOLEAN := COALESCE((payload->>'mfa_required')::BOOLEAN, false);
  _company_mfa BOOLEAN;
  _kind TEXT;
  _days INTEGER;
  _token TEXT;
  _id UUID;
  _expires TIMESTAMPTZ;
  _demo BOOLEAN;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF _company IS NULL OR _contact IS NULL THEN RAISE EXCEPTION 'company_id and contact_id are required'; END IF;
  IF NOT public.is_company_member(_company) THEN RAISE EXCEPTION 'You do not have access to that organisation'; END IF;
  IF _role NOT IN ('customer', 'supplier') THEN RAISE EXCEPTION 'Role must be customer or supplier'; END IF;
  IF _role = 'customer' AND NOT public.has_company_permission(_company, 'sales.draft') THEN
    RAISE EXCEPTION 'You do not have permission to invite customers';
  END IF;
  IF _role = 'supplier' AND NOT public.has_company_permission(_company, 'purchases.draft') THEN
    RAISE EXCEPTION 'You do not have permission to invite suppliers';
  END IF;
  IF NOT public.portal_enabled(_company) THEN
    RAISE EXCEPTION 'Turn on Portals in Settings → Feature manager before inviting people';
  END IF;
  PERFORM public.portal_assert_writable(_company);
  PERFORM public.portal_rate_limit('invite:' || _uid::TEXT, 30, INTERVAL '15 minutes');

  SELECT kind::TEXT, COALESCE(NULLIF(_email, ''), lower(btrim(email)))
    INTO _kind, _email
  FROM public.contacts
  WHERE id = _contact AND company_id = _company AND is_active AND archived_at IS NULL;
  IF _kind IS NULL THEN RAISE EXCEPTION 'Contact not found'; END IF;
  IF _role = 'customer' AND _kind NOT IN ('customer', 'both') THEN
    RAISE EXCEPTION 'This contact is not a customer';
  END IF;
  IF _role = 'supplier' AND _kind NOT IN ('supplier', 'both') THEN
    RAISE EXCEPTION 'This contact is not a supplier';
  END IF;
  IF _email IS NULL OR _email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Enter an email address for this invitation';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.portal_memberships
    WHERE company_id = _company AND contact_id = _contact AND portal_role = _role
      AND status IN ('invited', 'active')
  ) THEN
    RAISE EXCEPTION 'This contact already has an active or pending % portal login. Revoke it before inviting again.', _role;
  END IF;

  SELECT COALESCE(invite_days, 14), require_mfa
    INTO _days, _company_mfa
  FROM public.portal_settings WHERE company_id = _company;
  _mfa := _mfa OR COALESCE(_company_mfa, false);
  _days := COALESCE(_days, 14);
  _token := replace(gen_random_uuid()::TEXT, '-', '') || replace(gen_random_uuid()::TEXT, '-', '');
  _expires := now() + make_interval(days => _days);

  INSERT INTO public.portal_memberships (
    company_id, contact_id, email, portal_role, status, mfa_required,
    invite_token_hash, invite_expires_at, invited_by
  ) VALUES (
    _company, _contact, _email, _role, 'invited', COALESCE(_mfa, false),
    encode(sha256(convert_to(_token, 'UTF8')), 'hex'), _expires, _uid
  ) RETURNING id INTO _id;

  SELECT is_demo INTO _demo FROM public.companies WHERE id = _company;
  PERFORM public.portal_audit(_company, _uid, 'portal.invite', 'contact', _contact,
    jsonb_build_object('membership_id', _id, 'role', _role, 'email', _email));
  RETURN jsonb_build_object(
    'membership_id', _id,
    'token', _token,
    'email', _email,
    'expires_at', _expires,
    'role', _role,
    'is_demo', COALESCE(_demo, false)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.invite_portal_user(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invite_portal_user(jsonb) TO authenticated;
