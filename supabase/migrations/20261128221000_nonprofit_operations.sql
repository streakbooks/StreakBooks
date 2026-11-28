-- Nonprofit donations, grants, funds movements, registers, portals and reports.
-- Depends on 20261128220000. Still posts only through nonprofit_post_balanced / post_journal.

CREATE TABLE IF NOT EXISTS public.nonprofit_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  fund_id UUID NOT NULL REFERENCES public.nonprofit_funds(id) ON DELETE RESTRICT,
  grantor_name TEXT NOT NULL,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  grant_kind TEXT NOT NULL CHECK (grant_kind IN (
    'government', 'private', 'foundation', 'corporate', 'international', 'research', 'capital', 'programme', 'reimbursement', 'matching'
  )),
  conditional BOOLEAN NOT NULL DEFAULT true,
  award_minor BIGINT NOT NULL CHECK (award_minor > 0),
  currency_code CHAR(3) NOT NULL,
  eligible_categories TEXT[] NOT NULL DEFAULT '{}',
  indirect_cost_bps INTEGER CHECK (indirect_cost_bps IS NULL OR indirect_cost_bps BETWEEN 0 AND 10000),
  received_minor BIGINT NOT NULL DEFAULT 0 CHECK (received_minor >= 0),
  recognised_minor BIGINT NOT NULL DEFAULT 0 CHECK (recognised_minor >= 0),
  spent_minor BIGINT NOT NULL DEFAULT 0 CHECK (spent_minor >= 0),
  conditions_met BOOLEAN NOT NULL DEFAULT false,
  conditions_met_by UUID,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'rejected')),
  starts_on DATE,
  ends_on DATE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);

CREATE TABLE IF NOT EXISTS public.nonprofit_grant_funding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  grant_id UUID NOT NULL REFERENCES public.nonprofit_grants(id) ON DELETE CASCADE,
  received_on DATE NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  kind TEXT NOT NULL CHECK (kind IN ('advance', 'recognition', 'refund')),
  journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.nonprofit_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  fund_id UUID REFERENCES public.nonprofit_funds(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  target_minor BIGINT NOT NULL DEFAULT 0 CHECK (target_minor >= 0),
  starts_on DATE,
  ends_on DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.nonprofit_programmes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  fund_id UUID REFERENCES public.nonprofit_funds(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  objective TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.nonprofit_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  programme_id UUID REFERENCES public.nonprofit_programmes(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.nonprofit_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  fund_id UUID NOT NULL REFERENCES public.nonprofit_funds(id) ON DELETE RESTRICT,
  grant_id UUID REFERENCES public.nonprofit_grants(id) ON DELETE RESTRICT,
  programme_id UUID REFERENCES public.nonprofit_programmes(id) ON DELETE SET NULL,
  spent_on DATE NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency_code CHAR(3) NOT NULL,
  fx_rate_to_base NUMERIC(18, 8) NOT NULL DEFAULT 1 CHECK (fx_rate_to_base > 0),
  functional_class TEXT NOT NULL CHECK (functional_class IN ('programme', 'administration', 'fundraising')),
  category TEXT NOT NULL,
  payee TEXT,
  status TEXT NOT NULL CHECK (status IN ('posted', 'rejected')),
  rejection_reason TEXT,
  allocated_minor BIGINT NOT NULL DEFAULT 0 CHECK (allocated_minor >= 0),
  journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.nonprofit_expense_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  expense_id UUID NOT NULL REFERENCES public.nonprofit_expenses(id) ON DELETE CASCADE,
  functional_class TEXT NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.nonprofit_commitments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  fund_id UUID NOT NULL REFERENCES public.nonprofit_funds(id) ON DELETE RESTRICT,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'relieved', 'cancelled')),
  source_type TEXT NOT NULL,
  source_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.nonprofit_beneficiaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  eligibility_status TEXT NOT NULL DEFAULT 'pending' CHECK (eligibility_status IN ('pending', 'eligible', 'ineligible')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.nonprofit_assistance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  beneficiary_id UUID NOT NULL REFERENCES public.nonprofit_beneficiaries(id) ON DELETE RESTRICT,
  request_kind TEXT NOT NULL CHECK (request_kind IN ('financial', 'non_financial')),
  amount_minor BIGINT NOT NULL DEFAULT 0 CHECK (amount_minor >= 0),
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'rejected', 'disbursed')),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.nonprofit_disbursements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  assistance_id UUID REFERENCES public.nonprofit_assistance(id) ON DELETE SET NULL,
  fund_id UUID NOT NULL REFERENCES public.nonprofit_funds(id) ON DELETE RESTRICT,
  beneficiary_id UUID NOT NULL REFERENCES public.nonprofit_beneficiaries(id) ON DELETE RESTRICT,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  requested_by UUID NOT NULL,
  approved_by UUID,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'rejected')),
  journal_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.nonprofit_volunteers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.nonprofit_volunteer_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  volunteer_id UUID NOT NULL REFERENCES public.nonprofit_volunteers(id) ON DELETE CASCADE,
  worked_on DATE NOT NULL,
  hours NUMERIC(8, 2) NOT NULL CHECK (hours > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.nonprofit_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'lapsed')),
  renewal_on DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.nonprofit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  event_on DATE,
  status TEXT NOT NULL DEFAULT 'planned',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.nonprofit_sponsorships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sponsor_name TEXT NOT NULL,
  amount_minor BIGINT NOT NULL DEFAULT 0 CHECK (amount_minor >= 0),
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.nonprofit_board_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  office TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.nonprofit_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  met_on DATE NOT NULL,
  minutes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.nonprofit_resolutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.nonprofit_compliance_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  pack_id TEXT NOT NULL,
  title TEXT NOT NULL,
  due_on DATE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.nonprofit_portal_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  portal_role TEXT NOT NULL CHECK (portal_role IN ('donor', 'volunteer', 'member', 'grantor')),
  donor_id UUID REFERENCES public.nonprofit_donors(id) ON DELETE CASCADE,
  volunteer_id UUID REFERENCES public.nonprofit_volunteers(id) ON DELETE CASCADE,
  membership_id UUID REFERENCES public.nonprofit_memberships(id) ON DELETE CASCADE,
  grant_id UUID REFERENCES public.nonprofit_grants(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id, portal_role)
);

CREATE TABLE IF NOT EXISTS public.nonprofit_gateway_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  gateway TEXT NOT NULL,
  event_id TEXT NOT NULL,
  donation_id UUID REFERENCES public.nonprofit_donations(id) ON DELETE SET NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, gateway, event_id)
);

CREATE TABLE IF NOT EXISTS public.nonprofit_recurring_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  donor_id UUID NOT NULL REFERENCES public.nonprofit_donors(id) ON DELETE RESTRICT,
  fund_id UUID NOT NULL REFERENCES public.nonprofit_funds(id) ON DELETE RESTRICT,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  method TEXT NOT NULL,
  next_on DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'ended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.nonprofit_fund_restricted(_company_id UUID, _fund_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT restriction IN ('donor_restricted', 'temporarily_restricted', 'perpetually_restricted')
  FROM public.nonprofit_funds
  WHERE id = _fund_id AND company_id = _company_id
$$;

CREATE OR REPLACE FUNCTION public.nonprofit_assert_spendable(
  _company_id UUID,
  _fund_id UUID,
  _on DATE,
  _amount BIGINT
) RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _restriction TEXT;
  _category TEXT;
  _allow BOOLEAN;
  _available BIGINT;
BEGIN
  SELECT restriction, category INTO _restriction, _category
  FROM public.nonprofit_funds
  WHERE id = _fund_id AND company_id = _company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fund is not in this organisation';
  END IF;
  SELECT allow_unrestricted_deficit INTO _allow
  FROM public.nonprofit_settings WHERE company_id = _company_id;
  IF _restriction = 'unrestricted' AND _category <> 'endowment' AND COALESCE(_allow, false) THEN
    RETURN;
  END IF;
  _available := public.nonprofit_fund_spendable(_company_id, _fund_id, _on);
  IF _available < _amount THEN
    RAISE EXCEPTION 'Fund does not have % available (available %)', _amount, _available;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.nonprofit_submit_donation(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _existing public.nonprofit_donations;
  _id UUID;
  _amount BIGINT;
  _fee BIGINT;
  _sum BIGINT := 0;
  _lines JSONB := '[]'::JSONB;
  _assigned BIGINT := 0;
  _idx INTEGER := 0;
  _count INTEGER;
  _alloc JSONB;
  _fund UUID;
  _part BIGINT;
  _share BIGINT;
  _net BIGINT;
  _in_kind TEXT;
  _conditional BOOLEAN;
  _credit TEXT;
  _journal UUID;
  _wording TEXT;
BEGIN
  PERFORM public.nonprofit_require(_company_id, 'nonprofit.donations.manage');
  PERFORM public.nonprofit_enabled(_company_id);
  SELECT * INTO _existing FROM public.nonprofit_donations
  WHERE company_id = _company_id AND idempotency_key = NULLIF(_payload->>'idempotency_key', '');
  IF FOUND THEN
    RETURN jsonb_build_object('id', _existing.id, 'journal_id', _existing.journal_id, 'status', _existing.status, 'replayed', true);
  END IF;
  _amount := (_payload->>'amount_minor')::BIGINT;
  _fee := COALESCE((_payload->>'fee_minor')::BIGINT, 0);
  _conditional := COALESCE((_payload->>'conditional')::BOOLEAN, false);
  _in_kind := COALESCE(NULLIF(_payload->>'in_kind', ''), 'none');
  IF _amount IS NULL OR _amount <= 0 OR _fee < 0 OR _fee > _amount THEN
    RAISE EXCEPTION 'Donation amount is invalid';
  END IF;
  IF _in_kind <> 'none' AND _fee <> 0 THEN
    RAISE EXCEPTION 'In-kind donations cannot include a gateway fee';
  END IF;
  IF NULLIF(_payload->>'idempotency_key', '') IS NULL THEN
    RAISE EXCEPTION 'idempotency_key is required';
  END IF;
  IF jsonb_typeof(_payload->'allocations') <> 'array' OR jsonb_array_length(_payload->'allocations') < 1 THEN
    RAISE EXCEPTION 'A donation needs at least one fund allocation';
  END IF;
  FOR _alloc IN SELECT value FROM jsonb_array_elements(_payload->'allocations') LOOP
    _sum := _sum + COALESCE((_alloc->>'amount_minor')::BIGINT, 0);
  END LOOP;
  IF _sum <> _amount THEN
    RAISE EXCEPTION 'Fund allocations must equal the donation';
  END IF;

  INSERT INTO public.nonprofit_donations (
    company_id, donor_id, donation_number, donated_on, currency_code, fx_rate_to_base,
    amount_minor, fee_minor, method, conditional, in_kind, campaign_id, programme_id,
    anonymous, status, idempotency_key, memo, created_by
  ) VALUES (
    _company_id,
    NULLIF(_payload->>'donor_id', '')::UUID,
    public.nonprofit_next_number(_company_id, 'donation', 'DON-'),
    (_payload->>'donated_on')::DATE,
    upper(_payload->>'currency_code'),
    COALESCE((_payload->>'fx_rate_to_base')::NUMERIC, 1),
    _amount, _fee,
    COALESCE(NULLIF(_payload->>'method', ''), 'bank_transfer'),
    _conditional, _in_kind,
    NULLIF(_payload->>'campaign_id', '')::UUID,
    NULLIF(_payload->>'programme_id', '')::UUID,
    COALESCE((_payload->>'anonymous')::BOOLEAN, false),
    CASE WHEN _in_kind = 'services' THEN 'not_recognised' ELSE 'posted' END,
    _payload->>'idempotency_key',
    NULLIF(_payload->>'memo', ''),
    auth.uid()
  ) RETURNING id INTO _id;

  _count := jsonb_array_length(_payload->'allocations');
  FOR _alloc IN SELECT value FROM jsonb_array_elements(_payload->'allocations') LOOP
    _idx := _idx + 1;
    _fund := (_alloc->>'fund_id')::UUID;
    _part := (_alloc->>'amount_minor')::BIGINT;
    IF NOT EXISTS (SELECT 1 FROM public.nonprofit_funds WHERE id = _fund AND company_id = _company_id) THEN
      RAISE EXCEPTION 'Fund is not in this organisation';
    END IF;
    INSERT INTO public.nonprofit_donation_allocations (company_id, donation_id, fund_id, amount_minor)
    VALUES (_company_id, _id, _fund, _part);
    IF _idx = _count THEN _share := _fee - _assigned; ELSE _share := (_fee * _part) / _amount; _assigned := _assigned + _share; END IF;
    _net := _part - _share;
    _credit := CASE
      WHEN _conditional THEN 'refundable_advance'
      WHEN public.nonprofit_fund_restricted(_company_id, _fund) THEN 'restricted_contribution_revenue'
      ELSE 'contribution_revenue'
    END;
    IF _in_kind = 'services' THEN
      CONTINUE;
    ELSIF _in_kind = 'inventory' THEN
      _lines := _lines || jsonb_build_array(jsonb_build_object('fund_id', _fund, 'account_id', public.nonprofit_mapped_account(_company_id, 'inventory'), 'debit_minor', _part, 'credit_minor', 0, 'description', 'Donated inventory'));
    ELSIF _in_kind = 'fixed_asset' THEN
      _lines := _lines || jsonb_build_array(jsonb_build_object('fund_id', _fund, 'account_id', public.nonprofit_mapped_account(_company_id, 'fixed_asset'), 'debit_minor', _part, 'credit_minor', 0, 'description', 'Donated asset'));
    ELSE
      IF _net > 0 THEN
        _lines := _lines || jsonb_build_array(jsonb_build_object('fund_id', _fund, 'account_id', public.nonprofit_mapped_account(_company_id, 'bank'), 'debit_minor', _net, 'credit_minor', 0, 'description', 'Donation received'));
      END IF;
      IF _share > 0 THEN
        _lines := _lines || jsonb_build_array(jsonb_build_object('fund_id', _fund, 'account_id', public.nonprofit_mapped_account(_company_id, 'processing_fee'), 'debit_minor', _share, 'credit_minor', 0, 'description', 'Payment processing fee'));
      END IF;
    END IF;
    _lines := _lines || jsonb_build_array(jsonb_build_object(
      'fund_id', _fund,
      'account_id', public.nonprofit_mapped_account(_company_id, _credit),
      'debit_minor', 0,
      'credit_minor', _part,
      'description', CASE WHEN _conditional THEN 'Conditional contribution' ELSE 'Contribution' END
    ));
  END LOOP;

  IF _in_kind = 'services' THEN
    RETURN jsonb_build_object('id', _id, 'journal_id', NULL, 'status', 'not_recognised', 'replayed', false);
  END IF;

  _journal := public.nonprofit_post_balanced(
    _company_id, 'nonprofit_donation', _id, (_payload->>'donated_on')::DATE,
    COALESCE(NULLIF(_payload->>'memo', ''), 'Donation'),
    upper(_payload->>'currency_code'),
    COALESCE((_payload->>'fx_rate_to_base')::NUMERIC, 1),
    'np-donation-' || _id::TEXT,
    _lines
  );
  UPDATE public.nonprofit_donations SET journal_id = _journal WHERE id = _id;
  _wording := 'This receipt records a contribution received by the organisation. Tax treatment depends on the donor''s jurisdiction and the organisation''s registrations. This document is not a government filing.';
  IF _conditional THEN
    _wording := _wording || ' The amount is conditional and has not been recognised as revenue.';
  END IF;
  INSERT INTO public.nonprofit_receipts (
    company_id, donation_id, donor_id, receipt_number, issued_on, amount_minor, currency_code, wording
  ) VALUES (
    _company_id, _id, NULLIF(_payload->>'donor_id', '')::UUID,
    public.nonprofit_next_number(_company_id, 'receipt', 'RCP-'),
    (_payload->>'donated_on')::DATE, _amount, upper(_payload->>'currency_code'), _wording
  );
  RETURN jsonb_build_object('id', _id, 'journal_id', _journal, 'status', 'posted', 'replayed', false);
EXCEPTION WHEN unique_violation THEN
  SELECT * INTO _existing FROM public.nonprofit_donations
  WHERE company_id = _company_id AND idempotency_key = _payload->>'idempotency_key';
  IF FOUND THEN
    RETURN jsonb_build_object('id', _existing.id, 'journal_id', _existing.journal_id, 'status', _existing.status, 'replayed', true);
  END IF;
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.nonprofit_refund_donation(
  _company_id UUID,
  _donation_id UUID,
  _on DATE,
  _chargeback_fee_minor BIGINT DEFAULT 0
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _donation public.nonprofit_donations;
  _lines JSONB;
  _journal UUID;
BEGIN
  PERFORM public.nonprofit_require(_company_id, 'nonprofit.reverse');
  IF _chargeback_fee_minor IS NULL OR _chargeback_fee_minor < 0 THEN
    RAISE EXCEPTION 'Chargeback fee is invalid';
  END IF;
  SELECT * INTO _donation FROM public.nonprofit_donations
  WHERE id = _donation_id AND company_id = _company_id AND status = 'posted' AND journal_id IS NOT NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Posted donation was not found';
  END IF;
  SELECT jsonb_agg(jsonb_build_object(
    'fund_id', t.fund_id,
    'account_id', jl.account_id,
    'debit_minor', jl.credit_minor,
    'credit_minor', jl.debit_minor,
    'description', 'Reversal'
  ) ORDER BY jl.line_no) INTO _lines
  FROM public.journal_lines jl
  JOIN public.nonprofit_fund_tags t ON t.journal_line_id = jl.id
  WHERE jl.journal_id = _donation.journal_id;
  IF _chargeback_fee_minor > 0 THEN
    _lines := _lines || jsonb_build_array(
      jsonb_build_object(
        'fund_id', (SELECT fund_id FROM public.nonprofit_donation_allocations WHERE donation_id = _donation_id ORDER BY amount_minor DESC LIMIT 1),
        'account_id', public.nonprofit_mapped_account(_company_id, 'processing_fee'),
        'debit_minor', _chargeback_fee_minor, 'credit_minor', 0, 'description', 'Chargeback fee'
      ),
      jsonb_build_object(
        'fund_id', (SELECT fund_id FROM public.nonprofit_donation_allocations WHERE donation_id = _donation_id ORDER BY amount_minor DESC LIMIT 1),
        'account_id', public.nonprofit_mapped_account(_company_id, 'bank'),
        'debit_minor', 0, 'credit_minor', _chargeback_fee_minor, 'description', 'Chargeback fee settled'
      )
    );
  END IF;
  _journal := public.nonprofit_post_balanced(
    _company_id, 'nonprofit_refund', _donation_id, _on, 'Donation refund',
    _donation.currency_code, _donation.fx_rate_to_base,
    'np-refund-' || _donation_id::TEXT || '-' || _chargeback_fee_minor::TEXT,
    _lines
  );
  UPDATE public.nonprofit_donations SET status = 'refunded' WHERE id = _donation_id;
  RETURN jsonb_build_object('journal_id', _journal, 'status', 'refunded');
END;
$$;

CREATE OR REPLACE FUNCTION public.nonprofit_create_pledge(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
  _unconditional BOOLEAN;
  _journal UUID;
  _amount BIGINT;
  _fund UUID;
BEGIN
  PERFORM public.nonprofit_require(_company_id, 'nonprofit.donations.manage');
  PERFORM public.nonprofit_enabled(_company_id);
  _unconditional := COALESCE((_payload->>'unconditional')::BOOLEAN, false);
  _amount := (_payload->>'amount_minor')::BIGINT;
  _fund := (_payload->>'fund_id')::UUID;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Pledge amount is invalid'; END IF;
  INSERT INTO public.nonprofit_pledges (
    company_id, donor_id, fund_id, pledge_number, pledged_on, amount_minor, currency_code,
    fx_rate_to_base, unconditional, restricted, status, created_by
  ) VALUES (
    _company_id, (_payload->>'donor_id')::UUID, _fund,
    public.nonprofit_next_number(_company_id, 'pledge', 'PLN-'),
    (_payload->>'pledged_on')::DATE, _amount, upper(_payload->>'currency_code'),
    COALESCE((_payload->>'fx_rate_to_base')::NUMERIC, 1),
    _unconditional,
    public.nonprofit_fund_restricted(_company_id, _fund),
    CASE WHEN _unconditional THEN 'open' ELSE 'conditional' END,
    auth.uid()
  ) RETURNING id INTO _id;
  IF NOT _unconditional THEN
    RETURN jsonb_build_object('id', _id, 'status', 'conditional', 'journal_id', NULL);
  END IF;
  _journal := public.nonprofit_post_balanced(
    _company_id, 'nonprofit_pledge', _id, (_payload->>'pledged_on')::DATE, 'Unconditional pledge',
    upper(_payload->>'currency_code'), COALESCE((_payload->>'fx_rate_to_base')::NUMERIC, 1),
    'np-pledge-' || _id::TEXT,
    jsonb_build_array(
      jsonb_build_object('fund_id', _fund, 'account_id', public.nonprofit_mapped_account(_company_id, 'contributions_receivable'), 'debit_minor', _amount, 'credit_minor', 0, 'description', 'Pledge receivable'),
      jsonb_build_object('fund_id', _fund, 'account_id', public.nonprofit_mapped_account(_company_id, CASE WHEN public.nonprofit_fund_restricted(_company_id, _fund) THEN 'restricted_contribution_revenue' ELSE 'contribution_revenue' END), 'debit_minor', 0, 'credit_minor', _amount, 'description', 'Pledge contribution')
    )
  );
  UPDATE public.nonprofit_pledges
  SET journal_id = _journal, recognised_minor = _amount, status = 'recognised'
  WHERE id = _id;
  RETURN jsonb_build_object('id', _id, 'status', 'recognised', 'journal_id', _journal);
END;
$$;

CREATE OR REPLACE FUNCTION public.nonprofit_collect_pledge(_company_id UUID, _pledge_id UUID, _amount BIGINT, _on DATE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pledge public.nonprofit_pledges;
  _journal UUID;
BEGIN
  PERFORM public.nonprofit_require(_company_id, 'nonprofit.post');
  SELECT * INTO _pledge FROM public.nonprofit_pledges
  WHERE id = _pledge_id AND company_id = _company_id AND unconditional AND recognised_minor > 0;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recognisable pledge was not found'; END IF;
  IF _amount <= 0 OR _amount > (_pledge.recognised_minor - _pledge.collected_minor - _pledge.impaired_minor) THEN
    RAISE EXCEPTION 'Collection exceeds the outstanding pledge';
  END IF;
  _journal := public.nonprofit_post_balanced(
    _company_id, 'nonprofit_pledge', _pledge_id, _on, 'Pledge collection',
    _pledge.currency_code, _pledge.fx_rate_to_base,
    'np-pledge-collect-' || _pledge_id::TEXT || '-' || (_pledge.collected_minor + _amount)::TEXT,
    jsonb_build_array(
      jsonb_build_object('fund_id', _pledge.fund_id, 'account_id', public.nonprofit_mapped_account(_company_id, 'bank'), 'debit_minor', _amount, 'credit_minor', 0, 'description', 'Pledge collected'),
      jsonb_build_object('fund_id', _pledge.fund_id, 'account_id', public.nonprofit_mapped_account(_company_id, 'contributions_receivable'), 'debit_minor', 0, 'credit_minor', _amount, 'description', 'Pledge settled')
    )
  );
  UPDATE public.nonprofit_pledges
  SET collected_minor = collected_minor + _amount,
      status = CASE WHEN collected_minor + _amount + impaired_minor >= recognised_minor THEN 'collected' ELSE status END
  WHERE id = _pledge_id;
  RETURN jsonb_build_object('journal_id', _journal);
END;
$$;

CREATE OR REPLACE FUNCTION public.nonprofit_create_grant(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
BEGIN
  PERFORM public.nonprofit_require(_company_id, 'nonprofit.grants.approve');
  PERFORM public.nonprofit_enabled(_company_id);
  INSERT INTO public.nonprofit_grants (
    company_id, fund_id, grantor_name, code, title, grant_kind, conditional, award_minor,
    currency_code, eligible_categories, indirect_cost_bps, starts_on, ends_on, created_by
  ) VALUES (
    _company_id, (_payload->>'fund_id')::UUID, trim(_payload->>'grantor_name'),
    upper(trim(_payload->>'code')), trim(_payload->>'title'), _payload->>'grant_kind',
    COALESCE((_payload->>'conditional')::BOOLEAN, true), (_payload->>'award_minor')::BIGINT,
    upper(_payload->>'currency_code'),
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(_payload->'eligible_categories', '[]'::JSONB))), '{}'),
    NULLIF(_payload->>'indirect_cost_bps', '')::INTEGER,
    NULLIF(_payload->>'starts_on', '')::DATE, NULLIF(_payload->>'ends_on', '')::DATE, auth.uid()
  ) RETURNING id INTO _id;
  RETURN jsonb_build_object('id', _id, 'recognised_minor', 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.nonprofit_receive_grant(_company_id UUID, _grant_id UUID, _amount BIGINT, _on DATE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _grant public.nonprofit_grants;
  _journal UUID;
  _role TEXT;
BEGIN
  PERFORM public.nonprofit_require(_company_id, 'nonprofit.post');
  SELECT * INTO _grant FROM public.nonprofit_grants
  WHERE id = _grant_id AND company_id = _company_id AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Active grant was not found'; END IF;
  IF _amount <= 0 OR _grant.received_minor + _amount > _grant.award_minor THEN
    RAISE EXCEPTION 'Grant funding exceeds the award';
  END IF;
  _role := CASE WHEN _grant.conditional THEN 'refundable_advance' ELSE 'grant_revenue' END;
  _journal := public.nonprofit_post_balanced(
    _company_id, 'nonprofit_grant', _grant_id, _on, 'Grant funding',
    _grant.currency_code, 1,
    'np-grant-fund-' || _grant_id::TEXT || '-' || (_grant.received_minor + _amount)::TEXT,
    jsonb_build_array(
      jsonb_build_object('fund_id', _grant.fund_id, 'account_id', public.nonprofit_mapped_account(_company_id, 'bank'), 'debit_minor', _amount, 'credit_minor', 0, 'description', 'Grant funding'),
      jsonb_build_object('fund_id', _grant.fund_id, 'account_id', public.nonprofit_mapped_account(_company_id, _role), 'debit_minor', 0, 'credit_minor', _amount, 'description', _role)
    )
  );
  UPDATE public.nonprofit_grants
  SET received_minor = received_minor + _amount,
      recognised_minor = recognised_minor + CASE WHEN conditional THEN 0 ELSE _amount END
  WHERE id = _grant_id;
  INSERT INTO public.nonprofit_grant_funding (company_id, grant_id, received_on, amount_minor, kind, journal_id, created_by)
  VALUES (_company_id, _grant_id, _on, _amount, CASE WHEN _grant.conditional THEN 'advance' ELSE 'recognition' END, _journal, auth.uid());
  RETURN jsonb_build_object('journal_id', _journal, 'recognised', NOT _grant.conditional);
END;
$$;

CREATE OR REPLACE FUNCTION public.nonprofit_satisfy_grant(_company_id UUID, _grant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.nonprofit_require(_company_id, 'nonprofit.grants.approve');
  UPDATE public.nonprofit_grants
  SET conditions_met = true, conditions_met_by = auth.uid()
  WHERE id = _grant_id AND company_id = _company_id AND conditional AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Conditional grant was not found'; END IF;
  RETURN jsonb_build_object('id', _grant_id, 'conditions_met', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.nonprofit_recognise_grant(_company_id UUID, _grant_id UUID, _amount BIGINT, _on DATE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _grant public.nonprofit_grants;
  _seg BOOLEAN;
  _journal UUID;
BEGIN
  PERFORM public.nonprofit_require(_company_id, 'nonprofit.post');
  SELECT * INTO _grant FROM public.nonprofit_grants
  WHERE id = _grant_id AND company_id = _company_id AND conditional AND conditions_met AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Grant revenue cannot be recognised until conditions are satisfied';
  END IF;
  SELECT enforce_segregation INTO _seg FROM public.nonprofit_settings WHERE company_id = _company_id;
  IF COALESCE(_seg, false) AND _grant.conditions_met_by = auth.uid() THEN
    RAISE EXCEPTION 'The person who confirmed the conditions cannot recognise the revenue';
  END IF;
  IF _amount <= 0 OR _amount > (_grant.received_minor - _grant.recognised_minor) THEN
    RAISE EXCEPTION 'Recognition exceeds unrecognised grant funding';
  END IF;
  _journal := public.nonprofit_post_balanced(
    _company_id, 'nonprofit_grant', _grant_id, _on, 'Grant conditions satisfied',
    _grant.currency_code, 1,
    'np-grant-rev-' || _grant_id::TEXT || '-' || (_grant.recognised_minor + _amount)::TEXT,
    jsonb_build_array(
      jsonb_build_object('fund_id', _grant.fund_id, 'account_id', public.nonprofit_mapped_account(_company_id, 'refundable_advance'), 'debit_minor', _amount, 'credit_minor', 0, 'description', 'Conditions satisfied'),
      jsonb_build_object('fund_id', _grant.fund_id, 'account_id', public.nonprofit_mapped_account(_company_id, 'grant_revenue'), 'debit_minor', 0, 'credit_minor', _amount, 'description', 'Grant revenue')
    )
  );
  UPDATE public.nonprofit_grants SET recognised_minor = recognised_minor + _amount WHERE id = _grant_id;
  INSERT INTO public.nonprofit_grant_funding (company_id, grant_id, received_on, amount_minor, kind, journal_id, created_by)
  VALUES (_company_id, _grant_id, _on, _amount, 'recognition', _journal, auth.uid());
  RETURN jsonb_build_object('journal_id', _journal);
END;
$$;

CREATE OR REPLACE FUNCTION public.nonprofit_post_expense(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _grant public.nonprofit_grants;
  _amount BIGINT;
  _fund UUID;
  _class TEXT;
  _category TEXT;
  _role TEXT;
  _journal UUID;
  _id UUID;
  _admin BIGINT;
  _limit BIGINT;
  _grant_id UUID;
BEGIN
  PERFORM public.nonprofit_require(_company_id, 'nonprofit.post');
  PERFORM public.nonprofit_enabled(_company_id);
  _amount := (_payload->>'amount_minor')::BIGINT;
  _fund := (_payload->>'fund_id')::UUID;
  _class := _payload->>'functional_class';
  _category := trim(_payload->>'category');
  IF _amount IS NULL OR _amount <= 0 OR _category IS NULL OR _category = '' THEN
    RAISE EXCEPTION 'Expense is incomplete';
  END IF;
  _grant_id := NULLIF(_payload->>'grant_id', '')::UUID;
  IF _grant_id IS NOT NULL THEN
    SELECT * INTO _grant FROM public.nonprofit_grants
    WHERE id = _grant_id AND company_id = _company_id AND fund_id = _fund AND status = 'active';
    IF NOT FOUND THEN RAISE EXCEPTION 'Grant is not available for this fund'; END IF;
    IF COALESCE(array_length(_grant.eligible_categories, 1), 0) = 0 OR NOT (_category = ANY (_grant.eligible_categories)) THEN
      INSERT INTO public.nonprofit_expenses (
        company_id, fund_id, grant_id, spent_on, amount_minor, currency_code, functional_class,
        category, payee, status, rejection_reason, created_by
      ) VALUES (
        _company_id, _fund, _grant.id, (_payload->>'spent_on')::DATE, _amount,
        upper(COALESCE(NULLIF(_payload->>'currency_code', ''), 'USD')), _class, _category,
        NULLIF(_payload->>'payee', ''), 'rejected', 'Expenditure is not eligible for this grant', auth.uid()
      ) RETURNING id INTO _id;
      RETURN jsonb_build_object('id', _id, 'status', 'rejected', 'journal_id', NULL, 'reason', 'Expenditure is not eligible for this grant');
    END IF;
    IF _class = 'administration' AND _grant.indirect_cost_bps IS NOT NULL THEN
      SELECT COALESCE(SUM(amount_minor), 0) INTO _admin
      FROM public.nonprofit_expenses
      WHERE grant_id = _grant.id AND functional_class = 'administration' AND status = 'posted';
      _limit := (_grant.award_minor * _grant.indirect_cost_bps) / 10000;
      IF _admin + _amount > _limit THEN
        RAISE EXCEPTION 'Indirect cost limit would be exceeded';
      END IF;
    END IF;
  END IF;
  PERFORM public.nonprofit_assert_spendable(_company_id, _fund, (_payload->>'spent_on')::DATE, _amount);
  _role := CASE _class
    WHEN 'programme' THEN 'programme_expense'
    WHEN 'administration' THEN 'administration_expense'
    WHEN 'fundraising' THEN 'fundraising_expense'
    ELSE NULL
  END;
  IF _role IS NULL THEN RAISE EXCEPTION 'Functional class is invalid'; END IF;
  INSERT INTO public.nonprofit_expenses (
    company_id, fund_id, grant_id, programme_id, spent_on, amount_minor, currency_code, fx_rate_to_base,
    functional_class, category, payee, status, created_by
  ) VALUES (
    _company_id, _fund, NULLIF(_payload->>'grant_id', '')::UUID,     NULLIF(_payload->>'programme_id', '')::UUID,
    (_payload->>'spent_on')::DATE, _amount, upper(COALESCE(NULLIF(_payload->>'currency_code', ''), 'USD')),
    COALESCE((_payload->>'fx_rate_to_base')::NUMERIC, 1), _class, _category, NULLIF(_payload->>'payee', ''),
    'posted', auth.uid()
  ) RETURNING id INTO _id;
  IF _grant_id IS NOT NULL THEN
    UPDATE public.nonprofit_grants SET spent_minor = spent_minor + _amount WHERE id = _grant_id;
  END IF;
  _journal := public.nonprofit_post_balanced(
    _company_id, 'nonprofit_expense', _id, (_payload->>'spent_on')::DATE, 'Functional expense',
    upper(COALESCE(NULLIF(_payload->>'currency_code', ''), 'USD')),
    COALESCE((_payload->>'fx_rate_to_base')::NUMERIC, 1),
    'np-expense-' || _id::TEXT,
    jsonb_build_array(
      jsonb_build_object('fund_id', _fund, 'account_id', public.nonprofit_mapped_account(_company_id, _role), 'debit_minor', _amount, 'credit_minor', 0, 'description', _category),
      jsonb_build_object('fund_id', _fund, 'account_id', public.nonprofit_mapped_account(_company_id, COALESCE(NULLIF(_payload->>'credit', ''), 'bank')), 'debit_minor', 0, 'credit_minor', _amount, 'description', 'Expense settlement')
    )
  );
  UPDATE public.nonprofit_expenses SET journal_id = _journal WHERE id = _id;
  RETURN jsonb_build_object('id', _id, 'status', 'posted', 'journal_id', _journal);
END;
$$;

CREATE OR REPLACE FUNCTION public.nonprofit_transfer(_company_id UUID, _from UUID, _to UUID, _amount BIGINT, _on DATE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _journal UUID;
BEGIN
  PERFORM public.nonprofit_require(_company_id, 'nonprofit.post');
  IF _from = _to OR _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Transfer needs two funds and a positive amount';
  END IF;
  PERFORM public.nonprofit_assert_spendable(_company_id, _from, _on, _amount);
  _journal := public.nonprofit_post_balanced(
    _company_id, 'nonprofit_transfer', _from, _on, 'Interfund transfer',
    (SELECT base_currency FROM public.companies WHERE id = _company_id), 1,
    'np-transfer-' || _from::TEXT || '-' || _to::TEXT || '-' || _on::TEXT || '-' || _amount::TEXT,
    jsonb_build_array(
      jsonb_build_object('fund_id', _from, 'account_id', public.nonprofit_mapped_account(_company_id, 'transfer_out'), 'debit_minor', _amount, 'credit_minor', 0, 'description', 'Transfer out'),
      jsonb_build_object('fund_id', _from, 'account_id', public.nonprofit_mapped_account(_company_id, 'bank'), 'debit_minor', 0, 'credit_minor', _amount, 'description', 'Cash transferred'),
      jsonb_build_object('fund_id', _to, 'account_id', public.nonprofit_mapped_account(_company_id, 'bank'), 'debit_minor', _amount, 'credit_minor', 0, 'description', 'Cash received'),
      jsonb_build_object('fund_id', _to, 'account_id', public.nonprofit_mapped_account(_company_id, 'transfer_in'), 'debit_minor', 0, 'credit_minor', _amount, 'description', 'Transfer in')
    )
  );
  RETURN jsonb_build_object('journal_id', _journal);
END;
$$;

CREATE OR REPLACE FUNCTION public.nonprofit_release(_company_id UUID, _from UUID, _to UUID, _amount BIGINT, _on DATE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _journal UUID;
BEGIN
  PERFORM public.nonprofit_require(_company_id, 'nonprofit.restrictions.release');
  IF NOT public.nonprofit_fund_restricted(_company_id, _from) THEN
    RAISE EXCEPTION 'Only a donor-restricted fund can be released';
  END IF;
  IF public.nonprofit_fund_restricted(_company_id, _to) OR _from = _to OR _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Release must move a positive amount to an unrestricted fund';
  END IF;
  _journal := public.nonprofit_post_balanced(
    _company_id, 'nonprofit_release', _from, _on, 'Release from restriction',
    (SELECT base_currency FROM public.companies WHERE id = _company_id), 1,
    'np-release-' || _from::TEXT || '-' || _to::TEXT || '-' || _on::TEXT || '-' || _amount::TEXT,
    jsonb_build_array(
      jsonb_build_object('fund_id', _from, 'account_id', public.nonprofit_mapped_account(_company_id, 'restriction_release_debit'), 'debit_minor', _amount, 'credit_minor', 0, 'description', 'Released from restriction'),
      jsonb_build_object('fund_id', _from, 'account_id', public.nonprofit_mapped_account(_company_id, 'due_to'), 'debit_minor', 0, 'credit_minor', _amount, 'description', 'Due to unrestricted'),
      jsonb_build_object('fund_id', _to, 'account_id', public.nonprofit_mapped_account(_company_id, 'due_from'), 'debit_minor', _amount, 'credit_minor', 0, 'description', 'Due from restricted'),
      jsonb_build_object('fund_id', _to, 'account_id', public.nonprofit_mapped_account(_company_id, 'restriction_release_credit'), 'debit_minor', 0, 'credit_minor', _amount, 'description', 'Released to unrestricted')
    )
  );
  RETURN jsonb_build_object('journal_id', _journal);
END;
$$;

CREATE OR REPLACE FUNCTION public.nonprofit_create_donor(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
BEGIN
  PERFORM public.nonprofit_require(_company_id, 'nonprofit.donors.manage');
  PERFORM public.nonprofit_enabled(_company_id);
  IF NULLIF(_payload->>'email', '') IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.nonprofit_donors
    WHERE company_id = _company_id AND lower(email) = lower(_payload->>'email') AND status <> 'merged'
  ) THEN
    RAISE EXCEPTION 'A donor with that email already exists';
  END IF;
  INSERT INTO public.nonprofit_donors (
    company_id, contact_id, donor_kind, display_name, email, phone, anonymous, consent_status, communication_preference
  ) VALUES (
    _company_id, NULLIF(_payload->>'contact_id', '')::UUID, _payload->>'donor_kind',
    trim(_payload->>'display_name'), NULLIF(_payload->>'email', ''), NULLIF(_payload->>'phone', ''),
    COALESCE((_payload->>'anonymous')::BOOLEAN, false),
    COALESCE(NULLIF(_payload->>'consent_status', ''), 'unknown'),
    COALESCE(NULLIF(_payload->>'communication_preference', ''), 'email')
  ) RETURNING id INTO _id;
  RETURN jsonb_build_object('id', _id);
END;
$$;

CREATE OR REPLACE FUNCTION public.nonprofit_create_record(_company_id UUID, _kind TEXT, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
BEGIN
  PERFORM public.nonprofit_enabled(_company_id);
  IF _kind = 'beneficiary' OR _kind = 'assistance' THEN
    PERFORM public.nonprofit_require(_company_id, 'nonprofit.beneficiaries.view');
    PERFORM public.nonprofit_require(_company_id, 'nonprofit.manage');
  ELSIF _kind = 'compliance' THEN
    PERFORM public.nonprofit_require(_company_id, 'nonprofit.compliance.manage');
  ELSE
    PERFORM public.nonprofit_require(_company_id, 'nonprofit.manage');
  END IF;
  IF _kind = 'campaign' THEN
    INSERT INTO public.nonprofit_campaigns (company_id, fund_id, name, target_minor, starts_on, ends_on, status)
    VALUES (_company_id, NULLIF(_payload->>'fund_id', '')::UUID, trim(_payload->>'name'), COALESCE((_payload->>'target_minor')::BIGINT, 0), NULLIF(_payload->>'starts_on', '')::DATE, NULLIF(_payload->>'ends_on', '')::DATE, 'active')
    RETURNING id INTO _id;
  ELSIF _kind = 'programme' THEN
    INSERT INTO public.nonprofit_programmes (company_id, fund_id, name, objective)
    VALUES (_company_id, NULLIF(_payload->>'fund_id', '')::UUID, trim(_payload->>'name'), NULLIF(_payload->>'objective', ''))
    RETURNING id INTO _id;
  ELSIF _kind = 'volunteer' THEN
    INSERT INTO public.nonprofit_volunteers (company_id, display_name, email)
    VALUES (_company_id, trim(_payload->>'display_name'), NULLIF(_payload->>'email', ''))
    RETURNING id INTO _id;
  ELSIF _kind = 'volunteer_hours' THEN
    INSERT INTO public.nonprofit_volunteer_hours (company_id, volunteer_id, worked_on, hours)
    VALUES (_company_id, (_payload->>'volunteer_id')::UUID, (_payload->>'worked_on')::DATE, (_payload->>'hours')::NUMERIC)
    RETURNING id INTO _id;
  ELSIF _kind = 'membership' THEN
    INSERT INTO public.nonprofit_memberships (company_id, display_name, category, renewal_on, status)
    VALUES (_company_id, trim(_payload->>'display_name'), trim(_payload->>'category'), NULLIF(_payload->>'renewal_on', '')::DATE, 'active')
    RETURNING id INTO _id;
  ELSIF _kind = 'beneficiary' THEN
    INSERT INTO public.nonprofit_beneficiaries (company_id, display_name, eligibility_status, notes)
    VALUES (_company_id, trim(_payload->>'display_name'), COALESCE(NULLIF(_payload->>'eligibility_status', ''), 'pending'), NULLIF(_payload->>'notes', ''))
    RETURNING id INTO _id;
  ELSIF _kind = 'event' THEN
    INSERT INTO public.nonprofit_events (company_id, name, event_on)
    VALUES (_company_id, trim(_payload->>'name'), NULLIF(_payload->>'event_on', '')::DATE)
    RETURNING id INTO _id;
  ELSIF _kind = 'sponsorship' THEN
    INSERT INTO public.nonprofit_sponsorships (company_id, sponsor_name, amount_minor)
    VALUES (_company_id, trim(_payload->>'sponsor_name'), COALESCE((_payload->>'amount_minor')::BIGINT, 0))
    RETURNING id INTO _id;
  ELSIF _kind = 'board_member' THEN
    INSERT INTO public.nonprofit_board_members (company_id, display_name, office)
    VALUES (_company_id, trim(_payload->>'display_name'), trim(_payload->>'office'))
    RETURNING id INTO _id;
  ELSIF _kind = 'meeting' THEN
    INSERT INTO public.nonprofit_meetings (company_id, title, met_on, minutes)
    VALUES (_company_id, trim(_payload->>'title'), (_payload->>'met_on')::DATE, NULLIF(_payload->>'minutes', ''))
    RETURNING id INTO _id;
  ELSIF _kind = 'resolution' THEN
    INSERT INTO public.nonprofit_resolutions (company_id, title)
    VALUES (_company_id, trim(_payload->>'title'))
    RETURNING id INTO _id;
  ELSIF _kind = 'compliance' THEN
    INSERT INTO public.nonprofit_compliance_items (company_id, pack_id, title, due_on)
    VALUES (_company_id, _payload->>'pack_id', trim(_payload->>'title'), NULLIF(_payload->>'due_on', '')::DATE)
    RETURNING id INTO _id;
  ELSIF _kind = 'recurring' THEN
    INSERT INTO public.nonprofit_recurring_plans (company_id, donor_id, fund_id, amount_minor, method, next_on)
    VALUES (_company_id, (_payload->>'donor_id')::UUID, (_payload->>'fund_id')::UUID, (_payload->>'amount_minor')::BIGINT, COALESCE(NULLIF(_payload->>'method', ''), 'bank_transfer'), (_payload->>'next_on')::DATE)
    RETURNING id INTO _id;
  ELSE
    RAISE EXCEPTION 'Unsupported record kind %', _kind;
  END IF;
  RETURN jsonb_build_object('id', _id, 'kind', _kind);
END;
$$;

CREATE OR REPLACE FUNCTION public.nonprofit_grant_portal(_company_id UUID, _payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
BEGIN
  PERFORM public.nonprofit_require(_company_id, 'nonprofit.portal.manage');
  INSERT INTO public.nonprofit_portal_users (
    company_id, user_id, portal_role, donor_id, volunteer_id, membership_id, grant_id
  ) VALUES (
    _company_id, (_payload->>'user_id')::UUID, _payload->>'portal_role',
    NULLIF(_payload->>'donor_id', '')::UUID, NULLIF(_payload->>'volunteer_id', '')::UUID,
    NULLIF(_payload->>'membership_id', '')::UUID, NULLIF(_payload->>'grant_id', '')::UUID
  ) RETURNING id INTO _id;
  RETURN jsonb_build_object('id', _id);
END;
$$;

CREATE OR REPLACE FUNCTION public.nonprofit_my_portal()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'company_id', p.company_id,
      'portal_role', p.portal_role,
      'donor_id', p.donor_id,
      'donations', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', d.id, 'donation_number', d.donation_number, 'amount_minor', d.amount_minor,
          'donated_on', d.donated_on, 'status', d.status
        )), '[]'::JSONB)
        FROM public.nonprofit_donations d
        WHERE d.company_id = p.company_id AND d.donor_id = p.donor_id AND p.portal_role = 'donor'
      )
    ))
    FROM public.nonprofit_portal_users p
    WHERE p.user_id = _uid AND p.status = 'active'
  ), '[]'::JSONB);
END;
$$;

CREATE OR REPLACE FUNCTION public.nonprofit_workspace(_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _settings JSONB;
  _see_beneficiaries BOOLEAN;
BEGIN
  PERFORM public.nonprofit_require(_company_id, 'nonprofit.view');
  SELECT jsonb_build_object(
    'enabled', enabled, 'accounting_framework', accounting_framework, 'country_code', country_code,
    'allow_unrestricted_deficit', allow_unrestricted_deficit, 'enforce_segregation', enforce_segregation,
    'gateway_configured', gateway_configured, 'account_map', account_map, 'version', version
  ) INTO _settings
  FROM public.nonprofit_settings WHERE company_id = _company_id;
  _see_beneficiaries := public.has_company_permission(_company_id, 'nonprofit.beneficiaries.view');
  RETURN jsonb_build_object(
    'settings', COALESCE(_settings, jsonb_build_object('enabled', false, 'account_map', '{}'::JSONB)),
    'funds', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', f.id, 'code', f.code, 'name', f.name, 'restriction', f.restriction, 'category', f.category,
      'status', f.status, 'spendable_minor', public.nonprofit_fund_spendable(_company_id, f.id, CURRENT_DATE)
    ) ORDER BY f.code) FROM public.nonprofit_funds f WHERE f.company_id = _company_id), '[]'::JSONB),
    'donors', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', d.id, 'display_name', d.display_name, 'donor_kind', d.donor_kind, 'email', d.email) ORDER BY d.display_name) FROM public.nonprofit_donors d WHERE d.company_id = _company_id), '[]'::JSONB),
    'donations', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', d.id, 'donation_number', d.donation_number, 'amount_minor', d.amount_minor, 'status', d.status, 'journal_id', d.journal_id, 'donated_on', d.donated_on, 'conditional', d.conditional) ORDER BY d.created_at DESC) FROM public.nonprofit_donations d WHERE d.company_id = _company_id), '[]'::JSONB),
    'pledges', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'pledge_number', p.pledge_number, 'amount_minor', p.amount_minor, 'status', p.status, 'collected_minor', p.collected_minor) ORDER BY p.created_at DESC) FROM public.nonprofit_pledges p WHERE p.company_id = _company_id), '[]'::JSONB),
    'grants', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', g.id, 'code', g.code, 'title', g.title, 'award_minor', g.award_minor, 'received_minor', g.received_minor, 'recognised_minor', g.recognised_minor, 'conditional', g.conditional, 'conditions_met', g.conditions_met, 'status', g.status) ORDER BY g.code) FROM public.nonprofit_grants g WHERE g.company_id = _company_id), '[]'::JSONB),
    'expenses', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', e.id, 'amount_minor', e.amount_minor, 'functional_class', e.functional_class, 'category', e.category, 'status', e.status, 'rejection_reason', e.rejection_reason, 'journal_id', e.journal_id) ORDER BY e.created_at DESC) FROM public.nonprofit_expenses e WHERE e.company_id = _company_id), '[]'::JSONB),
    'campaigns', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'target_minor', c.target_minor, 'status', c.status)) FROM public.nonprofit_campaigns c WHERE c.company_id = _company_id), '[]'::JSONB),
    'programmes', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'objective', p.objective, 'status', p.status)) FROM public.nonprofit_programmes p WHERE p.company_id = _company_id), '[]'::JSONB),
    'volunteers', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', v.id, 'display_name', v.display_name, 'status', v.status)) FROM public.nonprofit_volunteers v WHERE v.company_id = _company_id), '[]'::JSONB),
    'memberships', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', m.id, 'display_name', m.display_name, 'category', m.category, 'status', m.status)) FROM public.nonprofit_memberships m WHERE m.company_id = _company_id), '[]'::JSONB),
    'events', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'event_on', e.event_on, 'status', e.status)) FROM public.nonprofit_events e WHERE e.company_id = _company_id), '[]'::JSONB),
    'board', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', b.id, 'display_name', b.display_name, 'office', b.office)) FROM public.nonprofit_board_members b WHERE b.company_id = _company_id), '[]'::JSONB),
    'compliance', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'due_on', c.due_on, 'status', c.status, 'pack_id', c.pack_id)) FROM public.nonprofit_compliance_items c WHERE c.company_id = _company_id), '[]'::JSONB),
    'receipts', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'receipt_number', r.receipt_number, 'amount_minor', r.amount_minor, 'donation_id', r.donation_id, 'wording', r.wording)) FROM public.nonprofit_receipts r WHERE r.company_id = _company_id), '[]'::JSONB),
    'beneficiaries', CASE WHEN _see_beneficiaries THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('id', b.id, 'display_name', b.display_name, 'eligibility_status', b.eligibility_status)) FROM public.nonprofit_beneficiaries b WHERE b.company_id = _company_id), '[]'::JSONB) ELSE NULL END,
    'actions', COALESCE((
      SELECT jsonb_agg(item) FROM (
        SELECT jsonb_build_object('id', p.id::TEXT, 'title', 'Outstanding pledge ' || p.pledge_number, 'href', '/nonprofit/pledges', 'severity', 'attention') AS item
        FROM public.nonprofit_pledges p
        WHERE p.company_id = _company_id AND (p.amount_minor - p.collected_minor - p.impaired_minor) > 0
        UNION ALL
        SELECT jsonb_build_object('id', g.id::TEXT, 'title', 'Grant conditions open for ' || g.code, 'href', '/nonprofit/grants', 'severity', 'attention')
        FROM public.nonprofit_grants g
        WHERE g.company_id = _company_id AND g.conditional AND NOT g.conditions_met AND g.status = 'active' AND g.received_minor > g.recognised_minor
        UNION ALL
        SELECT jsonb_build_object('id', c.id::TEXT, 'title', 'Compliance due: ' || c.title, 'href', '/nonprofit/people', 'severity', 'attention')
        FROM public.nonprofit_compliance_items c
        WHERE c.company_id = _company_id AND c.status = 'open' AND c.due_on IS NOT NULL AND c.due_on <= CURRENT_DATE + 30
      ) actions
    ), '[]'::JSONB)
  );
END;
$$;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'nonprofit_settings', 'nonprofit_counters', 'nonprofit_funds', 'nonprofit_endowments', 'nonprofit_donors',
    'nonprofit_donations', 'nonprofit_donation_allocations', 'nonprofit_receipts', 'nonprofit_pledges',
    'nonprofit_fund_tags', 'nonprofit_grants', 'nonprofit_grant_funding', 'nonprofit_campaigns',
    'nonprofit_programmes', 'nonprofit_projects', 'nonprofit_expenses', 'nonprofit_expense_allocations',
    'nonprofit_commitments', 'nonprofit_beneficiaries', 'nonprofit_assistance', 'nonprofit_disbursements',
    'nonprofit_volunteers', 'nonprofit_volunteer_hours', 'nonprofit_memberships', 'nonprofit_events',
    'nonprofit_sponsorships', 'nonprofit_board_members', 'nonprofit_meetings', 'nonprofit_resolutions',
    'nonprofit_compliance_items', 'nonprofit_portal_users', 'nonprofit_gateway_events', 'nonprofit_recurring_plans'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS np_member_select ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY np_member_select ON public.%I FOR SELECT TO authenticated USING (public.is_company_member(company_id) AND public.has_company_permission(company_id, %L))',
      t, 'nonprofit.view'
    );
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon', t);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS np_member_select ON public.nonprofit_beneficiaries;
CREATE POLICY np_member_select ON public.nonprofit_beneficiaries
  FOR SELECT TO authenticated
  USING (
    public.is_company_member(company_id)
    AND public.has_company_permission(company_id, 'nonprofit.beneficiaries.view')
  );

DROP POLICY IF EXISTS np_portal_donations ON public.nonprofit_donations;
CREATE POLICY np_portal_donations ON public.nonprofit_donations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.nonprofit_portal_users p
      WHERE p.company_id = nonprofit_donations.company_id
        AND p.user_id = auth.uid()
        AND p.status = 'active'
        AND p.portal_role = 'donor'
        AND p.donor_id = nonprofit_donations.donor_id
    )
  );

DROP POLICY IF EXISTS np_portal_self ON public.nonprofit_portal_users;
CREATE POLICY np_portal_self ON public.nonprofit_portal_users
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'nonprofit\_%'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.signature);
  END LOOP;
END $$;
