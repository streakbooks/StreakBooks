-- EM-05d: escalate stale submitted/in_review claims into Action Center (in-app only).

ALTER TABLE public.expense_management_settings
  ADD COLUMN IF NOT EXISTS approval_escalation_days INTEGER NOT NULL DEFAULT 5
    CHECK (approval_escalation_days >= 0 AND approval_escalation_days <= 90);

CREATE OR REPLACE FUNCTION public.list_expense_approval_escalations(
  _company_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _days INTEGER := 5;
  _rows JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this organisation' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'expenses.approve')
    OR public.has_company_permission(_company_id, 'expenses.admin')
    OR public.has_company_permission(_company_id, 'expenses.audit')
    OR private.expense_user_has_active_delegation(_company_id, auth.uid())
  ) THEN
    RAISE EXCEPTION 'Expense escalation access denied' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(s.approval_escalation_days, 5)
  INTO _days
  FROM public.expense_management_settings s
  WHERE s.company_id = _company_id;

  IF COALESCE(_days, 0) <= 0 THEN
    RETURN jsonb_build_object(
      'escalation_days', 0,
      'claims', '[]'::jsonb
    );
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.submitted_at ASC NULLS LAST, c.id), '[]'::jsonb)
  INTO _rows
  FROM public.expense_claims c
  WHERE c.company_id = _company_id
    AND c.approval_status IN ('submitted', 'in_review')
    AND c.submitted_at IS NOT NULL
    AND c.submitted_at <= (clock_timestamp() - make_interval(days => _days));

  RETURN jsonb_build_object(
    'escalation_days', _days,
    'claims', COALESCE(_rows, '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_expense_approval_escalations(
  _company_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _days INTEGER := 5;
  _inserted INTEGER := 0;
  _n INTEGER;
  _claim RECORD;
  _event_key TEXT;
  _title TEXT;
  _body TEXT;
  _path TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'expenses.approve')
    OR public.has_company_permission(_company_id, 'expenses.admin')
  ) THEN
    RAISE EXCEPTION 'Expense escalation refresh denied' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(s.approval_escalation_days, 5)
  INTO _days
  FROM public.expense_management_settings s
  WHERE s.company_id = _company_id;

  IF COALESCE(_days, 0) <= 0 THEN
    RETURN jsonb_build_object('escalation_days', 0, 'notified_count', 0);
  END IF;

  FOR _claim IN
    SELECT c.id, c.claim_number, c.title, c.submitted_at, c.claimant_user_id
    FROM public.expense_claims c
    WHERE c.company_id = _company_id
      AND c.approval_status IN ('submitted', 'in_review')
      AND c.submitted_at IS NOT NULL
      AND c.submitted_at <= (clock_timestamp() - make_interval(days => _days))
  LOOP
    _event_key := 'expense_claim_escalated:' || _claim.id::text;
    _title := left('Escalated expense claim: ' || COALESCE(_claim.claim_number, ''), 180);
    _body := 'Claim has waited more than ' || _days::text
      || ' day(s) for approval. Review it in Expense Management → Approvals.';
    _path := '/expense-management/claims/' || _claim.id::text;

    INSERT INTO public.action_notifications (
      company_id, recipient_user_id, event_key, category, priority,
      title, body, entity_type, entity_id, target_path, action_kind
    )
    SELECT
      _company_id, m.user_id, _event_key, 'expense_claim', 'critical',
      _title, _body, 'expense_claim', _claim.id, _path, 'review'
    FROM public.company_members m
    WHERE m.company_id = _company_id
      AND m.status = 'active'
      AND m.user_id <> _claim.claimant_user_id
      AND (
        EXISTS (
          SELECT 1 FROM public.role_permissions r
          WHERE r.role = m.role AND r.permission IN ('expenses.approve', 'expenses.admin')
        )
        OR EXISTS (
          SELECT 1 FROM public.member_permission_adjustments a
          WHERE a.company_id = _company_id
            AND a.user_id = m.user_id
            AND a.effect = 'grant'
            AND a.permission IN ('expenses.approve', 'expenses.admin')
            AND m.role <> 'owner'
        )
        OR private.expense_user_has_active_delegation(_company_id, m.user_id)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.member_permission_adjustments a
        WHERE a.company_id = _company_id
          AND a.user_id = m.user_id
          AND a.effect = 'deny'
          AND a.permission IN ('expenses.approve', 'expenses.admin')
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
  END LOOP;

  RETURN jsonb_build_object(
    'escalation_days', _days,
    'notified_count', _inserted
  );
END;
$$;

-- Expose escalation days through settings get/save helpers by extending JSON maps
-- in a lightweight overlay function used by the app if the base settings RPCs
-- already return unknown columns via to_jsonb — they do for SELECT * paths.
-- Keep a dedicated setter for the new field to avoid rewriting the large settings RPC.

CREATE OR REPLACE FUNCTION public.save_expense_approval_escalation_days(
  _company_id UUID,
  _days INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _row public.expense_management_settings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'expenses.manage_policies')
    OR public.has_company_permission(_company_id, 'expenses.admin')
  ) THEN
    RAISE EXCEPTION 'Expense settings update denied' USING ERRCODE = '42501';
  END IF;
  IF _days IS NULL OR _days < 0 OR _days > 90 THEN
    RAISE EXCEPTION 'Escalation days must be between 0 and 90 (0 disables)';
  END IF;

  UPDATE public.expense_management_settings SET
    approval_escalation_days = _days,
    version = version + 1,
    updated_by = auth.uid(),
    updated_at = clock_timestamp()
  WHERE company_id = _company_id
  RETURNING * INTO _row;

  IF NOT FOUND THEN
    INSERT INTO public.expense_management_settings (
      company_id, approval_escalation_days, created_by, updated_by
    ) VALUES (
      _company_id, _days, auth.uid(), auth.uid()
    )
    RETURNING * INTO _row;
  END IF;

  RETURN jsonb_build_object(
    'approval_escalation_days', _row.approval_escalation_days,
    'version', _row.version
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_expense_approval_escalations(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.refresh_expense_approval_escalations(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_expense_approval_escalation_days(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_expense_approval_escalations(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_expense_approval_escalations(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_expense_approval_escalation_days(UUID, INTEGER) TO authenticated;

NOTIFY pgrst, 'reload schema';
