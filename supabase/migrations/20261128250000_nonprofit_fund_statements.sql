-- Historical fund statement. This is a management report of tagged activity.
-- It does not file anything and it does not post a journal.

CREATE OR REPLACE FUNCTION public.nonprofit_fund_statement(
  _company_id UUID,
  _from DATE,
  _as_of DATE
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _transfer_out UUID;
  _transfer_in UUID;
  _release_debit UUID;
  _release_credit UUID;
  _funds JSONB;
  _totals JSONB;
BEGIN
  PERFORM public.nonprofit_require(_company_id, 'nonprofit.view');
  IF _from IS NULL OR _as_of IS NULL THEN
    RAISE EXCEPTION 'A fund statement needs a from date and an as-of date';
  END IF;
  IF _from > _as_of THEN
    RAISE EXCEPTION 'The statement period starts after it ends';
  END IF;

  SELECT
    NULLIF(account_map->>'transfer_out', '')::UUID,
    NULLIF(account_map->>'transfer_in', '')::UUID,
    NULLIF(account_map->>'restriction_release_debit', '')::UUID,
    NULLIF(account_map->>'restriction_release_credit', '')::UUID
  INTO _transfer_out, _transfer_in, _release_debit, _release_credit
  FROM public.nonprofit_settings
  WHERE company_id = _company_id;

  WITH activity AS (
    SELECT
      t.fund_id,
      j.journal_date,
      a.account_type,
      jl.account_id,
      jl.debit_minor,
      jl.credit_minor
    FROM public.nonprofit_fund_tags t
    JOIN public.journal_lines jl ON jl.id = t.journal_line_id
    JOIN public.journals j ON j.id = jl.journal_id
    JOIN public.accounts a ON a.id = jl.account_id
    WHERE t.company_id = _company_id
      AND j.company_id = _company_id
      AND j.status = 'posted'
      AND j.journal_date <= _as_of
  ),
  lines AS (
    SELECT
      f.id,
      f.code,
      f.name,
      f.restriction,
      f.category,
      f.status,
      COALESCE(SUM(CASE
        WHEN activity.journal_date < _from AND activity.account_type IN ('asset', 'liability')
        THEN activity.debit_minor - activity.credit_minor ELSE 0 END), 0) AS opening_net_assets_minor,
      COALESCE(SUM(CASE
        WHEN activity.journal_date >= _from AND activity.account_type = 'income'
        THEN activity.credit_minor - activity.debit_minor ELSE 0 END), 0) AS support_minor,
      COALESCE(SUM(CASE
        WHEN activity.journal_date >= _from AND activity.account_type = 'expense'
        THEN activity.debit_minor - activity.credit_minor ELSE 0 END), 0) AS expenses_minor,
      COALESCE(SUM(CASE
        WHEN activity.journal_date >= _from
          AND activity.account_id IN (_transfer_out, _transfer_in)
        THEN activity.credit_minor - activity.debit_minor ELSE 0 END), 0) AS transfers_minor,
      COALESCE(SUM(CASE
        WHEN activity.journal_date >= _from
          AND activity.account_id IN (_release_debit, _release_credit)
        THEN activity.credit_minor - activity.debit_minor ELSE 0 END), 0) AS releases_minor,
      COALESCE(SUM(CASE
        WHEN activity.journal_date >= _from
          AND activity.account_type NOT IN ('asset', 'liability', 'income', 'expense')
          AND activity.account_id IS DISTINCT FROM _transfer_out
          AND activity.account_id IS DISTINCT FROM _transfer_in
          AND activity.account_id IS DISTINCT FROM _release_debit
          AND activity.account_id IS DISTINCT FROM _release_credit
        THEN activity.credit_minor - activity.debit_minor ELSE 0 END), 0) AS other_equity_minor,
      COALESCE(SUM(CASE
        WHEN activity.account_type IN ('asset', 'liability')
        THEN activity.debit_minor - activity.credit_minor ELSE 0 END), 0) AS closing_net_assets_minor,
      public.nonprofit_fund_spendable(_company_id, f.id, _as_of) AS spendable_minor
    FROM public.nonprofit_funds f
    LEFT JOIN activity ON activity.fund_id = f.id
    WHERE f.company_id = _company_id
    GROUP BY f.id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'fund_id', id,
    'code', code,
    'name', name,
    'restriction', restriction,
    'category', category,
    'status', status,
    'opening_net_assets_minor', opening_net_assets_minor,
    'support_minor', support_minor,
    'expenses_minor', expenses_minor,
    'transfers_minor', transfers_minor,
    'releases_minor', releases_minor,
    'other_equity_minor', other_equity_minor,
    'closing_net_assets_minor', closing_net_assets_minor,
    'spendable_minor', spendable_minor
  ) ORDER BY code), '[]'::JSONB)
  INTO _funds
  FROM lines;

  SELECT jsonb_build_object(
    'opening_net_assets_minor', COALESCE(SUM((fund->>'opening_net_assets_minor')::BIGINT), 0),
    'support_minor', COALESCE(SUM((fund->>'support_minor')::BIGINT), 0),
    'expenses_minor', COALESCE(SUM((fund->>'expenses_minor')::BIGINT), 0),
    'transfers_minor', COALESCE(SUM((fund->>'transfers_minor')::BIGINT), 0),
    'releases_minor', COALESCE(SUM((fund->>'releases_minor')::BIGINT), 0),
    'other_equity_minor', COALESCE(SUM((fund->>'other_equity_minor')::BIGINT), 0),
    'closing_net_assets_minor', COALESCE(SUM((fund->>'closing_net_assets_minor')::BIGINT), 0),
    'spendable_minor', COALESCE(SUM((fund->>'spendable_minor')::BIGINT), 0)
  )
  INTO _totals
  FROM jsonb_array_elements(_funds) fund;

  RETURN jsonb_build_object(
    'statutory_filing', false,
    'government_approved', false,
    'wording', 'This management report summarises tagged fund activity for the selected dates. It is not a government filing and it is not a statutory financial statement.',
    'period_from', _from,
    'as_of', _as_of,
    'funds', _funds,
    'totals', _totals
  );
END;
$$;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'nonprofit\_%'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.signature);
  END LOOP;
END $$;
