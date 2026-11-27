INSERT INTO auth.users(id) VALUES
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002'),
  ('00000000-0000-4000-8000-000000000003')
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION private.expense_user_has_active_delegation(uuid, uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;

ALTER TABLE public.expense_management_settings
  ADD COLUMN version integer NOT NULL DEFAULT 0,
  ADD COLUMN created_by uuid REFERENCES auth.users(id),
  ADD COLUMN updated_by uuid REFERENCES auth.users(id),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.expense_claims
  ADD COLUMN claimant_user_id uuid REFERENCES auth.users(id),
  ADD COLUMN approved_at timestamptz,
  ADD COLUMN approved_by uuid REFERENCES auth.users(id),
  ADD COLUMN submitted_at timestamptz;

CREATE TABLE public.expense_claim_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  claim_id uuid NOT NULL REFERENCES public.expense_claims(id),
  approver_user_id uuid NOT NULL REFERENCES auth.users(id),
  step_no integer NOT NULL CHECK (step_no > 0),
  note text,
  acted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (claim_id, approver_user_id),
  UNIQUE (claim_id, step_no)
);

CREATE OR REPLACE FUNCTION private.expense_claim_event(
  uuid, uuid, text, text, text, text, text, jsonb DEFAULT '{}'::jsonb
) RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$;

CREATE OR REPLACE FUNCTION private.expense_claim_json(public.expense_claims)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'id', ($1).id,
    'approval_status', ($1).approval_status,
    'posting_status', ($1).posting_status,
    'reimbursement_status', ($1).reimbursement_status,
    'version', ($1).version
  )
$$;
