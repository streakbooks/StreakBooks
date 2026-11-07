-- EM-05c: approval delegation — temporary stand-ins for expense approvers.

CREATE TABLE IF NOT EXISTS public.expense_approval_delegations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  from_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  note TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  CONSTRAINT expense_approval_delegations_range CHECK (ends_on >= starts_on),
  CONSTRAINT expense_approval_delegations_not_self CHECK (from_user_id <> to_user_id),
  CONSTRAINT expense_approval_delegations_note_len CHECK (
    note IS NULL OR char_length(trim(note)) BETWEEN 1 AND 500
  )
);

CREATE INDEX IF NOT EXISTS expense_approval_delegations_active_idx
  ON public.expense_approval_delegations (company_id, to_user_id, starts_on, ends_on)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS expense_approval_delegations_from_idx
  ON public.expense_approval_delegations (company_id, from_user_id, starts_on DESC);

ALTER TABLE public.expense_approval_delegations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS expense_approval_delegations_select ON public.expense_approval_delegations;
CREATE POLICY expense_approval_delegations_select
  ON public.expense_approval_delegations FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND (
      from_user_id = auth.uid()
      OR to_user_id = auth.uid()
      OR public.has_company_permission(company_id, 'expenses.admin')
      OR public.has_company_permission(company_id, 'expenses.audit')
    )
  );

REVOKE ALL ON TABLE public.expense_approval_delegations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.expense_approval_delegations TO authenticated;
GRANT ALL ON TABLE public.expense_approval_delegations TO service_role;

CREATE OR REPLACE FUNCTION private.expense_user_is_active_approver(
  _company_id UUID,
  _user_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_members m
    WHERE m.company_id = _company_id
      AND m.user_id = _user_id
      AND m.status = 'active'
      AND (
        EXISTS (
          SELECT 1 FROM public.role_permissions r
          WHERE r.role = m.role AND r.permission IN ('expenses.approve', 'expenses.admin')
        )
        OR EXISTS (
          SELECT 1 FROM public.member_permission_adjustments a
          WHERE a.company_id = _company_id
            AND a.user_id = _user_id
            AND a.effect = 'grant'
            AND a.permission IN ('expenses.approve', 'expenses.admin')
            AND m.role <> 'owner'
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.member_permission_adjustments a
        WHERE a.company_id = _company_id
          AND a.user_id = _user_id
          AND a.effect = 'deny'
          AND a.permission IN ('expenses.approve', 'expenses.admin')
          AND m.role <> 'owner'
      )
  );
$$;

CREATE OR REPLACE FUNCTION private.expense_user_has_active_delegation(
  _company_id UUID,
  _delegate_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.expense_approval_delegations d
    WHERE d.company_id = _company_id
      AND d.to_user_id = _delegate_user_id
      AND d.revoked_at IS NULL
      AND CURRENT_DATE BETWEEN d.starts_on AND d.ends_on
      AND private.expense_user_is_active_approver(_company_id, d.from_user_id)
  );
$$;

CREATE OR REPLACE FUNCTION private.expense_claim_assert_approver(
  _company_id UUID,
  _claimant UUID
)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _prevent_self BOOLEAN := true;
  _is_approver BOOLEAN := false;
  _is_delegate BOOLEAN := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  _is_approver :=
    public.has_company_permission(_company_id, 'expenses.approve')
    OR public.has_company_permission(_company_id, 'expenses.admin');

  _is_delegate := private.expense_user_has_active_delegation(_company_id, auth.uid());

  IF NOT (_is_approver OR _is_delegate) THEN
    RAISE EXCEPTION 'Expense claim approval denied' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(s.prevent_self_approval, true)
  INTO _prevent_self
  FROM public.expense_management_settings s
  WHERE s.company_id = _company_id;

  IF COALESCE(_prevent_self, true) AND _claimant = auth.uid() THEN
    RAISE EXCEPTION 'You cannot approve your own expense claim. Ask another approver.'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

-- Also notify active delegates when a claim is submitted.
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
    SELECT DISTINCT ON (recipient.user_id)
      _company_id, recipient.user_id, _event_key, 'expense_claim', _priority,
      _notif_title, _body, 'expense_claim', _claim_id, _path, 'review'
    FROM (
      SELECT m.user_id
      FROM public.company_members m
      WHERE m.company_id = _company_id
        AND m.status = 'active'
        AND m.user_id <> _claimant_user_id
        AND (
          EXISTS (
            SELECT 1 FROM public.role_permissions r
            WHERE r.role = m.role AND r.permission = 'expenses.approve'
          )
          OR EXISTS (
            SELECT 1 FROM public.member_permission_adjustments a
            WHERE a.company_id = _company_id
              AND a.user_id = m.user_id
              AND a.effect = 'grant'
              AND a.permission = 'expenses.approve'
              AND m.role <> 'owner'
          )
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.member_permission_adjustments a
          WHERE a.company_id = _company_id
            AND a.user_id = m.user_id
            AND a.effect = 'deny'
            AND a.permission = 'expenses.approve'
            AND m.role <> 'owner'
        )
      UNION
      SELECT d.to_user_id AS user_id
      FROM public.expense_approval_delegations d
      WHERE d.company_id = _company_id
        AND d.revoked_at IS NULL
        AND CURRENT_DATE BETWEEN d.starts_on AND d.ends_on
        AND d.to_user_id <> _claimant_user_id
        AND private.expense_user_is_active_approver(_company_id, d.from_user_id)
    ) recipient
    WHERE COALESCE((
      SELECT p.enabled
      FROM public.action_notification_preferences p
      WHERE p.company_id = _company_id
        AND p.recipient_user_id = recipient.user_id
        AND p.category = 'expense_claim'
    ), true)
    ON CONFLICT (company_id, recipient_user_id, event_key) DO UPDATE SET
      title = EXCLUDED.title,
      body = EXCLUDED.body,
      priority = EXCLUDED.priority,
      target_path = EXCLUDED.target_path,
      resolved_at = NULL;
    GET DIAGNOSTICS _n = ROW_COUNT;
    RETURN _n;
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

CREATE OR REPLACE FUNCTION public.list_expense_claims(
  _company_id UUID,
  _scope TEXT DEFAULT 'own',
  _approval_statuses TEXT[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _rows JSONB;
  _scope_norm TEXT := lower(COALESCE(NULLIF(btrim(_scope), ''), 'own'));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this organisation' USING ERRCODE = '42501';
  END IF;

  IF _scope_norm = 'all' THEN
    IF NOT (
      public.has_company_permission(_company_id, 'expenses.view')
      OR public.has_company_permission(_company_id, 'expenses.approve')
      OR public.has_company_permission(_company_id, 'expenses.audit')
      OR public.has_company_permission(_company_id, 'expenses.admin')
      OR private.expense_user_has_active_delegation(_company_id, auth.uid())
    ) THEN
      RAISE EXCEPTION 'Expense claim list access denied' USING ERRCODE = '42501';
    END IF;
  ELSIF _scope_norm = 'own' THEN
    IF NOT public.has_company_permission(_company_id, 'expenses.submit') THEN
      RAISE EXCEPTION 'Expense claim list access denied' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unknown expense claim list scope';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.updated_at DESC, c.id DESC), '[]'::jsonb)
  INTO _rows
  FROM public.expense_claims c
  WHERE c.company_id = _company_id
    AND (_scope_norm = 'all' OR c.claimant_user_id = auth.uid())
    AND (
      _approval_statuses IS NULL
      OR cardinality(_approval_statuses) = 0
      OR c.approval_status = ANY (_approval_statuses)
    );

  RETURN jsonb_build_object('claims', _rows);
END;
$$;

CREATE OR REPLACE FUNCTION private.expense_claim_can_read(_company_id UUID, _claimant UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.is_company_member(_company_id)
    AND (
      (
        _claimant = auth.uid()
        AND public.has_company_permission(_company_id, 'expenses.submit')
      )
      OR public.has_company_permission(_company_id, 'expenses.view')
      OR public.has_company_permission(_company_id, 'expenses.approve')
      OR public.has_company_permission(_company_id, 'expenses.audit')
      OR public.has_company_permission(_company_id, 'expenses.admin')
      OR private.expense_user_has_active_delegation(_company_id, auth.uid())
    );
$$;

CREATE OR REPLACE FUNCTION public.list_expense_approval_delegations(
  _company_id UUID
)
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
    public.has_company_permission(_company_id, 'expenses.approve')
    OR public.has_company_permission(_company_id, 'expenses.admin')
    OR public.has_company_permission(_company_id, 'expenses.audit')
    OR private.expense_user_has_active_delegation(_company_id, auth.uid())
  ) THEN
    RAISE EXCEPTION 'Expense delegation access denied' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.starts_on DESC, d.id DESC), '[]'::jsonb)
  INTO _rows
  FROM public.expense_approval_delegations d
  WHERE d.company_id = _company_id
    AND (
      public.has_company_permission(_company_id, 'expenses.admin')
      OR public.has_company_permission(_company_id, 'expenses.audit')
      OR d.from_user_id = auth.uid()
      OR d.to_user_id = auth.uid()
    );

  RETURN jsonb_build_object('delegations', COALESCE(_rows, '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.save_expense_approval_delegation(
  _company_id UUID,
  _to_user_id UUID,
  _starts_on DATE,
  _ends_on DATE,
  _note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _note_clean TEXT := NULLIF(btrim(COALESCE(_note, '')), '');
  _row public.expense_approval_delegations%ROWTYPE;
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
  ) THEN
    RAISE EXCEPTION 'Only expense approvers can create a delegation' USING ERRCODE = '42501';
  END IF;
  IF _to_user_id IS NULL OR _to_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Choose a different organisation member as your delegate';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.company_members m
    WHERE m.company_id = _company_id AND m.user_id = _to_user_id AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Delegate must be an active organisation member';
  END IF;
  IF _starts_on IS NULL OR _ends_on IS NULL OR _ends_on < _starts_on THEN
    RAISE EXCEPTION 'Delegation end date must be on or after the start date';
  END IF;

  INSERT INTO public.expense_approval_delegations (
    company_id, from_user_id, to_user_id, starts_on, ends_on, note, created_by
  ) VALUES (
    _company_id, auth.uid(), _to_user_id, _starts_on, _ends_on, _note_clean, auth.uid()
  )
  RETURNING * INTO _row;

  RETURN to_jsonb(_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_expense_approval_delegation(
  _company_id UUID,
  _delegation_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _row public.expense_approval_delegations%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _row
  FROM public.expense_approval_delegations
  WHERE id = _delegation_id AND company_id = _company_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delegation not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    _row.from_user_id = auth.uid()
    OR public.has_company_permission(_company_id, 'expenses.admin')
  ) THEN
    RAISE EXCEPTION 'Only the delegating approver or an admin can revoke this delegation'
      USING ERRCODE = '42501';
  END IF;

  IF _row.revoked_at IS NOT NULL THEN
    RETURN to_jsonb(_row);
  END IF;

  UPDATE public.expense_approval_delegations SET
    revoked_at = clock_timestamp()
  WHERE id = _row.id
  RETURNING * INTO _row;

  RETURN to_jsonb(_row);
END;
$$;

REVOKE ALL ON FUNCTION private.expense_user_is_active_approver(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.expense_user_has_active_delegation(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_expense_approval_delegations(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_expense_approval_delegation(UUID, UUID, DATE, DATE, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_expense_approval_delegation(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_expense_approval_delegations(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_expense_approval_delegation(UUID, UUID, DATE, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_expense_approval_delegation(UUID, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
