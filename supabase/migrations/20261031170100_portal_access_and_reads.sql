-- Portal invitations, settings, and customer/supplier reads.
-- Depends on 20261031170000_customer_supplier_portals.sql.

CREATE OR REPLACE FUNCTION public.portal_my_access(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'membership_id', m.id,
      'company_id', m.company_id,
      'company_name', c.name,
      'contact_id', m.contact_id,
      'contact_name', ct.name,
      'role', m.portal_role,
      'mfa_required', m.mfa_required,
      'enabled', public.portal_enabled(m.company_id),
      'locale', c.locale,
      'date_format', c.date_format,
      'currency', c.base_currency,
      'theme_color', c.document_theme_color
    ) ORDER BY c.name, m.portal_role)
    FROM public.portal_memberships m
    JOIN public.companies c ON c.id = m.company_id
    JOIN public.contacts ct ON ct.id = m.contact_id
    WHERE m.user_id = auth.uid() AND m.status = 'active'
  ), '[]'::JSONB);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_portal_settings(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _company UUID := NULLIF(payload->>'company_id', '')::UUID;
  _s public.portal_settings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF _company IS NULL OR NOT public.is_company_member(_company) THEN
    RAISE EXCEPTION 'You do not have access to that organisation';
  END IF;
  IF NOT public.has_company_permission(_company, 'company.settings.edit')
     AND NOT public.has_company_permission(_company, 'sales.draft')
     AND NOT public.has_company_permission(_company, 'purchases.draft') THEN
    RAISE EXCEPTION 'You do not have permission to view portal settings';
  END IF;
  SELECT * INTO _s FROM public.portal_settings WHERE company_id = _company;
  RETURN jsonb_build_object(
    'enabled', public.portal_enabled(_company),
    'settlement_account_id', _s.settlement_account_id,
    'settlement_user_id', _s.settlement_user_id,
    'fee_expense_account_id', _s.fee_expense_account_id,
    'default_purchase_account_id', _s.default_purchase_account_id,
    'allow_sandbox', COALESCE(_s.allow_sandbox, false),
    'require_mfa', COALESCE(_s.require_mfa, false),
    'invite_days', COALESCE(_s.invite_days, 14),
    'actors', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'user_id', m.user_id,
        'role', m.role,
        'name', COALESCE(p.full_name, ''),
        'email', COALESCE(p.email, '')
      ) ORDER BY p.full_name)
      FROM public.company_members m
      LEFT JOIN public.profiles p ON p.id = m.user_id
      WHERE m.company_id = _company AND m.status = 'active'
        AND EXISTS (
          SELECT 1 FROM public.role_permissions r
          WHERE r.role = m.role AND r.permission = 'sales.payment'
        )
        AND EXISTS (
          SELECT 1 FROM public.role_permissions r
          WHERE r.role = m.role AND r.permission IN ('accounting.post', 'journals.manual')
        )
    ), '[]'::JSONB),
    'bank_accounts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', a.id, 'code', a.code, 'name', a.name) ORDER BY a.code)
      FROM public.accounts a
      WHERE a.company_id = _company AND public.sales_is_deposit_account(_company, a.id)
    ), '[]'::JSONB),
    'expense_accounts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', a.id, 'code', a.code, 'name', a.name) ORDER BY a.code)
      FROM public.accounts a
      WHERE a.company_id = _company AND a.is_active AND a.archived_at IS NULL
        AND a.is_postable AND NOT a.is_control AND a.account_type::TEXT = 'expense'
    ), '[]'::JSONB),
    'purchase_accounts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', a.id, 'code', a.code, 'name', a.name) ORDER BY a.code)
      FROM public.accounts a
      WHERE a.company_id = _company AND a.is_active AND a.archived_at IS NULL
        AND a.is_postable AND NOT a.is_control
        AND a.account_type::TEXT IN ('expense', 'asset')
    ), '[]'::JSONB),
    'open_alerts', (
      SELECT count(*) FROM public.portal_staff_alerts
      WHERE company_id = _company AND resolved_at IS NULL
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.save_portal_settings(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _company UUID := NULLIF(payload->>'company_id', '')::UUID;
  _bank UUID := NULLIF(payload->>'settlement_account_id', '')::UUID;
  _actor UUID := NULLIF(payload->>'settlement_user_id', '')::UUID;
  _fee UUID := NULLIF(payload->>'fee_expense_account_id', '')::UUID;
  _purchase UUID := NULLIF(payload->>'default_purchase_account_id', '')::UUID;
  _days INTEGER := COALESCE(NULLIF(payload->>'invite_days', '')::INTEGER, 14);
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF _company IS NULL OR NOT public.has_company_permission(_company, 'company.settings.edit') THEN
    RAISE EXCEPTION 'You do not have permission to edit portal settings';
  END IF;
  PERFORM public.portal_assert_writable(_company);
  IF _days < 1 OR _days > 90 THEN RAISE EXCEPTION 'Invitation life must be 1–90 days'; END IF;
  IF _bank IS NOT NULL AND NOT public.sales_is_deposit_account(_company, _bank) THEN
    RAISE EXCEPTION 'Choose an active bank or cash account for settlement';
  END IF;
  IF _actor IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.company_members m
    WHERE m.company_id = _company AND m.user_id = _actor AND m.status = 'active'
      AND EXISTS (SELECT 1 FROM public.role_permissions r WHERE r.role = m.role AND r.permission = 'sales.payment')
      AND EXISTS (SELECT 1 FROM public.role_permissions r WHERE r.role = m.role AND r.permission IN ('accounting.post', 'journals.manual'))
  ) THEN
    RAISE EXCEPTION 'The settlement user must be an active member who can record receipts and post journals';
  END IF;
  IF _fee IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.accounts a
    WHERE a.id = _fee AND a.company_id = _company AND a.is_active AND a.is_postable
      AND a.account_type::TEXT = 'expense'
  ) THEN
    RAISE EXCEPTION 'The fee account must be an active expense account';
  END IF;
  IF _purchase IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.accounts a
    WHERE a.id = _purchase AND a.company_id = _company AND a.is_active AND a.is_postable AND NOT a.is_control
      AND a.account_type::TEXT IN ('expense', 'asset')
  ) THEN
    RAISE EXCEPTION 'The purchase account must be an active expense or asset account';
  END IF;

  INSERT INTO public.portal_settings AS s (
    company_id, settlement_account_id, settlement_user_id, fee_expense_account_id,
    default_purchase_account_id, allow_sandbox, require_mfa, invite_days, updated_by, updated_at
  ) VALUES (
    _company, _bank, _actor, _fee, _purchase,
    COALESCE((payload->>'allow_sandbox')::BOOLEAN, false),
    COALESCE((payload->>'require_mfa')::BOOLEAN, false),
    _days, _uid, now()
  )
  ON CONFLICT (company_id) DO UPDATE SET
    settlement_account_id = EXCLUDED.settlement_account_id,
    settlement_user_id = EXCLUDED.settlement_user_id,
    fee_expense_account_id = EXCLUDED.fee_expense_account_id,
    default_purchase_account_id = EXCLUDED.default_purchase_account_id,
    allow_sandbox = EXCLUDED.allow_sandbox,
    require_mfa = EXCLUDED.require_mfa,
    invite_days = EXCLUDED.invite_days,
    updated_by = _uid,
    updated_at = now();

  PERFORM public.portal_audit(_company, _uid, 'portal.settings.save', 'company', _company,
    jsonb_build_object('allow_sandbox', COALESCE((payload->>'allow_sandbox')::BOOLEAN, false)));
  RETURN public.get_portal_settings(payload);
END;
$$;

CREATE OR REPLACE FUNCTION public.invite_portal_user(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _company UUID := NULLIF(payload->>'company_id', '')::UUID;
  _contact UUID := NULLIF(payload->>'contact_id', '')::UUID;
  _role TEXT := payload->>'role';
  _email TEXT := lower(btrim(COALESCE(payload->>'email', '')));
  _mfa BOOLEAN := COALESCE((payload->>'mfa_required')::BOOLEAN, false);
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

  SELECT COALESCE(invite_days, 14), COALESCE((payload->>'mfa_required')::BOOLEAN, require_mfa, false)
    INTO _days, _mfa
  FROM public.portal_settings WHERE company_id = _company;
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

CREATE OR REPLACE FUNCTION public.revoke_portal_access(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _company UUID := NULLIF(payload->>'company_id', '')::UUID;
  _id UUID := NULLIF(payload->>'membership_id', '')::UUID;
  _role TEXT;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT portal_role INTO _role FROM public.portal_memberships
  WHERE id = _id AND company_id = _company AND status IN ('invited', 'active');
  IF _role IS NULL THEN RAISE EXCEPTION 'Portal access was not found'; END IF;
  IF _role = 'customer' AND NOT public.has_company_permission(_company, 'sales.draft') THEN
    RAISE EXCEPTION 'You do not have permission to revoke customer access';
  END IF;
  IF _role = 'supplier' AND NOT public.has_company_permission(_company, 'purchases.draft') THEN
    RAISE EXCEPTION 'You do not have permission to revoke supplier access';
  END IF;
  UPDATE public.portal_memberships
  SET status = 'revoked', revoked_at = now(), revoked_by = _uid, invite_token_hash = NULL
  WHERE id = _id;
  PERFORM public.portal_audit(_company, _uid, 'portal.revoke', 'contact',
    (SELECT contact_id FROM public.portal_memberships WHERE id = _id),
    jsonb_build_object('membership_id', _id));
  RETURN jsonb_build_object('revoked', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_contact_portal_access(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _company UUID := NULLIF(payload->>'company_id', '')::UUID;
  _contact UUID := NULLIF(payload->>'contact_id', '')::UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.is_company_member(_company) THEN RAISE EXCEPTION 'You do not have access to that organisation'; END IF;
  IF NOT (
    public.has_company_permission(_company, 'sales.view')
    OR public.has_company_permission(_company, 'purchases.view')
    OR public.has_company_permission(_company, 'contacts.manage')
  ) THEN
    RAISE EXCEPTION 'You do not have permission to view portal access';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'membership_id', id,
      'email', email,
      'role', portal_role,
      'status', status,
      'mfa_required', mfa_required,
      'invite_expires_at', invite_expires_at,
      'accepted_at', accepted_at,
      'revoked_at', revoked_at
    ) ORDER BY created_at DESC)
    FROM public.portal_memberships
    WHERE company_id = _company AND contact_id = _contact
  ), '[]'::JSONB);
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_portal_invite(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _token TEXT := payload->>'token';
  _hash TEXT;
  _m public.portal_memberships%ROWTYPE;
  _email TEXT;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF _token IS NULL OR _token !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'This invitation link is not valid';
  END IF;
  PERFORM public.portal_rate_limit('accept:' || _uid::TEXT, 10, INTERVAL '15 minutes');
  _email := public.portal_jwt_email();
  IF _email = '' THEN RAISE EXCEPTION 'Sign in with the email address the invitation was sent to'; END IF;
  _hash := encode(sha256(convert_to(_token, 'UTF8')), 'hex');
  SELECT * INTO _m FROM public.portal_memberships
  WHERE invite_token_hash = _hash AND status = 'invited'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'This invitation link is not valid'; END IF;
  IF _m.invite_expires_at IS NOT NULL AND _m.invite_expires_at <= now() THEN
    RAISE EXCEPTION 'This invitation has expired. Ask the organisation for a new one.';
  END IF;
  IF _m.email IS DISTINCT FROM _email THEN
    RAISE EXCEPTION 'Sign in as % to accept this invitation', _m.email;
  END IF;
  IF NOT public.portal_enabled(_m.company_id) THEN
    RAISE EXCEPTION 'This organisation has not turned the portal on';
  END IF;
  UPDATE public.portal_memberships
  SET user_id = _uid, status = 'active', accepted_at = now(), invite_token_hash = NULL
  WHERE id = _m.id;
  PERFORM public.portal_audit(_m.company_id, _uid, 'portal.accept', 'contact', _m.contact_id,
    jsonb_build_object('membership_id', _m.id, 'role', _m.portal_role));
  RETURN jsonb_build_object('membership_id', _m.id, 'role', _m.portal_role, 'company_id', _m.company_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_home(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _m public.portal_memberships;
  _today DATE;
  _company_name TEXT;
  _contact_name TEXT;
  _locale TEXT;
  _date_format TEXT;
  _currency TEXT;
  _theme TEXT;
BEGIN
  _m := public.portal_require_member(NULLIF(payload->>'membership_id', '')::UUID);
  _today := public.portal_company_today(_m.company_id);
  SELECT c.name, c.locale, c.date_format, c.base_currency, c.document_theme_color, ct.name
    INTO _company_name, _locale, _date_format, _currency, _theme, _contact_name
  FROM public.companies c
  JOIN public.contacts ct ON ct.id = _m.contact_id
  WHERE c.id = _m.company_id;

  IF _m.portal_role = 'customer' THEN
    RETURN jsonb_build_object(
      'role', 'customer',
      'company_name', _company_name,
      'contact_name', _contact_name,
      'locale', _locale,
      'date_format', _date_format,
      'currency', _currency,
      'theme_color', _theme,
      'balances', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'currency', currency_code,
          'outstanding_minor', outstanding_minor,
          'overdue_minor', overdue_minor,
          'overdue_count', overdue_count
        ))
        FROM (
          SELECT currency_code,
            COALESCE(sum(total_minor - amount_paid_minor - amount_credited_minor)
              FILTER (WHERE status IN ('authorised', 'partly_paid')), 0) AS outstanding_minor,
            COALESCE(sum(total_minor - amount_paid_minor - amount_credited_minor)
              FILTER (WHERE status IN ('authorised', 'partly_paid') AND due_date < _today), 0) AS overdue_minor,
            count(*) FILTER (WHERE status IN ('authorised', 'partly_paid') AND due_date < _today) AS overdue_count
          FROM public.sales_invoices
          WHERE company_id = _m.company_id AND contact_id = _m.contact_id
          GROUP BY currency_code
        ) b
      ), '[]'::JSONB),
      'recent_invoices', COALESCE((
        SELECT jsonb_agg(to_jsonb(i)) FROM (
          SELECT id, invoice_number, invoice_date, due_date, currency_code, status::TEXT AS status,
            total_minor, (total_minor - amount_paid_minor - amount_credited_minor) AS due_minor
          FROM public.sales_invoices
          WHERE company_id = _m.company_id AND contact_id = _m.contact_id AND status::TEXT <> 'draft'
          ORDER BY invoice_date DESC, created_at DESC
          LIMIT 8
        ) i
      ), '[]'::JSONB),
      'recent_payments', COALESCE((
        SELECT jsonb_agg(to_jsonb(r)) FROM (
          SELECT id, receipt_date, currency_code, amount_minor, reference, status
          FROM public.sales_receipts
          WHERE company_id = _m.company_id AND contact_id = _m.contact_id
          ORDER BY receipt_date DESC, created_at DESC
          LIMIT 8
        ) r
      ), '[]'::JSONB),
      'unread_notifications', (
        SELECT count(*) FROM public.portal_notifications
        WHERE company_id = _m.company_id AND contact_id = _m.contact_id AND read_at IS NULL
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'role', 'supplier',
    'company_name', _company_name,
    'contact_name', _contact_name,
    'locale', _locale,
    'date_format', _date_format,
    'currency', _currency,
    'theme_color', _theme,
    'open_orders', (
      SELECT count(*) FROM public.purchase_orders
      WHERE company_id = _m.company_id AND contact_id = _m.contact_id
        AND status IN ('sent', 'partially_received')
    ),
    'submitted', (
      SELECT count(*) FROM public.portal_supplier_submissions
      WHERE company_id = _m.company_id AND contact_id = _m.contact_id AND status = 'submitted'
    ),
    'recent_submissions', COALESCE((
      SELECT jsonb_agg(to_jsonb(s)) FROM (
        SELECT id, kind, status, supplier_reference, document_date, currency_code, total_minor, created_at
        FROM public.portal_supplier_submissions
        WHERE company_id = _m.company_id AND contact_id = _m.contact_id
        ORDER BY created_at DESC
        LIMIT 8
      ) s
    ), '[]'::JSONB),
    'recent_payments', COALESCE((
      SELECT jsonb_agg(to_jsonb(p)) FROM (
        SELECT id, payment_date, currency_code, amount_minor, reference, status::TEXT AS status
        FROM public.supplier_payments
        WHERE company_id = _m.company_id AND contact_id = _m.contact_id AND status = 'paid'
        ORDER BY payment_date DESC
        LIMIT 8
      ) p
    ), '[]'::JSONB),
    'bank', (
      SELECT jsonb_build_object(
        'verified_masked', public.portal_mask_account(d.account_number),
        'bank_name', d.bank_name,
        'pending', EXISTS (
          SELECT 1 FROM public.portal_bank_change_requests r
          WHERE r.company_id = _m.company_id AND r.contact_id = _m.contact_id AND r.status = 'pending'
        )
      )
      FROM public.contact_payment_details d
      WHERE d.contact_id = _m.contact_id
    ),
    'unread_notifications', (
      SELECT count(*) FROM public.portal_notifications
      WHERE company_id = _m.company_id AND contact_id = _m.contact_id AND read_at IS NULL
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_list_invoices(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _m public.portal_memberships;
  _q TEXT := left(replace(replace(COALESCE(payload->>'q', ''), '%', ''), '_', ''), 80);
  _status TEXT := COALESCE(payload->>'status', 'all');
  _page INTEGER := GREATEST(COALESCE(NULLIF(payload->>'page', '')::INTEGER, 1), 1);
  _size INTEGER := LEAST(GREATEST(COALESCE(NULLIF(payload->>'page_size', '')::INTEGER, 25), 1), 50);
  _today DATE;
  _rows JSONB;
  _total INTEGER;
BEGIN
  _m := public.portal_require_member(NULLIF(payload->>'membership_id', '')::UUID);
  IF _m.portal_role <> 'customer' THEN RAISE EXCEPTION 'Invoices are available on the customer portal'; END IF;
  _today := public.portal_company_today(_m.company_id);
  WITH filtered AS (
    SELECT id, invoice_number, invoice_date, due_date, currency_code, status::TEXT AS status,
      total_minor, amount_paid_minor, amount_credited_minor,
      (total_minor - amount_paid_minor - amount_credited_minor) AS due_minor
    FROM public.sales_invoices
    WHERE company_id = _m.company_id AND contact_id = _m.contact_id AND status::TEXT <> 'draft'
      AND (_q = '' OR invoice_number ILIKE '%' || _q || '%')
      AND (
        _status = 'all'
        OR (_status = 'open' AND status IN ('authorised', 'partly_paid'))
        OR (_status = 'paid' AND status = 'paid')
        OR (_status = 'void' AND status = 'void')
        OR (_status = 'overdue' AND status IN ('authorised', 'partly_paid') AND due_date < _today)
      )
  )
  SELECT
    (SELECT count(*) FROM filtered),
    (SELECT COALESCE(jsonb_agg(to_jsonb(f)), '[]'::JSONB) FROM (
      SELECT * FROM filtered ORDER BY invoice_date DESC, invoice_number DESC
      OFFSET (_page - 1) * _size LIMIT _size
    ) f)
  INTO _total, _rows;
  RETURN jsonb_build_object('total', _total, 'page', _page, 'page_size', _size, 'rows', _rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_get_invoice(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _m public.portal_memberships;
  _id UUID := NULLIF(payload->>'invoice_id', '')::UUID;
  _inv public.sales_invoices%ROWTYPE;
  _today DATE;
  _due BIGINT;
BEGIN
  _m := public.portal_require_member(NULLIF(payload->>'membership_id', '')::UUID);
  IF _m.portal_role <> 'customer' THEN RAISE EXCEPTION 'Invoices are available on the customer portal'; END IF;
  SELECT * INTO _inv FROM public.sales_invoices
  WHERE id = _id AND company_id = _m.company_id AND contact_id = _m.contact_id AND status::TEXT <> 'draft';
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  _today := public.portal_company_today(_m.company_id);
  _due := _inv.total_minor - _inv.amount_paid_minor - _inv.amount_credited_minor;
  RETURN jsonb_build_object(
    'invoice', jsonb_build_object(
      'id', _inv.id,
      'invoice_number', _inv.invoice_number,
      'invoice_date', _inv.invoice_date,
      'due_date', _inv.due_date,
      'currency_code', _inv.currency_code,
      'status', _inv.status::TEXT,
      'subtotal_minor', _inv.subtotal_minor,
      'tax_minor', _inv.tax_minor,
      'total_minor', _inv.total_minor,
      'amount_paid_minor', _inv.amount_paid_minor,
      'amount_credited_minor', _inv.amount_credited_minor,
      'due_minor', _due,
      'overdue', _inv.status IN ('authorised', 'partly_paid') AND _inv.due_date < _today,
      'memo', _inv.memo,
      'fx_rate_to_base', _inv.fx_rate_to_base
    ),
    'lines', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'description', description, 'quantity', quantity, 'unit_price_minor', unit_price_minor,
        'discount_minor', discount_minor, 'tax_rate_bps', tax_rate_bps,
        'net_minor', net_minor, 'tax_minor', tax_minor, 'gross_minor', gross_minor
      ) ORDER BY line_order)
      FROM public.sales_invoice_lines WHERE invoice_id = _inv.id
    ), '[]'::JSONB),
    'payable_minor', CASE
      WHEN _inv.status IN ('authorised', 'partly_paid')
        THEN GREATEST(_due - public.portal_invoice_hold(_inv.id, NULL), 0)
      ELSE 0
    END,
    'branding', (
      SELECT jsonb_build_object(
        'trading_name', b.trading_name,
        'letterhead_line', b.letterhead_line,
        'invoice_email', b.invoice_email,
        'invoice_phone', b.invoice_phone,
        'logo_url', CASE WHEN b.logo_url ~* '^https://' THEN b.logo_url ELSE NULL END,
        'address_text', b.address_text,
        'tax_number', b.tax_number,
        'bank_details', b.bank_details,
        'payment_instructions', b.payment_instructions
      )
      FROM public.company_branding b WHERE b.company_id = _m.company_id
    ),
    'company_name', (SELECT name FROM public.companies WHERE id = _m.company_id),
    'allow_sandbox', COALESCE((SELECT allow_sandbox FROM public.portal_settings WHERE company_id = _m.company_id), false),
    'settlement_ready', EXISTS (
      SELECT 1 FROM public.portal_settings s
      WHERE s.company_id = _m.company_id
        AND s.settlement_account_id IS NOT NULL
        AND s.settlement_user_id IS NOT NULL
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_list_credits(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _m public.portal_memberships;
BEGIN
  _m := public.portal_require_member(NULLIF(payload->>'membership_id', '')::UUID);
  IF _m.portal_role <> 'customer' THEN RAISE EXCEPTION 'Credit notes are available on the customer portal'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(c)) FROM (
      SELECT id, credit_number, credit_date, currency_code, status::TEXT AS status,
        total_minor, amount_allocated_minor, (total_minor - amount_allocated_minor) AS remaining_minor, memo
      FROM public.sales_credit_notes
      WHERE company_id = _m.company_id AND contact_id = _m.contact_id AND status::TEXT <> 'draft'
      ORDER BY credit_date DESC
      LIMIT 100
    ) c
  ), '[]'::JSONB);
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_statement(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _m public.portal_memberships;
  _from DATE := NULLIF(payload->>'from', '')::DATE;
  _to DATE := NULLIF(payload->>'to', '')::DATE;
BEGIN
  _m := public.portal_require_member(NULLIF(payload->>'membership_id', '')::UUID);
  IF _m.portal_role <> 'customer' THEN RAISE EXCEPTION 'Statements are available on the customer portal'; END IF;
  IF _from IS NULL THEN _from := public.portal_company_today(_m.company_id) - 90; END IF;
  IF _to IS NULL THEN _to := public.portal_company_today(_m.company_id); END IF;
  IF _to < _from THEN RAISE EXCEPTION 'The end date must be on or after the start date'; END IF;
  IF _to > _from + 800 THEN RAISE EXCEPTION 'Choose a period of 800 days or less'; END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(section) FROM (
      SELECT jsonb_build_object(
        'currency', currency_code,
        'opening_minor', COALESCE(sum(debit_minor - credit_minor) FILTER (WHERE on_date < _from), 0),
        'closing_minor', COALESCE(sum(debit_minor - credit_minor) FILTER (WHERE on_date <= _to), 0),
        'rows', COALESCE(jsonb_agg(jsonb_build_object(
          'date', on_date, 'kind', kind, 'reference', reference,
          'debit_minor', debit_minor, 'credit_minor', credit_minor
        ) ORDER BY on_date, kind) FILTER (WHERE on_date BETWEEN _from AND _to), '[]'::JSONB)
      ) AS section
      FROM (
        SELECT invoice_date AS on_date, 'Invoice' AS kind, invoice_number AS reference,
          currency_code, total_minor AS debit_minor, 0::BIGINT AS credit_minor
        FROM public.sales_invoices
        WHERE company_id = _m.company_id AND contact_id = _m.contact_id
          AND status::TEXT NOT IN ('draft', 'void')
        UNION ALL
        SELECT credit_date, 'Credit note', credit_number, currency_code, 0, total_minor
        FROM public.sales_credit_notes
        WHERE company_id = _m.company_id AND contact_id = _m.contact_id
          AND status::TEXT NOT IN ('draft', 'void')
        UNION ALL
        SELECT receipt_date, 'Payment', COALESCE(reference, 'Receipt'), currency_code, 0, amount_minor
        FROM public.sales_receipts
        WHERE company_id = _m.company_id AND contact_id = _m.contact_id AND status = 'posted'
      ) movements
      GROUP BY currency_code
    ) grouped
  ), '[]'::JSONB);
END;
$$;

CREATE OR REPLACE FUNCTION public.portal_list_receipts(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _m public.portal_memberships;
BEGIN
  _m := public.portal_require_member(NULLIF(payload->>'membership_id', '')::UUID);
  IF _m.portal_role <> 'customer' THEN RAISE EXCEPTION 'Receipts are available on the customer portal'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(r)) FROM (
      SELECT r.id, r.receipt_date, r.currency_code, r.amount_minor, r.reference, r.memo, r.status,
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'invoice_number', i.invoice_number, 'amount_minor', a.amount_minor
          ))
          FROM public.sales_receipt_allocations a
          JOIN public.sales_invoices i ON i.id = a.invoice_id
          WHERE a.receipt_id = r.id AND a.reversed_on IS NULL
        ), '[]'::JSONB) AS allocations
      FROM public.sales_receipts r
      WHERE r.company_id = _m.company_id AND r.contact_id = _m.contact_id
      ORDER BY r.receipt_date DESC
      LIMIT 100
    ) r
  ), '[]'::JSONB);
END;
$$;

REVOKE ALL ON FUNCTION public.portal_my_access(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_portal_settings(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_portal_settings(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.invite_portal_user(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_portal_access(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_contact_portal_access(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_portal_invite(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_home(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_list_invoices(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_get_invoice(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_list_credits(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_statement(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_list_receipts(JSONB) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.portal_my_access(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_portal_settings(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_portal_settings(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_portal_user(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_portal_access(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_contact_portal_access(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_portal_invite(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_home(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_list_invoices(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_get_invoice(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_list_credits(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_statement(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_list_receipts(JSONB) TO authenticated;
