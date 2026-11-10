-- HR-11: Action Center alerts, Files attachment map for payroll employees,
-- Payroll handoff RPCs (comp + offboarding). Does not mutate finalized pay runs.

ALTER TABLE public.hr_offboarding_cases
  ADD COLUMN IF NOT EXISTS payroll_applied_at TIMESTAMPTZ;
ALTER TABLE public.hr_compensation_changes
  ADD COLUMN IF NOT EXISTS payroll_applied_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- Action Center category
-- ---------------------------------------------------------------------------
ALTER TABLE public.action_notifications
  DROP CONSTRAINT IF EXISTS action_notifications_category_check;
ALTER TABLE public.action_notifications
  ADD CONSTRAINT action_notifications_category_check
  CHECK (category = ANY (ARRAY[
    'bill_approval','overdue_invoice','bank_reconciliation','document_request',
    'system','contact_followup','expense_claim','hr_alert'
  ]));

ALTER TABLE public.action_notification_preferences
  DROP CONSTRAINT IF EXISTS action_notification_preferences_category_check;
ALTER TABLE public.action_notification_preferences
  ADD CONSTRAINT action_notification_preferences_category_check
  CHECK (category = ANY (ARRAY[
    'bill_approval','overdue_invoice','bank_reconciliation','document_request',
    'contact_followup','expense_claim','hr_alert'
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
    WHEN 'hr_alert' THEN (
      public.has_company_permission(_company_id, 'hr.view')
      OR public.has_company_permission(_company_id, 'hr.leave.approve')
      OR public.has_company_permission(_company_id, 'hr.attendance.manage')
      OR public.has_company_permission(_company_id, 'hr.approvals.manage')
      OR public.has_company_permission(_company_id, 'hr.employees.manage')
      OR public.has_company_permission(_company_id, 'payroll.employees.manage')
    )
    WHEN 'system' THEN true
    ELSE false
  END;
END;
$function$;

CREATE OR REPLACE FUNCTION private.sync_hr_action_notifications(
  _company_id uuid, _recipient_user_id uuid
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  _inserted integer := 0;
  _batch integer := 0;
  _resolved integer := 0;
  _can_approve boolean := false;
  _can_hr_docs boolean := false;
  _can_payroll boolean := false;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('hr-alert:' || _company_id::text || ':' || _recipient_user_id::text)
  );

  _can_approve := public.has_company_permission(_company_id, 'hr.leave.approve')
    OR public.has_company_permission(_company_id, 'hr.attendance.manage')
    OR public.has_company_permission(_company_id, 'hr.approvals.manage')
    OR public.has_company_permission(_company_id, 'hr.manager');
  _can_hr_docs := public.has_company_permission(_company_id, 'hr.employees.manage')
    OR public.has_company_permission(_company_id, 'hr.view');
  _can_payroll := public.has_company_permission(_company_id, 'payroll.employees.manage');

  IF _can_approve AND to_regclass('public.hr_leave_requests') IS NOT NULL THEN
    INSERT INTO public.action_notifications (
      company_id, recipient_user_id, event_key, category, priority,
      title, body, entity_type, entity_id, target_path, action_kind
    )
    SELECT
      r.company_id, _recipient_user_id, 'hr_leave_approval:' || r.id::text,
      'hr_alert', 'high',
      pg_catalog.left('Leave approval: ' || coalesce(e.employee_number, 'employee'), 180),
      'A leave request is waiting for decision.',
      'hr_leave_request', r.id, '/hr/approvals', 'review'
    FROM public.hr_leave_requests r
    JOIN public.payroll_employees e ON e.id = r.employee_id
    WHERE r.company_id = _company_id AND r.status = 'submitted'
    ON CONFLICT (company_id, recipient_user_id, event_key) DO UPDATE SET
      title = EXCLUDED.title, body = EXCLUDED.body, priority = EXCLUDED.priority,
      resolved_at = NULL
    WHERE public.action_notifications.resolved_at IS NOT NULL;
    GET DIAGNOSTICS _inserted = ROW_COUNT;
  END IF;

  IF _can_approve AND to_regclass('public.hr_attendance_corrections') IS NOT NULL THEN
    INSERT INTO public.action_notifications (
      company_id, recipient_user_id, event_key, category, priority,
      title, body, entity_type, entity_id, target_path, action_kind
    )
    SELECT
      c.company_id, _recipient_user_id, 'hr_attendance_approval:' || c.id::text,
      'hr_alert', 'medium',
      pg_catalog.left('Attendance correction: ' || coalesce(e.employee_number, 'employee'), 180),
      'An attendance correction is waiting for decision.',
      'hr_attendance_correction', c.id, '/hr/approvals', 'review'
    FROM public.hr_attendance_corrections c
    JOIN public.payroll_employees e ON e.id = c.employee_id
    WHERE c.company_id = _company_id AND c.status = 'submitted'
    ON CONFLICT (company_id, recipient_user_id, event_key) DO UPDATE SET
      title = EXCLUDED.title, body = EXCLUDED.body, priority = EXCLUDED.priority,
      resolved_at = NULL
    WHERE public.action_notifications.resolved_at IS NOT NULL;
    GET DIAGNOSTICS _batch = ROW_COUNT; _inserted := _inserted + _batch;
  END IF;

  IF _can_hr_docs AND to_regclass('public.hr_employee_documents') IS NOT NULL THEN
    INSERT INTO public.action_notifications (
      company_id, recipient_user_id, event_key, category, priority,
      title, body, entity_type, entity_id, target_path, action_kind
    )
    SELECT
      d.company_id, _recipient_user_id, 'hr_document_expiry:' || d.id::text,
      'hr_alert',
      CASE WHEN d.expires_on <= CURRENT_DATE + 7 THEN 'high' ELSE 'medium' END,
      pg_catalog.left('Document expiring: ' || d.title, 180),
      'An employee document expires within 30 days.',
      'hr_employee_document', d.id, '/hr/documents', 'open'
    FROM public.hr_employee_documents d
    WHERE d.company_id = _company_id AND d.status = 'active'
      AND d.expires_on IS NOT NULL
      AND d.expires_on BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '30 days')
    ON CONFLICT (company_id, recipient_user_id, event_key) DO UPDATE SET
      title = EXCLUDED.title, body = EXCLUDED.body, priority = EXCLUDED.priority,
      resolved_at = NULL
    WHERE public.action_notifications.resolved_at IS NOT NULL
       OR public.action_notifications.priority IS DISTINCT FROM EXCLUDED.priority;
    GET DIAGNOSTICS _batch = ROW_COUNT; _inserted := _inserted + _batch;
  END IF;

  IF _can_payroll AND to_regclass('public.hr_offboarding_cases') IS NOT NULL THEN
    INSERT INTO public.action_notifications (
      company_id, recipient_user_id, event_key, category, priority,
      title, body, entity_type, entity_id, target_path, action_kind
    )
    SELECT
      o.company_id, _recipient_user_id, 'hr_offboarding_handoff:' || o.id::text,
      'hr_alert', 'high',
      pg_catalog.left('Payroll handoff: offboarding ' || coalesce(e.employee_number, ''), 180),
      'Clearance is complete. Terminate the employee in Payroll when ready.',
      'hr_offboarding_case', o.id, '/hr/offboarding', 'review'
    FROM public.hr_offboarding_cases o
    JOIN public.payroll_employees e ON e.id = o.employee_id
    WHERE o.company_id = _company_id
      AND o.ready_for_payroll IS TRUE
      AND o.payroll_applied_at IS NULL
      AND e.status = 'active'
    ON CONFLICT (company_id, recipient_user_id, event_key) DO UPDATE SET
      title = EXCLUDED.title, body = EXCLUDED.body, resolved_at = NULL
    WHERE public.action_notifications.resolved_at IS NOT NULL;
    GET DIAGNOSTICS _batch = ROW_COUNT; _inserted := _inserted + _batch;
  END IF;

  IF _can_payroll AND to_regclass('public.hr_compensation_changes') IS NOT NULL THEN
    INSERT INTO public.action_notifications (
      company_id, recipient_user_id, event_key, category, priority,
      title, body, entity_type, entity_id, target_path, action_kind
    )
    SELECT
      c.company_id, _recipient_user_id, 'hr_compensation_handoff:' || c.id::text,
      'hr_alert', 'medium',
      pg_catalog.left('Payroll handoff: compensation ' || coalesce(e.employee_number, ''), 180),
      'An approved HR compensation change is waiting for Payroll apply.',
      'hr_compensation_change', c.id, '/hr/compensation', 'review'
    FROM public.hr_compensation_changes c
    JOIN public.payroll_employees e ON e.id = c.employee_id
    WHERE c.company_id = _company_id AND c.status = 'approved' AND c.payroll_applied_at IS NULL
    ON CONFLICT (company_id, recipient_user_id, event_key) DO UPDATE SET
      title = EXCLUDED.title, body = EXCLUDED.body, resolved_at = NULL
    WHERE public.action_notifications.resolved_at IS NOT NULL;
    GET DIAGNOSTICS _batch = ROW_COUNT; _inserted := _inserted + _batch;
  END IF;

  UPDATE public.action_notifications n
  SET resolved_at = pg_catalog.now()
  WHERE n.company_id = _company_id
    AND n.recipient_user_id = _recipient_user_id
    AND n.category = 'hr_alert'
    AND n.resolved_at IS NULL
    AND (
      (n.event_key LIKE 'hr_leave_approval:%' AND (
        NOT _can_approve OR NOT EXISTS (
          SELECT 1 FROM public.hr_leave_requests r
          WHERE r.id = n.entity_id AND r.company_id = _company_id AND r.status = 'submitted'
        )
      ))
      OR (n.event_key LIKE 'hr_attendance_approval:%' AND (
        NOT _can_approve OR NOT EXISTS (
          SELECT 1 FROM public.hr_attendance_corrections c
          WHERE c.id = n.entity_id AND c.company_id = _company_id AND c.status = 'submitted'
        )
      ))
      OR (n.event_key LIKE 'hr_document_expiry:%' AND (
        NOT _can_hr_docs OR NOT EXISTS (
          SELECT 1 FROM public.hr_employee_documents d
          WHERE d.id = n.entity_id AND d.company_id = _company_id AND d.status = 'active'
            AND d.expires_on IS NOT NULL
            AND d.expires_on BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '30 days')
        )
      ))
      OR (n.event_key LIKE 'hr_offboarding_handoff:%' AND (
        NOT _can_payroll OR NOT EXISTS (
          SELECT 1 FROM public.hr_offboarding_cases o
          JOIN public.payroll_employees e ON e.id = o.employee_id
          WHERE o.id = n.entity_id AND o.company_id = _company_id
            AND o.ready_for_payroll AND o.payroll_applied_at IS NULL AND e.status = 'active'
        )
      ))
      OR (n.event_key LIKE 'hr_compensation_handoff:%' AND (
        NOT _can_payroll OR NOT EXISTS (
          SELECT 1 FROM public.hr_compensation_changes c
          WHERE c.id = n.entity_id AND c.company_id = _company_id
            AND c.status = 'approved' AND c.payroll_applied_at IS NULL
        )
      ))
    );
  GET DIAGNOSTICS _resolved = ROW_COUNT;
  RETURN _inserted + _resolved;
END;
$function$;

REVOKE ALL ON FUNCTION private.sync_hr_action_notifications(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.refresh_my_hr_notifications(_company_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL OR NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'You are not an active member of this organisation';
  END IF;
  RETURN private.sync_hr_action_notifications(_company_id, _uid);
END;
$function$;

REVOKE ALL ON FUNCTION public.refresh_my_hr_notifications(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_my_hr_notifications(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Files: payroll_employee attachment entity
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_access_attachment(
  _company_id UUID, _entity_type TEXT, _action TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR _company_id IS NULL THEN RETURN false; END IF;
  IF NOT public.is_company_member(_company_id) THEN RETURN false; END IF;

  IF _action = 'view' THEN
    RETURN CASE
      WHEN _entity_type IN ('sales_invoice', 'sales_quote', 'sales_credit_note', 'sales_receipt',
                            'money_sales_receipt', 'money_customer_refund')
        THEN public.has_company_permission(_company_id, 'sales.view')
      WHEN _entity_type IN ('purchase_bill', 'purchase_order', 'purchase_credit_note',
                            'purchase_expense', 'recurring_bill', 'inbox_document',
                            'money_supplier_refund')
        THEN public.has_company_permission(_company_id, 'purchases.view')
      WHEN _entity_type IN ('expense_claim', 'expense_receipt_inbox') THEN (
        public.has_company_permission(_company_id, 'expenses.submit')
        OR public.has_company_permission(_company_id, 'expenses.view')
        OR public.has_company_permission(_company_id, 'expenses.approve')
        OR public.has_company_permission(_company_id, 'expenses.audit')
        OR public.has_company_permission(_company_id, 'expenses.admin')
      )
      WHEN _entity_type IN ('journal', 'recurring_journal')
        THEN public.has_company_permission(_company_id, 'accounting.view')
      WHEN _entity_type = 'project' THEN (
        public.has_company_permission(_company_id, 'accounting.view')
        OR public.has_company_permission(_company_id, 'accounts.manage')
      )
      WHEN _entity_type IN ('money_receive', 'money_deposit', 'money_card_payment',
                            'money_adjustment', 'bank_transfer')
        THEN public.has_company_permission(_company_id, 'banking.view')
      WHEN _entity_type = 'product' THEN (
        public.has_company_permission(_company_id, 'products.manage')
        OR public.has_company_permission(_company_id, 'sales.view')
        OR public.has_company_permission(_company_id, 'purchases.view')
      )
      WHEN _entity_type = 'payroll_employee' THEN (
        public.has_company_permission(_company_id, 'hr.view')
        OR public.has_company_permission(_company_id, 'hr.employees.manage')
        OR public.has_company_permission(_company_id, 'payroll.employees.manage')
        OR public.has_company_permission(_company_id, 'payroll.view')
      )
      WHEN _entity_type IN ('contact', 'company') THEN true
      ELSE false
    END;
  ELSIF _action = 'manage' THEN
    RETURN CASE
      WHEN _entity_type IN ('sales_invoice', 'sales_quote', 'sales_credit_note', 'sales_receipt')
        THEN public.has_company_permission(_company_id, 'sales.draft')
      WHEN _entity_type IN ('money_sales_receipt', 'money_customer_refund')
        THEN public.has_company_permission(_company_id, 'sales.payment')
      WHEN _entity_type IN ('purchase_bill', 'purchase_order', 'purchase_credit_note',
                            'purchase_expense', 'recurring_bill', 'inbox_document')
        THEN public.has_company_permission(_company_id, 'purchases.draft')
      WHEN _entity_type IN ('expense_claim', 'expense_receipt_inbox') THEN (
        public.has_company_permission(_company_id, 'expenses.submit')
        OR public.has_company_permission(_company_id, 'expenses.admin')
      )
      WHEN _entity_type = 'money_supplier_refund'
        THEN public.has_company_permission(_company_id, 'purchases.payment')
      WHEN _entity_type = 'contact'
        THEN public.has_company_permission(_company_id, 'contacts.manage')
      WHEN _entity_type = 'journal'
        THEN public.has_company_permission(_company_id, 'accounting.post')
      WHEN _entity_type = 'recurring_journal'
        THEN public.has_company_permission(_company_id, 'journals.manual')
      WHEN _entity_type = 'project'
        THEN public.has_company_permission(_company_id, 'accounts.manage')
      WHEN _entity_type = 'product'
        THEN public.has_company_permission(_company_id, 'products.manage')
      WHEN _entity_type IN ('money_receive', 'money_deposit', 'money_card_payment',
                            'money_adjustment', 'bank_transfer')
        THEN public.has_company_permission(_company_id, 'banking.categorise')
      WHEN _entity_type = 'payroll_employee' THEN (
        public.has_company_permission(_company_id, 'hr.employees.manage')
        OR public.has_company_permission(_company_id, 'payroll.employees.manage')
      )
      WHEN _entity_type = 'company' THEN (
        public.has_company_permission(_company_id, 'sales.draft')
        OR public.has_company_permission(_company_id, 'purchases.draft')
        OR public.has_company_permission(_company_id, 'accounting.post')
      )
      ELSE false
    END;
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.document_entity_exists(
  _company_id UUID, _entity_type TEXT, _entity_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _table TEXT;
  _kind TEXT;
  _ok BOOLEAN;
BEGIN
  IF _company_id IS NULL OR _entity_id IS NULL OR _entity_type IS NULL THEN
    RETURN false;
  END IF;
  IF _entity_type = 'company' THEN
    RETURN _entity_id = _company_id;
  END IF;

  _table := CASE _entity_type
    WHEN 'sales_invoice' THEN 'sales_invoices'
    WHEN 'sales_quote' THEN 'sales_quotes'
    WHEN 'sales_credit_note' THEN 'sales_credit_notes'
    WHEN 'sales_receipt' THEN 'sales_receipts'
    WHEN 'purchase_bill' THEN 'purchase_bills'
    WHEN 'purchase_order' THEN 'purchase_orders'
    WHEN 'purchase_credit_note' THEN 'purchase_credit_notes'
    WHEN 'purchase_expense' THEN 'purchase_expenses'
    WHEN 'expense_claim' THEN 'expense_claims'
    WHEN 'expense_receipt_inbox' THEN 'expense_receipt_inbox_entries'
    WHEN 'recurring_bill' THEN 'recurring_bills'
    WHEN 'inbox_document' THEN 'inbox_documents'
    WHEN 'contact' THEN 'contacts'
    WHEN 'journal' THEN 'journals'
    WHEN 'recurring_journal' THEN 'recurring_journal_templates'
    WHEN 'product' THEN 'products'
    WHEN 'project' THEN 'projects'
    WHEN 'bank_transfer' THEN 'bank_transfers'
    WHEN 'payroll_employee' THEN 'payroll_employees'
    WHEN 'money_sales_receipt' THEN 'money_documents'
    WHEN 'money_customer_refund' THEN 'money_documents'
    WHEN 'money_supplier_refund' THEN 'money_documents'
    WHEN 'money_receive' THEN 'money_documents'
    WHEN 'money_deposit' THEN 'money_documents'
    WHEN 'money_card_payment' THEN 'money_documents'
    WHEN 'money_adjustment' THEN 'money_documents'
    ELSE NULL
  END;
  IF _table IS NULL THEN RETURN false; END IF;

  IF _table = 'money_documents' THEN
    _kind := CASE _entity_type
      WHEN 'money_sales_receipt' THEN 'sales_receipt'
      WHEN 'money_customer_refund' THEN 'customer_refund'
      WHEN 'money_supplier_refund' THEN 'supplier_refund'
      WHEN 'money_receive' THEN 'receive_money'
      WHEN 'money_deposit' THEN 'bank_deposit'
      WHEN 'money_card_payment' THEN 'card_payment'
      WHEN 'money_adjustment' THEN 'bank_adjustment'
      ELSE NULL
    END;
    SELECT EXISTS (
      SELECT 1 FROM public.money_documents
      WHERE id = _entity_id AND company_id = _company_id AND kind = _kind
    ) INTO _ok;
    RETURN COALESCE(_ok, false);
  END IF;

  EXECUTE format(
    'SELECT EXISTS (SELECT 1 FROM public.%I WHERE id = $1 AND company_id = $2)',
    _table
  ) INTO _ok USING _entity_id, _company_id;
  RETURN COALESCE(_ok, false);
END;
$$;

-- ---------------------------------------------------------------------------
-- Payroll handoff RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_hr_payroll_handoffs(_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this organisation';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'payroll.employees.manage') THEN
    RAISE EXCEPTION 'Missing permission: payroll.employees.manage';
  END IF;
  RETURN jsonb_build_object(
    'compensation', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'employeeId', c.employee_id,
        'employeeName', trim(both FROM concat_ws(' ', e.first_name, e.last_name)),
        'employeeNumber', e.employee_number,
        'effectiveOn', c.effective_on, 'changeType', c.change_type,
        'currencyCode', c.currency_code, 'proposedAmount', c.proposed_amount,
        'status', c.status, 'notes', c.notes, 'payrollHandoffNote', c.payroll_handoff_note
      ) ORDER BY c.effective_on)
      FROM public.hr_compensation_changes c
      JOIN public.payroll_employees e ON e.id = c.employee_id
      WHERE c.company_id = _company_id AND c.status = 'approved' AND c.payroll_applied_at IS NULL
    ), '[]'::jsonb),
    'offboarding', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', o.id, 'caseNumber', o.case_number, 'employeeId', o.employee_id,
        'employeeName', trim(both FROM concat_ws(' ', e.first_name, e.last_name)),
        'employeeNumber', e.employee_number,
        'lastWorkingDay', o.last_working_day, 'exitReason', o.exit_reason,
        'payrollHandoffNote', o.payroll_handoff_note
      ) ORDER BY o.last_working_day)
      FROM public.hr_offboarding_cases o
      JOIN public.payroll_employees e ON e.id = o.employee_id
      WHERE o.company_id = _company_id AND o.ready_for_payroll AND o.payroll_applied_at IS NULL
        AND e.status = 'active'
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_payroll_hr_compensation_handoff(
  _company_id UUID, _change_id UUID, _component_type_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  _row public.hr_compensation_changes%ROWTYPE;
  _minor BIGINT;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this organisation';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'payroll.employees.manage') THEN
    RAISE EXCEPTION 'Missing permission: payroll.employees.manage';
  END IF;
  SELECT * INTO _row FROM public.hr_compensation_changes
  WHERE id = _change_id AND company_id = _company_id FOR UPDATE;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'Compensation change not found'; END IF;
  IF _row.status <> 'approved' OR _row.payroll_applied_at IS NOT NULL THEN
    RAISE EXCEPTION 'Compensation change is not an open approved handoff';
  END IF;
  IF _component_type_id IS NULL THEN
    RAISE EXCEPTION 'component_type_id is required to apply salary version';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.payroll_component_types t
    WHERE t.id = _component_type_id AND t.company_id = _company_id
  ) THEN
    RAISE EXCEPTION 'Payroll component type not found';
  END IF;

  _minor := round(_row.proposed_amount * 100)::BIGINT;
  PERFORM public.assign_payroll_employee_salary(
    _company_id, _row.employee_id,
    jsonb_build_object(
      'effective_from', _row.effective_on::text,
      'change_reason', coalesce(_row.payroll_handoff_note, 'HR compensation handoff ' || _row.id::text),
      'lines', jsonb_build_array(jsonb_build_object(
        'component_type_id', _component_type_id,
        'amount_minor', _minor,
        'is_recurring', true,
        'notes', 'Applied from HR compensation change'
      ))
    )
  );

  UPDATE public.hr_compensation_changes SET
    status = 'applied',
    payroll_applied_at = now(),
    version = version + 1,
    updated_at = now()
  WHERE id = _row.id
  RETURNING * INTO _row;

  PERFORM private.hr_write_audit(
    _company_id, 'hr_compensation_change', _row.id, 'payroll_apply',
    format('Payroll applied compensation change for %s', _row.employee_id),
    jsonb_build_object('amountMinor', _minor, 'componentTypeId', _component_type_id)
  );

  RETURN jsonb_build_object('id', _row.id, 'status', _row.status, 'payrollAppliedAt', _row.payroll_applied_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_payroll_hr_offboarding_handoff(
  _company_id UUID, _case_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  _case public.hr_offboarding_cases%ROWTYPE;
  _emp public.payroll_employees%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this organisation';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'payroll.employees.manage') THEN
    RAISE EXCEPTION 'Missing permission: payroll.employees.manage';
  END IF;
  SELECT * INTO _case FROM public.hr_offboarding_cases
  WHERE id = _case_id AND company_id = _company_id FOR UPDATE;
  IF _case.id IS NULL THEN RAISE EXCEPTION 'Offboarding case not found'; END IF;
  IF NOT _case.ready_for_payroll OR _case.payroll_applied_at IS NOT NULL THEN
    RAISE EXCEPTION 'Offboarding case is not ready for Payroll handoff';
  END IF;

  SELECT * INTO _emp FROM public.payroll_employees
  WHERE id = _case.employee_id AND company_id = _company_id FOR UPDATE;
  IF _emp.id IS NULL THEN RAISE EXCEPTION 'Employee not found'; END IF;
  IF _emp.status = 'terminated' THEN
    UPDATE public.hr_offboarding_cases SET
      payroll_applied_at = now(), updated_at = now(), version = version + 1
    WHERE id = _case.id RETURNING * INTO _case;
  ELSE
    UPDATE public.payroll_employees SET
      status = 'terminated',
      termination_date = _case.last_working_day,
      updated_at = now()
    WHERE id = _emp.id AND company_id = _company_id
    RETURNING * INTO _emp;

    UPDATE public.hr_offboarding_cases SET
      payroll_applied_at = now(),
      payroll_handoff_note = coalesce(
        payroll_handoff_note,
        'Payroll termination applied from HR offboarding handoff.'
      ),
      updated_at = now(),
      version = version + 1
    WHERE id = _case.id
    RETURNING * INTO _case;
  END IF;

  PERFORM private.hr_write_audit(
    _company_id, 'hr_offboarding_case', _case.id, 'payroll_apply',
    format('Payroll terminated employee via offboarding %s', _case.case_number),
    jsonb_build_object('employeeId', _emp.id, 'terminationDate', _emp.termination_date)
  );

  RETURN jsonb_build_object(
    'id', _case.id, 'caseNumber', _case.case_number,
    'payrollAppliedAt', _case.payroll_applied_at,
    'employeeStatus', _emp.status
  );
END;
$$;

-- KPI extension
CREATE OR REPLACE FUNCTION public.get_hr_dashboard_kpis(_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  _settings public.hr_settings%ROWTYPE;
  _att_pending INTEGER := 0;
  _leave_pending INTEGER := 0;
  _att_exc INTEGER := 0;
  _open_req INTEGER := 0;
  _expiring INTEGER := 0;
  _payroll_handoffs INTEGER := 0;
BEGIN
  PERFORM private.hr_require_permission(_company_id, 'hr.view');
  PERFORM private.hr_seed_defaults(_company_id);
  SELECT * INTO _settings FROM public.hr_settings WHERE company_id = _company_id;

  IF to_regclass('public.hr_attendance_corrections') IS NOT NULL THEN
    SELECT count(*)::INTEGER INTO _att_pending FROM public.hr_attendance_corrections c
    WHERE c.company_id = _company_id AND c.status = 'submitted';
  END IF;
  IF to_regclass('public.hr_leave_requests') IS NOT NULL THEN
    SELECT count(*)::INTEGER INTO _leave_pending FROM public.hr_leave_requests r
    WHERE r.company_id = _company_id AND r.status = 'submitted';
  END IF;
  IF to_regclass('public.hr_attendance_logs') IS NOT NULL THEN
    SELECT count(*)::INTEGER INTO _att_exc FROM public.hr_attendance_logs l
    WHERE l.company_id = _company_id AND l.status = 'exception';
  END IF;
  IF to_regclass('public.hr_job_requisitions') IS NOT NULL THEN
    SELECT count(*)::INTEGER INTO _open_req FROM public.hr_job_requisitions r
    WHERE r.company_id = _company_id AND r.status = 'open';
  END IF;
  IF to_regclass('public.hr_employee_documents') IS NOT NULL THEN
    SELECT count(*)::INTEGER INTO _expiring FROM public.hr_employee_documents d
    WHERE d.company_id = _company_id AND d.status = 'active'
      AND d.expires_on IS NOT NULL
      AND d.expires_on BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '30 days');
  END IF;
  IF to_regclass('public.hr_offboarding_cases') IS NOT NULL THEN
    SELECT count(*)::INTEGER INTO _payroll_handoffs FROM public.hr_offboarding_cases o
    JOIN public.payroll_employees e ON e.id = o.employee_id
    WHERE o.company_id = _company_id AND o.ready_for_payroll AND o.payroll_applied_at IS NULL
      AND e.status = 'active';
  END IF;
  IF to_regclass('public.hr_compensation_changes') IS NOT NULL THEN
    _payroll_handoffs := _payroll_handoffs + (
      SELECT count(*)::INTEGER FROM public.hr_compensation_changes c
      WHERE c.company_id = _company_id AND c.status = 'approved' AND c.payroll_applied_at IS NULL
    );
  END IF;

  RETURN jsonb_build_object(
    'enabled', COALESCE(_settings.enabled, false),
    'activeEmployees', (SELECT count(*)::INTEGER FROM public.payroll_employees e WHERE e.company_id = _company_id AND e.status = 'active'),
    'archivedEmployees', (SELECT count(*)::INTEGER FROM public.payroll_employees e WHERE e.company_id = _company_id AND e.status = 'archived'),
    'terminatedEmployees', (SELECT count(*)::INTEGER FROM public.payroll_employees e WHERE e.company_id = _company_id AND e.status = 'terminated'),
    'profilesLinked', (SELECT count(*)::INTEGER FROM public.hr_employee_profiles p WHERE p.company_id = _company_id),
    'departments', (SELECT count(*)::INTEGER FROM public.hr_departments d WHERE d.company_id = _company_id AND d.is_active),
    'locations', (SELECT count(*)::INTEGER FROM public.hr_locations l WHERE l.company_id = _company_id AND l.is_active),
    'pendingApprovals', (_att_pending + _leave_pending),
    'attendanceExceptions', _att_exc,
    'expiringDocuments', _expiring,
    'openRequisitions', _open_req,
    'payrollHandoffsPending', _payroll_handoffs
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_hr_payroll_handoffs(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apply_payroll_hr_compensation_handoff(UUID, UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apply_payroll_hr_offboarding_handoff(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_hr_payroll_handoffs(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_payroll_hr_compensation_handoff(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_payroll_hr_offboarding_handoff(UUID, UUID) TO authenticated;