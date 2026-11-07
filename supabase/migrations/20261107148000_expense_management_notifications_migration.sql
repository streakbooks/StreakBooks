-- EM-11b: Action Center expense notifications + legacy employee-claim migration tooling.
-- In-app only (no email/push). Import creates draft EM claims linked via legacy_employee_claim_id.

ALTER TABLE public.action_notifications
  DROP CONSTRAINT IF EXISTS action_notifications_category_check;
ALTER TABLE public.action_notifications
  ADD CONSTRAINT action_notifications_category_check
  CHECK (category = ANY (ARRAY[
    'bill_approval','overdue_invoice','bank_reconciliation','document_request',
    'system','contact_followup','expense_claim'
  ]));

ALTER TABLE public.action_notification_preferences
  DROP CONSTRAINT IF EXISTS action_notification_preferences_category_check;
ALTER TABLE public.action_notification_preferences
  ADD CONSTRAINT action_notification_preferences_category_check
  CHECK (category = ANY (ARRAY[
    'bill_approval','overdue_invoice','bank_reconciliation','document_request',
    'contact_followup','expense_claim'
  ]));

CREATE OR REPLACE FUNCTION public.can_read_action_notification(
  _company_id uuid, _category text
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_company_member(_company_id) THEN
    RETURN false;
  END IF;
  RETURN CASE _category
    WHEN 'bill_approval' THEN public.has_company_permission(_company_id,'purchases.authorise')
    WHEN 'overdue_invoice' THEN public.has_company_permission(_company_id,'sales.view')
    WHEN 'bank_reconciliation' THEN public.has_company_permission(_company_id,'banking.view')
    WHEN 'document_request' THEN public.can_access_attachment(_company_id,'company','view')
    WHEN 'contact_followup' THEN true
    WHEN 'expense_claim' THEN (
      public.has_company_permission(_company_id, 'expenses.submit')
      OR public.has_company_permission(_company_id, 'expenses.approve')
      OR public.has_company_permission(_company_id, 'expenses.view')
      OR public.has_company_permission(_company_id, 'expenses.admin')
    )
    WHEN 'system' THEN true
    ELSE false
  END;
END;
$function$;

CREATE UNIQUE INDEX IF NOT EXISTS expense_claims_legacy_employee_claim_uidx
  ON public.expense_claims (company_id, legacy_employee_claim_id)
  WHERE legacy_employee_claim_id IS NOT NULL;

-- Idempotent Action Center publisher for expense claim lifecycle events.
CREATE OR REPLACE FUNCTION private.notify_expense_claim_action(
  _company_id UUID,
  _claim_id UUID,
  _event_type TEXT,
  _claim_number TEXT,
  _title TEXT,
  _claimant_user_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _inserted INTEGER := 0;
  _n INTEGER;
  _path TEXT := '/expense-management/claims/' || _claim_id::text;
  _event_key TEXT;
  _priority TEXT := 'medium';
  _notif_title TEXT;
  _body TEXT;
BEGIN
  IF _event_type = 'submitted' THEN
    _event_key := 'expense_claim_submitted:' || _claim_id::text;
    _priority := 'high';
    _notif_title := left('Expense claim awaiting approval: ' || COALESCE(_claim_number, ''), 180);
    _body := 'Review ' || COALESCE(NULLIF(btrim(_title), ''), 'an expense claim')
      || ' in Expense Management → Approvals.';

    INSERT INTO public.action_notifications (
      company_id, recipient_user_id, event_key, category, priority,
      title, body, entity_type, entity_id, target_path, action_kind
    )
    SELECT
      _company_id, m.user_id, _event_key, 'expense_claim', _priority,
      _notif_title, _body, 'expense_claim', _claim_id, _path, 'review'
    FROM public.company_members m
    WHERE m.company_id = _company_id
      AND m.status = 'active'
      AND m.user_id <> _claimant_user_id
      AND (
        EXISTS (
          SELECT 1
          FROM public.role_permissions r
          WHERE r.role = m.role
            AND r.permission = 'expenses.approve'
        )
        OR EXISTS (
          SELECT 1
          FROM public.member_permission_adjustments a
          WHERE a.company_id = _company_id
            AND a.user_id = m.user_id
            AND a.effect = 'grant'
            AND a.permission = 'expenses.approve'
            AND m.role <> 'owner'
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.member_permission_adjustments a
        WHERE a.company_id = _company_id
          AND a.user_id = m.user_id
          AND a.effect = 'deny'
          AND a.permission = 'expenses.approve'
          AND m.role <> 'owner'
      )
      AND COALESCE((
        SELECT p.enabled
        FROM public.action_notification_preferences p
        WHERE p.company_id = _company_id
          AND p.recipient_user_id = m.user_id
          AND p.category = 'expense_claim'
      ), true)
    ON CONFLICT (company_id, recipient_user_id, event_key) DO UPDATE SET
      title = EXCLUDED.title,
      body = EXCLUDED.body,
      priority = EXCLUDED.priority,
      target_path = EXCLUDED.target_path,
      resolved_at = NULL;
    GET DIAGNOSTICS _n = ROW_COUNT;
    _inserted := _inserted + _n;
    RETURN _inserted;
  END IF;

  IF _event_type IN ('approved', 'returned', 'rejected', 'reimbursed') THEN
    _event_key := 'expense_claim_' || _event_type || ':' || _claim_id::text;
    _priority := CASE
      WHEN _event_type = 'rejected' THEN 'high'
      WHEN _event_type = 'returned' THEN 'medium'
      ELSE 'low'
    END;
    _notif_title := left(
      CASE _event_type
        WHEN 'approved' THEN 'Expense claim approved: '
        WHEN 'returned' THEN 'Expense claim returned: '
        WHEN 'rejected' THEN 'Expense claim rejected: '
        ELSE 'Expense claim reimbursed: '
      END || COALESCE(_claim_number, ''),
      180
    );
    _body := CASE _event_type
      WHEN 'approved' THEN 'Your claim was approved. Posting and reimbursement can continue.'
      WHEN 'returned' THEN 'Your claim was returned for changes. Open it from My Expenses.'
      WHEN 'rejected' THEN 'Your claim was rejected. Open it from My Expenses for the reason.'
      ELSE 'Your claim reimbursement has been recorded.'
    END;

    IF _claimant_user_id IS NULL THEN
      RETURN 0;
    END IF;

    IF NOT COALESCE((
      SELECT p.enabled
      FROM public.action_notification_preferences p
      WHERE p.company_id = _company_id
        AND p.recipient_user_id = _claimant_user_id
        AND p.category = 'expense_claim'
    ), true) THEN
      RETURN 0;
    END IF;

    INSERT INTO public.action_notifications (
      company_id, recipient_user_id, event_key, category, priority,
      title, body, entity_type, entity_id, target_path, action_kind
    ) VALUES (
      _company_id, _claimant_user_id, _event_key, 'expense_claim', _priority,
      _notif_title, _body, 'expense_claim', _claim_id, _path, 'open'
    )
    ON CONFLICT (company_id, recipient_user_id, event_key) DO UPDATE SET
      title = EXCLUDED.title,
      body = EXCLUDED.body,
      priority = EXCLUDED.priority,
      target_path = EXCLUDED.target_path,
      resolved_at = NULL;
    GET DIAGNOSTICS _n = ROW_COUNT;
    RETURN _n;
  END IF;

  RETURN 0;
END;
$$;

-- Hook notifications into the shared claim event writer.
CREATE OR REPLACE FUNCTION private.expense_claim_event(
  _company_id UUID,
  _claim_id UUID,
  _event_type TEXT,
  _approval TEXT,
  _posting TEXT,
  _reimbursement TEXT,
  _note TEXT DEFAULT NULL,
  _payload JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _claim public.expense_claims%ROWTYPE;
BEGIN
  INSERT INTO public.expense_claim_events (
    company_id, claim_id, event_type,
    approval_status_after, posting_status_after, reimbursement_status_after,
    note, payload, acted_by
  ) VALUES (
    _company_id, _claim_id, _event_type,
    _approval, _posting, _reimbursement,
    _note, COALESCE(_payload, '{}'::jsonb), auth.uid()
  );

  SELECT * INTO _claim
  FROM public.expense_claims
  WHERE id = _claim_id AND company_id = _company_id;

  IF FOUND THEN
    PERFORM private.notify_expense_claim_action(
      _company_id,
      _claim.id,
      _event_type,
      _claim.claim_number,
      _claim.title,
      _claim.claimant_user_id
    );
  END IF;
END;
$$;

-- Preview legacy Purchases employee claims that can be imported as EM drafts.
CREATE OR REPLACE FUNCTION public.preview_legacy_employee_expense_migration(
  _company_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _pending INTEGER := 0;
  _already INTEGER := 0;
  _sample JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this organisation' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'expenses.admin')
    OR public.has_company_permission(_company_id, 'expenses.manage_policies')
  ) THEN
    RAISE EXCEPTION 'Legacy expense migration denied' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*)::INTEGER INTO _already
  FROM public.expense_claims c
  WHERE c.company_id = _company_id
    AND c.legacy_employee_claim_id IS NOT NULL;

  SELECT COUNT(*)::INTEGER INTO _pending
  FROM public.employee_expense_claims e
  WHERE e.company_id = _company_id
    AND NOT EXISTS (
      SELECT 1 FROM public.expense_claims c
      WHERE c.company_id = _company_id
        AND c.legacy_employee_claim_id = e.id
    );

  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.claim_date DESC), '[]'::jsonb)
  INTO _sample
  FROM (
    SELECT e.id, e.claim_date, e.description, e.amount_minor, e.currency_code, e.status,
           e.claimant_user_id
    FROM public.employee_expense_claims e
    WHERE e.company_id = _company_id
      AND NOT EXISTS (
        SELECT 1 FROM public.expense_claims c
        WHERE c.company_id = _company_id
          AND c.legacy_employee_claim_id = e.id
      )
    ORDER BY e.claim_date DESC, e.id DESC
    LIMIT 25
  ) s;

  RETURN jsonb_build_object(
    'pending_count', _pending,
    'already_imported_count', _already,
    'sample', COALESCE(_sample, '[]'::jsonb)
  );
END;
$$;

-- Import unmigrated legacy claims as EM drafts (idempotent by legacy_employee_claim_id).
CREATE OR REPLACE FUNCTION public.import_legacy_employee_expense_claims(
  _company_id UUID,
  _limit INTEGER DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _cap INTEGER := GREATEST(1, LEAST(COALESCE(_limit, 50), 200));
  _imported INTEGER := 0;
  _skipped INTEGER := 0;
  _legacy public.employee_expense_claims%ROWTYPE;
  _claim_id UUID;
  _claim_number TEXT;
  _title TEXT;
  _currency CHAR(3);
  _tax BIGINT;
  _total BIGINT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this organisation' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'expenses.admin')
    OR public.has_company_permission(_company_id, 'expenses.manage_policies')
  ) THEN
    RAISE EXCEPTION 'Legacy expense migration denied' USING ERRCODE = '42501';
  END IF;

  FOR _legacy IN
    SELECT e.*
    FROM public.employee_expense_claims e
    WHERE e.company_id = _company_id
      AND NOT EXISTS (
        SELECT 1 FROM public.expense_claims c
        WHERE c.company_id = _company_id
          AND c.legacy_employee_claim_id = e.id
      )
    ORDER BY e.claim_date ASC, e.id ASC
    LIMIT _cap
    FOR UPDATE OF e SKIP LOCKED
  LOOP
    BEGIN
      _claim_number := public.allocate_document_number(_company_id, 'expense_claim');
      _title := left(NULLIF(btrim(_legacy.description), ''), 200);
      IF _title IS NULL THEN
        _title := 'Imported legacy claim';
      END IF;
      _currency := upper(_legacy.currency_code)::CHAR(3);
      _tax := COALESCE(_legacy.tax_minor, 0);
      _total := _legacy.amount_minor + _tax;

      INSERT INTO public.expense_claims (
        company_id, claim_number, title, description, claimant_user_id,
        employment_type, claim_date, claim_currency, reimbursement_currency,
        payment_source, approval_status, posting_status, reimbursement_status,
        subtotal_minor, tax_minor, total_minor, reimbursable_minor, non_reimbursable_minor,
        base_currency_total_minor, notes, legacy_employee_claim_id, created_by, updated_by
      ) VALUES (
        _company_id, _claim_number, _title, _legacy.description, _legacy.claimant_user_id,
        'employee', _legacy.claim_date, _currency, _currency,
        'employee_paid', 'draft', 'not_posted', 'not_eligible',
        _legacy.amount_minor, _tax, _total, _total, 0,
        _total,
        'Imported from Purchases employee expense claim ' || _legacy.id::text,
        _legacy.id, auth.uid(), auth.uid()
      )
      RETURNING id INTO _claim_id;

      INSERT INTO public.expense_claim_lines (
        company_id, claim_id, line_no, expense_date, description,
        account_id, quantity, unit_price_minor,
        net_minor, tax_minor, gross_minor, currency_code, exchange_rate,
        base_currency_gross_minor, reimbursable_minor, non_reimbursable_minor,
        employee_paid_minor, company_paid_minor, is_billable
      ) VALUES (
        _company_id, _claim_id, 1, _legacy.claim_date, _legacy.description,
        _legacy.expense_account_id, 1, _legacy.amount_minor,
        _legacy.amount_minor, _tax, _total, _currency, 1,
        _total, _total, 0,
        _total, 0, false
      );

      PERFORM private.expense_claim_event(
        _company_id, _claim_id, 'imported_from_legacy',
        'draft', 'not_posted', 'not_eligible',
        'Imported from legacy employee expense claim',
        jsonb_build_object('legacy_employee_claim_id', _legacy.id)
      );

      _imported := _imported + 1;
    EXCEPTION WHEN unique_violation THEN
      _skipped := _skipped + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'imported_count', _imported,
    'skipped_count', _skipped,
    'limit', _cap
  );
END;
$$;

REVOKE ALL ON FUNCTION private.notify_expense_claim_action(UUID, UUID, TEXT, TEXT, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.preview_legacy_employee_expense_migration(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.import_legacy_employee_expense_claims(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_legacy_employee_expense_migration(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.import_legacy_employee_expense_claims(UUID, INTEGER) TO authenticated;

NOTIFY pgrst, 'reload schema';
