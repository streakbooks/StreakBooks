-- Demo Company: sample data for every module and a reset that clears all of it.
-- Only companies with is_demo = true are touched (AGENTS.md allows is_demo to gate reset and demo
-- data). Seeding runs as the signed-in demo owner and goes through each module's own functions,
-- so posted payroll, depreciation and expense entries use the real posting engine.
-- Each module seeds independently; public.seed_demo_modules returns a per-module report.
-- Re-runnable.

-- ---------------------------------------------------------------- demo firm marker
ALTER TABLE public.firms ADD COLUMN IF NOT EXISTS demo_company_id uuid
  REFERENCES public.companies(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS firms_demo_company_key ON public.firms (demo_company_id)
  WHERE demo_company_id IS NOT NULL;

-- ---------------------------------------------------------------- helpers
CREATE OR REPLACE FUNCTION private.demo_acct(
  _c uuid, _code text, _name text, _type text, _subtype text, _kind text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  rid uuid;
BEGIN
  SELECT id INTO rid FROM public.accounts WHERE company_id = _c AND code = _code;
  IF rid IS NULL THEN
    INSERT INTO public.accounts (company_id, code, name, account_type, normal_balance, subtype, account_kind,
      is_postable, is_active)
    VALUES (_c, _code, _name, _type::public.account_type,
      (CASE WHEN _type IN ('asset', 'expense') THEN 'debit' ELSE 'credit' END)::public.normal_balance,
      _subtype, _kind, true, true)
    RETURNING id INTO rid;
  END IF;
  RETURN rid;
END $$;

CREATE OR REPLACE FUNCTION private.demo_acct_id(_c uuid, _code text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT id FROM public.accounts WHERE company_id = _c AND code = _code;
$$;

CREATE OR REPLACE FUNCTION private.demo_month_end(_d date) RETURNS date
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT (date_trunc('month', _d) + interval '1 month - 1 day')::date;
$$;

-- ---------------------------------------------------------------- audit helper fix
-- Payroll functions pass the entity id as text, but only a uuid version existed, so every payroll
-- run step failed. This overload keeps callers working; non-uuid ids are kept in the details.
CREATE OR REPLACE FUNCTION public.record_audit_event(
  _company_id uuid, _action text, _entity_type text, _entity_id text, _details jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF _entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN public.record_audit_event(_company_id, _action, _entity_type, _entity_id::uuid, _details);
  END IF;
  RETURN public.record_audit_event(_company_id, _action, _entity_type, NULL::uuid,
    coalesce(_details, '{}'::jsonb) || jsonb_build_object('entity_ref', _entity_id));
END $$;
REVOKE ALL ON FUNCTION public.record_audit_event(uuid, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_audit_event(uuid, text, text, text, jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------- payroll approval fix
-- The loop row was an untyped RECORD, which payroll_build_payslip_snapshot cannot accept, so
-- approving any pay run failed. Same function with a typed row.
CREATE OR REPLACE FUNCTION public.approve_payroll_run(_company_id UUID, _run_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _run public.payroll_runs;
  _settings public.payroll_settings;
  _company_name TEXT;
  _re public.payroll_run_employees;
  _emp public.payroll_employees;
  _snapshot JSONB;
  _payslip_number TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'Not a member of this company';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'payroll.run.approve') THEN
    RAISE EXCEPTION 'You do not have permission to approve payroll runs';
  END IF;

  SELECT * INTO _run FROM public.payroll_runs
  WHERE id = _run_id AND company_id = _company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payroll run not found'; END IF;

  IF _run.requires_approval THEN
    IF _run.status NOT IN ('calculated', 'reviewed') THEN
      RAISE EXCEPTION 'Run must be calculated (and reviewed when required) before approval';
    END IF;
  ELSE
    IF _run.status NOT IN ('calculated', 'reviewed', 'draft') THEN
      RAISE EXCEPTION 'Run cannot be approved from status %', _run.status;
    END IF;
    IF _run.status = 'draft' AND _run.calculated_at IS NULL THEN
      RAISE EXCEPTION 'Calculate the run before approval';
    END IF;
  END IF;

  SELECT * INTO _settings FROM public.payroll_settings WHERE company_id = _company_id;
  SELECT name INTO _company_name FROM public.companies WHERE id = _company_id;

  FOR _re IN
    SELECT re.* FROM public.payroll_run_employees re
    WHERE re.run_id = _run_id AND re.company_id = _company_id AND re.status = 'included'
  LOOP
    IF EXISTS (SELECT 1 FROM public.payroll_payslips WHERE run_employee_id = _re.id) THEN
      CONTINUE;
    END IF;
    SELECT * INTO _emp FROM public.payroll_employees WHERE id = _re.employee_id;
    _snapshot := public.payroll_build_payslip_snapshot(
      _run, _re, _emp, _company_name,
      _settings.payslip_branding_name, _settings.payslip_footer_note,
      _settings.payslip_show_employer_costs
    );
    _payslip_number := public.allocate_document_number(_company_id, 'payslip');
    INSERT INTO public.payroll_payslips (
      company_id, run_id, run_employee_id, employee_id, payslip_number,
      snapshot, branding_name, footer_note, show_employer_costs
    ) VALUES (
      _company_id, _run_id, _re.id, _re.employee_id, _payslip_number,
      _snapshot, _settings.payslip_branding_name, _settings.payslip_footer_note,
      _settings.payslip_show_employer_costs
    );
  END LOOP;

  UPDATE public.payroll_runs SET
    status = 'approved',
    approved_by = auth.uid(),
    approved_at = now(),
    updated_at = now()
  WHERE id = _run_id
  RETURNING * INTO _run;

  PERFORM public.record_audit_event(
    _company_id, 'payroll.run.approved', 'payroll_run', _run.id::TEXT,
    jsonb_build_object('run_number', _run.run_number)
  );

  RETURN to_jsonb(_run);
END;
$$;

-- ---------------------------------------------------------------- reset of module data
-- Runs inside the demo reset, before journals, contacts and documents are cleared.
CREATE OR REPLACE FUNCTION private.reset_demo_module_data(_c uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  demo_client uuid;
  demo_email text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = _c AND is_demo) THEN
    RAISE EXCEPTION 'Reset denied: company is not a demo company';
  END IF;
  PERFORM set_config('linkbooks.trusted', 'on', true);

  -- Module write guards need the features switched on for the demo company.
  INSERT INTO public.organisation_features (company_id, feature_key, enabled)
  VALUES (_c, 'fixed_assets', true), (_c, 'basic_payroll', true)
  ON CONFLICT (company_id, feature_key) DO UPDATE SET enabled = true;

  -- Smart Action Center
  DELETE FROM public.action_notifications WHERE company_id = _c;
  DELETE FROM public.action_notification_refresh_state WHERE company_id = _c;
  DELETE FROM public.action_notification_preferences WHERE company_id = _c;

  -- Firm (the demo practice and every client row about the demo company)
  BEGIN
    DELETE FROM public.firm_engagement_recurring_links WHERE company_id = _c OR billing_company_id = _c;
    DELETE FROM public.firm_engagement_invoice_links WHERE company_id = _c OR billing_company_id = _c;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  DELETE FROM public.firm_document_request_tracking WHERE company_id = _c;
  DELETE FROM public.firm_onboarding_escalation_events WHERE company_id = _c;
  DELETE FROM public.firm_onboarding_daily_snapshots WHERE company_id = _c;
  DELETE FROM public.firm_client_profile_audit WHERE company_id = _c;
  DELETE FROM public.firm_client_onboarding_steps WHERE company_id = _c;
  DELETE FROM public.firm_client_assignments WHERE company_id = _c;
  DELETE FROM public.firm_engagements WHERE company_id = _c;
  DELETE FROM public.firm_client_profiles WHERE company_id = _c;
  DELETE FROM public.firm_app_recommendations WHERE firm_id = _c OR client_company_id = _c;
  DELETE FROM public.firm_client_links WHERE company_id = _c;
  UPDATE public.report_saved_views SET firm_id = NULL
   WHERE firm_id IN (SELECT id FROM public.firms WHERE demo_company_id = _c);
  DELETE FROM public.firms WHERE demo_company_id = _c;

  -- Files
  DELETE FROM public.action_document_requests WHERE company_id = _c;
  DELETE FROM public.document_share_links WHERE company_id = _c;
  BEGIN
    EXECUTE 'DELETE FROM public.document_internal_notes WHERE company_id = $1' USING _c;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  DELETE FROM public.document_attachments WHERE company_id = _c;
  UPDATE public.document_folders SET parent_id = NULL WHERE company_id = _c AND parent_id IS NOT NULL;
  DELETE FROM public.document_folders WHERE company_id = _c;
  DELETE FROM public.inbox_documents WHERE company_id = _c;

  -- Accountant
  BEGIN
    EXECUTE 'DELETE FROM public.reconciliation_review_events WHERE company_id = $1' USING _c;
    EXECUTE 'DELETE FROM public.reconciliation_review_cases WHERE company_id = $1' USING _c;
  EXCEPTION WHEN undefined_table THEN NULL; END;
  DELETE FROM public.accountant_journal_exception_events WHERE company_id = _c;
  DELETE FROM public.accountant_journal_exception_reviews WHERE company_id = _c;
  DELETE FROM public.ai_journal_review_events WHERE company_id = _c;
  DELETE FROM public.ai_journal_review_cases WHERE company_id = _c;
  DELETE FROM public.account_workpaper_reconciling_item_events WHERE company_id = _c;
  DELETE FROM public.account_workpaper_reconciling_items WHERE company_id = _c;
  DELETE FROM public.account_workpapers WHERE company_id = _c;
  DELETE FROM public.practice_tasks WHERE company_id = _c;

  -- Advisors portal (only the demo client created for this demo company)
  SELECT id, email INTO demo_client, demo_email FROM public.advisors_clients
   WHERE company_id = _c AND email LIKE 'demo-%@demo.linkbooks.invalid';
  IF demo_client IS NOT NULL THEN
    DELETE FROM public.advisors_appointments WHERE lower(customer_email) = lower(demo_email);
    DELETE FROM public.advisors_subscriptions WHERE client_id = demo_client;
    DELETE FROM public.advisors_engagements WHERE client_id = demo_client;
    DELETE FROM public.advisors_clients WHERE id = demo_client;
  END IF;

  -- App Store
  DELETE FROM public.integration_sync_events WHERE company_id = _c;
  DELETE FROM public.integration_sync_jobs WHERE company_id = _c;
  DELETE FROM public.external_record_links WHERE company_id = _c;
  DELETE FROM public.integration_mappings WHERE company_id = _c;
  DELETE FROM public.integration_webhook_deliveries WHERE company_id = _c;
  DELETE FROM public.integration_webhook_subscriptions WHERE company_id = _c;
  DELETE FROM public.app_connection_consents WHERE company_id = _c;
  DELETE FROM public.marketplace_oauth_states WHERE company_id = _c;
  DELETE FROM public.integration_connections WHERE company_id = _c;
  DELETE FROM public.app_install_requests WHERE company_id = _c;
  DELETE FROM public.app_installations WHERE company_id = _c;
  DELETE FROM public.marketplace_security_alerts WHERE company_id = _c;
  DELETE FROM public.marketplace_analytics_events WHERE company_id = _c;

  -- Reports
  DELETE FROM public.report_deliveries WHERE company_id = _c;
  DELETE FROM public.report_schedules WHERE company_id = _c;
  DELETE FROM public.report_comments WHERE company_id = _c;
  DELETE FROM public.report_packs WHERE company_id = _c;
  DELETE FROM public.report_open_events WHERE company_id = _c;
  BEGIN
    DELETE FROM public.report_grants WHERE view_id IN (SELECT id FROM public.report_saved_views WHERE company_id = _c);
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  DELETE FROM public.report_saved_views WHERE company_id = _c;
  BEGIN
    DELETE FROM public.report_model_versions WHERE model_id IN (SELECT id FROM public.report_models WHERE company_id = _c);
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  DELETE FROM public.report_models WHERE company_id = _c;

  -- Budgets (governance, approval, dimension and forecast tables may not exist yet)
  BEGIN EXECUTE 'DELETE FROM public.budget_approval_events WHERE company_id = $1' USING _c;
  EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN EXECUTE 'DELETE FROM public.budget_approval_state WHERE company_id = $1' USING _c;
  EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN EXECUTE 'DELETE FROM public.budget_governance WHERE company_id = $1' USING _c;
  EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN EXECUTE 'DELETE FROM public.budget_forecast_scenario_events WHERE company_id = $1' USING _c;
  EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN EXECUTE 'DELETE FROM public.budget_forecast_scenarios WHERE company_id = $1' USING _c;
  EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN EXECUTE 'DELETE FROM public.budget_dimension_revisions WHERE company_id = $1' USING _c;
  EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN EXECUTE 'DELETE FROM public.budget_dimension_lines WHERE company_id = $1' USING _c;
  EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN EXECUTE 'DELETE FROM public.budget_revisions WHERE company_id = $1' USING _c;
  EXCEPTION WHEN undefined_table THEN NULL; END;
  DELETE FROM public.budget_lines WHERE company_id = _c;
  DELETE FROM public.budgets WHERE company_id = _c;

  -- Tax returns: filed returns are protected, so the guard is suspended for this demo company only.
  BEGIN EXECUTE 'DELETE FROM public.tax_gl_review_events WHERE company_id = $1' USING _c;
  EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN EXECUTE 'DELETE FROM public.tax_gl_review_sessions WHERE company_id = $1' USING _c;
  EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN
    PERFORM set_config('session_replication_role', 'replica', true);
    DELETE FROM public.tax_return_lines WHERE company_id = _c;
    DELETE FROM public.tax_returns WHERE company_id = _c;
    PERFORM set_config('session_replication_role', 'origin', true);
  EXCEPTION WHEN others THEN
    -- Without that privilege only drafts can go; filed demo returns stay on record.
    DELETE FROM public.tax_return_lines WHERE company_id = _c
      AND return_id IN (SELECT id FROM public.tax_returns WHERE company_id = _c AND status = 'draft');
    DELETE FROM public.tax_returns WHERE company_id = _c AND status = 'draft';
  END;
  DELETE FROM public.company_tax_pack_applications WHERE company_id = _c;

  -- Payroll
  DELETE FROM public.payroll_payment_allocations WHERE company_id = _c;
  DELETE FROM public.payroll_payments WHERE company_id = _c;
  DELETE FROM public.payroll_payslips WHERE company_id = _c;
  DELETE FROM public.payroll_run_lines WHERE company_id = _c;
  DELETE FROM public.payroll_run_employees WHERE company_id = _c;
  DELETE FROM public.payroll_runs WHERE company_id = _c;
  DELETE FROM public.payroll_employee_salary_lines WHERE company_id = _c;
  DELETE FROM public.payroll_employee_salary_versions WHERE company_id = _c;
  DELETE FROM public.payroll_employee_payment_details WHERE company_id = _c;
  DELETE FROM public.payroll_employees WHERE company_id = _c;
  DELETE FROM public.payroll_salary_structure_lines WHERE company_id = _c;
  DELETE FROM public.payroll_salary_structures WHERE company_id = _c;
  DELETE FROM public.payroll_settings WHERE company_id = _c;
  DELETE FROM public.payroll_pay_schedules WHERE company_id = _c;
  DELETE FROM public.payroll_component_types WHERE company_id = _c;

  -- Fixed assets
  DELETE FROM public.fixed_asset_import_refs WHERE company_id = _c;
  DELETE FROM public.asset_depreciation_entries WHERE company_id = _c;
  DELETE FROM public.asset_depreciation_runs WHERE company_id = _c;
  DELETE FROM public.fixed_assets WHERE company_id = _c;
  DELETE FROM public.asset_types WHERE company_id = _c;

  -- Expense Management (rows the existing reset does not cover)
  DELETE FROM public.expense_exit_settlements WHERE company_id = _c;
  DELETE FROM public.expense_approval_delegations WHERE company_id = _c;
  DELETE FROM public.expense_claim_approvals WHERE company_id = _c;
  DELETE FROM public.expense_claim_reimbursement_payments WHERE company_id = _c;

  -- Accounting extras
  DELETE FROM public.recurring_journal_occurrences WHERE company_id = _c;
  DELETE FROM public.recurring_journal_templates WHERE company_id = _c;
  DELETE FROM public.document_tracking_assignments WHERE company_id = _c;
  DELETE FROM public.line_tracking_assignments WHERE company_id = _c;
  DELETE FROM public.tracking_options WHERE company_id = _c;
  DELETE FROM public.tracking_categories WHERE company_id = _c;
  DELETE FROM public.projects WHERE company_id = _c;

  -- Contacts extras (contacts themselves are cleared by the base reset)
  DELETE FROM public.contact_tag_assignments WHERE company_id = _c;
  DELETE FROM public.contact_group_members WHERE company_id = _c;
  DELETE FROM public.contact_tags WHERE company_id = _c;
  DELETE FROM public.contact_groups WHERE company_id = _c;
END $$;

-- Existing deletes are kept; module data is cleared first and catalogue rows after the base reset.
CREATE OR REPLACE FUNCTION private.reset_demo_company_with_workflows(_company uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_company_permission(_company, 'demo.reset') THEN
    RAISE EXCEPTION 'Demo reset access denied' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_company::text || ':workflow-reset', 0));
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = _company AND is_demo) THEN
    RAISE EXCEPTION 'Reset denied: company is not a demo company';
  END IF;

  PERFORM private.reset_demo_module_data(_company);

  UPDATE public.expense_claims
  SET spending_request_id = NULL, cash_advance_id = NULL, petty_cash_float_id = NULL,
      corporate_card_id = NULL
  WHERE company_id = _company;
  UPDATE public.expense_corporate_card_transactions SET matched_claim_id = NULL
  WHERE company_id = _company;
  DELETE FROM public.expense_corporate_card_transactions WHERE company_id = _company;
  DELETE FROM public.expense_spending_requests WHERE company_id = _company;
  DELETE FROM public.expense_receipt_inbox_entries WHERE company_id = _company;
  DELETE FROM public.expense_claim_events WHERE company_id = _company;
  DELETE FROM public.expense_claim_lines WHERE company_id = _company;
  DELETE FROM public.expense_claims WHERE company_id = _company;
  DELETE FROM public.expense_claim_templates WHERE company_id = _company;
  DELETE FROM public.expense_categories WHERE company_id = _company;
  DELETE FROM public.expense_cash_advances WHERE company_id = _company;
  DELETE FROM public.expense_petty_cash_floats WHERE company_id = _company;
  DELETE FROM public.expense_corporate_cards WHERE company_id = _company;
  DELETE FROM public.expense_mileage_rates WHERE company_id = _company;
  DELETE FROM public.expense_per_diem_rates WHERE company_id = _company;
  DELETE FROM public.expense_management_settings WHERE company_id = _company;

  DELETE FROM public.deferral_entries WHERE company_id = _company;
  DELETE FROM public.deferral_schedules WHERE company_id = _company;
  DELETE FROM public.sales_orders WHERE company_id = _company;

  -- Rows that reference contacts, invoices or journal lines go before the base reset deletes those.
  DELETE FROM public.portal_payment_intents WHERE company_id = _company;
  DELETE FROM public.portal_supplier_submissions WHERE company_id = _company;
  DELETE FROM public.recurring_occurrences WHERE company_id = _company;
  DELETE FROM public.recurring_generation_runs WHERE company_id = _company;
  DELETE FROM public.recurring_schedule_exceptions WHERE company_id = _company;
  DELETE FROM public.recurring_schedules WHERE company_id = _company;
  DELETE FROM public.recurring_template_versions WHERE company_id = _company;
  DELETE FROM public.recurring_templates WHERE company_id = _company;
  DELETE FROM public.reconciliation_session_lines WHERE company_id = _company;
  DELETE FROM public.reconciliation_sessions WHERE company_id = _company;
  DELETE FROM public.reconciliation_links WHERE company_id = _company;

  -- Posted documents reference their journals, so they go before the base reset deletes journals.
  BEGIN EXECUTE 'DELETE FROM public.transaction_correction_items WHERE company_id = $1' USING _company;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN EXECUTE 'DELETE FROM public.transaction_correction_batches WHERE company_id = $1' USING _company;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  DELETE FROM public.money_deposit_items WHERE company_id = _company;
  DELETE FROM public.money_document_credit_uses WHERE company_id = _company;
  DELETE FROM public.money_document_lines WHERE company_id = _company;
  DELETE FROM public.money_documents WHERE company_id = _company;
  DELETE FROM public.sales_receipt_allocations WHERE company_id = _company;
  DELETE FROM public.sales_credit_allocations WHERE company_id = _company;
  DELETE FROM public.sales_credit_note_lines WHERE company_id = _company;
  DELETE FROM public.sales_invoice_lines WHERE company_id = _company;
  DELETE FROM public.sales_receipts WHERE company_id = _company;
  DELETE FROM public.sales_credit_notes WHERE company_id = _company;
  DELETE FROM public.sales_invoices WHERE company_id = _company;
  DELETE FROM public.supplier_payment_allocations WHERE company_id = _company;
  DELETE FROM public.purchase_credit_allocations WHERE company_id = _company;
  DELETE FROM public.purchase_credit_note_lines WHERE company_id = _company;
  DELETE FROM public.purchase_bill_lines WHERE company_id = _company;
  DELETE FROM public.supplier_payments WHERE company_id = _company;
  DELETE FROM public.purchase_credit_notes WHERE company_id = _company;
  DELETE FROM public.purchase_expenses WHERE company_id = _company;
  DELETE FROM public.purchase_bills WHERE company_id = _company;
  DELETE FROM public.employee_expense_claims WHERE company_id = _company;
  DELETE FROM public.bank_transfers WHERE company_id = _company;
  PERFORM private.reset_demo_company_before_workflows(_company);

  DELETE FROM public.product_price_lists WHERE company_id = _company;
  DELETE FROM public.product_categories WHERE company_id = _company;
END;
$$;

-- ---------------------------------------------------------------- Expense Management
CREATE OR REPLACE FUNCTION private.demo_xline(
  _d date, _merchant text, _desc text, _acct uuid, _cat uuid, _net bigint, _tax bigint
) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('expense_date', _d, 'merchant_name', _merchant, 'description', _desc,
    'account_id', _acct, 'category_id', _cat, 'net_minor', _net, 'tax_minor', _tax,
    'gross_minor', _net + _tax, 'reimbursable_minor', _net + _tax, 'non_reimbursable_minor', 0,
    'currency_code', 'GBP', 'exchange_rate', 1, 'base_currency_gross_minor', _net + _tax, 'is_billable', false);
$$;

CREATE OR REPLACE FUNCTION private.demo_xclaim(
  _c uuid, _title text, _d date, _source text, _lines jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RETURN (public.save_expense_claim(_c, jsonb_build_object('title', _title, 'claim_date', _d,
    'claim_currency', 'GBP', 'reimbursement_currency', 'GBP', 'payment_source', _source,
    'description', 'Demo claim', 'lines', _lines)) ->> 'id')::uuid;
END $$;

CREATE OR REPLACE FUNCTION private.demo_xv(_claim uuid) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT version FROM public.expense_claims WHERE id = _claim;
$$;

-- Moves a claim through submit, review, approval and posting as far as _to.
CREATE OR REPLACE FUNCTION private.demo_xadvance(_c uuid, _claim uuid, _to text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.submit_expense_claim(_c, _claim, private.demo_xv(_claim));
  IF _to = 'submitted' THEN RETURN; END IF;
  IF _to = 'withdrawn' THEN
    PERFORM public.withdraw_expense_claim(_c, _claim, private.demo_xv(_claim)); RETURN;
  END IF;
  PERFORM public.start_expense_claim_review(_c, _claim, private.demo_xv(_claim));
  IF _to = 'in_review' THEN RETURN; END IF;
  IF _to = 'returned' THEN
    PERFORM public.return_expense_claim(_c, _claim, private.demo_xv(_claim), 'Please attach the hotel invoice.');
    RETURN;
  END IF;
  IF _to = 'rejected' THEN
    PERFORM public.reject_expense_claim(_c, _claim, private.demo_xv(_claim), 'Personal expense, not reimbursable.');
    RETURN;
  END IF;
  PERFORM public.approve_expense_claim(_c, _claim, private.demo_xv(_claim), 'Approved');
  IF _to = 'approved' THEN RETURN; END IF;
  PERFORM public.post_expense_claim(_c, _claim, private.demo_xv(_claim));
END $$;

CREATE OR REPLACE FUNCTION private.demo_seed_expenses(_c uuid, _u uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  d date := current_date;
  bank uuid := private.demo_acct_id(_c, '1000');
  a_pay uuid; a_adv uuid; a_petty uuid; a_card uuid;
  a_tr uuid; a_hotel uuid; a_meal uuid; a_mile uuid; a_ent uuid; a_off uuid; a_soft uuid; a_train uuid;
  c_tr uuid; c_hotel uuid; c_meal uuid; c_mile uuid; c_ent uuid; c_off uuid; c_soft uuid; c_train uuid;
  mrate uuid; prate uuid; card uuid; adv uuid; adv2 uuid; flt uuid; sr uuid; x uuid; txn uuid;
  sat date := (date_trunc('week', current_date - 14)::date + 5);
  warn text := '';
  n integer := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM public.expense_management_settings WHERE company_id = _c) THEN
    RETURN 'already seeded';
  END IF;
  a_pay := private.demo_acct(_c, '2210', 'Employee Expenses Payable', 'liability', 'current_liability', 'current_liability');
  a_card := private.demo_acct(_c, '2310', 'Corporate Card Payable', 'liability', 'current_liability', 'credit_card');
  a_adv := private.demo_acct(_c, '1250', 'Employee Advances', 'asset', 'current_asset', 'current_asset');
  a_petty := private.demo_acct(_c, '1010', 'Petty Cash', 'asset', 'current_asset', 'current_asset');
  a_tr := private.demo_acct(_c, '6300', 'Travel', 'expense', 'expense', 'expense');
  a_hotel := private.demo_acct(_c, '6310', 'Accommodation', 'expense', 'expense', 'expense');
  a_meal := private.demo_acct(_c, '6320', 'Subsistence', 'expense', 'expense', 'expense');
  a_mile := private.demo_acct(_c, '6330', 'Motor & Mileage', 'expense', 'expense', 'expense');
  a_ent := private.demo_acct(_c, '6340', 'Client Entertainment', 'expense', 'expense', 'expense');
  a_off := private.demo_acct(_c, '6350', 'Office Supplies', 'expense', 'expense', 'expense');
  a_soft := private.demo_acct(_c, '6360', 'Software Subscriptions', 'expense', 'expense', 'expense');
  a_train := private.demo_acct(_c, '6370', 'Training', 'expense', 'expense', 'expense');

  PERFORM public.save_expense_management_settings(_c, jsonb_build_object('version', 0, 'enabled', true,
    'claim_number_prefix', 'EXP-', 'default_claim_currency', 'GBP',
    'employee_payable_account_id', a_pay, 'employee_advance_account_id', a_adv,
    'petty_cash_account_id', a_petty, 'rebilling_income_account_id', private.demo_acct_id(_c, '4100'),
    'require_receipt_above_minor', 2500, 'allow_multi_currency_claims', false,
    -- The demo company has a single member, who must be able to approve their own claims.
    'prevent_self_approval', false, 'default_distance_unit', 'mi', 'require_spending_request_above_minor', 0));

  INSERT INTO public.expense_categories (company_id, code, name, account_id, is_mileage, requires_receipt, sort_order)
  VALUES (_c, 'TRAVEL', 'Travel', a_tr, false, true, 10), (_c, 'HOTEL', 'Accommodation', a_hotel, false, true, 20),
    (_c, 'MEALS', 'Meals & subsistence', a_meal, false, false, 30), (_c, 'MILEAGE', 'Mileage', a_mile, true, false, 40),
    (_c, 'ENTERTAIN', 'Client entertainment', a_ent, false, true, 50), (_c, 'OFFICE', 'Office supplies', a_off, false, false, 60),
    (_c, 'SOFTWARE', 'Software', a_soft, false, true, 70), (_c, 'TRAINING', 'Training', a_train, false, true, 80);
  SELECT id INTO c_tr FROM public.expense_categories WHERE company_id = _c AND code = 'TRAVEL';
  SELECT id INTO c_hotel FROM public.expense_categories WHERE company_id = _c AND code = 'HOTEL';
  SELECT id INTO c_meal FROM public.expense_categories WHERE company_id = _c AND code = 'MEALS';
  SELECT id INTO c_mile FROM public.expense_categories WHERE company_id = _c AND code = 'MILEAGE';
  SELECT id INTO c_ent FROM public.expense_categories WHERE company_id = _c AND code = 'ENTERTAIN';
  SELECT id INTO c_off FROM public.expense_categories WHERE company_id = _c AND code = 'OFFICE';
  SELECT id INTO c_soft FROM public.expense_categories WHERE company_id = _c AND code = 'SOFTWARE';
  SELECT id INTO c_train FROM public.expense_categories WHERE company_id = _c AND code = 'TRAINING';

  mrate := (public.save_expense_mileage_rate(_c, jsonb_build_object('name', 'Car - first 10,000 miles (HMRC)',
    'rate_minor_per_unit', 45, 'currency_code', 'GBP', 'distance_unit', 'mi', 'vehicle_class', 'car',
    'account_id', a_mile, 'effective_from', d - 365, 'is_active', true)) ->> 'id')::uuid;
  PERFORM public.save_expense_mileage_rate(_c, jsonb_build_object('name', 'Car - over 10,000 miles (HMRC)',
    'rate_minor_per_unit', 25, 'currency_code', 'GBP', 'distance_unit', 'mi', 'vehicle_class', 'car',
    'account_id', a_mile, 'effective_from', d - 365, 'is_active', true));
  PERFORM public.save_expense_mileage_rate(_c, jsonb_build_object('name', 'Motorcycle (HMRC)',
    'rate_minor_per_unit', 24, 'currency_code', 'GBP', 'distance_unit', 'mi', 'vehicle_class', 'motorcycle',
    'account_id', a_mile, 'effective_from', d - 365, 'is_active', true));
  prate := (public.save_expense_per_diem_rate(_c, jsonb_build_object('name', 'UK overnight', 'rate_minor_per_day', 4500,
    'currency_code', 'GBP', 'location_label', 'United Kingdom', 'account_id', a_meal, 'effective_from', d - 365,
    'is_active', true)) ->> 'id')::uuid;
  PERFORM public.save_expense_per_diem_rate(_c, jsonb_build_object('name', 'UK day trip (10 hours)', 'rate_minor_per_day', 1000,
    'currency_code', 'GBP', 'location_label', 'United Kingdom', 'account_id', a_meal, 'effective_from', d - 365,
    'is_active', true));

  BEGIN
    PERFORM public.save_expense_claim_template(_c, jsonb_build_object('name', 'Monthly mobile phone',
      'title_template', 'Mobile phone bill', 'payment_source', 'employee_paid', 'claim_currency', 'GBP',
      'default_lines', jsonb_build_array(jsonb_build_object('description', 'Mobile phone', 'account_id', a_off))));
    PERFORM public.save_expense_claim_template(_c, jsonb_build_object('name', 'Client site visit',
      'title_template', 'Client site visit', 'payment_source', 'employee_paid', 'claim_currency', 'GBP',
      'default_lines', jsonb_build_array(jsonb_build_object('description', 'Train fare', 'account_id', a_tr))));
  EXCEPTION WHEN others THEN warn := warn || ' templates: ' || SQLERRM; END;

  -- Claims in every state
  x := private.demo_xclaim(_c, 'Client visit - Leeds', d - 3, 'employee_paid', jsonb_build_array(
    private.demo_xline(d - 3, NULL, 'Manchester to Leeds and back (88 miles)', a_mile, c_mile, 3960, 0)
      || jsonb_build_object('is_mileage', true, 'distance_value', 88, 'distance_unit', 'mi', 'mileage_rate_id', mrate,
        'trip_origin', 'Manchester', 'trip_destination', 'Leeds')));
  x := private.demo_xclaim(_c, 'Stationery top-up', d - 2, 'employee_paid', jsonb_build_array(
    private.demo_xline(d - 2, 'Ryman', 'Printer paper and folders', a_off, c_off, 2350, 470)));
  n := n + 2;
  x := private.demo_xclaim(_c, 'Conference travel - Birmingham', d - 6, 'employee_paid', jsonb_build_array(
    private.demo_xline(d - 6, 'Trainline', 'Return rail fare', a_tr, c_tr, 8650, 0),
    private.demo_xline(d - 6, 'Pret A Manger', 'Lunch', a_meal, c_meal, 700, 140)));
  PERFORM private.demo_xadvance(_c, x, 'submitted');
  x := private.demo_xclaim(_c, 'Supplier meeting - Bristol', d - 12, 'employee_paid', jsonb_build_array(
    private.demo_xline(d - 12, 'GWR', 'Rail fare', a_tr, c_tr, 6420, 0)));
  PERFORM private.demo_xadvance(_c, x, 'submitted');
  UPDATE public.expense_claims SET submitted_at = now() - interval '9 days' WHERE id = x;
  x := private.demo_xclaim(_c, 'Team lunch with client', d - 8, 'employee_paid', jsonb_build_array(
    private.demo_xline(d - 8, 'Dishoom', 'Client lunch (4 people)', a_ent, c_ent, 15800, 3160)));
  PERFORM private.demo_xadvance(_c, x, 'in_review');
  x := private.demo_xclaim(_c, 'London overnight stay', d - 15, 'employee_paid', jsonb_build_array(
    private.demo_xline(d - 15, 'Premier Inn', 'Hotel, 1 night', a_hotel, c_hotel, 9500, 1900)));
  PERFORM private.demo_xadvance(_c, x, 'returned');
  x := private.demo_xclaim(_c, 'Weekend groceries', d - 16, 'employee_paid', jsonb_build_array(
    private.demo_xline(d - 16, 'Tesco', 'Groceries', a_meal, c_meal, 4520, 0)));
  PERFORM private.demo_xadvance(_c, x, 'rejected');
  x := private.demo_xclaim(_c, 'Duplicate taxi claim', d - 18, 'employee_paid', jsonb_build_array(
    private.demo_xline(d - 18, 'Uber', 'Taxi to station', a_tr, c_tr, 1450, 0)));
  PERFORM private.demo_xadvance(_c, x, 'withdrawn');
  x := private.demo_xclaim(_c, 'Excel training course', d - 10, 'employee_paid', jsonb_build_array(
    private.demo_xline(d - 10, 'Peak Training Ltd', 'Advanced Excel (1 day)', a_train, c_train, 29500, 5900)));
  PERFORM private.demo_xadvance(_c, x, 'approved');
  n := n + 7;

  x := private.demo_xclaim(_c, 'Client visits - week 1', d - 25, 'employee_paid', jsonb_build_array(
    private.demo_xline(d - 25, 'Pret A Manger', 'Breakfast meeting', a_meal, c_meal, 700, 140),
    private.demo_xline(d - 24, 'Pret A Manger', 'Breakfast meeting', a_meal, c_meal, 700, 140),
    private.demo_xline(sat, 'Uber', 'Taxi from client event (Saturday)', a_tr, c_tr, 2000, 0)));
  PERFORM private.demo_xadvance(_c, x, 'posted');
  x := private.demo_xclaim(_c, 'Software subscription', d - 20, 'employee_paid', jsonb_build_array(
    private.demo_xline(d - 20, 'Adobe', 'Creative Cloud monthly', a_soft, c_soft, 5099, 1020)));
  PERFORM private.demo_xadvance(_c, x, 'posted');
  x := private.demo_xclaim(_c, 'Edinburgh client trip', d - 30, 'employee_paid', jsonb_build_array(
    private.demo_xline(d - 30, 'LNER', 'Return rail fare', a_tr, c_tr, 18200, 0),
    private.demo_xline(d - 30, 'Premier Inn', 'Hotel, 1 night', a_hotel, c_hotel, 8900, 1780)));
  PERFORM private.demo_xadvance(_c, x, 'posted');
  PERFORM public.reimburse_expense_claim(_c, x, bank, private.demo_xv(x), d - 5, 15000::bigint);
  x := private.demo_xclaim(_c, 'Office chair', d - 40, 'employee_paid', jsonb_build_array(
    private.demo_xline(d - 40, 'DeskCraft Furniture', 'Ergonomic chair', a_off, c_off, 14900, 2980)));
  PERFORM private.demo_xadvance(_c, x, 'posted');
  PERFORM public.reimburse_expense_claim(_c, x, bank, private.demo_xv(x), d - 28, NULL::bigint);
  x := private.demo_xclaim(_c, 'Taxi and parking', d - 45, 'employee_paid', jsonb_build_array(
    private.demo_xline(d - 45, 'NCP', 'Parking', a_mile, c_mile, 1500, 300),
    private.demo_xline(d - 45, 'Uber', 'Taxi', a_tr, c_tr, 2300, 0)));
  PERFORM private.demo_xadvance(_c, x, 'posted');
  PERFORM public.reimburse_expense_claim(_c, x, bank, private.demo_xv(x), d - 35, NULL::bigint);
  x := private.demo_xclaim(_c, 'Books and journals', d - 22, 'employee_paid', jsonb_build_array(
    private.demo_xline(d - 22, 'Waterstones', 'Accounting reference books', a_train, c_train, 4200, 0)));
  PERFORM private.demo_xadvance(_c, x, 'posted');
  BEGIN
    PERFORM public.queue_expense_claim_for_payroll(_c, x, private.demo_xv(x));
  EXCEPTION WHEN others THEN warn := warn || ' payroll queue: ' || SQLERRM; END;
  x := private.demo_xclaim(_c, 'Glasgow audit visit', d - 33, 'employee_paid', jsonb_build_array(
    private.demo_xline(d - 34, NULL, 'Overnight allowance (2 days)', a_meal, c_meal, 9000, 0)
      || jsonb_build_object('is_per_diem', true, 'travel_day_count', 2, 'per_diem_rate_id', prate,
        'travel_start_date', d - 34, 'travel_end_date', d - 33)));
  BEGIN
    PERFORM private.demo_xadvance(_c, x, 'posted');
    PERFORM public.reimburse_expense_claim(_c, x, bank, private.demo_xv(x), d - 20, NULL::bigint);
  EXCEPTION WHEN others THEN warn := warn || ' per diem: ' || SQLERRM; END;
  n := n + 7;

  -- Corporate cards
  card := (public.save_expense_corporate_card(_c, jsonb_build_object('label', 'Visa Business - Owner', 'last4', '4421',
    'network', 'visa', 'liability_account_id', a_card, 'currency_code', 'GBP', 'holder_user_id', _u,
    'status', 'active')) ->> 'id')::uuid;
  BEGIN
    PERFORM public.save_expense_corporate_card(_c, jsonb_build_object('label', 'Amex - Travel', 'last4', '1007',
      'network', 'amex', 'liability_account_id', a_card, 'currency_code', 'GBP', 'status', 'suspended'));
    PERFORM public.save_expense_corporate_card(_c, jsonb_build_object('label', 'Mastercard - Old', 'last4', '8830',
      'network', 'mastercard', 'liability_account_id', a_card, 'currency_code', 'GBP', 'status', 'closed'));
  EXCEPTION WHEN others THEN warn := warn || ' cards: ' || SQLERRM; END;
  x := private.demo_xclaim(_c, 'Card: hotel in Manchester', d - 14, 'corporate_card', jsonb_build_array(
    private.demo_xline(d - 14, 'Hilton', 'Hotel, 1 night', a_hotel, c_hotel, 12500, 2500)));
  PERFORM public.link_expense_claim_corporate_card(_c, x, private.demo_xv(x), card);
  PERFORM private.demo_xadvance(_c, x, 'posted');
  txn := (public.save_expense_corporate_card_transaction(_c, jsonb_build_object('card_id', card,
    'transaction_date', d - 14, 'posted_date', d - 13, 'description', 'HILTON MANCHESTER', 'merchant_name', 'Hilton',
    'amount_minor', 15000, 'currency_code', 'GBP')) ->> 'id')::uuid;
  BEGIN
    PERFORM public.match_expense_corporate_card_transaction(_c, txn, x);
  EXCEPTION WHEN others THEN warn := warn || ' card match: ' || SQLERRM; END;
  PERFORM public.save_expense_corporate_card_transaction(_c, jsonb_build_object('card_id', card,
    'transaction_date', d - 9, 'posted_date', d - 8, 'description', 'TRAINLINE', 'merchant_name', 'Trainline',
    'amount_minor', 6420, 'currency_code', 'GBP'));
  PERFORM public.save_expense_corporate_card_transaction(_c, jsonb_build_object('card_id', card,
    'transaction_date', d - 7, 'posted_date', d - 6, 'description', 'AMAZON MARKETPLACE', 'merchant_name', 'Amazon',
    'amount_minor', 3899, 'currency_code', 'GBP'));
  PERFORM public.save_expense_corporate_card_transaction(_c, jsonb_build_object('card_id', card,
    'transaction_date', d - 4, 'posted_date', d - 3, 'description', 'ZOOM.US', 'merchant_name', 'Zoom',
    'amount_minor', 1439, 'currency_code', 'GBP'));
  txn := (public.save_expense_corporate_card_transaction(_c, jsonb_build_object('card_id', card,
    'transaction_date', d - 11, 'posted_date', d - 10, 'description', 'UNKNOWN MERCHANT LTD', 'merchant_name', 'Unknown',
    'amount_minor', 9999, 'currency_code', 'GBP')) ->> 'id')::uuid;
  BEGIN
    PERFORM public.dispute_expense_corporate_card_transaction(_c, txn, 'Not recognised by the card holder');
  EXCEPTION WHEN others THEN warn := warn || ' card dispute: ' || SQLERRM; END;

  -- Cash advances
  adv := (public.save_expense_cash_advance(_c, jsonb_build_object('title', 'Trade show float - Birmingham',
    'amount_minor', 30000, 'currency_code', 'GBP', 'employee_user_id', _u, 'advance_date', d - 26,
    'description', 'Cash for the NEC trade show')) ->> 'id')::uuid;
  PERFORM public.issue_expense_cash_advance(_c, adv, bank,
    (SELECT version FROM public.expense_cash_advances WHERE id = adv), d - 26);
  x := private.demo_xclaim(_c, 'Trade show expenses', d - 24, 'cash_advance', jsonb_build_array(
    private.demo_xline(d - 24, 'NEC Catering', 'Stand catering', a_ent, c_ent, 12000, 2400)));
  PERFORM public.link_expense_claim_cash_advance(_c, x, private.demo_xv(x), adv);
  PERFORM private.demo_xadvance(_c, x, 'posted');
  adv2 := (public.save_expense_cash_advance(_c, jsonb_build_object('title', 'December client visits',
    'amount_minor', 20000, 'currency_code', 'GBP', 'employee_user_id', _u, 'advance_date', d + 10)) ->> 'id')::uuid;

  -- Petty cash
  flt := (public.save_expense_petty_cash_float(_c, jsonb_build_object('name', 'Office petty cash',
    'custodian_user_id', _u, 'target_minor', 50000, 'currency_code', 'GBP',
    'description', 'Front desk cash tin')) ->> 'id')::uuid;
  PERFORM public.fund_expense_petty_cash_float(_c, flt, bank, 50000,
    (SELECT version FROM public.expense_petty_cash_floats WHERE id = flt), d - 50);
  x := private.demo_xclaim(_c, 'Milk, tea and coffee', d - 19, 'company_paid', jsonb_build_array(
    private.demo_xline(d - 19, 'Sainsbury''s', 'Kitchen supplies', a_off, c_off, 3120, 0),
    private.demo_xline(d - 12, 'Post Office', 'Postage', a_off, c_off, 4620, 0)));
  PERFORM public.link_expense_claim_petty_cash_float(_c, x, private.demo_xv(x), flt);
  PERFORM private.demo_xadvance(_c, x, 'posted');
  n := n + 2;

  -- Spending requests
  BEGIN
    sr := (public.save_expense_spending_request(_c, jsonb_build_object('title', 'Accountancy conference 2027',
      'amount_minor', 145000, 'currency_code', 'GBP', 'needed_by', d + 45, 'description', 'Tickets and hotel')) ->> 'id')::uuid;
    PERFORM public.submit_expense_spending_request(_c, sr, (SELECT version FROM public.expense_spending_requests WHERE id = sr));
    PERFORM public.decide_expense_spending_request(_c, sr, (SELECT version FROM public.expense_spending_requests WHERE id = sr),
      'approved', 'Approved within the training budget');
    sr := (public.save_expense_spending_request(_c, jsonb_build_object('title', 'New laptop for finance',
      'amount_minor', 120000, 'currency_code', 'GBP', 'needed_by', d + 20)) ->> 'id')::uuid;
    PERFORM public.submit_expense_spending_request(_c, sr, (SELECT version FROM public.expense_spending_requests WHERE id = sr));
    sr := (public.save_expense_spending_request(_c, jsonb_build_object('title', 'Team away day',
      'amount_minor', 250000, 'currency_code', 'GBP', 'needed_by', d + 60)) ->> 'id')::uuid;
    PERFORM public.submit_expense_spending_request(_c, sr, (SELECT version FROM public.expense_spending_requests WHERE id = sr));
    PERFORM public.decide_expense_spending_request(_c, sr, (SELECT version FROM public.expense_spending_requests WHERE id = sr),
      'returned', 'Please add a venue quote');
    sr := (public.save_expense_spending_request(_c, jsonb_build_object('title', 'First-class rail upgrades',
      'amount_minor', 90000, 'currency_code', 'GBP', 'needed_by', d + 30)) ->> 'id')::uuid;
    PERFORM public.submit_expense_spending_request(_c, sr, (SELECT version FROM public.expense_spending_requests WHERE id = sr));
    PERFORM public.decide_expense_spending_request(_c, sr, (SELECT version FROM public.expense_spending_requests WHERE id = sr),
      'rejected', 'Standard class only under the travel policy');
    PERFORM public.save_expense_spending_request(_c, jsonb_build_object('title', 'Marketing photography',
      'amount_minor', 60000, 'currency_code', 'GBP', 'needed_by', d + 25));
  EXCEPTION WHEN others THEN warn := warn || ' spending requests: ' || SQLERRM; END;

  -- Receipt inbox
  BEGIN
    PERFORM public.register_expense_receipt_inbox_entry(_c, jsonb_build_object('file_name', 'receipt-pret-0412.pdf',
      'source', 'email', 'content_type', 'application/pdf', 'size_bytes', 48213, 'notes', 'Forwarded from receipts@'));
    PERFORM public.register_expense_receipt_inbox_entry(_c, jsonb_build_object('file_name', 'taxi-uber.png',
      'source', 'mobile', 'content_type', 'image/png', 'size_bytes', 120456));
    PERFORM public.register_expense_receipt_inbox_entry(_c, jsonb_build_object('file_name', 'hotel-invoice.pdf',
      'source', 'upload', 'content_type', 'application/pdf', 'size_bytes', 88310));
  EXCEPTION WHEN others THEN warn := warn || ' receipts: ' || SQLERRM; END;

  RETURN format('%s claims, cards, advances, petty cash, spending requests%s', n, CASE WHEN warn = '' THEN '' ELSE ' (partial:' || warn || ')' END);
END $$;

-- ---------------------------------------------------------------- Payroll
-- Builds a balanced calculation (net = gross - deductions) for every employee in a run.
CREATE OR REPLACE FUNCTION private.demo_payroll_calc(_c uuid, _run uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  re record;
  emps jsonb := '[]'::jsonb;
  gross bigint; tax bigint; ni bigint; pen bigint; er bigint; ded bigint; net bigint;
  t_gross bigint := 0; t_ded bigint := 0; t_net bigint := 0; t_er bigint := 0;
  earn_code text;
  comp jsonb;
BEGIN
  SELECT jsonb_object_agg(code, id) INTO comp FROM public.payroll_component_types WHERE company_id = _c;
  FOR re IN
    SELECT r.employee_id, e.employment_type FROM public.payroll_run_employees r
      JOIN public.payroll_employees e ON e.id = r.employee_id
     WHERE r.run_id = _run ORDER BY e.employee_number
  LOOP
    IF re.employment_type = 'hourly' THEN
      earn_code := 'HOURLY';
      gross := 1350 * 375 / 10;
    ELSE
      earn_code := 'BASIC';
      SELECT sl.amount_minor INTO gross FROM public.payroll_employee_salary_lines sl
        JOIN public.payroll_employee_salary_versions v ON v.id = sl.version_id
       WHERE sl.employee_id = re.employee_id AND sl.component_type_id = (comp ->> 'BASIC')::uuid
       ORDER BY v.effective_from DESC LIMIT 1;
      gross := coalesce(gross, 250000);
    END IF;
    tax := gross * 16 / 100; ni := gross * 6 / 100; pen := gross * 5 / 100; er := gross * 13 / 100;
    ded := tax + ni + pen; net := gross - ded;
    t_gross := t_gross + gross; t_ded := t_ded + ded; t_net := t_net + net; t_er := t_er + er;
    emps := emps || jsonb_build_object('employeeId', re.employee_id, 'grossMinor', gross, 'deductionsMinor', ded,
      'netMinor', net, 'employerMinor', er, 'employerCostMinor', gross + er,
      'lines', jsonb_build_array(
        jsonb_build_object('componentTypeId', comp ->> earn_code, 'kind', 'earning', 'code', earn_code,
          'name', CASE WHEN earn_code = 'BASIC' THEN 'Basic salary' ELSE 'Hourly pay (37.5 h)' END,
          'amountMinor', gross, 'isEmployer', false, 'sortOrder', 10),
        jsonb_build_object('componentTypeId', comp ->> 'MANUAL_TAX', 'kind', 'deduction', 'code', 'MANUAL_TAX',
          'name', 'Income tax (PAYE)', 'amountMinor', tax, 'isEmployer', false, 'sortOrder', 50),
        jsonb_build_object('componentTypeId', comp ->> 'MANUAL_SOCIAL', 'kind', 'deduction', 'code', 'MANUAL_SOCIAL',
          'name', 'Employee National Insurance', 'amountMinor', ni, 'isEmployer', false, 'sortOrder', 60),
        jsonb_build_object('componentTypeId', comp ->> 'PCT_DED', 'kind', 'deduction', 'code', 'PCT_DED',
          'name', 'Pension (5%)', 'amountMinor', pen, 'percentageBps', 500, 'isEmployer', false, 'sortOrder', 70),
        jsonb_build_object('componentTypeId', comp ->> 'ER_CONTRIB', 'kind', 'employer_contribution', 'code', 'ER_CONTRIB',
          'name', 'Employer NI and pension', 'amountMinor', er, 'isEmployer', true, 'sortOrder', 90)));
  END LOOP;
  RETURN jsonb_build_object('currency', 'GBP', 'grossMinor', t_gross, 'deductionsMinor', t_ded, 'netMinor', t_net,
    'employerMinor', t_er, 'employerCostMinor', t_gross + t_er, 'employees', emps);
END $$;

-- Creates a run and moves it to _to (draft, calculated, reviewed, approved, posted, paid, complete).
CREATE OR REPLACE FUNCTION private.demo_payroll_run(
  _c uuid, _schedule uuid, _ps date, _pe date, _to text, _bank uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  run uuid;
  allocs jsonb;
  total bigint;
BEGIN
  run := (public.create_payroll_run(_c, jsonb_build_object('pay_schedule_id', _schedule, 'period_start', _ps,
    'period_end', _pe, 'payment_date', _pe)) ->> 'id')::uuid;
  IF _to = 'draft' THEN RETURN run; END IF;
  PERFORM public.calculate_payroll_run(_c, run, private.demo_payroll_calc(_c, run));
  IF _to = 'calculated' THEN RETURN run; END IF;
  PERFORM public.mark_payroll_run_reviewed(_c, run);
  IF _to = 'reviewed' THEN RETURN run; END IF;
  PERFORM public.approve_payroll_run(_c, run);
  IF _to = 'approved' THEN RETURN run; END IF;
  PERFORM public.post_payroll_run(_c, run);
  IF _to = 'posted' THEN RETURN run; END IF;
  -- complete: every payslip paid; paid: all but the last payslip paid, one of them only in part.
  SELECT jsonb_agg(jsonb_build_object('payslip_id', x.id, 'amount_minor', x.amt) ORDER BY x.rn), sum(x.amt)
    INTO allocs, total
    FROM (SELECT p.id, row_number() OVER (ORDER BY p.payslip_number) rn, count(*) OVER () cnt,
            CASE WHEN _to = 'paid' AND row_number() OVER (ORDER BY p.payslip_number) = count(*) OVER () - 1
                 THEN e.net_minor / 2 ELSE e.net_minor END AS amt
            FROM public.payroll_payslips p JOIN public.payroll_run_employees e ON e.id = p.run_employee_id
           WHERE p.run_id = run) x
   WHERE _to = 'complete' OR x.rn < x.cnt;
  IF total > 0 THEN
    PERFORM public.record_payroll_payment(jsonb_build_object('company_id', _c, 'payment_date', _pe,
      'payment_method', 'bank_transfer', 'amount_minor', total, 'clearing_account_id', _bank, 'currency_code', 'GBP',
      'reference', 'Salaries ' || to_char(_pe, 'Mon YYYY'), 'memo', 'Demo salary payment',
      'idempotency_key', 'demo-payroll-' || run, 'allocations', allocs));
  END IF;
  RETURN run;
END $$;

CREATE OR REPLACE FUNCTION private.demo_seed_payroll(_c uuid, _u uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  d date := current_date;
  bank uuid := private.demo_acct_id(_c, '1000');
  a_wages uuid; a_er uuid; a_net uuid; a_paye uuid; a_pen uuid;
  monthly uuid; weekly uuid; basic uuid; hourly uuid; office uuid;
  emp uuid; e record;
  lastfri date := current_date - ((extract(isodow FROM current_date)::int + 2) % 7);
  m0 date := date_trunc('month', current_date)::date;
  warn text := '';
  runs integer := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM public.payroll_settings WHERE company_id = _c) THEN RETURN 'already seeded'; END IF;
  a_wages := private.demo_acct(_c, '7000', 'Wages & Salaries', 'expense', 'expense', 'expense');
  a_er := private.demo_acct(_c, '7010', 'Employer NI & Pension', 'expense', 'expense', 'expense');
  a_net := private.demo_acct(_c, '2220', 'Net Wages Payable', 'liability', 'current_liability', 'current_liability');
  a_paye := private.demo_acct(_c, '2230', 'PAYE & NI Payable', 'liability', 'current_liability', 'current_liability');
  a_pen := private.demo_acct(_c, '2240', 'Workplace Pension Payable', 'liability', 'current_liability', 'current_liability');

  PERFORM public.save_payroll_settings(_c, jsonb_build_object('enabled', true, 'disclaimer_acknowledged', true,
    'operating_country_code', 'GB', 'payroll_currency', 'GBP', 'payroll_start_date', (m0 - interval '6 months')::date,
    'default_working_days_per_week', 5, 'default_working_hours_per_day', 7.5, 'payment_date_offset_days', 0,
    'salary_expense_account_id', a_wages, 'net_pay_liability_account_id', a_net,
    'deduction_liability_account_id', a_paye, 'employer_expense_account_id', a_er,
    'employer_liability_account_id', a_pen, 'default_payment_method', 'bank_transfer', 'requires_approval', true,
    'rounding_mode', 'half_up', 'payslip_show_employer_costs', true, 'payslip_branding_name', 'Demo Company Ltd',
    'payslip_footer_note', 'Sample payslip - demo data only', 'employee_number_prefix', 'EMP-'));
  monthly := (public.save_payroll_pay_schedule(_c, jsonb_build_object('name', 'Monthly salaried', 'frequency', 'monthly',
    'anchor_date', (m0 - 1), 'payment_offset_days', 0, 'is_default', true, 'is_active', true)) ->> 'id')::uuid;
  weekly := (public.save_payroll_pay_schedule(_c, jsonb_build_object('name', 'Weekly hourly', 'frequency', 'weekly',
    'anchor_date', lastfri, 'payment_offset_days', 0, 'is_default', false, 'is_active', true)) ->> 'id')::uuid;
  SELECT id INTO basic FROM public.payroll_component_types WHERE company_id = _c AND code = 'BASIC';
  SELECT id INTO hourly FROM public.payroll_component_types WHERE company_id = _c AND code = 'HOURLY';
  BEGIN
    office := (public.save_payroll_salary_structure(_c, jsonb_build_object('name', 'Office salaried',
      'description', 'Monthly salary with 5% employee pension', 'is_active', true, 'lines', jsonb_build_array(
        jsonb_build_object('component_type_id', basic, 'amount_minor', 250000, 'is_recurring', true, 'sort_order', 10),
        jsonb_build_object('component_type_id', (SELECT id FROM public.payroll_component_types
          WHERE company_id = _c AND code = 'PCT_DED'), 'percentage_bps', 500, 'is_recurring', true, 'sort_order', 70)))) ->> 'id')::uuid;
    PERFORM public.save_payroll_salary_structure(_c, jsonb_build_object('name', 'Hourly operative',
      'description', 'Hourly rate', 'is_active', true, 'lines', jsonb_build_array(
        jsonb_build_object('component_type_id', hourly, 'rate_minor', 1350, 'is_recurring', true, 'sort_order', 10))));
  EXCEPTION WHEN others THEN warn := warn || ' structures: ' || SQLERRM; END;

  FOR e IN SELECT * FROM (VALUES
      ('Priya', 'Shah', 'Finance', 'Finance Manager', 'salaried', 395000, '2023-02-01'::date, true),
      ('Tom', 'Bennett', 'Sales', 'Account Executive', 'salaried', 285000, '2024-06-03'::date, true),
      ('Aisha', 'Khan', 'Operations', 'Operations Lead', 'salaried', 330000, '2022-09-12'::date, true),
      ('Daniel', 'Okafor', 'Consulting', 'Consultant', 'salaried', 310000, '2025-01-06'::date, true),
      ('Emily', 'Clarke', 'Sales', 'Sales Assistant', 'salaried', 210000, '2025-03-17'::date, false),
      ('Liam', 'Hughes', 'Operations', 'Warehouse Operative', 'hourly', 0, '2024-11-04'::date, true)
    ) AS t(first_name, last_name, dept, title, kind, monthly_minor, hired, bank_details)
  LOOP
    emp := (public.save_payroll_employee(_c, jsonb_build_object('first_name', e.first_name, 'last_name', e.last_name,
      'email', lower(e.first_name) || '.' || lower(e.last_name) || '@demo-company.example', 'hire_date', e.hired,
      'status', 'active', 'department', e.dept, 'designation', e.title, 'employment_type', e.kind,
      'work_location', 'London', 'pay_schedule_id', CASE WHEN e.kind = 'hourly' THEN weekly ELSE monthly END,
      'payment_method', CASE WHEN e.bank_details THEN 'bank_transfer' ELSE 'cash' END)) ->> 'id')::uuid;
    IF e.bank_details THEN
      BEGIN
        PERFORM public.save_payroll_employee_payment_details(_c, emp, jsonb_build_object('account_name',
          e.first_name || ' ' || e.last_name, 'bank_name', 'Demo Bank plc', 'account_number', '41' || lpad((abs(hashtext(emp::text)) % 1000000)::text, 6, '0'),
          'sort_code', '200000'));
      EXCEPTION WHEN others THEN warn := warn || ' bank details: ' || SQLERRM; END;
    END IF;
    PERFORM public.assign_payroll_employee_salary(_c, emp, jsonb_build_object('effective_from', (m0 - interval '6 months')::date,
      'change_reason', 'Starting salary', 'lines', jsonb_build_array(CASE WHEN e.kind = 'hourly'
        THEN jsonb_build_object('component_type_id', hourly, 'rate_minor', 1350, 'is_recurring', true)
        ELSE jsonb_build_object('component_type_id', basic, 'amount_minor', e.monthly_minor, 'is_recurring', true) END)));
    IF e.first_name = 'Tom' THEN
      PERFORM public.assign_payroll_employee_salary(_c, emp, jsonb_build_object('effective_from', (m0 - interval '1 month')::date,
        'change_reason', 'Annual pay rise', 'lines', jsonb_build_array(
          jsonb_build_object('component_type_id', basic, 'amount_minor', 300000, 'is_recurring', true))));
    END IF;
  END LOOP;

  PERFORM private.demo_payroll_run(_c, monthly, (m0 - interval '3 months')::date, (m0 - interval '2 months')::date - 1, 'complete', bank);
  PERFORM private.demo_payroll_run(_c, monthly, (m0 - interval '2 months')::date, (m0 - interval '1 month')::date - 1, 'complete', bank);
  PERFORM private.demo_payroll_run(_c, monthly, (m0 - interval '1 month')::date, m0 - 1, 'paid', bank);
  PERFORM private.demo_payroll_run(_c, monthly, m0, private.demo_month_end(m0), 'calculated', bank);
  runs := 4;
  BEGIN
    PERFORM private.demo_payroll_run(_c, weekly, lastfri - 13, lastfri - 7, 'posted', bank);
    PERFORM private.demo_payroll_run(_c, weekly, lastfri - 6, lastfri, 'approved', bank);
    PERFORM private.demo_payroll_run(_c, weekly, lastfri + 1, lastfri + 7, 'draft', bank);
    runs := runs + 3;
  EXCEPTION WHEN others THEN warn := warn || ' weekly runs: ' || SQLERRM; END;

  RETURN format('6 employees, %s pay runs with payslips and payments%s', runs,
    CASE WHEN warn = '' THEN '' ELSE ' (partial:' || warn || ')' END);
END $$;

-- ---------------------------------------------------------------- Fixed assets
CREATE OR REPLACE FUNCTION private.demo_post_journal(_c uuid, _date date, _memo text, _key text, _lines jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.post_journal(jsonb_build_object('company_id', _c, 'journal_date', _date, 'memo', _memo,
    'source_type', 'manual', 'currency_code', 'GBP', 'fx_rate_to_base', 1, 'idempotency_key', _key, 'lines', _lines));
END $$;

CREATE OR REPLACE FUNCTION private.demo_seed_fixed_assets(_c uuid, _u uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  d date := current_date;
  fy date := make_date(CASE WHEN extract(month FROM current_date) >= 4 THEN extract(year FROM current_date)::int
                            ELSE extract(year FROM current_date)::int - 1 END, 4, 1);
  last_me date := date_trunc('month', current_date)::date - 1;
  bank uuid := private.demo_acct_id(_c, '1000');
  obe uuid := private.demo_acct_id(_c, '3100');
  dep uuid := private.demo_acct_id(_c, '6200');
  c_cost uuid; c_acc uuid; v_cost uuid; v_acc uuid; f_cost uuid; f_acc uuid; gain uuid;
  t_comp uuid; t_veh uuid; t_furn uuid; t_art uuid;
  disposed uuid; a record; me date; runs integer := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM public.asset_types WHERE company_id = _c) THEN RETURN 'already seeded'; END IF;
  c_cost := private.demo_acct(_c, '1520', 'Computer Equipment', 'asset', 'non_current_asset', 'fixed_asset');
  c_acc := private.demo_acct(_c, '1521', 'Acc. Depn - Computer Equipment', 'asset', 'non_current_asset', 'fixed_asset');
  v_cost := private.demo_acct(_c, '1530', 'Motor Vehicles', 'asset', 'non_current_asset', 'fixed_asset');
  v_acc := private.demo_acct(_c, '1531', 'Acc. Depn - Motor Vehicles', 'asset', 'non_current_asset', 'fixed_asset');
  f_cost := private.demo_acct(_c, '1540', 'Fixtures & Fittings', 'asset', 'non_current_asset', 'fixed_asset');
  f_acc := private.demo_acct(_c, '1541', 'Acc. Depn - Fixtures & Fittings', 'asset', 'non_current_asset', 'fixed_asset');
  gain := private.demo_acct(_c, '4200', 'Gain/Loss on Asset Disposal', 'income', 'income', 'other_income');

  t_comp := public.save_asset_type(_c, NULL, jsonb_build_object('name', 'Computer equipment', 'depreciation_method', 'straight_line',
    'useful_life_months', 36, 'asset_account_id', c_cost, 'accumulated_account_id', c_acc, 'expense_account_id', dep));
  t_veh := public.save_asset_type(_c, NULL, jsonb_build_object('name', 'Motor vehicles', 'depreciation_method', 'reducing_balance',
    'annual_rate_bps', 2500, 'asset_account_id', v_cost, 'accumulated_account_id', v_acc, 'expense_account_id', dep));
  t_furn := public.save_asset_type(_c, NULL, jsonb_build_object('name', 'Office furniture', 'depreciation_method', 'straight_line',
    'useful_life_months', 60, 'asset_account_id', f_cost, 'accumulated_account_id', f_acc, 'expense_account_id', dep));
  t_art := public.save_asset_type(_c, NULL, jsonb_build_object('name', 'Artwork (not depreciated)', 'depreciation_method', 'none',
    'asset_account_id', f_cost, 'accumulated_account_id', f_acc, 'expense_account_id', dep));

  FOR a IN SELECT * FROM (VALUES
      ('Server rack (brought forward)', t_comp, 'straight_line', 18, NULL::int, c_cost, c_acc, '2024-10-01'::date, fy, 540000::bigint, 270000::bigint, 'bf'),
      ('Ford Transit van', t_veh, 'reducing_balance', NULL::int, 2500, v_cost, v_acc, fy + 20, fy + 20, 1850000::bigint, 0::bigint, 'van'),
      ('MacBook Pro - Finance', t_comp, 'straight_line', 36, NULL::int, c_cost, c_acc, fy + 10, fy + 10, 249900::bigint, 0::bigint, 'mac'),
      ('Dell laptop - Sales', t_comp, 'straight_line', 36, NULL::int, c_cost, c_acc, fy + 14, fy + 14, 129900::bigint, 0::bigint, 'dispose'),
      ('Office fit-out - desks and chairs', t_furn, 'straight_line', 60, NULL::int, f_cost, f_acc, fy + 30, fy + 30, 860000::bigint, 0::bigint, 'furn'),
      ('Reception artwork', t_art, 'none', NULL::int, NULL::int, f_cost, f_acc, fy + 45, fy + 45, 150000::bigint, 0::bigint, 'art'),
      ('Meeting room display', t_comp, 'straight_line', 36, NULL::int, c_cost, c_acc, last_me + 1, last_me + 1, 179900::bigint, 0::bigint, 'new')
    ) AS t(name, type_id, method, life, rate, cost_acct, acc_acct, purchased, dep_start, cost, opening, tag)
  LOOP
    DECLARE
      aid uuid;
    BEGIN
      aid := public.save_fixed_asset(_c, NULL, jsonb_build_object('name', a.name, 'description', 'Demo asset',
        'asset_type_id', a.type_id, 'purchase_date', a.purchased, 'depreciation_start_date', a.dep_start,
        'cost_minor', a.cost, 'residual_minor', 0, 'opening_accumulated_minor', a.opening,
        'depreciation_method', a.method, 'useful_life_months', a.life, 'annual_rate_bps', a.rate,
        'asset_account_id', a.cost_acct, 'accumulated_account_id', a.acc_acct, 'expense_account_id', dep));
      IF a.tag = 'dispose' THEN disposed := aid; END IF;
      -- Keep the register and the ledger in step: purchases from the bank, brought-forward cost from equity.
      IF a.tag = 'bf' THEN
        PERFORM private.demo_post_journal(_c, fy, 'Opening balance: ' || a.name, 'demo-fa-open-' || aid, jsonb_build_array(
          jsonb_build_object('account_id', a.cost_acct, 'debit_minor', a.cost, 'credit_minor', 0, 'description', a.name),
          jsonb_build_object('account_id', a.acc_acct, 'debit_minor', 0, 'credit_minor', a.opening, 'description', 'Accumulated depreciation b/f'),
          jsonb_build_object('account_id', obe, 'debit_minor', 0, 'credit_minor', a.cost - a.opening, 'description', 'Opening balance')));
      ELSE
        PERFORM private.demo_post_journal(_c, a.purchased, 'Asset purchase: ' || a.name, 'demo-fa-buy-' || aid, jsonb_build_array(
          jsonb_build_object('account_id', a.cost_acct, 'debit_minor', a.cost, 'credit_minor', 0, 'description', a.name),
          jsonb_build_object('account_id', bank, 'debit_minor', 0, 'credit_minor', a.cost, 'description', 'Paid from bank')));
      END IF;
    END;
  END LOOP;

  -- Depreciation month by month; the Dell laptop is sold part-way through last month.
  me := private.demo_month_end(fy);
  WHILE me <= last_me LOOP
    IF me = last_me AND disposed IS NOT NULL THEN
      PERFORM public.dispose_fixed_asset(disposed, last_me - 14, 30000::bigint, bank, gain, 'Sold to a staff member');
    END IF;
    PERFORM public.run_depreciation(_c, me, false);
    runs := runs + 1;
    me := private.demo_month_end(me + 1);
  END LOOP;
  RETURN format('7 assets in 4 types, %s depreciation runs, 1 disposal; this month is left for preview', runs);
END $$;

-- ---------------------------------------------------------------- Budgets
CREATE OR REPLACE FUNCTION private.demo_seed_budgets(_c uuid, _u uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  fy date := make_date(CASE WHEN extract(month FROM current_date) >= 4 THEN extract(year FROM current_date)::int
                            ELSE extract(year FROM current_date)::int - 1 END, 4, 1);
  b uuid;
  lines jsonb;
  plan jsonb := jsonb_build_object('4000', 600000, '4100', 20000, '5000', 50000, '6000', 250000, '6100', 2500,
    '6200', 100000, '6300', 40000, '6320', 15000, '6330', 12000, '7000', 1500000);
BEGIN
  IF EXISTS (SELECT 1 FROM public.budgets WHERE company_id = _c) THEN RETURN 'already seeded'; END IF;
  SELECT jsonb_agg(jsonb_build_object('account_id', a.id, 'period_month', (fy + make_interval(months => m))::date,
           'amount_minor', ((plan ->> a.code)::bigint * (100 + (m % 3) * 5) / 100)))
    INTO lines
    FROM public.accounts a CROSS JOIN generate_series(0, 11) m
   WHERE a.company_id = _c AND plan ? a.code AND a.is_active;
  b := public.save_budget(_c, NULL, 'FY' || extract(year FROM fy) || '/' || right((extract(year FROM fy) + 1)::text, 2)
    || ' Operating Budget', fy, 'Board-approved operating plan (demo)');
  PERFORM public.save_budget_lines(b, lines, 'replace');
  b := public.save_budget(_c, NULL, 'FY' || extract(year FROM fy) || '/' || right((extract(year FROM fy) + 1)::text, 2)
    || ' Stretch Case', fy, 'Revenue +15% scenario (demo)');
  PERFORM public.save_budget_lines(b, (SELECT jsonb_agg(CASE WHEN l ->> 'account_id' IN
      (SELECT id::text FROM public.accounts WHERE company_id = _c AND code IN ('4000', '4100'))
    THEN jsonb_set(l, '{amount_minor}', to_jsonb((l ->> 'amount_minor')::bigint * 115 / 100)) ELSE l END)
    FROM jsonb_array_elements(lines) l), 'replace');
  b := public.save_budget(_c, NULL, 'FY' || (extract(year FROM fy) - 1) || '/' || right(extract(year FROM fy)::text, 2)
    || ' Budget', (fy - interval '1 year')::date, 'Prior year budget (demo)');
  PERFORM public.save_budget_lines(b, (SELECT jsonb_agg(jsonb_set(jsonb_set(l, '{period_month}',
      to_jsonb(((l ->> 'period_month')::date - interval '1 year')::date)), '{amount_minor}',
      to_jsonb((l ->> 'amount_minor')::bigint * 90 / 100))) FROM jsonb_array_elements(lines) l), 'replace');
  RETURN '3 budgets with monthly lines';
END $$;

-- ---------------------------------------------------------------- Tax
CREATE OR REPLACE FUNCTION private.demo_seed_tax(_c uuid, _u uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  fy date := make_date(CASE WHEN extract(month FROM current_date) >= 4 THEN extract(year FROM current_date)::int
                            ELSE extract(year FROM current_date)::int - 1 END, 4, 1);
  q record;
  n integer := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM public.tax_returns WHERE company_id = _c) THEN RETURN 'already seeded'; END IF;
  BEGIN
    PERFORM public.seed_default_tax_pack(_c);
  EXCEPTION WHEN others THEN NULL; END;
  UPDATE public.company_tax_settings
     SET registration_number = 'GB 123 4567 89 (demo)', registration_date = DATE '2020-04-01',
         output_tax_account_id = private.demo_acct_id(_c, '2100'),
         input_tax_account_id = private.demo_acct_id(_c, '1200'),
         default_sales_tax_code_id = (SELECT id FROM public.tax_codes WHERE company_id = _c AND code = 'VAT20'),
         default_purchase_tax_code_id = (SELECT id FROM public.tax_codes WHERE company_id = _c AND code = 'VAT20')
   WHERE company_id = _c;
  UPDATE public.tax_rates SET effective_from = DATE '2011-01-04' WHERE company_id = _c AND effective_from > DATE '2011-01-04';

  FOR q IN SELECT fy + make_interval(months => k * 3) AS ps, 1 + k AS qn,
                  (ARRAY[1243500, 1586200])[k + 1]::bigint AS sales_vat, (ARRAY[412300, 498750])[k + 1]::bigint AS purch_vat
             FROM generate_series(0, 1) k
            WHERE fy + make_interval(months => k * 3 + 3) <= current_date
  LOOP
    PERFORM public.save_tax_return_draft(_c, q.ps::date, (q.ps + interval '3 months')::date - 1, 'accrual', 'GB', 'GBP',
      q.sales_vat - q.purch_vat,
      jsonb_build_object('documents', 24 + q.qn * 3, 'lines', 61 + q.qn * 5, 'uncodedLines', 0, 'outOfScopeLines', 2,
        'reverseChargeLines', 0, 'selfAssessedLines', 0, 'skippedNoRate', 0, 'nonRecoverableTaxMinor', 0,
        'outputTaxMinor', q.sales_vat, 'inputTaxMinor', q.purch_vat),
      jsonb_build_array(
        jsonb_build_object('box_key', 'box1', 'label', 'VAT due on sales', 'amount_minor', q.sales_vat, 'sort_order', 1),
        jsonb_build_object('box_key', 'box2', 'label', 'VAT due on acquisitions', 'amount_minor', 0, 'sort_order', 2),
        jsonb_build_object('box_key', 'box3', 'label', 'Total VAT due', 'amount_minor', q.sales_vat, 'sort_order', 3),
        jsonb_build_object('box_key', 'box4', 'label', 'VAT reclaimed on purchases', 'amount_minor', q.purch_vat, 'sort_order', 4),
        jsonb_build_object('box_key', 'box5', 'label', 'Net VAT payable', 'amount_minor', q.sales_vat - q.purch_vat, 'sort_order', 5),
        jsonb_build_object('box_key', 'box6', 'label', 'Total sales excluding VAT', 'amount_minor', q.sales_vat * 5, 'sort_order', 6),
        jsonb_build_object('box_key', 'box7', 'label', 'Total purchases excluding VAT', 'amount_minor', q.purch_vat * 5, 'sort_order', 7),
        jsonb_build_object('box_key', 'box8', 'label', 'Supplies to EU', 'amount_minor', 0, 'sort_order', 8),
        jsonb_build_object('box_key', 'box9', 'label', 'Acquisitions from EU', 'amount_minor', 0, 'sort_order', 9)));
    n := n + 1;
  END LOOP;
  RETURN format('VAT registration set, %s draft VAT returns', n);
END $$;

-- ---------------------------------------------------------------- Reports
CREATE OR REPLACE FUNCTION private.demo_seed_reports(_c uuid, _u uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  fy date := make_date(CASE WHEN extract(month FROM current_date) >= 4 THEN extract(year FROM current_date)::int
                            ELSE extract(year FROM current_date)::int - 1 END, 4, 1);
  v uuid; p uuid; warn text := '';
BEGIN
  IF EXISTS (SELECT 1 FROM public.report_saved_views WHERE company_id = _c) THEN RETURN 'already seeded'; END IF;
  INSERT INTO public.report_saved_views (company_id, user_id, report_id, name, is_favourite, config, access_level)
  VALUES (_c, _u, 'cash-flow-indirect', 'Cash flow (indirect)', false, '{}'::jsonb, 'private')
  RETURNING id INTO v;
  INSERT INTO public.report_saved_views (company_id, user_id, report_id, name, is_favourite, config, access_level)
  VALUES (_c, _u, 'profit-and-loss', 'Monthly P&L - this financial year', true, jsonb_build_object('from', fy, 'to', current_date), 'private'),
    (_c, _u, 'balance-sheet', 'Balance sheet - month end', false, jsonb_build_object('asOf', date_trunc('month', current_date)::date - 1), 'private'),
    (_c, _u, 'trial-balance', 'Trial balance - last quarter', false, jsonb_build_object('asOf', date_trunc('quarter', current_date)::date - 1), 'private'),
    (_c, _u, 'cash-summary', 'Cash summary year to date', true, jsonb_build_object('from', fy, 'to', current_date), 'private');
  BEGIN
    INSERT INTO public.report_models (company_id, owner_id, kind, name, config)
    VALUES (_c, _u, 'dashboard', 'Owner dashboard', jsonb_build_object('widgets',
      jsonb_build_array('revenue', 'gross_profit', 'net_profit', 'cash', 'gross_margin', 'net_margin')));
  EXCEPTION WHEN others THEN warn := warn || ' model: ' || SQLERRM; END;
  BEGIN
    p := public.save_report_pack(_c, jsonb_build_object('name', 'Quarterly management pack', 'from', fy, 'to',
      date_trunc('quarter', current_date)::date - 1, 'config', jsonb_build_object('reports',
        jsonb_build_array('profit-and-loss', 'balance-sheet', 'cash-summary'), 'basis', 'accrual',
        'commentary', 'Revenue ahead of budget; payroll costs in line. Sample commentary.',
        'header', 'Demo Company Ltd', 'footer', 'Management information - unaudited')));
    PERFORM public.transition_report_pack(p, (SELECT version FROM public.report_packs WHERE id = p), 'start', 'Preparing pack');
    INSERT INTO public.report_comments (pack_id, company_id, author_id, body)
    VALUES (p, _c, _u, 'Check accruals before sending to the board.'),
           (p, _c, _u, 'Add a note on the new van purchase.');
    PERFORM public.save_report_pack(_c, jsonb_build_object('name', 'Month-end pack (draft)', 'from',
      date_trunc('month', current_date - 30)::date, 'to', date_trunc('month', current_date)::date - 1,
      'config', jsonb_build_object('reports', jsonb_build_array('profit-and-loss', 'trial-balance'), 'basis', 'accrual')));
  EXCEPTION WHEN others THEN warn := warn || ' packs: ' || SQLERRM; END;
  BEGIN
    -- Switched off so the delivery job never emails anyone.
    INSERT INTO public.report_schedules (company_id, owner_id, view_id, recipients, subject, message, recurrence, period,
      timezone, next_run_at, anchor_at, enabled)
    VALUES (_c, _u, v, '["finance@example.com"]'::jsonb, 'Monthly cash flow', 'Sample schedule (disabled)', 'monthly',
      'previous_month', 'Europe/London', date_trunc('month', now()) + interval '1 month 8 hours',
      date_trunc('month', now()) + interval '8 hours', false);
  EXCEPTION WHEN others THEN warn := warn || ' schedule: ' || SQLERRM; END;
  RETURN '5 saved reports, dashboard, 2 report packs, 1 paused schedule'
    || CASE WHEN warn = '' THEN '' ELSE ' (partial:' || warn || ')' END;
END $$;

-- ---------------------------------------------------------------- Products & Services
CREATE OR REPLACE FUNCTION private.demo_seed_products(_c uuid, _u uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  cat_consult uuid; cat_ret uuid; cat_host uuid; cat_print uuid;
  std uuid; partner uuid; ent uuid;
  pr record; n integer := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM public.product_categories WHERE company_id = _c) THEN RETURN 'already seeded'; END IF;
  INSERT INTO public.product_categories (company_id, name, description) VALUES (_c, 'Consulting', 'Advisory and project work')
    RETURNING id INTO cat_consult;
  INSERT INTO public.product_categories (company_id, name, description) VALUES (_c, 'Retainers & support', 'Monthly retainers')
    RETURNING id INTO cat_ret;
  INSERT INTO public.product_categories (company_id, name, description) VALUES (_c, 'Hosting & licences', 'Recurring software')
    RETURNING id INTO cat_host;
  INSERT INTO public.product_categories (company_id, name, description) VALUES (_c, 'Print & design', 'Creative services')
    RETURNING id INTO cat_print;
  UPDATE public.products SET category_id = CASE
      WHEN code IN ('SVC-CONSULT', 'SVC-TRAIN') THEN cat_consult
      WHEN code IN ('SVC-RETAIN', 'SVC-SUPPORT') THEN cat_ret
      WHEN code IN ('NI-HOST', 'NI-LICENSE') THEN cat_host
      WHEN code IN ('NI-PRINT', 'NI-DESIGN') THEN cat_print END
   WHERE company_id = _c AND code IN ('SVC-CONSULT', 'SVC-TRAIN', 'SVC-RETAIN', 'SVC-SUPPORT', 'NI-HOST', 'NI-LICENSE', 'NI-PRINT', 'NI-DESIGN');

  INSERT INTO public.product_price_lists (company_id, name, description, currency_code)
  VALUES (_c, 'Standard 2026', 'List prices', 'GBP') RETURNING id INTO std;
  INSERT INTO public.product_price_lists (company_id, name, description, currency_code)
  VALUES (_c, 'Partner -10%', 'Referral partners', 'GBP') RETURNING id INTO partner;
  INSERT INTO public.product_price_lists (company_id, name, description, currency_code)
  VALUES (_c, 'Enterprise', 'Volume pricing for large accounts', 'GBP') RETURNING id INTO ent;
  FOR pr IN SELECT id, code, sales_price_minor FROM public.products WHERE company_id = _c AND is_active LOOP
    INSERT INTO public.product_price_list_items (company_id, price_list_id, product_id, unit_price_minor)
    VALUES (_c, std, pr.id, pr.sales_price_minor), (_c, partner, pr.id, pr.sales_price_minor * 90 / 100);
    IF pr.code IN ('SVC-SUPPORT', 'SVC-CONSULT') THEN
      INSERT INTO public.product_price_list_rules (company_id, price_list_id, product_id, min_quantity, unit_price_minor)
      VALUES (_c, ent, pr.id, 10, pr.sales_price_minor * 92 / 100), (_c, ent, pr.id, 40, pr.sales_price_minor * 85 / 100);
      INSERT INTO public.product_price_list_discount_rules (company_id, price_list_id, product_id, min_quantity, discount_bps)
      VALUES (_c, partner, pr.id, 20, 500);
    END IF;
    n := n + 1;
  END LOOP;
  INSERT INTO public.product_customer_price_list_defaults (company_id, contact_id, price_list_id)
  SELECT _c, c.id, CASE WHEN c.name LIKE 'Acme%' THEN ent ELSE partner END
    FROM public.contacts c WHERE c.company_id = _c AND c.name IN ('Acme Consulting Ltd', 'Brightside Ltd', 'Northwind Traders Ltd');
  RETURN format('4 categories, 3 price lists covering %s products, tiers, discounts and customer defaults', n);
END $$;

-- ---------------------------------------------------------------- Accounting extras
CREATE OR REPLACE FUNCTION private.demo_seed_accounting(_c uuid, _u uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  cat uuid; warn text := '';
  m1 date := date_trunc('month', current_date)::date;
BEGIN
  IF EXISTS (SELECT 1 FROM public.tracking_categories WHERE company_id = _c) THEN RETURN 'already seeded'; END IF;
  INSERT INTO public.tracking_categories (company_id, name, dimension_kind, applies_to, sort_order, description)
  VALUES (_c, 'Department', 'department', ARRAY['sales', 'purchases', 'journals'], 1, 'Reporting department') RETURNING id INTO cat;
  INSERT INTO public.tracking_options (company_id, category_id, name, code, sort_order)
  VALUES (_c, cat, 'Consulting', 'CON', 1), (_c, cat, 'Operations', 'OPS', 2), (_c, cat, 'Sales', 'SAL', 3);
  INSERT INTO public.tracking_categories (company_id, name, dimension_kind, applies_to, sort_order, description)
  VALUES (_c, 'Location', 'location', ARRAY['sales', 'purchases', 'journals'], 2, 'Office location') RETURNING id INTO cat;
  INSERT INTO public.tracking_options (company_id, category_id, name, code, sort_order)
  VALUES (_c, cat, 'London', 'LDN', 1), (_c, cat, 'Manchester', 'MAN', 2), (_c, cat, 'Remote', 'REM', 3);

  INSERT INTO public.projects (company_id, contact_id, code, name, status, start_date, end_date, description, budget_minor, created_by)
  VALUES
    (_c, (SELECT id FROM public.contacts WHERE company_id = _c AND name = 'Acme Consulting Ltd'), 'PRJ-001',
     'Acme website rebuild', 'active', m1 - 120, m1 + 60, 'Design and build of the new site', 1200000, _u),
    (_c, (SELECT id FROM public.contacts WHERE company_id = _c AND name = 'Brightside Ltd'), 'PRJ-002',
     'Brightside monthly retainer', 'active', m1 - 200, NULL, 'Ongoing support retainer', 600000, _u),
    (_c, (SELECT id FROM public.contacts WHERE company_id = _c AND name = 'Northwind Traders Ltd'), 'PRJ-003',
     'Northwind strategy review', 'draft', m1 + 30, NULL, 'Proposal stage', 450000, _u),
    (_c, NULL, 'PRJ-004', 'Legacy system migration', 'completed', m1 - 300, m1 - 90, 'Finished in the spring', 300000, _u);

  INSERT INTO public.recurring_journal_templates (company_id, name, start_date, next_date, interval_months, max_occurrences,
    lines, memo, created_by)
  VALUES
    (_c, 'Monthly audit fee accrual', m1, private.demo_month_end(m1), 1, NULL, jsonb_build_array(
       jsonb_build_object('accountId', private.demo_acct_id(_c, '6000'), 'description', 'Audit fee accrual', 'debitMinor', 30000, 'creditMinor', 0),
       jsonb_build_object('accountId', private.demo_acct_id(_c, '2200'), 'description', 'Audit fee accrual', 'debitMinor', 0, 'creditMinor', 30000)),
     'Accrue 1/12 of the annual audit fee', _u),
    (_c, 'Office rent accrual', m1, private.demo_month_end(m1), 1, 12, jsonb_build_array(
       jsonb_build_object('accountId', private.demo_acct_id(_c, '6000'), 'description', 'Rent', 'debitMinor', 125000, 'creditMinor', 0),
       jsonb_build_object('accountId', private.demo_acct_id(_c, '2200'), 'description', 'Rent', 'debitMinor', 0, 'creditMinor', 125000)),
     'Rent invoiced quarterly in arrears', _u);

  BEGIN
    PERFORM public.create_deferral_schedule(_c, jsonb_build_object('requestId', gen_random_uuid(), 'kind', 'prepaid_expense',
      'name', 'Annual software licence', 'reference', 'INV-SW-2026', 'debitAccountId', private.demo_acct_id(_c, '6000'),
      'creditAccountId', private.demo_acct_id(_c, '1300'), 'totalMinor', 240000, 'periods', 12, 'startDate', m1));
    PERFORM public.create_deferral_schedule(_c, jsonb_build_object('requestId', gen_random_uuid(), 'kind', 'deferred_income',
      'name', 'Training retainer billed upfront', 'reference', 'INV-TR-2026', 'debitAccountId', private.demo_acct_id(_c, '2300'),
      'creditAccountId', private.demo_acct_id(_c, '4000'), 'totalMinor', 600000, 'periods', 6, 'startDate', m1));
  EXCEPTION WHEN others THEN warn := warn || ' deferrals: ' || SQLERRM; END;
  RETURN '2 tracking categories, 4 projects, 2 recurring journals, 2 deferral schedules'
    || CASE WHEN warn = '' THEN '' ELSE ' (partial:' || warn || ')' END;
END $$;

-- ---------------------------------------------------------------- Files
CREATE OR REPLACE FUNCTION private.demo_inline_file(
  _c uuid, _entity_type text, _entity_id uuid, _folder uuid, _name text, _type text, _body text, _age interval
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  rid uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.document_attachments (id, company_id, entity_type, entity_id, file_name, storage_path, storage_bucket,
    content_type, size_bytes, content_base64, folder_id, created_at)
  VALUES (rid, _c, _entity_type, _entity_id, _name, 'inline:' || rid, NULL, _type, octet_length(_body),
    replace(encode(convert_to(_body, 'UTF8'), 'base64'), E'\n', ''), _folder, now() - _age);
  RETURN rid;
END $$;

CREATE OR REPLACE FUNCTION private.demo_seed_files(_c uuid, _u uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  f_receipts uuid; f_travel uuid; f_bank uuid; f_contracts uuid; f_payroll uuid; f_year uuid;
  a uuid; acme uuid; warn text := '';
BEGIN
  IF EXISTS (SELECT 1 FROM public.document_folders WHERE company_id = _c) THEN RETURN 'already seeded'; END IF;
  INSERT INTO public.document_folders (company_id, name, created_by) VALUES (_c, 'Receipts', _u) RETURNING id INTO f_receipts;
  INSERT INTO public.document_folders (company_id, parent_id, name, created_by) VALUES (_c, f_receipts, 'Travel', _u) RETURNING id INTO f_travel;
  INSERT INTO public.document_folders (company_id, name, created_by) VALUES (_c, 'Bank statements', _u) RETURNING id INTO f_bank;
  INSERT INTO public.document_folders (company_id, name, created_by) VALUES (_c, 'Contracts', _u) RETURNING id INTO f_contracts;
  INSERT INTO public.document_folders (company_id, name, created_by) VALUES (_c, 'Payroll', _u) RETURNING id INTO f_payroll;
  INSERT INTO public.document_folders (company_id, name, created_by) VALUES (_c, 'Year end', _u) RETURNING id INTO f_year;

  -- Company-level files are queued for review automatically.
  a := private.demo_inline_file(_c, 'company', _c, f_receipts, 'ryman-receipt.txt', 'text/plain',
    E'RYMAN STATIONERY\nPrinter paper x2   £18.00\nFolders            £5.50\nVAT 20%            £4.70\nTOTAL             £28.20\n(demo receipt)', interval '20 days');
  UPDATE public.document_reviews SET document_type = 'receipt', supplier_name = 'Ryman', total_minor = 2820,
    currency_code = 'GBP', status = 'ready' WHERE attachment_id = a;
  a := private.demo_inline_file(_c, 'company', _c, f_travel, 'trainline-ticket.txt', 'text/plain',
    E'TRAINLINE e-ticket\nManchester Piccadilly -> Leeds\nAdult return  £86.50\n(demo receipt)', interval '6 days');
  a := private.demo_inline_file(_c, 'company', _c, f_travel, 'premier-inn-folio.txt', 'text/plain',
    E'PREMIER INN London City\n1 night  £95.00\nVAT      £19.00\nTOTAL   £114.00\n(demo receipt)', interval '15 days');
  UPDATE public.document_reviews SET document_type = 'receipt', supplier_name = 'Premier Inn', total_minor = 11400,
    currency_code = 'GBP', status = 'rejected', note = 'Duplicate of claim EXP receipt' WHERE attachment_id = a;
  a := private.demo_inline_file(_c, 'company', _c, f_bank, 'bank-statement-last-month.csv', 'text/csv',
    E'Date,Description,Amount\n' || to_char(current_date - 35, 'YYYY-MM-DD') || E',Acme Consulting receipt,4800.00\n'
    || to_char(current_date - 33, 'YYYY-MM-DD') || E',Cloud Hosting Partners,-240.00\n'
    || to_char(current_date - 30, 'YYYY-MM-DD') || E',Salaries,-12650.00\n', interval '4 days');
  UPDATE public.document_reviews SET document_type = 'statement', status = 'ready' WHERE attachment_id = a;
  a := private.demo_inline_file(_c, 'company', _c, f_contracts, 'office-lease-summary.txt', 'text/plain',
    E'OFFICE LEASE - KEY TERMS (demo)\nTerm: 5 years\nRent: £15,000 per year, quarterly in arrears\nBreak clause: year 3', interval '60 days');
  UPDATE public.document_reviews SET document_type = 'contract', status = 'ready', reference = 'LEASE-2026' WHERE attachment_id = a;
  BEGIN
    UPDATE public.document_reviews SET status = 'approved' WHERE attachment_id = a;
  EXCEPTION WHEN others THEN warn := warn || ' approve: ' || SQLERRM; END;
  a := private.demo_inline_file(_c, 'company', _c, f_payroll, 'payroll-summary.csv', 'text/csv',
    E'Employee,Gross,Net\nPriya Shah,3950.00,2884.00\nTom Bennett,3000.00,2190.00\n(demo)', interval '8 days');
  a := private.demo_inline_file(_c, 'company', _c, f_year, 'year-end-checklist.txt', 'text/plain',
    E'Year-end checklist (demo)\n[x] Bank reconciliations\n[x] Fixed asset register\n[ ] Accruals review\n[ ] Director sign-off', interval '90 days');
  a := private.demo_inline_file(_c, 'company', _c, NULL, 'unfiled-scan.txt', 'text/plain',
    E'Scanned document awaiting classification (demo)', interval '1 day');

  SELECT id INTO acme FROM public.contacts WHERE company_id = _c AND name = 'Acme Consulting Ltd';
  IF acme IS NOT NULL THEN
    PERFORM private.demo_inline_file(_c, 'contact', acme, f_contracts, 'acme-engagement-letter.txt', 'text/plain',
      E'Engagement letter - Acme Consulting Ltd (demo)\nServices: website rebuild\nFees: £12,000', interval '100 days');
  END IF;

  INSERT INTO public.inbox_documents (company_id, file_name, content_type, size_bytes, status, scan_status, note, created_by)
  VALUES (_c, 'supplier-invoice-forwarded.pdf', 'application/pdf', 52344, 'inbox', 'not_scanned', 'Forwarded by email (demo)', _u),
         (_c, 'utility-bill-october.pdf', 'application/pdf', 61022, 'classified', 'not_scanned', 'Electricity (demo)', _u);
  RETURN '6 folders, 9 files with review states, 2 inbox documents'
    || CASE WHEN warn = '' THEN '' ELSE ' (partial:' || warn || ')' END;
END $$;

-- ---------------------------------------------------------------- Accountant
CREATE OR REPLACE FUNCTION private.demo_gl_balance(_c uuid, _account uuid, _as_of date) RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(sum(l.debit_minor - l.credit_minor), 0)::bigint
    FROM public.journal_lines l JOIN public.journals j ON j.id = l.journal_id
   WHERE j.company_id = _c AND j.status = 'posted' AND j.journal_date <= _as_of AND l.account_id = _account;
$$;

CREATE OR REPLACE FUNCTION private.demo_seed_accountant(_c uuid, _u uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  as_of date := date_trunc('month', current_date)::date - 1;
  prev date := date_trunc('month', current_date - 32)::date - 1;
  wp uuid; acct record; j record; cs uuid; n integer := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM public.practice_tasks WHERE company_id = _c) THEN RETURN 'already seeded'; END IF;

  INSERT INTO public.practice_tasks (company_id, title, kind, period_end, due_date, status, assignee_id, note, template_key,
    prepared_by, created_by)
  SELECT _c, t.title || ' - ' || to_char(pe, 'Mon YYYY'), 'month_end', pe, pe + 10,
         CASE WHEN pe = prev THEN (ARRAY['ready', 'ready', 'ready', 'ready', 'in_progress', 'in_progress'])[t.ord]
              ELSE (ARRAY['in_progress', 'in_progress', 'blocked', 'todo', 'todo', 'todo'])[t.ord] END,
         _u,
         CASE WHEN pe <> prev AND t.ord = 3 THEN 'Awaiting supplier statement from Cloud Hosting Partners' ELSE '' END,
         t.key,
         CASE WHEN pe = prev AND t.ord <= 4 THEN _u ELSE NULL END, _u
    FROM (VALUES (1, 'bank', 'Reconcile bank accounts'), (2, 'ar', 'Review aged receivables'),
                 (3, 'ap', 'Review aged payables'), (4, 'adjustments', 'Post accruals and prepayments'),
                 (5, 'tax', 'Prepare VAT workings'), (6, 'reporting', 'Issue management accounts')) AS t(ord, key, title)
   CROSS JOIN (VALUES (prev), (as_of)) AS p(pe);
  INSERT INTO public.practice_tasks (company_id, title, kind, due_date, status, assignee_id, note, created_by)
  VALUES (_c, 'VAT return filing', 'deadline', current_date + 21, 'todo', _u, 'Quarterly VAT return due', _u),
         (_c, 'Companies House confirmation statement', 'deadline', current_date + 45, 'todo', _u, '', _u),
         (_c, 'Corporation tax return (CT600)', 'deadline', current_date + 120, 'in_progress', _u, 'Draft computations started', _u);

  FOR acct IN SELECT a.id, a.code FROM public.accounts a
               WHERE a.company_id = _c AND a.code IN ('1000', '1100', '1300', '2000', '2100', '2200') ORDER BY a.code LOOP
    INSERT INTO public.account_workpapers (company_id, account_id, as_of, gl_balance_minor, supporting_balance_minor,
      evidence_reference, note, status, prepared_by, prepared_at, created_by)
    VALUES (_c, acct.id, as_of, private.demo_gl_balance(_c, acct.id, as_of),
      CASE WHEN acct.code IN ('1000', '1300') THEN private.demo_gl_balance(_c, acct.id, as_of) END,
      CASE WHEN acct.code = '1000' THEN 'Bank statement ' || to_char(as_of, 'DD Mon YYYY')
           WHEN acct.code = '1300' THEN 'Prepayments schedule' ELSE '' END,
      'Demo workpaper',
      CASE WHEN acct.code IN ('1000', '1300') THEN 'prepared' ELSE 'draft' END,
      CASE WHEN acct.code IN ('1000', '1300') THEN _u END,
      CASE WHEN acct.code IN ('1000', '1300') THEN now() - interval '2 days' END, _u)
    RETURNING id INTO wp;
    IF acct.code = '1100' THEN
      INSERT INTO public.account_workpaper_reconciling_items (company_id, workpaper_id, description, amount_minor, created_by, updated_by)
      VALUES (_c, wp, 'Receipt in transit from Brightside Ltd', 42000, _u, _u),
             (_c, wp, 'Unapplied customer receipt', -8550, _u, _u);
    ELSIF acct.code = '2000' THEN
      INSERT INTO public.account_workpaper_reconciling_items (company_id, workpaper_id, description, amount_minor, state,
        evidence_reference, resolution_note, resolved_by, resolved_at, created_by, updated_by)
      VALUES (_c, wp, 'Supplier credit note not yet received', -12000, 'resolved', 'Credit note PCN-1',
        'Credit note received and posted', _u, now() - interval '1 day', _u, _u);
    END IF;
    n := n + 1;
  END LOOP;

  FOR j IN SELECT id FROM public.journals WHERE company_id = _c AND status = 'posted' ORDER BY journal_date DESC LIMIT 2 LOOP
    INSERT INTO public.ai_journal_review_cases (company_id, journal_id, created_by, status)
    VALUES (_c, j.id, _u, 'open') RETURNING id INTO cs;
    INSERT INTO public.ai_journal_review_events (company_id, case_id, actor_id, action, note, new_status)
    VALUES (_c, cs, _u, 'open', 'Opened for review', 'open'),
           (_c, cs, _u, 'comment', 'Check the supporting invoice is attached.', 'open');
  END LOOP;
  RETURN format('15 practice tasks, %s account workpapers, AI journal review cases', n);
END $$;

-- ---------------------------------------------------------------- Contacts extras
CREATE OR REPLACE FUNCTION private.demo_seed_contacts(_c uuid, _u uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  g_key uuid; g_retail uuid; g_supp uuid; g_util uuid;
  t record; ct record; task uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.contact_groups WHERE company_id = _c) THEN RETURN 'already seeded'; END IF;
  INSERT INTO public.contact_groups (company_id, name, description, color) VALUES (_c, 'Key accounts', 'Top customers', '#2563eb') RETURNING id INTO g_key;
  INSERT INTO public.contact_groups (company_id, name, description, color) VALUES (_c, 'Retail customers', NULL, '#16a34a') RETURNING id INTO g_retail;
  INSERT INTO public.contact_groups (company_id, name, description, color) VALUES (_c, 'Overseas suppliers', NULL, '#9333ea') RETURNING id INTO g_supp;
  INSERT INTO public.contact_groups (company_id, name, description, color) VALUES (_c, 'Utilities', NULL, '#ea580c') RETURNING id INTO g_util;
  INSERT INTO public.contact_group_members (company_id, group_id, contact_id)
  SELECT _c, CASE WHEN name IN ('Acme Consulting Ltd', 'Brightside Ltd', 'Northwind Traders Ltd', 'Summit Analytics Ltd') THEN g_key
                  WHEN name IN ('Westgate Retail Ltd', 'Prairie Foods Ltd', 'Evergreen Homes Ltd') THEN g_retail
                  WHEN name IN ('Cloud Hosting Partners', 'SoftServe Licences') THEN g_supp
                  ELSE g_util END, id
    FROM public.contacts WHERE company_id = _c AND name IN ('Acme Consulting Ltd', 'Brightside Ltd', 'Northwind Traders Ltd',
      'Summit Analytics Ltd', 'Westgate Retail Ltd', 'Prairie Foods Ltd', 'Evergreen Homes Ltd', 'Cloud Hosting Partners',
      'SoftServe Licences', 'City Utilities Demo', 'North Grid Power', 'Lantern Telecom Ltd');

  INSERT INTO public.contact_tags (company_id, name)
  VALUES (_c, 'vip'), (_c, 'net-30'), (_c, 'vat-registered'), (_c, 'late-payer'), (_c, 'eu'), (_c, 'contract-renewal');
  INSERT INTO public.contact_tag_assignments (company_id, tag_id, contact_id)
  SELECT _c, tg.id, c.id FROM public.contacts c JOIN public.contact_tags tg ON tg.company_id = _c
   WHERE c.company_id = _c AND (
     (tg.name = 'vip' AND c.name IN ('Acme Consulting Ltd', 'Brightside Ltd')) OR
     (tg.name = 'net-30' AND c.name IN ('Acme Consulting Ltd', 'Northwind Traders Ltd', 'Summit Analytics Ltd', 'Office Supplies Co')) OR
     (tg.name = 'vat-registered' AND c.name IN ('Acme Consulting Ltd', 'Brightside Ltd', 'Cloud Hosting Partners', 'PrintShop & Mail Ltd')) OR
     (tg.name = 'late-payer' AND c.name IN ('Northwind Traders Ltd')) OR
     (tg.name = 'eu' AND c.name IN ('SoftServe Licences')) OR
     (tg.name = 'contract-renewal' AND c.name IN ('Brightside Ltd', 'Cloud Hosting Partners')));

  FOR ct IN SELECT id, name FROM public.contacts WHERE company_id = _c
             AND name IN ('Acme Consulting Ltd', 'Brightside Ltd', 'Northwind Traders Ltd', 'Cloud Hosting Partners') LOOP
    INSERT INTO public.contact_people (company_id, contact_id, first_name, last_name, email, phone, job_title, is_primary, sort_order)
    VALUES (_c, ct.id, 'Sam', split_part(ct.name, ' ', 1), 'sam@' || lower(split_part(ct.name, ' ', 1)) || '.example', '020 7946 0001',
            'Finance Director', true, 1),
           (_c, ct.id, 'Jo', 'Accounts', 'accounts@' || lower(split_part(ct.name, ' ', 1)) || '.example', NULL, 'Accounts Payable', false, 2);
    INSERT INTO public.contact_interactions (company_id, contact_id, kind, title, detail)
    VALUES (_c, ct.id, 'call', 'Quarterly catch-up call', 'Discussed upcoming work and payment terms.'),
           (_c, ct.id, 'note', 'Prefers invoices by email', 'Send PDFs to the accounts mailbox.'),
           (_c, ct.id, 'meeting', 'Annual review meeting', 'Agreed pricing for next year.');
  END LOOP;

  FOR t IN SELECT * FROM (VALUES
      ('Northwind Traders Ltd', 'Chase overdue invoice', current_date - 5, current_date - 7),
      ('Acme Consulting Ltd', 'Send website phase 2 proposal', current_date - 2, NULL::date),
      ('Brightside Ltd', 'Confirm retainer renewal', current_date, NULL::date),
      ('Cloud Hosting Partners', 'Request updated SLA', current_date + 5, current_date),
      ('Summit Analytics Ltd', 'Book quarterly review', current_date + 30, NULL::date),
      ('Acme Consulting Ltd', 'Collect signed engagement letter', current_date - 10, NULL::date)
    ) AS x(contact_name, title, due, remind)
  LOOP
    INSERT INTO public.contact_interactions (company_id, contact_id, kind, title, due_on, remind_on, assigned_to)
    SELECT _c, c.id, 'task', t.title, t.due, t.remind, _u FROM public.contacts c
     WHERE c.company_id = _c AND c.name = t.contact_name
    RETURNING id INTO task;
    IF t.title = 'Collect signed engagement letter' AND task IS NOT NULL THEN
      UPDATE public.contact_interactions SET completed_at = now() WHERE id = task;
    END IF;
  END LOOP;

  INSERT INTO public.action_notification_preferences (company_id, recipient_user_id, category, enabled)
  VALUES (_c, _u, 'contact_followup', true)
  ON CONFLICT DO NOTHING;
  RETURN '4 groups, 6 tags, contact people, timeline entries and 6 follow-up tasks';
END $$;

-- ---------------------------------------------------------------- Firm
CREATE OR REPLACE FUNCTION private.demo_seed_firm(_c uuid, _u uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  f uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.firms WHERE demo_company_id = _c) THEN RETURN 'already seeded'; END IF;
  INSERT INTO public.firms (name, created_by, demo_company_id) VALUES ('Demo Practice LLP (sample)', _u, _c) RETURNING id INTO f;
  INSERT INTO public.firm_members (firm_id, user_id, role) VALUES (f, _u, 'owner') ON CONFLICT DO NOTHING;
  INSERT INTO public.firm_client_links (firm_id, company_id, access_level) VALUES (f, _c, 'full');
  INSERT INTO public.firm_client_profiles (firm_id, company_id, status, primary_contact_name, primary_contact_email,
    industry, service_line, notes, tags, next_review_date, updated_by)
  VALUES (f, _c, 'active', 'Demo Owner', 'owner@demo-company.example', 'Professional services',
    'Monthly bookkeeping & VAT', 'Sample client profile', ARRAY['VAT quarterly', 'Priority'], current_date + 21, _u);
  INSERT INTO public.firm_service_categories (firm_id, name, created_by, updated_by)
  VALUES (f, 'Bookkeeping', _u, _u), (f, 'VAT returns', _u, _u), (f, 'Year-end accounts', _u, _u), (f, 'Payroll', _u, _u);
  INSERT INTO public.firm_onboarding_template_steps (firm_id, task_key, title, sort_order, due_in_days, created_by, updated_by)
  VALUES (f, 'custom_' || md5(f::text || '1'), 'Engagement letter signed', 10, 3, _u, _u),
         (f, 'custom_' || md5(f::text || '2'), 'Anti-money-laundering checks', 20, 5, _u, _u),
         (f, 'custom_' || md5(f::text || '3'), 'Bank feeds connected', 30, 10, _u, _u),
         (f, 'custom_' || md5(f::text || '4'), 'Opening balances agreed', 40, 14, _u, _u);
  INSERT INTO public.firm_client_onboarding_steps (firm_id, company_id, task_key, title, completed_at, completed_by,
    assignee_id, due_date, depends_on_task_key, updated_by)
  VALUES (f, _c, 'engagement_letter', 'Engagement letter signed', now() - interval '20 days', _u, _u, current_date - 21, NULL, _u),
         (f, _c, 'aml_checks', 'Anti-money-laundering checks', now() - interval '18 days', _u, _u, current_date - 18, 'engagement_letter', _u),
         (f, _c, 'bank_feeds', 'Bank feeds connected', now() - interval '10 days', _u, _u, current_date - 12, 'aml_checks', _u),
         (f, _c, 'opening_balances', 'Opening balances agreed', NULL, NULL, _u, current_date - 3, 'bank_feeds', _u),
         (f, _c, 'vat_authority', 'VAT agent authorisation', NULL, NULL, _u, current_date + 3, NULL, _u),
         (f, _c, 'first_month_close', 'First month-end close', NULL, NULL, _u, current_date + 14, 'opening_balances', _u);
  INSERT INTO public.firm_engagements (firm_id, company_id, name, status, frequency, start_date, agreed_fee, currency_code, notes,
    created_by, updated_by)
  VALUES (f, _c, 'Monthly bookkeeping', 'active', 'monthly', current_date - 90, 450.00, 'GBP', 'Includes bank reconciliations', _u, _u),
         (f, _c, 'Quarterly VAT returns', 'active', 'quarterly', current_date - 90, 250.00, 'GBP', '', _u, _u),
         (f, _c, 'Year-end accounts', 'draft', 'one_off', current_date + 120, 1200.00, 'GBP', 'Quote sent', _u, _u);
  INSERT INTO public.firm_client_assignments (firm_id, company_id, user_id, responsibility, updated_by)
  VALUES (f, _c, _u, 'lead', _u);
  RETURN 'Demo Practice LLP with client profile, onboarding steps, engagements and services';
END $$;

-- ---------------------------------------------------------------- Advisors portal
-- Only the customer portal is populated; the platform's Advisors console is not seeded.
CREATE OR REPLACE FUNCTION private.demo_seed_advisors(_c uuid, _u uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  staff uuid; client uuid; eng uuid; ws uuid; p1 uuid; p2 uuid; p3 uuid;
  email text := 'demo-' || _c || '@demo.linkbooks.invalid';
  slot integer := abs(hashtext(_c::text)) % 400;
BEGIN
  IF EXISTS (SELECT 1 FROM public.advisors_clients WHERE company_id = _c) THEN RETURN 'already seeded'; END IF;
  IF EXISTS (SELECT 1 FROM public.advisors_clients WHERE linked_user_id = _u) THEN
    RETURN 'skipped: this user already has a real Advisors portal account';
  END IF;
  SELECT id INTO staff FROM public.advisors_staff WHERE display_name = 'Demo Advisor (sample data)';
  IF staff IS NULL THEN
    INSERT INTO public.advisors_staff (display_name, timezone, is_active)
    VALUES ('Demo Advisor (sample data)', 'Europe/London', false) RETURNING id INTO staff;
  END IF;
  INSERT INTO public.advisors_clients (email, name, business_name, status, primary_service_code, assigned_advisor_id,
    linked_user_id, company_id, notes)
  VALUES (email, 'Demo Owner', 'Demo Company Ltd (sample)', 'active', 'bookkeeping', staff, _u, _c, 'Demo client - sample data')
  RETURNING id INTO client;
  INSERT INTO public.advisors_engagements (client_id, assigned_advisor_id, service_code, plan_code, title, status, currency,
    amount_minor, billing_interval, scope_summary)
  VALUES (client, staff, 'bookkeeping', 'growth_books', 'Growth bookkeeping', 'active', 'USD', 34900, 'month',
    'Monthly bookkeeping, reconciliations and management reports') RETURNING id INTO eng;
  INSERT INTO public.advisors_onboarding_tasks (engagement_id, code, title, status, sort_order, completed_at)
  VALUES (eng, 'kickoff', 'Kick-off call', 'done', 10, now() - interval '40 days'),
         (eng, 'access', 'Grant LinkBooks access', 'done', 20, now() - interval '38 days'),
         (eng, 'bank', 'Connect bank accounts', 'done', 30, now() - interval '35 days');
  INSERT INTO public.advisors_workspaces (engagement_id, kind, status, assigned_advisor_id, title, cadence, objectives)
  VALUES (eng, 'bookkeeping', 'active', staff, 'Monthly bookkeeping', 'monthly', 'Close each month within 10 working days')
  RETURNING id INTO ws;
  INSERT INTO public.advisors_work_periods (workspace_id, label, period_start, period_end, status, summary)
  VALUES (ws, to_char(current_date - 60, 'Mon YYYY'), date_trunc('month', current_date - 60)::date,
          private.demo_month_end(current_date - 60), 'completed', 'Month closed; management pack sent.') RETURNING id INTO p1;
  INSERT INTO public.advisors_work_periods (workspace_id, label, period_start, period_end, status, summary)
  VALUES (ws, to_char(current_date - 30, 'Mon YYYY'), date_trunc('month', current_date - 30)::date,
          private.demo_month_end(current_date - 30), 'completed', 'Month closed.') RETURNING id INTO p2;
  INSERT INTO public.advisors_work_periods (workspace_id, label, period_start, period_end, status)
  VALUES (ws, to_char(current_date, 'Mon YYYY'), date_trunc('month', current_date)::date,
          private.demo_month_end(current_date), 'open') RETURNING id INTO p3;
  INSERT INTO public.advisors_delivery_tasks (workspace_id, period_id, code, title, status, sort_order, requires_document, document_label)
  VALUES (ws, p3, 'bank_rec', 'Reconcile bank', 'in_progress', 10, false, ''),
         (ws, p3, 'receipts', 'Collect receipts', 'pending', 20, true, 'Receipts for the month'),
         (ws, p3, 'payroll', 'Review payroll journal', 'pending', 30, false, ''),
         (ws, p2, 'bank_rec', 'Reconcile bank', 'done', 10, false, ''),
         (ws, p2, 'report', 'Send management pack', 'done', 40, false, '');
  INSERT INTO public.advisors_document_requests (workspace_id, period_id, title, instructions, status, due_at)
  VALUES (ws, p3, 'Receipts for this month', 'Upload all card and cash receipts', 'requested', now() + interval '7 days'),
         (ws, p2, 'Supplier statement - Cloud Hosting', '', 'received', now() - interval '20 days'),
         (ws, p1, 'Loan statement', '', 'reviewed', now() - interval '50 days');
  INSERT INTO public.advisors_workspace_notes (workspace_id, period_id, author_advisor_id, visibility, body)
  VALUES (ws, p2, staff, 'customer', 'All transactions reconciled. Two receipts still missing for card spend.'),
         (ws, p3, staff, 'customer', 'Please upload this month''s receipts by the 7th.');
  INSERT INTO public.advisors_portal_messages (client_id, author_role, author_advisor_id, body, created_at)
  VALUES (client, 'advisor', staff, 'Welcome to your bookkeeping portal. This is sample data.', now() - interval '40 days'),
         (client, 'customer', NULL, 'Thanks! Is the VAT return on track?', now() - interval '5 days'),
         (client, 'advisor', staff, 'Yes, draft VAT workings are ready for your review.', now() - interval '4 days');
  INSERT INTO public.advisors_portal_notifications (client_id, kind, title, body, href, read_at)
  VALUES (client, 'document_request', 'Receipts requested', 'Upload this month''s receipts', '/advisors-portal/documents', NULL),
         (client, 'message', 'New message from your advisor', '', '/advisors-portal/messages', now() - interval '3 days');
  BEGIN
    INSERT INTO public.advisors_appointments (advisor_id, service_code, plan_code, status, starts_at, ends_at, customer_timezone,
      customer_name, customer_email, business_name, notes, manage_token)
    VALUES (staff, 'bookkeeping', 'growth_books', 'completed', date_trunc('day', now() - interval '30 days') + make_interval(mins => 540 + slot),
            date_trunc('day', now() - interval '30 days') + make_interval(mins => 570 + slot), 'Europe/London', 'Demo Owner', email,
            'Demo Company Ltd', 'Monthly review (sample)', encode(extensions.gen_random_bytes(18), 'hex')),
           (staff, 'bookkeeping', 'growth_books', 'confirmed', date_trunc('day', now() + interval '10 days') + make_interval(mins => 540 + slot),
            date_trunc('day', now() + interval '10 days') + make_interval(mins => 570 + slot), 'Europe/London', 'Demo Owner', email,
            'Demo Company Ltd', 'Quarter-end planning (sample)', encode(extensions.gen_random_bytes(18), 'hex'));
  EXCEPTION WHEN others THEN NULL; END;
  RETURN 'Advisors portal: engagement, workspace, document requests, messages and appointments';
END $$;

-- ---------------------------------------------------------------- App Store (honest statuses: no connector is verified)
CREATE OR REPLACE FUNCTION private.demo_seed_app_store(_c uuid, _u uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  conn_shop uuid; conn_stripe uuid; job uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.app_installations WHERE company_id = _c) THEN RETURN 'already seeded'; END IF;
  INSERT INTO public.app_installations (company_id, app_code, status, installed_by, last_error, disabled_at)
  VALUES (_c, 'shopify', 'requested', _u, NULL, NULL),
         (_c, 'stripe_payments', 'requested', _u, NULL, NULL),
         (_c, 'hubdoc', 'error', _u, 'Partner credentials are not configured yet', NULL),
         (_c, 'paypal', 'disabled', _u, NULL, now() - interval '12 days');
  INSERT INTO public.app_install_requests (company_id, app_code, requested_by, status, justification, remarks, approver_id, decided_at)
  VALUES (_c, 'link_my_books', _u, 'submitted', 'Import Amazon settlements automatically', '', NULL, NULL),
         (_c, 'dext', _u, 'pending_approval', 'Receipt capture for the sales team', '', NULL, NULL),
         (_c, 'hubspot', _u, 'rejected', 'Sync CRM contacts', 'Not needed this year', _u, now() - interval '8 days');
  INSERT INTO public.integration_connections (company_id, app_code, provider, external_account_label, auth_method, status, health,
    last_error, created_by)
  VALUES (_c, 'shopify', 'shopify', 'demo-store.myshopify.com', 'oauth2', 'pending', 'unknown', NULL, _u)
  RETURNING id INTO conn_shop;
  INSERT INTO public.integration_connections (company_id, app_code, provider, external_account_label, auth_method, status, health,
    last_error, created_by)
  VALUES (_c, 'stripe_payments', 'stripe', 'Demo Stripe account', 'oauth2', 'error', 'unhealthy', 'Token expired (sample)', _u)
  RETURNING id INTO conn_stripe;
  INSERT INTO public.integration_connections (company_id, app_code, provider, external_account_label, auth_method, status, health, created_by)
  VALUES (_c, 'paypal', 'paypal', 'Demo PayPal', 'oauth2', 'disconnected', 'unknown', _u);
  INSERT INTO public.app_connection_consents (company_id, app_code, connection_id, granted_scopes, consented_by, consent_version, status,
    revoked_at, revoked_by, revoke_reason)
  VALUES (_c, 'shopify', conn_shop, ARRAY['orders:read', 'customers:read'], _u, '1', 'active', NULL, NULL, NULL),
         (_c, 'paypal', NULL, ARRAY['payments:read'], _u, '1', 'revoked', now() - interval '12 days', _u, 'customer_revoked');
  INSERT INTO public.integration_sync_jobs (company_id, connection_id, app_code, direction, trigger, status, correlation_id,
    discovered, imported, skipped, failed, retry_count, last_error, started_at, finished_at)
  VALUES (_c, conn_stripe, 'stripe_payments', 'inbound', 'scheduled', 'failed', 'demo-' || gen_random_uuid(), 0, 0, 0, 0, 3,
          'Authentication failed (sample)', now() - interval '2 days', now() - interval '2 days')
  RETURNING id INTO job;
  INSERT INTO public.integration_sync_events (job_id, company_id, event_type, external_id, idempotency_key, status, detail)
  VALUES (job, _c, 'payout', 'po_demo_1', 'demo-' || gen_random_uuid(), 'failed', '{"reason":"auth"}'::jsonb);
  INSERT INTO public.integration_sync_jobs (company_id, connection_id, app_code, direction, trigger, status, correlation_id,
    discovered, imported, skipped, failed, retry_count, last_error, started_at, finished_at)
  VALUES (_c, conn_shop, 'shopify', 'inbound', 'manual', 'partial', 'demo-' || gen_random_uuid(), 25, 21, 2, 2, 0,
          '2 orders had unknown tax codes (sample)', now() - interval '1 day', now() - interval '1 day'),
         (_c, conn_shop, 'shopify', 'inbound', 'install', 'dead_letter', 'demo-' || gen_random_uuid(), 0, 0, 0, 1, 5,
          'Webhook signature invalid (sample)', now() - interval '6 days', now() - interval '6 days'),
         (_c, conn_shop, 'shopify', 'inbound', 'scheduled', 'pending', 'demo-' || gen_random_uuid(), 0, 0, 0, 0, 0, NULL, NULL, NULL),
         (_c, conn_stripe, 'stripe_payments', 'inbound', 'retry', 'cancelled', 'demo-' || gen_random_uuid(), 0, 0, 0, 0, 1, NULL,
          now() - interval '3 days', now() - interval '3 days');
  INSERT INTO public.marketplace_security_alerts (company_id, app_code, severity, alert_type, message)
  VALUES (_c, 'paypal', 'medium', 'consent_revoked', 'PayPal access was revoked by the organisation (sample)'),
         (_c, 'shopify', 'low', 'rate_limit', 'Shopify sync was rate limited and will retry (sample)'),
         (_c, 'stripe_payments', 'high', 'permission_denied', 'Stripe rejected the stored token (sample)');
  BEGIN
    INSERT INTO public.firm_app_recommendations (firm_id, client_company_id, app_code, recommended_by, status, rationale)
    VALUES (_c, _c, 'dext', _u, 'sent', 'Speeds up receipt capture for month-end'),
           (_c, _c, 'link_my_books', _u, 'client_pending', 'Automates marketplace settlements');
  EXCEPTION WHEN others THEN NULL; END;
  RETURN '4 installs, 3 requests, 3 connections, 5 sync jobs, 3 security alerts';
END $$;

-- ---------------------------------------------------------------- Orchestrator
-- Seeds every module for the caller's demo company. Each module runs in its own sub-transaction:
-- one failure is reported and leaves the other modules seeded.
CREATE OR REPLACE FUNCTION public.seed_demo_modules(_company_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid uuid := auth.uid();
  report jsonb := '{}'::jsonb;
  m text;
  result text;
  n record;
  i integer := 0;
  ctx text;
BEGIN
  IF uid IS NULL OR NOT public.has_company_permission(_company_id, 'demo.reset') THEN
    RAISE EXCEPTION 'Demo seed access denied' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = _company_id AND is_demo) THEN
    RAISE EXCEPTION 'Demo seed denied: company is not a demo company' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_company_id::text || ':demo-modules', 0));

  INSERT INTO public.organisation_features (company_id, feature_key, enabled)
  VALUES (_company_id, 'fixed_assets', true), (_company_id, 'basic_payroll', true)
  ON CONFLICT (company_id, feature_key) DO UPDATE SET enabled = true;
  -- Sample activity sits around today, so the surrounding months must be open for posting.
  PERFORM public.ensure_accounting_period_coverage(_company_id,
    make_date(CASE WHEN extract(month FROM current_date) >= 4 THEN extract(year FROM current_date)::int
                   ELSE extract(year FROM current_date)::int - 1 END, 4, 1),
    (date_trunc('month', current_date) + interval '3 months - 1 day')::date, 'Demo periods');

  FOREACH m IN ARRAY ARRAY['expenses', 'payroll', 'fixed_assets', 'budgets', 'tax', 'reports', 'products',
                           'accounting', 'files', 'accountant', 'contacts', 'firm', 'advisors', 'app_store'] LOOP
    BEGIN
      EXECUTE format('SELECT private.demo_seed_%s($1, $2)', m) INTO result USING _company_id, uid;
      report := report || jsonb_build_object(m, jsonb_build_object('ok', true, 'detail', result));
    EXCEPTION WHEN others THEN
      GET STACKED DIAGNOSTICS ctx = PG_EXCEPTION_CONTEXT;
      report := report || jsonb_build_object(m, jsonb_build_object('ok', false, 'detail', SQLERRM,
        'where', left(split_part(ctx, E'\n', 1), 200)));
    END;
  END LOOP;

  -- Smart Action Center builds its alerts from the seeded source data.
  BEGIN
    DELETE FROM public.action_notification_refresh_state WHERE company_id = _company_id;
    PERFORM public.refresh_action_notifications(_company_id);
    PERFORM public.refresh_my_contact_followups(_company_id);
    FOR n IN SELECT id FROM public.action_notifications
              WHERE company_id = _company_id AND recipient_user_id = uid ORDER BY created_at LIMIT 3 LOOP
      i := i + 1;
      PERFORM public.set_action_notification_state(n.id, true, CASE WHEN i = 3 THEN true ELSE NULL END);
    END LOOP;
    report := report || jsonb_build_object('action_center', jsonb_build_object('ok', true, 'detail',
      (SELECT count(*) FROM public.action_notifications WHERE company_id = _company_id AND recipient_user_id = uid)
      || ' alerts generated from demo data'));
  EXCEPTION WHEN others THEN
    report := report || jsonb_build_object('action_center', jsonb_build_object('ok', false, 'detail', SQLERRM));
  END;
  RETURN report;
END $$;

-- ---------------------------------------------------------------- grants
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'private.demo_acct(uuid, text, text, text, text, text)', 'private.demo_acct_id(uuid, text)',
    'private.demo_month_end(date)', 'private.reset_demo_module_data(uuid)',
    'private.demo_xline(date, text, text, uuid, uuid, bigint, bigint)', 'private.demo_xclaim(uuid, text, date, text, jsonb)',
    'private.demo_xv(uuid)', 'private.demo_xadvance(uuid, uuid, text)', 'private.demo_seed_expenses(uuid, uuid)',
    'private.demo_payroll_calc(uuid, uuid)', 'private.demo_payroll_run(uuid, uuid, date, date, text, uuid)',
    'private.demo_seed_payroll(uuid, uuid)', 'private.demo_post_journal(uuid, date, text, text, jsonb)',
    'private.demo_seed_fixed_assets(uuid, uuid)', 'private.demo_seed_budgets(uuid, uuid)', 'private.demo_seed_tax(uuid, uuid)',
    'private.demo_seed_reports(uuid, uuid)', 'private.demo_seed_products(uuid, uuid)', 'private.demo_seed_accounting(uuid, uuid)',
    'private.demo_inline_file(uuid, text, uuid, uuid, text, text, text, interval)', 'private.demo_seed_files(uuid, uuid)',
    'private.demo_gl_balance(uuid, uuid, date)', 'private.demo_seed_accountant(uuid, uuid)', 'private.demo_seed_contacts(uuid, uuid)',
    'private.demo_seed_firm(uuid, uuid)', 'private.demo_seed_advisors(uuid, uuid)', 'private.demo_seed_app_store(uuid, uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', f);
    EXCEPTION WHEN undefined_object THEN NULL; END;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.seed_demo_modules(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_demo_modules(uuid) TO authenticated;
