-- EM-10a: duplicate detection, risk indicators, category suggestions.
-- OCR remains explicitly not configured until an extraction provider is wired.

ALTER TABLE public.expense_receipt_inbox_entries
  ADD COLUMN IF NOT EXISTS ocr_status TEXT NOT NULL DEFAULT 'not_configured'
    CHECK (ocr_status IN (
      'not_configured', 'queued', 'processing', 'succeeded', 'failed', 'unavailable'
    )),
  ADD COLUMN IF NOT EXISTS ocr_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS suggested_category_id UUID
    REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suggested_merchant_name TEXT,
  ADD COLUMN IF NOT EXISTS suggested_gross_minor BIGINT
    CHECK (suggested_gross_minor IS NULL OR suggested_gross_minor >= 0);

CREATE OR REPLACE FUNCTION public.list_expense_categories(_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _rows JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this organisation' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'expenses.view')
    OR public.has_company_permission(_company_id, 'expenses.submit')
    OR public.has_company_permission(_company_id, 'expenses.manage_policies')
    OR public.has_company_permission(_company_id, 'expenses.admin')
  ) THEN
    RAISE EXCEPTION 'Expense categories access denied' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(to_jsonb(c) ORDER BY c.sort_order, c.name, c.id),
    '[]'::jsonb
  )
  INTO _rows
  FROM public.expense_categories c
  WHERE c.company_id = _company_id AND c.is_active;

  RETURN jsonb_build_object('categories', COALESCE(_rows, '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.suggest_expense_category(
  _company_id UUID,
  _merchant_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _merchant TEXT := lower(btrim(COALESCE(_merchant_name, '')));
  _category_id UUID;
  _category_name TEXT;
  _uses INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this organisation' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'expenses.submit')
    OR public.has_company_permission(_company_id, 'expenses.view')
    OR public.has_company_permission(_company_id, 'expenses.admin')
  ) THEN
    RAISE EXCEPTION 'Expense category suggest denied' USING ERRCODE = '42501';
  END IF;
  IF _merchant IS NULL OR _merchant = '' THEN
    RETURN jsonb_build_object('suggested', false);
  END IF;

  SELECT l.category_id, cat.name, COUNT(*)::INTEGER
  INTO _category_id, _category_name, _uses
  FROM public.expense_claim_lines l
  JOIN public.expense_claims c ON c.id = l.claim_id AND c.company_id = l.company_id
  JOIN public.expense_categories cat
    ON cat.id = l.category_id AND cat.company_id = l.company_id
  WHERE l.company_id = _company_id
    AND l.category_id IS NOT NULL
    AND lower(btrim(COALESCE(l.merchant_name, ''))) = _merchant
  GROUP BY l.category_id, cat.name
  ORDER BY COUNT(*) DESC, cat.name
  LIMIT 1;

  IF _category_id IS NULL THEN
    RETURN jsonb_build_object('suggested', false, 'merchant_name', _merchant_name);
  END IF;

  RETURN jsonb_build_object(
    'suggested', true,
    'merchant_name', _merchant_name,
    'category_id', _category_id,
    'category_name', _category_name,
    'prior_uses', _uses
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.find_expense_claim_duplicates(
  _company_id UUID,
  _claim_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _claim public.expense_claims%ROWTYPE;
  _matches JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _claim
  FROM public.expense_claims
  WHERE id = _claim_id AND company_id = _company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense claim not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT private.expense_claim_can_read(_company_id, _claim.claimant_user_id) THEN
    RAISE EXCEPTION 'Expense claim access denied' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.score DESC, x.claim_number), '[]'::jsonb)
  INTO _matches
  FROM (
    SELECT DISTINCT
      other.id AS claim_id,
      other.claim_number,
      other.approval_status,
      other.total_minor,
      other.claim_currency,
      other.claim_date,
      GREATEST(
        CASE WHEN other.total_minor = _claim.total_minor THEN 40 ELSE 0 END
        + CASE
            WHEN EXISTS (
              SELECT 1
              FROM public.expense_claim_lines src
              JOIN public.expense_claim_lines dst
                ON dst.claim_id = other.id
               AND dst.company_id = src.company_id
               AND dst.gross_minor = src.gross_minor
               AND lower(btrim(COALESCE(dst.merchant_name, '')))
                   = lower(btrim(COALESCE(src.merchant_name, '')))
               AND dst.merchant_name IS NOT NULL
               AND btrim(dst.merchant_name) <> ''
               AND abs(dst.expense_date - src.expense_date) <= 3
              WHERE src.claim_id = _claim.id
            ) THEN 50
            ELSE 0
          END
        + CASE WHEN other.claimant_user_id = _claim.claimant_user_id THEN 10 ELSE 0 END
      , 0) AS score
    FROM public.expense_claims other
    WHERE other.company_id = _company_id
      AND other.id <> _claim.id
      AND other.approval_status NOT IN ('voided', 'withdrawn', 'rejected')
      AND (
        other.total_minor = _claim.total_minor
        OR EXISTS (
          SELECT 1
          FROM public.expense_claim_lines src
          JOIN public.expense_claim_lines dst
            ON dst.claim_id = other.id
           AND dst.company_id = src.company_id
           AND dst.gross_minor = src.gross_minor
           AND lower(btrim(COALESCE(dst.merchant_name, '')))
               = lower(btrim(COALESCE(src.merchant_name, '')))
           AND dst.merchant_name IS NOT NULL
           AND btrim(dst.merchant_name) <> ''
           AND abs(dst.expense_date - src.expense_date) <= 3
          WHERE src.claim_id = _claim.id
        )
      )
  ) x
  WHERE x.score >= 40;

  RETURN jsonb_build_object(
    'claim_id', _claim.id,
    'duplicates', COALESCE(_matches, '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.scan_expense_claim_risks(
  _company_id UUID,
  _claim_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _claim public.expense_claims%ROWTYPE;
  _settings public.expense_management_settings%ROWTYPE;
  _flags JSONB := '[]'::jsonb;
  _dup_count INTEGER := 0;
  _has_attachment BOOLEAN := false;
  _weekend_lines INTEGER := 0;
  _round_lines INTEGER := 0;
  _score INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _claim
  FROM public.expense_claims
  WHERE id = _claim_id AND company_id = _company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense claim not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT private.expense_claim_can_read(_company_id, _claim.claimant_user_id) THEN
    RAISE EXCEPTION 'Expense claim access denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _settings
  FROM public.expense_management_settings
  WHERE company_id = _company_id;

  SELECT COUNT(*) INTO _dup_count
  FROM jsonb_array_elements(
    COALESCE((public.find_expense_claim_duplicates(_company_id, _claim_id))->'duplicates', '[]'::jsonb)
  );

  IF _dup_count > 0 THEN
    _flags := _flags || jsonb_build_array(jsonb_build_object(
      'code', 'possible_duplicate',
      'severity', 'medium',
      'message', format('%s similar claim(s) found (merchant/amount/date)', _dup_count)
    ));
    _score := _score + 30;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.document_attachments a
    WHERE a.company_id = _company_id
      AND a.entity_type = 'expense_claim'
      AND a.entity_id = _claim.id
  ) INTO _has_attachment;

  IF COALESCE(_settings.require_receipt_above_minor, 0) > 0
     AND _claim.total_minor >= _settings.require_receipt_above_minor
     AND NOT _has_attachment THEN
    _flags := _flags || jsonb_build_array(jsonb_build_object(
      'code', 'missing_receipt',
      'severity', 'high',
      'message', 'Claim is at/above the receipt threshold but has no attachment'
    ));
    _score := _score + 40;
  END IF;

  IF COALESCE(_settings.require_spending_request_above_minor, 0) > 0
     AND _claim.total_minor >= _settings.require_spending_request_above_minor
     AND _claim.spending_request_id IS NULL THEN
    _flags := _flags || jsonb_build_array(jsonb_build_object(
      'code', 'missing_spending_request',
      'severity', 'high',
      'message', 'Claim is at/above the spending-request threshold without a linked request'
    ));
    _score := _score + 35;
  END IF;

  SELECT COUNT(*) INTO _weekend_lines
  FROM public.expense_claim_lines l
  WHERE l.claim_id = _claim.id
    AND EXTRACT(ISODOW FROM l.expense_date) IN (6, 7);

  IF _weekend_lines > 0 THEN
    _flags := _flags || jsonb_build_array(jsonb_build_object(
      'code', 'weekend_expense',
      'severity', 'low',
      'message', format('%s line(s) dated on a weekend', _weekend_lines)
    ));
    _score := _score + 10;
  END IF;

  SELECT COUNT(*) INTO _round_lines
  FROM public.expense_claim_lines l
  WHERE l.claim_id = _claim.id
    AND l.gross_minor >= 10000
    AND l.gross_minor % 10000 = 0;

  IF _round_lines > 0 THEN
    _flags := _flags || jsonb_build_array(jsonb_build_object(
      'code', 'round_amount',
      'severity', 'low',
      'message', format('%s large round-amount line(s)', _round_lines)
    ));
    _score := _score + 10;
  END IF;

  RETURN jsonb_build_object(
    'claim_id', _claim.id,
    'score', LEAST(_score, 100),
    'flags', _flags,
    'ocr_available', false,
    'ocr_note', 'Receipt OCR is not configured for this organisation yet.'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.request_expense_receipt_ocr(
  _company_id UUID,
  _entry_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _entry public.expense_receipt_inbox_entries%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'expenses.submit')
    OR public.has_company_permission(_company_id, 'expenses.admin')
  ) THEN
    RAISE EXCEPTION 'Receipt OCR request denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _entry
  FROM public.expense_receipt_inbox_entries
  WHERE id = _entry_id AND company_id = _company_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receipt inbox entry not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.expense_receipt_inbox_entries SET
    ocr_status = 'unavailable',
    ocr_payload = jsonb_build_object(
      'available', false,
      'reason', 'No OCR provider is configured for Expense Management yet.'
    ),
    updated_at = clock_timestamp()
  WHERE id = _entry.id
  RETURNING * INTO _entry;

  RETURN to_jsonb(_entry);
END;
$$;

-- Refresh receipt inbox list to include OCR fields.
CREATE OR REPLACE FUNCTION public.list_expense_receipt_inbox(_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _rows JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this organisation' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'expenses.submit')
    OR public.has_company_permission(_company_id, 'expenses.view')
    OR public.has_company_permission(_company_id, 'expenses.approve')
    OR public.has_company_permission(_company_id, 'expenses.admin')
  ) THEN
    RAISE EXCEPTION 'Expense receipt inbox access denied' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.created_at DESC, e.id DESC), '[]'::jsonb)
  INTO _rows
  FROM public.expense_receipt_inbox_entries e
  WHERE e.company_id = _company_id;

  RETURN jsonb_build_object(
    'entries', COALESCE(_rows, '[]'::jsonb),
    'inbound_email_enabled', false,
    'ocr_enabled', false,
    'note', 'Inbound email and OCR are not configured. Upload files here, then match them to a draft claim.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_expense_categories(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.suggest_expense_category(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.find_expense_claim_duplicates(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.scan_expense_claim_risks(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.request_expense_receipt_ocr(UUID, UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.list_expense_categories(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.suggest_expense_category(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_expense_claim_duplicates(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.scan_expense_claim_risks(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_expense_receipt_ocr(UUID, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
