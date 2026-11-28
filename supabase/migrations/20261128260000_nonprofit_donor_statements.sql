-- Donor statements read posted donations and their journals.
-- They do not post, send email, or issue a tax certificate.

CREATE TABLE IF NOT EXISTS public.nonprofit_statement_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  donor_id UUID REFERENCES public.nonprofit_donors(id) ON DELETE SET NULL,
  period_from DATE NOT NULL,
  as_of DATE NOT NULL,
  statement_kind TEXT NOT NULL CHECK (statement_kind IN ('donor', 'consolidated')),
  document JSONB NOT NULL,
  delivery_status TEXT NOT NULL CHECK (delivery_status IN (
    'not_requested', 'not_configured', 'withheld', 'sent', 'failed'
  )),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (period_from <= as_of)
);

CREATE INDEX IF NOT EXISTS nonprofit_statement_runs_company_idx
  ON public.nonprofit_statement_runs (company_id, created_at DESC);

ALTER TABLE public.nonprofit_statement_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS np_member_select ON public.nonprofit_statement_runs;
CREATE POLICY np_member_select ON public.nonprofit_statement_runs
  FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'nonprofit.view')
  );

GRANT SELECT ON public.nonprofit_statement_runs TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.nonprofit_statement_runs FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.np_organisation_heading(_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _name TEXT := 'Organisation';
  _legal TEXT;
  _country TEXT;
  _trading TEXT;
  _letterhead TEXT;
  _email TEXT;
  _phone TEXT;
  _logo TEXT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'name'
  ) THEN
    EXECUTE 'SELECT name FROM public.companies WHERE id = $1' INTO _name USING _company_id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'legal_name'
  ) THEN
    EXECUTE 'SELECT legal_name FROM public.companies WHERE id = $1' INTO _legal USING _company_id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'country_code'
  ) THEN
    EXECUTE 'SELECT country_code FROM public.companies WHERE id = $1' INTO _country USING _company_id;
  END IF;
  IF to_regclass('public.company_branding') IS NOT NULL THEN
    EXECUTE
      'SELECT trading_name, letterhead_line, invoice_email, invoice_phone, logo_url
       FROM public.company_branding WHERE company_id = $1'
      INTO _trading, _letterhead, _email, _phone, _logo
      USING _company_id;
  END IF;
  RETURN jsonb_build_object(
    'name', COALESCE(NULLIF(_trading, ''), NULLIF(_name, ''), 'Organisation'),
    'legal_name', _legal,
    'country_code', _country,
    'letterhead', _letterhead,
    'email', _email,
    'phone', _phone,
    'logo_url', _logo
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.np_donor_statement_document(
  _company_id UUID,
  _from DATE,
  _as_of DATE,
  _donor_id UUID,
  _history TEXT
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _currencies JSONB;
  _funds JSONB;
  _campaigns JSONB;
  _pledges JSONB;
  _receipts JSONB;
  _donors JSONB;
  _history_rows JSONB := '[]'::JSONB;
  _services INTEGER := 0;
  _donor_name TEXT;
  _consent TEXT;
  _email TEXT;
  _anonymous BOOLEAN := false;
BEGIN
  IF _from IS NULL OR _as_of IS NULL THEN
    RAISE EXCEPTION 'A donor statement needs a from date and an as-of date';
  END IF;
  IF _from > _as_of THEN
    RAISE EXCEPTION 'The statement period starts after it ends';
  END IF;
  IF _history NOT IN ('all', 'donor', 'none') THEN
    RAISE EXCEPTION 'Statement history scope is invalid';
  END IF;

  IF _donor_id IS NOT NULL THEN
    SELECT
      CASE WHEN anonymous THEN 'Anonymous donor' ELSE display_name END,
      consent_status,
      CASE WHEN anonymous THEN NULL ELSE email END,
      anonymous
    INTO _donor_name, _consent, _email, _anonymous
    FROM public.nonprofit_donors
    WHERE id = _donor_id AND company_id = _company_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Donor was not found';
    END IF;
  END IF;

  WITH gifts AS (
    SELECT
      d.id,
      d.donor_id,
      d.donation_number,
      d.currency_code,
      d.amount_minor,
      d.fee_minor,
      d.conditional,
      d.donated_on,
      d.campaign_id,
      d.status
    FROM public.nonprofit_donations d
    WHERE d.company_id = _company_id
      AND (_donor_id IS NULL OR d.donor_id = _donor_id)
      AND d.in_kind <> 'services'
      AND d.status IN ('posted', 'refunded')
      AND d.journal_id IS NOT NULL
  ),
  refunds AS (
    SELECT g.id, g.currency_code, g.amount_minor, g.donor_id, g.campaign_id, j.journal_date
    FROM gifts g
    JOIN public.journals j
      ON j.company_id = _company_id
     AND j.source_id = g.id
     AND j.source_type = 'nonprofit_refund'
     AND j.status = 'posted'
    WHERE g.status = 'refunded' AND NOT g.conditional
  ),
  codes AS (
    SELECT currency_code FROM gifts WHERE donated_on BETWEEN _from AND _as_of
    UNION
    SELECT currency_code FROM refunds WHERE journal_date BETWEEN _from AND _as_of
  ),
  gross AS (
    SELECT
      currency_code,
      COALESCE(SUM(amount_minor) FILTER (
        WHERE donated_on BETWEEN _from AND _as_of AND NOT conditional
      ), 0) AS gross_minor,
      COALESCE(SUM(amount_minor) FILTER (
        WHERE donated_on BETWEEN _from AND _as_of AND conditional
      ), 0) AS conditional_minor,
      COALESCE(SUM(fee_minor) FILTER (
        WHERE donated_on BETWEEN _from AND _as_of
      ), 0) AS fee_minor
    FROM gifts
    GROUP BY currency_code
  ),
  refunded AS (
    SELECT currency_code, COALESCE(SUM(amount_minor), 0) AS refunded_minor
    FROM refunds
    WHERE journal_date BETWEEN _from AND _as_of
    GROUP BY currency_code
  ),
  support AS (
    SELECT g.currency_code, COALESCE(SUM(jl.credit_minor - jl.debit_minor), 0) AS journal_support_minor
    FROM gifts g
    JOIN public.journals j
      ON j.company_id = _company_id
     AND j.source_id = g.id
     AND j.status = 'posted'
     AND j.source_type IN ('nonprofit_donation', 'nonprofit_refund')
     AND j.journal_date BETWEEN _from AND _as_of
    JOIN public.journal_lines jl ON jl.journal_id = j.id
    JOIN public.accounts a ON a.id = jl.account_id AND a.account_type = 'income'
    WHERE NOT g.conditional
    GROUP BY g.currency_code
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'currency_code', codes.currency_code,
    'gross_minor', COALESCE(gross.gross_minor, 0),
    'refunded_minor', COALESCE(refunded.refunded_minor, 0),
    'net_minor', COALESCE(gross.gross_minor, 0) - COALESCE(refunded.refunded_minor, 0),
    'conditional_minor', COALESCE(gross.conditional_minor, 0),
    'fee_minor', COALESCE(gross.fee_minor, 0),
    'journal_support_minor', COALESCE(support.journal_support_minor, 0),
    'reconciled',
      COALESCE(gross.gross_minor, 0) - COALESCE(refunded.refunded_minor, 0)
        = COALESCE(support.journal_support_minor, 0)
  ) ORDER BY codes.currency_code), '[]'::JSONB)
  INTO _currencies
  FROM codes
  LEFT JOIN gross ON gross.currency_code = codes.currency_code
  LEFT JOIN refunded ON refunded.currency_code = codes.currency_code
  LEFT JOIN support ON support.currency_code = codes.currency_code;

  WITH gifts AS (
    SELECT d.id, d.currency_code, d.amount_minor, d.conditional, d.donated_on, d.status
    FROM public.nonprofit_donations d
    WHERE d.company_id = _company_id
      AND (_donor_id IS NULL OR d.donor_id = _donor_id)
      AND d.in_kind <> 'services'
      AND d.status IN ('posted', 'refunded')
      AND d.journal_id IS NOT NULL
      AND NOT d.conditional
  ),
  movement AS (
    SELECT a.fund_id, g.currency_code, a.amount_minor AS signed_minor
    FROM gifts g
    JOIN public.nonprofit_donation_allocations a ON a.donation_id = g.id
    WHERE g.donated_on BETWEEN _from AND _as_of
    UNION ALL
    SELECT a.fund_id, g.currency_code, -a.amount_minor
    FROM gifts g
    JOIN public.nonprofit_donation_allocations a ON a.donation_id = g.id
    JOIN public.journals j
      ON j.company_id = _company_id
     AND j.source_id = g.id
     AND j.source_type = 'nonprofit_refund'
     AND j.status = 'posted'
     AND j.journal_date BETWEEN _from AND _as_of
    WHERE g.status = 'refunded'
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'fund_id', f.id,
    'code', f.code,
    'name', f.name,
    'currency_code', movement.currency_code,
    'net_minor', movement.net_minor
  ) ORDER BY f.code, movement.currency_code), '[]'::JSONB)
  INTO _funds
  FROM (
    SELECT fund_id, currency_code, SUM(signed_minor) AS net_minor
    FROM movement
    GROUP BY fund_id, currency_code
  ) movement
  JOIN public.nonprofit_funds f ON f.id = movement.fund_id AND f.company_id = _company_id;

  WITH gifts AS (
    SELECT d.id, d.currency_code, d.amount_minor, d.conditional, d.donated_on, d.status, d.campaign_id
    FROM public.nonprofit_donations d
    WHERE d.company_id = _company_id
      AND (_donor_id IS NULL OR d.donor_id = _donor_id)
      AND d.in_kind <> 'services'
      AND d.status IN ('posted', 'refunded')
      AND d.journal_id IS NOT NULL
      AND NOT d.conditional
  ),
  movement AS (
    SELECT g.campaign_id, g.currency_code, g.amount_minor AS signed_minor
    FROM gifts g
    WHERE g.donated_on BETWEEN _from AND _as_of
    UNION ALL
    SELECT g.campaign_id, g.currency_code, -g.amount_minor
    FROM gifts g
    JOIN public.journals j
      ON j.company_id = _company_id
     AND j.source_id = g.id
     AND j.source_type = 'nonprofit_refund'
     AND j.status = 'posted'
     AND j.journal_date BETWEEN _from AND _as_of
    WHERE g.status = 'refunded'
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'campaign_id', movement.campaign_id,
    'name', COALESCE(c.name, 'Unassigned'),
    'currency_code', movement.currency_code,
    'net_minor', movement.net_minor
  ) ORDER BY COALESCE(c.name, 'Unassigned'), movement.currency_code), '[]'::JSONB)
  INTO _campaigns
  FROM (
    SELECT campaign_id, currency_code, SUM(signed_minor) AS net_minor
    FROM movement
    GROUP BY campaign_id, currency_code
  ) movement
  LEFT JOIN public.nonprofit_campaigns c ON c.id = movement.campaign_id AND c.company_id = _company_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'pledge_number', p.pledge_number,
    'pledged_on', p.pledged_on,
    'currency_code', p.currency_code,
    'amount_minor', p.amount_minor,
    'collected_minor', p.collected_minor,
    'impaired_minor', p.impaired_minor,
    'outstanding_minor', p.amount_minor - p.collected_minor - p.impaired_minor,
    'status', p.status,
    'fund_code', f.code
  ) ORDER BY p.pledged_on, p.pledge_number), '[]'::JSONB)
  INTO _pledges
  FROM public.nonprofit_pledges p
  JOIN public.nonprofit_funds f ON f.id = p.fund_id
  WHERE p.company_id = _company_id
    AND (_donor_id IS NULL OR p.donor_id = _donor_id)
    AND (
      p.pledged_on BETWEEN _from AND _as_of
      OR (p.pledged_on <= _as_of AND p.amount_minor - p.collected_minor - p.impaired_minor > 0)
    );

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'receipt_number', r.receipt_number,
    'issued_on', r.issued_on,
    'amount_minor', r.amount_minor,
    'currency_code', r.currency_code,
    'donation_number', d.donation_number,
    'wording', r.wording
  ) ORDER BY r.issued_on, r.receipt_number), '[]'::JSONB)
  INTO _receipts
  FROM public.nonprofit_receipts r
  JOIN public.nonprofit_donations d ON d.id = r.donation_id
  WHERE r.company_id = _company_id
    AND (_donor_id IS NULL OR d.donor_id = _donor_id)
    AND r.issued_on BETWEEN _from AND _as_of;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'donor_id', donors.donor_id,
    'display_name', donors.display_name,
    'currency_code', donors.currency_code,
    'net_minor', donors.net_minor
  ) ORDER BY donors.display_name, donors.currency_code), '[]'::JSONB)
  INTO _donors
  FROM (
    SELECT
      d.donor_id,
      CASE WHEN n.anonymous THEN 'Anonymous donor' ELSE n.display_name END AS display_name,
      d.currency_code,
      COALESCE(SUM(d.amount_minor) FILTER (
        WHERE d.donated_on BETWEEN _from AND _as_of AND NOT d.conditional AND d.in_kind <> 'services'
          AND d.status IN ('posted', 'refunded') AND d.journal_id IS NOT NULL
      ), 0)
      - COALESCE(SUM(d.amount_minor) FILTER (
        WHERE d.status = 'refunded' AND NOT d.conditional AND d.in_kind <> 'services'
          AND EXISTS (
            SELECT 1 FROM public.journals j
            WHERE j.company_id = _company_id
              AND j.source_id = d.id
              AND j.source_type = 'nonprofit_refund'
              AND j.status = 'posted'
              AND j.journal_date BETWEEN _from AND _as_of
          )
      ), 0) AS net_minor
    FROM public.nonprofit_donations d
    JOIN public.nonprofit_donors n ON n.id = d.donor_id
    WHERE d.company_id = _company_id
      AND (_donor_id IS NULL OR d.donor_id = _donor_id)
    GROUP BY d.donor_id, n.anonymous, n.display_name, d.currency_code
  ) donors
  WHERE donors.net_minor <> 0;

  SELECT count(*) INTO _services
  FROM public.nonprofit_donations d
  WHERE d.company_id = _company_id
    AND (_donor_id IS NULL OR d.donor_id = _donor_id)
    AND d.in_kind = 'services'
    AND d.donated_on BETWEEN _from AND _as_of;

  IF _history = 'all' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', runs.id,
      'donor_id', runs.donor_id,
      'period_from', runs.period_from,
      'as_of', runs.as_of,
      'statement_kind', runs.statement_kind,
      'delivery_status', runs.delivery_status,
      'created_at', runs.created_at
    ) ORDER BY runs.created_at DESC), '[]'::JSONB)
    INTO _history_rows
    FROM (
      SELECT * FROM public.nonprofit_statement_runs
      WHERE company_id = _company_id
      ORDER BY created_at DESC
      LIMIT 20
    ) runs;
  ELSIF _history = 'donor' AND _donor_id IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', runs.id,
      'donor_id', runs.donor_id,
      'period_from', runs.period_from,
      'as_of', runs.as_of,
      'statement_kind', runs.statement_kind,
      'delivery_status', runs.delivery_status,
      'created_at', runs.created_at
    ) ORDER BY runs.created_at DESC), '[]'::JSONB)
    INTO _history_rows
    FROM (
      SELECT * FROM public.nonprofit_statement_runs
      WHERE company_id = _company_id AND donor_id = _donor_id
      ORDER BY created_at DESC
      LIMIT 20
    ) runs;
  END IF;

  RETURN jsonb_build_object(
    'statutory_filing', false,
    'government_approved', false,
    'tax_certificate', false,
    'wording',
      'This donor statement lists contributions, refunds, receipts and outstanding pledges for the selected dates. Figures for recognised gifts equal the tagged contribution revenue in the journal. It is not a government filing and it is not a tax certificate.',
    'period_from', _from,
    'as_of', _as_of,
    'statement_kind', CASE WHEN _donor_id IS NULL THEN 'consolidated' ELSE 'donor' END,
    'organisation', public.np_organisation_heading(_company_id),
    'donor', CASE WHEN _donor_id IS NULL THEN NULL ELSE jsonb_build_object(
      'donor_id', _donor_id,
      'display_name', _donor_name,
      'consent_status', _consent,
      'email', _email,
      'anonymous', _anonymous
    ) END,
    'currencies', _currencies,
    'funds', _funds,
    'campaigns', _campaigns,
    'pledges', _pledges,
    'receipts', _receipts,
    'donors', _donors,
    'services_not_recognised', _services,
    'email_delivery', 'not_configured',
    'history', _history_rows
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.nonprofit_donor_statement(
  _company_id UUID,
  _from DATE,
  _as_of DATE,
  _donor_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.nonprofit_require(_company_id, 'nonprofit.view');
  RETURN public.np_donor_statement_document(_company_id, _from, _as_of, _donor_id, 'all');
END;
$$;

CREATE OR REPLACE FUNCTION public.nonprofit_record_donor_statement(
  _company_id UUID,
  _from DATE,
  _as_of DATE,
  _donor_id UUID,
  _delivery_status TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _document JSONB;
  _id UUID;
  _status TEXT;
BEGIN
  PERFORM public.nonprofit_require(_company_id, 'nonprofit.view');
  PERFORM public.nonprofit_require(_company_id, 'nonprofit.export');
  _status := COALESCE(_delivery_status, 'not_requested');
  IF _status NOT IN ('not_requested', 'not_configured', 'withheld', 'sent', 'failed') THEN
    RAISE EXCEPTION 'Statement delivery status is invalid';
  END IF;
  _document := public.np_donor_statement_document(
    _company_id, _from, _as_of, _donor_id,
    CASE WHEN _donor_id IS NULL THEN 'all' ELSE 'donor' END
  );
  INSERT INTO public.nonprofit_statement_runs (
    company_id, donor_id, period_from, as_of, statement_kind, document, delivery_status, created_by
  ) VALUES (
    _company_id, _donor_id, _from, _as_of,
    CASE WHEN _donor_id IS NULL THEN 'consolidated' ELSE 'donor' END,
    _document, _status, auth.uid()
  ) RETURNING id INTO _id;
  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, details)
  VALUES (
    _company_id, auth.uid(), 'nonprofit.statement.generated', 'nonprofit_statement_run', _id,
    jsonb_build_object('donor_id', _donor_id, 'period_from', _from, 'as_of', _as_of, 'delivery_status', _status)
  );
  RETURN _document || jsonb_build_object('run_id', _id, 'delivery_status', _status);
END;
$$;

CREATE OR REPLACE FUNCTION public.nonprofit_record_donor_statements(
  _company_id UUID,
  _from DATE,
  _as_of DATE
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _donor UUID;
  _count INTEGER := 0;
BEGIN
  PERFORM public.nonprofit_require(_company_id, 'nonprofit.view');
  PERFORM public.nonprofit_require(_company_id, 'nonprofit.export');
  IF _from IS NULL OR _as_of IS NULL OR _from > _as_of THEN
    RAISE EXCEPTION 'The statement period starts after it ends';
  END IF;
  FOR _donor IN
    SELECT DISTINCT activity.donor_id
    FROM (
      SELECT d.donor_id
      FROM public.nonprofit_donations d
      WHERE d.company_id = _company_id
        AND d.donor_id IS NOT NULL
        AND d.donated_on BETWEEN _from AND _as_of
      UNION
      SELECT p.donor_id
      FROM public.nonprofit_pledges p
      WHERE p.company_id = _company_id
        AND (
          p.pledged_on BETWEEN _from AND _as_of
          OR (p.pledged_on <= _as_of AND p.amount_minor - p.collected_minor - p.impaired_minor > 0)
        )
    ) activity
    ORDER BY activity.donor_id
  LOOP
    PERFORM public.nonprofit_record_donor_statement(_company_id, _from, _as_of, _donor, 'not_requested');
    _count := _count + 1;
  END LOOP;
  RETURN jsonb_build_object(
    'generated', _count,
    'email_delivery', 'not_configured',
    'statutory_filing', false,
    'tax_certificate', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.nonprofit_my_donor_statement(_from DATE, _as_of DATE)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'company_id', p.company_id,
      'donor_id', p.donor_id,
      'statement', public.np_donor_statement_document(p.company_id, _from, _as_of, p.donor_id, 'donor')
    ))
    FROM public.nonprofit_portal_users p
    WHERE p.user_id = _uid
      AND p.status = 'active'
      AND p.portal_role = 'donor'
      AND p.donor_id IS NOT NULL
  ), '[]'::JSONB);
END;
$$;

REVOKE ALL ON FUNCTION public.np_organisation_heading(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.np_donor_statement_document(UUID, DATE, DATE, UUID, TEXT) FROM PUBLIC, anon;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'nonprofit_donor_statement',
        'nonprofit_record_donor_statement',
        'nonprofit_record_donor_statements',
        'nonprofit_my_donor_statement'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.signature);
  END LOOP;
END $$;
