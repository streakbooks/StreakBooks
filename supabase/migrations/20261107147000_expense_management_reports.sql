-- EM-11a: expense management report summary + exportable claim rows + recent audit events.

CREATE OR REPLACE FUNCTION public.get_expense_management_report(
  _company_id UUID,
  _from_date DATE DEFAULT NULL,
  _to_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _from DATE := COALESCE(_from_date, (CURRENT_DATE - INTERVAL '90 days')::DATE);
  _to DATE := COALESCE(_to_date, CURRENT_DATE);
  _by_approval JSONB;
  _by_posting JSONB;
  _by_reimbursement JSONB;
  _aging JSONB;
  _totals JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this organisation' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'expenses.export')
    OR public.has_company_permission(_company_id, 'expenses.view')
    OR public.has_company_permission(_company_id, 'expenses.audit')
    OR public.has_company_permission(_company_id, 'expenses.admin')
  ) THEN
    RAISE EXCEPTION 'Expense report access denied' USING ERRCODE = '42501';
  END IF;
  IF _from > _to THEN
    RAISE EXCEPTION 'From date must be on or before to date';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'status', s.approval_status,
    'claim_count', s.claim_count,
    'total_minor', s.total_minor
  ) ORDER BY s.approval_status), '[]'::jsonb)
  INTO _by_approval
  FROM (
    SELECT c.approval_status,
           COUNT(*)::INTEGER AS claim_count,
           COALESCE(SUM(c.total_minor), 0)::BIGINT AS total_minor
    FROM public.expense_claims c
    WHERE c.company_id = _company_id
      AND c.claim_date BETWEEN _from AND _to
    GROUP BY c.approval_status
  ) s;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'status', s.posting_status,
    'claim_count', s.claim_count,
    'total_minor', s.total_minor
  ) ORDER BY s.posting_status), '[]'::jsonb)
  INTO _by_posting
  FROM (
    SELECT c.posting_status,
           COUNT(*)::INTEGER AS claim_count,
           COALESCE(SUM(c.total_minor), 0)::BIGINT AS total_minor
    FROM public.expense_claims c
    WHERE c.company_id = _company_id
      AND c.claim_date BETWEEN _from AND _to
    GROUP BY c.posting_status
  ) s;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'status', s.reimbursement_status,
    'claim_count', s.claim_count,
    'total_minor', s.total_minor
  ) ORDER BY s.reimbursement_status), '[]'::jsonb)
  INTO _by_reimbursement
  FROM (
    SELECT c.reimbursement_status,
           COUNT(*)::INTEGER AS claim_count,
           COALESCE(SUM(c.total_minor), 0)::BIGINT AS total_minor
    FROM public.expense_claims c
    WHERE c.company_id = _company_id
      AND c.claim_date BETWEEN _from AND _to
    GROUP BY c.reimbursement_status
  ) s;

  SELECT jsonb_build_object(
    '0_7', COALESCE(SUM(CASE WHEN CURRENT_DATE - c.claim_date BETWEEN 0 AND 7 THEN 1 ELSE 0 END), 0),
    '8_30', COALESCE(SUM(CASE WHEN CURRENT_DATE - c.claim_date BETWEEN 8 AND 30 THEN 1 ELSE 0 END), 0),
    '31_90', COALESCE(SUM(CASE WHEN CURRENT_DATE - c.claim_date BETWEEN 31 AND 90 THEN 1 ELSE 0 END), 0),
    '90_plus', COALESCE(SUM(CASE WHEN CURRENT_DATE - c.claim_date > 90 THEN 1 ELSE 0 END), 0)
  )
  INTO _aging
  FROM public.expense_claims c
  WHERE c.company_id = _company_id
    AND c.claim_date BETWEEN _from AND _to
    AND c.approval_status IN ('submitted', 'in_review', 'approved')
    AND c.reimbursement_status IN (
      'eligible', 'awaiting_payment', 'payment_initiated', 'not_eligible', 'partially_paid'
    );

  SELECT jsonb_build_object(
    'claim_count', COUNT(*)::INTEGER,
    'total_minor', COALESCE(SUM(c.total_minor), 0)::BIGINT,
    'reimbursable_minor', COALESCE(SUM(c.reimbursable_minor), 0)::BIGINT
  )
  INTO _totals
  FROM public.expense_claims c
  WHERE c.company_id = _company_id
    AND c.claim_date BETWEEN _from AND _to;

  RETURN jsonb_build_object(
    'company_id', _company_id,
    'from_date', _from,
    'to_date', _to,
    'totals', _totals,
    'by_approval_status', COALESCE(_by_approval, '[]'::jsonb),
    'by_posting_status', COALESCE(_by_posting, '[]'::jsonb),
    'by_reimbursement_status', COALESCE(_by_reimbursement, '[]'::jsonb),
    'open_aging', COALESCE(_aging, '{}'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.export_expense_claims_report(
  _company_id UUID,
  _from_date DATE DEFAULT NULL,
  _to_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _from DATE := COALESCE(_from_date, (CURRENT_DATE - INTERVAL '90 days')::DATE);
  _to DATE := COALESCE(_to_date, CURRENT_DATE);
  _rows JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this organisation' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'expenses.export')
    OR public.has_company_permission(_company_id, 'expenses.admin')
    OR public.has_company_permission(_company_id, 'expenses.audit')
  ) THEN
    RAISE EXCEPTION 'Expense export denied' USING ERRCODE = '42501';
  END IF;
  IF _from > _to THEN
    RAISE EXCEPTION 'From date must be on or before to date';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.claim_date DESC, c.claim_number DESC), '[]'::jsonb)
  INTO _rows
  FROM public.expense_claims c
  WHERE c.company_id = _company_id
    AND c.claim_date BETWEEN _from AND _to;

  RETURN jsonb_build_object(
    'from_date', _from,
    'to_date', _to,
    'claims', COALESCE(_rows, '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_expense_claim_audit_events(
  _company_id UUID,
  _limit INTEGER DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _cap INTEGER := GREATEST(1, LEAST(COALESCE(_limit, 50), 200));
  _rows JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this organisation' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'expenses.audit')
    OR public.has_company_permission(_company_id, 'expenses.view')
    OR public.has_company_permission(_company_id, 'expenses.admin')
  ) THEN
    RAISE EXCEPTION 'Expense audit access denied' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.acted_at DESC, e.id DESC), '[]'::jsonb)
  INTO _rows
  FROM (
    SELECT ev.*
    FROM public.expense_claim_events ev
    WHERE ev.company_id = _company_id
    ORDER BY ev.acted_at DESC, ev.id DESC
    LIMIT _cap
  ) e;

  RETURN jsonb_build_object('events', COALESCE(_rows, '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.get_expense_management_report(UUID, DATE, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.export_expense_claims_report(UUID, DATE, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_expense_claim_audit_events(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_expense_management_report(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.export_expense_claims_report(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_expense_claim_audit_events(UUID, INTEGER) TO authenticated;

NOTIFY pgrst, 'reload schema';
