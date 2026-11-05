-- Isolated PostgreSQL 17 substrate for the real correction approval migration.
-- Ledger preview and posting are deterministic stubs; the approval, RLS and
-- database trigger logic are the actual migration under test.
CREATE SCHEMA auth;
CREATE SCHEMA private;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
GRANT USAGE ON SCHEMA public, auth, private TO authenticated, anon;

CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE TABLE public.companies(id uuid PRIMARY KEY);
CREATE TABLE public.role_permissions(
  role text NOT NULL, permission text NOT NULL,
  PRIMARY KEY(role, permission)
);
CREATE TABLE public.test_permissions(
  company_id uuid NOT NULL, user_id uuid NOT NULL, permission text NOT NULL
);
CREATE TABLE public.accounts(id uuid PRIMARY KEY, company_id uuid NOT NULL);
CREATE TABLE public.accounting_periods(id uuid PRIMARY KEY, company_id uuid NOT NULL);
CREATE TABLE public.organisation_lock_policy(company_id uuid PRIMARY KEY);

CREATE TABLE public.transaction_correction_batches(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  request_key uuid NOT NULL, request_hash text NOT NULL,
  preview_hash text NOT NULL, plan jsonb NOT NULL, created_by uuid NOT NULL,
  UNIQUE(company_id, request_key)
);
CREATE TABLE public.test_audit_events(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL, action text NOT NULL, entity_id uuid NOT NULL
);

CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE FUNCTION private.mfa_requirement_met() RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT current_setting('test.mfa', true) = 'on'
$$;
CREATE FUNCTION public.has_company_permission(_company_id uuid, _permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.test_permissions
    WHERE company_id = _company_id AND user_id = auth.uid()
      AND permission = _permission
  )
$$;
CREATE FUNCTION public.record_audit_event(
  _company_id uuid, _action text, _entity_type text, _entity_id uuid, _details jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.test_audit_events(company_id, action, entity_id)
  VALUES (_company_id, _action, _entity_id);
END $$;

CREATE FUNCTION private.correction_plan(
  _company_id uuid, _items jsonb, _target_id uuid,
  _mode text, _date date, _reason text
) RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'company_id', _company_id, 'target', jsonb_build_object(
      'id', _target_id, 'code', '6500', 'name', 'Corrected account'
    ), 'rows', jsonb_build_array(jsonb_build_object(
      'id', '40000000-0000-4000-8000-000000000001',
      'journal_id', '30000000-0000-4000-8000-000000000001',
      'posting_date', '2026-10-31',
      'debit_minor', '10000', 'credit_minor', '0'
    )), 'currency', 'GBP', 'gross_minor', '10000',
    'line_count', 1, 'journal_count', 1,
    'date_mode', _mode, 'adjustment_date', _date, 'reason', trim(_reason)
  )
$$;

-- SECURITY DEFINER simulates the existing authorised apply RPC's insertion.
-- The new production AFTER INSERT trigger is still exercised unchanged.
CREATE FUNCTION public.test_apply_correction(
  _company_id uuid, _request_key uuid, _request_hash text, _preview_hash text,
  _plan jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _batch_id uuid;
BEGIN
  INSERT INTO public.transaction_correction_batches(
    company_id, request_key, request_hash, preview_hash, plan, created_by
  ) VALUES (
    _company_id, _request_key, _request_hash, _preview_hash, _plan, auth.uid()
  ) RETURNING id INTO _batch_id;
  RETURN _batch_id;
END $$;
GRANT EXECUTE ON FUNCTION public.test_apply_correction(uuid,uuid,text,text,jsonb)
  TO authenticated;

INSERT INTO auth.users(id) VALUES
('00000000-0000-4000-8000-000000000001'),
('00000000-0000-4000-8000-000000000002'),
('00000000-0000-4000-8000-000000000003');
INSERT INTO public.companies(id) VALUES
('10000000-0000-4000-8000-000000000001'),
('10000000-0000-4000-8000-000000000002');
INSERT INTO public.accounts(id, company_id) VALUES
('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001');
INSERT INTO public.accounting_periods(id, company_id) VALUES
('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001');
INSERT INTO public.organisation_lock_policy(company_id) VALUES
('10000000-0000-4000-8000-000000000001');

INSERT INTO public.test_permissions(company_id,user_id,permission) VALUES
('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','accounting.view'),
('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','accounting.post'),
('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','journals.manual'),
('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','journals.approve'),
('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','company.settings.edit'),
('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','accounting.view'),
('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','journals.approve'),
('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','accounting.view'),
('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','journals.approve');

GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
GRANT EXECUTE ON FUNCTION private.mfa_requirement_met() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_company_permission(uuid,text) TO authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;
