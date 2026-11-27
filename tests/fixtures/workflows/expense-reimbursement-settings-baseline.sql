ALTER TYPE public.journal_source_type ADD VALUE IF NOT EXISTS 'expense';

CREATE TABLE public.expense_claims (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  claim_number text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  approval_status text NOT NULL,
  payment_source text NOT NULL,
  posting_status text NOT NULL,
  posted_journal_id uuid,
  reimbursement_channel text,
  reimbursement_status text NOT NULL,
  reimbursement_journal_id uuid,
  reimbursable_minor bigint,
  total_minor bigint NOT NULL,
  reimbursed_minor bigint NOT NULL DEFAULT 0,
  reimbursement_currency char(3) NOT NULL,
  updated_by uuid,
  updated_at timestamptz
);

CREATE TABLE public.expense_claim_reimbursement_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  claim_id uuid NOT NULL REFERENCES public.expense_claims(id),
  amount_minor bigint NOT NULL,
  payment_date date NOT NULL,
  bank_account_id uuid,
  journal_id uuid REFERENCES public.journals(id),
  channel text NOT NULL,
  note text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION private.expense_claim_json(public.expense_claims)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$ SELECT to_jsonb($1) $$;

CREATE OR REPLACE FUNCTION private.expense_claim_event(
  uuid, uuid, text, text, text, text, text, jsonb
) RETURNS void LANGUAGE sql AS $$ SELECT $$;

CREATE OR REPLACE FUNCTION public.sales_is_deposit_account(uuid, uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;

INSERT INTO public.test_permissions(company_id, user_id, permission)
VALUES
  ('10000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000001','expenses.reimburse'),
  ('10000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000001','accounting.post');

INSERT INTO public.accounts(id, company_id, code, account_type)
VALUES
  ('20000000-0000-4000-8000-000000000013','10000000-0000-4000-8000-000000000013','2200','liability'),
  ('20000000-0000-4000-8000-000000000014','10000000-0000-4000-8000-000000000013','1010','asset');

INSERT INTO public.accounting_periods(company_id, start_date, end_date, status)
VALUES ('10000000-0000-4000-8000-000000000013','2026-01-01','2027-12-31','open');

INSERT INTO public.expense_management_settings(company_id, employee_payable_account_id)
VALUES ('10000000-0000-4000-8000-000000000013','20000000-0000-4000-8000-000000000013');

INSERT INTO public.expense_claims(
  id, company_id, claim_number, version, approval_status, payment_source,
  posting_status, posted_journal_id, reimbursement_status, reimbursable_minor,
  total_minor, reimbursement_currency
) VALUES (
  '40000000-0000-4000-8000-000000000013',
  '10000000-0000-4000-8000-000000000013', 'REIMB-SETTINGS-1', 1, 'approved',
  'employee_paid', 'posted', '50000000-0000-4000-8000-000000000013',
  'eligible', 12345, 12345, 'GBP'
);
