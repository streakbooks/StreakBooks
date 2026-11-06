-- Phase 8: CA partners, referrals and commission ledger. Payouts are disabled.
-- Extends public.platform_partners (optionally linked to an existing firm). Nothing is attributed
-- until platform owners set an attribution window (D14), no commission rule is seeded, and payouts
-- stay off until a second owner approves enabling them with a regulatory review reference (D15).
-- Commission accrues from immutable invoices and is reversed from credit notes; the ledger is
-- append-only. No automatic transfers exist: payouts are manual records with two-person approval.
-- Re-runnable.

-- ---------------------------------------------------------------- partners
ALTER TABLE public.platform_partners
  ADD COLUMN IF NOT EXISTS firm_id uuid REFERENCES public.firms(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  ADD COLUMN IF NOT EXISTS contact_email text
    CHECK (contact_email IS NULL OR contact_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  ADD COLUMN IF NOT EXISTS country_code char(2) REFERENCES billing.countries(code),
  ADD COLUMN IF NOT EXISTS membership_reference text CHECK (membership_reference IS NULL OR length(membership_reference) <= 60),
  ADD COLUMN IF NOT EXISTS verification_evidence text CHECK (verification_evidence IS NULL OR length(verification_evidence) <= 1000),
  ADD COLUMN IF NOT EXISTS applied_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS platform_partners_firm_key ON public.platform_partners (firm_id) WHERE firm_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS billing.partner_users (
  partner_id uuid NOT NULL REFERENCES public.platform_partners(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'member')),
  added_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (partner_id, user_id)
);
CREATE INDEX IF NOT EXISTS partner_users_user_idx ON billing.partner_users (user_id);

-- ---------------------------------------------------------------- programme settings
CREATE TABLE IF NOT EXISTS billing.partner_program (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  attribution_model text NOT NULL DEFAULT 'last_touch' CHECK (attribution_model IN ('last_touch', 'first_touch')),
  attribution_window_days integer CHECK (attribution_window_days BETWEEN 1 AND 730),
  payouts_enabled boolean NOT NULL DEFAULT false,
  regulatory_review_reference text CHECK (regulatory_review_reference IS NULL OR length(regulatory_review_reference) <= 200),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT payouts_enabled OR regulatory_review_reference IS NOT NULL)
);
INSERT INTO billing.partner_program (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS billing.partner_program_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  change jsonb NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'rejected')),
  requested_by uuid NOT NULL,
  decided_by uuid,
  decided_at timestamptz,
  decision_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (decided_by IS NULL OR decided_by <> requested_by)
);

-- ---------------------------------------------------------------- referrals
CREATE TABLE IF NOT EXISTS billing.referral_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.platform_partners(id) ON DELETE RESTRICT,
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9]{6,24}$'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS referral_codes_partner_idx ON billing.referral_codes (partner_id);

-- Every touch records the customer's acceptance of the published partner disclosure.
CREATE TABLE IF NOT EXISTS billing.referral_touches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id uuid NOT NULL REFERENCES billing.referral_codes(id),
  partner_id uuid NOT NULL REFERENCES public.platform_partners(id),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  disclosure_acceptance_id uuid NOT NULL REFERENCES billing.legal_acceptances(id),
  touched_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS referral_touches_company_idx ON billing.referral_touches (company_id, touched_at DESC);

CREATE TABLE IF NOT EXISTS billing.referral_attributions (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.platform_partners(id),
  code_id uuid NOT NULL REFERENCES billing.referral_codes(id),
  touch_id uuid NOT NULL REFERENCES billing.referral_touches(id),
  model text NOT NULL CHECK (model IN ('last_touch', 'first_touch')),
  touched_at timestamptz NOT NULL,
  locked_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  ended_reason text,
  ended_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS referral_attributions_partner_idx ON billing.referral_attributions (partner_id);

-- ---------------------------------------------------------------- commission rules
CREATE TABLE IF NOT EXISTS billing.commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 80),
  partner_id uuid REFERENCES public.platform_partners(id),
  kind text NOT NULL CHECK (kind IN ('percent', 'fixed')),
  percent_bps integer CHECK (percent_bps BETWEEN 1 AND 10000),
  fixed_minor bigint CHECK (fixed_minor > 0),
  fixed_currency char(3) REFERENCES billing.currencies(code),
  plan_codes text[],
  countries char(2)[],
  duration_months integer CHECK (duration_months BETWEEN 1 AND 120),
  hold_days integer NOT NULL CHECK (hold_days BETWEEN 0 AND 365),
  min_payout_minor bigint NOT NULL CHECK (min_payout_minor >= 0),
  min_payout_currency char(3) NOT NULL REFERENCES billing.currencies(code),
  effective_from date NOT NULL,
  effective_to date,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'retired')),
  created_by uuid NOT NULL,
  approved_by uuid,
  approved_at timestamptz,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'percent' AND percent_bps IS NOT NULL AND fixed_minor IS NULL AND fixed_currency IS NULL)
      OR (kind = 'fixed' AND percent_bps IS NULL AND fixed_minor IS NOT NULL AND fixed_currency IS NOT NULL)),
  CHECK (effective_to IS NULL OR effective_to > effective_from),
  CHECK (approved_by IS NULL OR approved_by <> created_by)
);

-- Approved terms are frozen; only retirement (status and end date) may change afterwards.
CREATE OR REPLACE FUNCTION billing.guard_commission_rule() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'Approved commission rules cannot be deleted' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'draft' AND (
       (to_jsonb(NEW) - ARRAY['status', 'effective_to']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status', 'effective_to'])
       OR NEW.status = 'draft') THEN
    RAISE EXCEPTION 'Approved commission rules cannot be edited; retire and replace them' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS commission_rules_guard ON billing.commission_rules;
CREATE TRIGGER commission_rules_guard BEFORE UPDATE OR DELETE ON billing.commission_rules
  FOR EACH ROW EXECUTE FUNCTION billing.guard_commission_rule();

-- ---------------------------------------------------------------- payouts and ledger
CREATE TABLE IF NOT EXISTS billing.partner_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.platform_partners(id),
  currency char(3) NOT NULL REFERENCES billing.currencies(code),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'paid', 'cancelled')),
  requested_by uuid NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  request_reason text NOT NULL,
  approved_by uuid,
  approved_at timestamptz,
  paid_by uuid,
  paid_at timestamptz,
  payment_reference text CHECK (payment_reference IS NULL OR length(payment_reference) BETWEEN 3 AND 120),
  cancelled_by uuid,
  cancelled_at timestamptz,
  cancel_reason text,
  CHECK (approved_by IS NULL OR approved_by <> requested_by),
  CHECK (status <> 'paid' OR (approved_by IS NOT NULL AND payment_reference IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS billing.commission_ledger (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  partner_id uuid NOT NULL REFERENCES public.platform_partners(id),
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  entry_type text NOT NULL CHECK (entry_type IN ('accrual', 'reversal', 'adjustment', 'payout', 'payout_cancelled')),
  amount_minor bigint NOT NULL,
  currency char(3) NOT NULL REFERENCES billing.currencies(code),
  basis_minor bigint,
  invoice_id uuid REFERENCES billing.invoices(id),
  credit_note_id uuid REFERENCES billing.credit_notes(id),
  rule_id uuid REFERENCES billing.commission_rules(id),
  reverses_id bigint REFERENCES billing.commission_ledger(id),
  payout_id uuid REFERENCES billing.partner_payouts(id),
  available_at timestamptz NOT NULL,
  memo text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
       (entry_type = 'accrual' AND amount_minor > 0 AND invoice_id IS NOT NULL AND rule_id IS NOT NULL)
    OR (entry_type = 'reversal' AND amount_minor < 0 AND reverses_id IS NOT NULL)
    OR (entry_type = 'adjustment' AND amount_minor <> 0 AND memo IS NOT NULL AND created_by IS NOT NULL)
    OR (entry_type = 'payout' AND amount_minor < 0 AND payout_id IS NOT NULL)
    OR (entry_type = 'payout_cancelled' AND amount_minor > 0 AND payout_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS commission_ledger_accrual_key ON billing.commission_ledger (invoice_id) WHERE entry_type = 'accrual';
CREATE UNIQUE INDEX IF NOT EXISTS commission_ledger_reversal_key ON billing.commission_ledger (credit_note_id, reverses_id) WHERE entry_type = 'reversal';
CREATE UNIQUE INDEX IF NOT EXISTS commission_ledger_payout_key ON billing.commission_ledger (payout_id, entry_type) WHERE payout_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS commission_ledger_partner_idx ON billing.commission_ledger (partner_id, currency, available_at);
CREATE INDEX IF NOT EXISTS commission_ledger_reverses_idx ON billing.commission_ledger (reverses_id) WHERE reverses_id IS NOT NULL;

CREATE OR REPLACE FUNCTION billing.immutable_commission_entry() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Commission entries are append-only; post a reversal or adjustment' USING ERRCODE = '42501';
END $$;
DROP TRIGGER IF EXISTS commission_ledger_immutable ON billing.commission_ledger;
CREATE TRIGGER commission_ledger_immutable BEFORE UPDATE OR DELETE ON billing.commission_ledger
  FOR EACH ROW EXECUTE FUNCTION billing.immutable_commission_entry();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['partner_users', 'partner_program', 'partner_program_changes', 'referral_codes',
    'referral_touches', 'referral_attributions', 'commission_rules', 'partner_payouts', 'commission_ledger'] LOOP
    EXECUTE format('ALTER TABLE billing.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON billing.%I FROM PUBLIC', t);
    BEGIN
      EXECUTE format('REVOKE ALL ON billing.%I FROM anon, authenticated', t);
    EXCEPTION WHEN undefined_object THEN NULL; END;
  END LOOP;
END $$;

-- ---------------------------------------------------------------- helpers
-- Partner access: explicit partner users, or owners and admins of the linked firm.
CREATE OR REPLACE FUNCTION billing.partner_role(_partner_id uuid, _user_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(
    (SELECT pu.role FROM billing.partner_users pu WHERE pu.partner_id = _partner_id AND pu.user_id = _user_id),
    (SELECT 'admin' FROM public.platform_partners p
       JOIN public.firm_members m ON m.firm_id = p.firm_id AND m.user_id = _user_id
      WHERE p.id = _partner_id AND m.role::text IN ('owner', 'admin') LIMIT 1));
$$;

CREATE OR REPLACE FUNCTION billing.partner_json(p public.platform_partners) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', p.id, 'name', p.name, 'status', p.status, 'firmId', p.firm_id,
    'firmName', (SELECT f.name FROM public.firms f WHERE f.id = p.firm_id),
    'contactEmail', p.contact_email, 'countryCode', p.country_code,
    'membershipReference', p.membership_reference, 'verificationEvidence', p.verification_evidence,
    'appliedBy', p.applied_by, 'reviewedAt', p.reviewed_at, 'createdAt', p.created_at);
$$;

CREATE OR REPLACE FUNCTION billing.commission_rule_json(r billing.commission_rules) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', r.id, 'name', r.name, 'partnerId', r.partner_id,
    'partnerName', (SELECT p.name FROM public.platform_partners p WHERE p.id = r.partner_id),
    'kind', r.kind, 'percentBps', r.percent_bps, 'fixedMinor', r.fixed_minor, 'fixedCurrency', r.fixed_currency,
    'planCodes', to_jsonb(r.plan_codes), 'countries', to_jsonb(r.countries), 'durationMonths', r.duration_months,
    'holdDays', r.hold_days, 'minPayoutMinor', r.min_payout_minor, 'minPayoutCurrency', r.min_payout_currency,
    'effectiveFrom', r.effective_from, 'effectiveTo', r.effective_to, 'status', r.status,
    'createdBy', r.created_by, 'approvedBy', r.approved_by, 'approvedAt', r.approved_at, 'reason', r.reason);
$$;

-- Balances per currency: pending (on hold), available, reserved in open payouts, paid out.
CREATE OR REPLACE FUNCTION billing.partner_balances(_partner_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'currency', b.currency, 'pendingMinor', b.pending, 'availableMinor', b.available,
    'inPayoutMinor', b.in_payout, 'paidOutMinor', b.paid_out) ORDER BY b.currency), '[]'::jsonb)
  FROM (
    SELECT l.currency,
      coalesce(sum(l.amount_minor) FILTER (WHERE l.available_at > now()), 0) AS pending,
      coalesce(sum(l.amount_minor) FILTER (WHERE l.available_at <= now()), 0) AS available,
      coalesce(-sum(l.amount_minor) FILTER (WHERE l.entry_type = 'payout' AND po.status IN ('requested', 'approved')), 0) AS in_payout,
      coalesce(-sum(l.amount_minor) FILTER (WHERE l.entry_type = 'payout' AND po.status = 'paid'), 0) AS paid_out
    FROM billing.commission_ledger l
    LEFT JOIN billing.partner_payouts po ON po.id = l.payout_id
    WHERE l.partner_id = _partner_id
    GROUP BY l.currency
  ) b;
$$;


-- The rule for a partner on a date: a partner-specific rule wins over the programme-wide rule.
-- Retired rules still apply up to their end date.
CREATE OR REPLACE FUNCTION billing.commission_rule_for(_partner_id uuid, _on date) RETURNS billing.commission_rules
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT r.* FROM billing.commission_rules r
   WHERE r.status IN ('approved', 'retired') AND (r.partner_id = _partner_id OR r.partner_id IS NULL)
     AND r.effective_from <= _on AND (r.effective_to IS NULL OR r.effective_to > _on)
   ORDER BY r.partner_id NULLS LAST
   LIMIT 1;
$$;

-- ---------------------------------------------------------------- accrual and reversal
CREATE OR REPLACE FUNCTION billing.accrue_partner_commission() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  att billing.referral_attributions%ROWTYPE;
  prog billing.partner_program%ROWTYPE;
  partner_status text;
  rule_row billing.commission_rules%ROWTYPE;
  org_country char(2);
  issued_on date := (NEW.issued_at AT TIME ZONE 'UTC')::date;
  commission bigint;
BEGIN
  SELECT * INTO att FROM billing.referral_attributions WHERE company_id = NEW.company_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  SELECT * INTO prog FROM billing.partner_program;
  IF att.locked_at IS NULL THEN
    IF prog.attribution_window_days IS NULL
       OR NEW.issued_at > att.touched_at + make_interval(days => prog.attribution_window_days) THEN
      UPDATE billing.referral_attributions
         SET status = 'ended', ended_reason = 'The first paid invoice came after the attribution window',
             ended_at = now(), updated_at = now()
       WHERE company_id = NEW.company_id;
      RETURN NULL;
    END IF;
    UPDATE billing.referral_attributions SET locked_at = NEW.issued_at, updated_at = now()
     WHERE company_id = NEW.company_id RETURNING * INTO att;
  END IF;

  SELECT p.status INTO partner_status FROM public.platform_partners p WHERE p.id = att.partner_id;
  IF partner_status IS DISTINCT FROM 'approved' THEN
    RETURN NULL;
  END IF;
  rule_row := billing.commission_rule_for(att.partner_id, issued_on);
  IF rule_row.id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT upper(c.country_code) INTO org_country FROM public.companies c WHERE c.id = NEW.company_id;
  IF (rule_row.plan_codes IS NOT NULL AND NOT (NEW.plan_code = ANY (rule_row.plan_codes)))
     OR (rule_row.countries IS NOT NULL AND NOT (org_country = ANY (rule_row.countries)))
     OR (rule_row.duration_months IS NOT NULL
         AND NEW.issued_at >= att.locked_at + make_interval(months => rule_row.duration_months)) THEN
    RETURN NULL;
  END IF;

  -- Net eligible revenue: the invoice subtotal after discounts, excluding tax.
  IF rule_row.kind = 'percent' THEN
    commission := billing.round_ratio(NEW.subtotal_minor::numeric * rule_row.percent_bps, 10000, 'DOWN');
  ELSIF rule_row.fixed_currency = NEW.currency THEN
    commission := least(rule_row.fixed_minor, NEW.subtotal_minor);
  ELSE
    RETURN NULL;
  END IF;
  IF commission <= 0 THEN
    RETURN NULL;
  END IF;

  INSERT INTO billing.commission_ledger (partner_id, company_id, entry_type, amount_minor, currency, basis_minor,
    invoice_id, rule_id, available_at, memo)
  VALUES (att.partner_id, NEW.company_id, 'accrual', commission, NEW.currency, NEW.subtotal_minor,
    NEW.id, rule_row.id, NEW.issued_at + make_interval(days => rule_row.hold_days), NEW.invoice_number);
  PERFORM billing.write_audit('commission.accrued', 'partner', att.partner_id::text, NEW.billing_account_id, NULL,
    jsonb_build_object('invoice', NEW.invoice_number, 'amountMinor', commission, 'currency', NEW.currency,
      'basisMinor', NEW.subtotal_minor, 'ruleId', rule_row.id), 'Paid invoice');
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS invoices_partner_commission ON billing.invoices;
CREATE TRIGGER invoices_partner_commission AFTER INSERT ON billing.invoices
  FOR EACH ROW EXECUTE FUNCTION billing.accrue_partner_commission();

-- Refunds reverse commission in proportion; the final credit reverses whatever remains.
CREATE OR REPLACE FUNCTION billing.reverse_partner_commission() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  accrual billing.commission_ledger%ROWTYPE;
  invoice_total bigint;
  credited bigint;
  remaining bigint;
  reversal bigint;
BEGIN
  SELECT i.total_minor INTO invoice_total FROM billing.invoices i WHERE i.id = NEW.invoice_id;
  SELECT coalesce(sum(cn.total_minor), 0) INTO credited FROM billing.credit_notes cn WHERE cn.invoice_id = NEW.invoice_id;
  FOR accrual IN
    SELECT * FROM billing.commission_ledger WHERE invoice_id = NEW.invoice_id AND entry_type = 'accrual'
  LOOP
    remaining := accrual.amount_minor
      + coalesce((SELECT sum(r.amount_minor) FROM billing.commission_ledger r WHERE r.reverses_id = accrual.id), 0);
    CONTINUE WHEN remaining <= 0;
    IF credited >= invoice_total OR invoice_total <= 0 THEN
      reversal := remaining;
    ELSE
      reversal := least(remaining,
        billing.round_ratio(accrual.amount_minor::numeric * NEW.total_minor, invoice_total, 'HALF_UP'));
    END IF;
    CONTINUE WHEN reversal <= 0;
    INSERT INTO billing.commission_ledger (partner_id, company_id, entry_type, amount_minor, currency,
      credit_note_id, reverses_id, rule_id, available_at, memo)
    VALUES (accrual.partner_id, accrual.company_id, 'reversal', -reversal, accrual.currency,
      NEW.id, accrual.id, accrual.rule_id, now(), NEW.credit_note_number);
    PERFORM billing.write_audit('commission.reversed', 'partner', accrual.partner_id::text, NULL, NULL,
      jsonb_build_object('creditNote', NEW.credit_note_number, 'amountMinor', -reversal, 'currency', accrual.currency),
      'Refund credit note');
  END LOOP;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS credit_notes_partner_commission ON billing.credit_notes;
CREATE TRIGGER credit_notes_partner_commission AFTER INSERT ON billing.credit_notes
  FOR EACH ROW EXECUTE FUNCTION billing.reverse_partner_commission();

-- ---------------------------------------------------------------- customer RPCs
CREATE OR REPLACE FUNCTION public.billing_referral_status(_company_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  prog billing.partner_program%ROWTYPE;
  disclosure billing.legal_documents%ROWTYPE;
  current_partner jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_company_permission(_company_id, 'billing.manage') THEN
    RAISE EXCEPTION 'You do not have permission to manage billing for this organisation' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO prog FROM billing.partner_program;
  SELECT d.* INTO disclosure FROM billing.legal_documents d
   WHERE d.kind = 'PARTNER_DISCLOSURE' AND d.status = 'published' ORDER BY d.locale = 'en' DESC, d.version DESC LIMIT 1;
  SELECT jsonb_build_object('partnerName', p.name, 'attributedAt', a.touched_at, 'locked', a.locked_at IS NOT NULL,
           'status', a.status)
    INTO current_partner
    FROM billing.referral_attributions a JOIN public.platform_partners p ON p.id = a.partner_id
   WHERE a.company_id = _company_id;
  RETURN jsonb_build_object(
    'programOpen', prog.attribution_window_days IS NOT NULL AND disclosure.id IS NOT NULL,
    'attribution', current_partner,
    'disclosure', CASE WHEN disclosure.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', disclosure.id, 'title', disclosure.title, 'body', disclosure.body, 'version', disclosure.version) END);
END $$;

CREATE OR REPLACE FUNCTION public.billing_record_referral(
  _company_id uuid, _code text, _disclosure_id uuid, _ip_hash text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  prog billing.partner_program%ROWTYPE;
  ref billing.referral_codes%ROWTYPE;
  ptn public.platform_partners%ROWTYPE;
  att billing.referral_attributions%ROWTYPE;
  acceptance uuid;
  touch uuid;
  outcome text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_company_permission(_company_id, 'billing.manage') THEN
    RAISE EXCEPTION 'You do not have permission to manage billing for this organisation' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO prog FROM billing.partner_program;
  IF prog.attribution_window_days IS NULL THEN
    RAISE EXCEPTION 'The partner referral programme is not open yet' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO ref FROM billing.referral_codes WHERE code = upper(btrim(coalesce(_code, ''))) AND status = 'active';
  IF FOUND THEN
    SELECT * INTO ptn FROM public.platform_partners WHERE id = ref.partner_id;
  END IF;
  IF ref.id IS NULL OR ptn.status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'That referral code is not valid' USING ERRCODE = 'P0001';
  END IF;
  IF billing.partner_role(ptn.id, auth.uid()) IS NOT NULL THEN
    RAISE EXCEPTION 'Partners cannot refer an organisation they manage billing for' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM billing.legal_documents d
                  WHERE d.id = _disclosure_id AND d.kind = 'PARTNER_DISCLOSURE' AND d.status = 'published') THEN
    RAISE EXCEPTION 'Review the current partner disclosure' USING ERRCODE = '40001';
  END IF;

  acceptance := public.billing_record_legal_acceptance(_disclosure_id, _company_id, 'partner', _ip_hash);
  INSERT INTO billing.referral_touches (code_id, partner_id, company_id, user_id, disclosure_acceptance_id)
  VALUES (ref.id, ptn.id, _company_id, auth.uid(), acceptance) RETURNING id INTO touch;

  SELECT * INTO att FROM billing.referral_attributions WHERE company_id = _company_id FOR UPDATE;
  IF FOUND AND att.locked_at IS NOT NULL THEN
    outcome := 'already_attributed';
  ELSIF FOUND AND att.status = 'active' AND prog.attribution_model = 'first_touch' THEN
    outcome := 'kept';
  ELSIF FOUND THEN
    UPDATE billing.referral_attributions
       SET partner_id = ptn.id, code_id = ref.id, touch_id = touch, model = prog.attribution_model,
           touched_at = now(), status = 'active', ended_reason = NULL, ended_at = NULL, updated_at = now()
     WHERE company_id = _company_id;
    outcome := 'attributed';
  ELSE
    INSERT INTO billing.referral_attributions (company_id, partner_id, code_id, touch_id, model, touched_at)
    VALUES (_company_id, ptn.id, ref.id, touch, prog.attribution_model, now());
    outcome := 'attributed';
  END IF;
  PERFORM billing.write_audit('referral.recorded', 'company', _company_id::text,
    (SELECT l.billing_account_id FROM billing.billing_account_companies l WHERE l.company_id = _company_id),
    CASE WHEN att.partner_id IS NULL THEN NULL ELSE jsonb_build_object('partnerId', att.partner_id) END,
    jsonb_build_object('partnerId', ptn.id, 'code', ref.code, 'outcome', outcome), 'Customer accepted the partner disclosure');
  RETURN jsonb_build_object('result', outcome, 'partnerName', ptn.name);
END $$;

-- ---------------------------------------------------------------- partner portal
CREATE OR REPLACE FUNCTION public.billing_partner_apply(
  _firm_id uuid, _contact_email text, _country text, _membership_reference text, _terms_id uuid, _ip_hash text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  firm_name text;
  ptn public.platform_partners%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.firm_members m
     WHERE m.firm_id = _firm_id AND m.user_id = auth.uid() AND m.role::text IN ('owner', 'admin')) THEN
    RAISE EXCEPTION 'Only a firm owner or admin can apply' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.platform_partners p WHERE p.firm_id = _firm_id) THEN
    RAISE EXCEPTION 'This firm has already applied' USING ERRCODE = '23505';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM billing.legal_documents d
                  WHERE d.id = _terms_id AND d.kind = 'PARTNER_TERMS' AND d.status = 'published') THEN
    RAISE EXCEPTION 'Review the current partner terms' USING ERRCODE = '40001';
  END IF;
  IF _country IS NOT NULL AND NOT EXISTS (SELECT 1 FROM billing.countries c WHERE c.code = upper(_country)) THEN
    RAISE EXCEPTION 'Choose a supported country' USING ERRCODE = '22023';
  END IF;
  SELECT f.name INTO firm_name FROM public.firms f WHERE f.id = _firm_id;
  IF EXISTS (SELECT 1 FROM public.platform_partners p WHERE p.name = btrim(firm_name)) THEN
    RAISE EXCEPTION 'A partner with this name already exists; contact support' USING ERRCODE = '23505';
  END IF;
  PERFORM public.billing_record_legal_acceptance(_terms_id, NULL, 'partner', _ip_hash);
  INSERT INTO public.platform_partners (name, created_by, firm_id, status, contact_email, country_code,
    membership_reference, applied_by)
  VALUES (left(btrim(firm_name), 80), auth.uid(), _firm_id, 'pending', nullif(btrim(_contact_email), ''),
    upper(nullif(btrim(_country), '')), nullif(btrim(_membership_reference), ''), auth.uid())
  RETURNING * INTO ptn;
  INSERT INTO billing.partner_users (partner_id, user_id, role, added_by) VALUES (ptn.id, auth.uid(), 'admin', auth.uid());
  PERFORM billing.write_audit('partner.applied', 'partner', ptn.id::text, NULL, NULL, billing.partner_json(ptn), 'Partner application');
  RETURN billing.partner_json(ptn);
END $$;

CREATE OR REPLACE FUNCTION public.billing_partner_portal() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  prog billing.partner_program%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO prog FROM billing.partner_program;
  RETURN jsonb_build_object(
    'program', jsonb_build_object('open', prog.attribution_window_days IS NOT NULL,
      'attributionModel', prog.attribution_model, 'attributionWindowDays', prog.attribution_window_days,
      'payoutsEnabled', prog.payouts_enabled),
    'firms', coalesce((SELECT jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name,
        'applied', EXISTS (SELECT 1 FROM public.platform_partners p WHERE p.firm_id = f.id)) ORDER BY f.name)
      FROM public.firms f JOIN public.firm_members m ON m.firm_id = f.id
      WHERE m.user_id = auth.uid() AND m.role::text IN ('owner', 'admin')), '[]'::jsonb),
    'partners', coalesce((SELECT jsonb_agg(billing.partner_json(p) || jsonb_build_object(
        'role', billing.partner_role(p.id, auth.uid()),
        'codes', coalesce((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'code', c.code, 'status', c.status,
            'createdAt', c.created_at) ORDER BY c.created_at DESC) FROM billing.referral_codes c WHERE c.partner_id = p.id), '[]'::jsonb),
        'referrals', coalesce((SELECT jsonb_agg(jsonb_build_object('companyName', co.name, 'attributedAt', a.touched_at,
            'locked', a.locked_at IS NOT NULL, 'status', a.status) ORDER BY a.touched_at DESC)
          FROM billing.referral_attributions a JOIN public.companies co ON co.id = a.company_id
          WHERE a.partner_id = p.id), '[]'::jsonb),
        'balances', billing.partner_balances(p.id),
        'entries', coalesce((SELECT jsonb_agg(e ORDER BY (e ->> 'id')::bigint DESC) FROM (
          SELECT jsonb_build_object('id', l.id, 'type', l.entry_type, 'amountMinor', l.amount_minor, 'currency', l.currency,
            'basisMinor', l.basis_minor, 'availableAt', l.available_at, 'memo', l.memo, 'createdAt', l.created_at,
            'companyName', (SELECT co.name FROM public.companies co WHERE co.id = l.company_id)) AS e
          FROM billing.commission_ledger l WHERE l.partner_id = p.id ORDER BY l.id DESC LIMIT 100) x), '[]'::jsonb),
        'payouts', coalesce((SELECT jsonb_agg(jsonb_build_object('id', po.id, 'currency', po.currency,
            'amountMinor', po.amount_minor, 'status', po.status, 'requestedAt', po.requested_at, 'paidAt', po.paid_at,
            'paymentReference', po.payment_reference) ORDER BY po.requested_at DESC)
          FROM billing.partner_payouts po WHERE po.partner_id = p.id), '[]'::jsonb)
      ) ORDER BY p.name)
      FROM public.platform_partners p WHERE billing.partner_role(p.id, auth.uid()) IS NOT NULL), '[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.billing_partner_create_code(_partner_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  new_code text;
  rid uuid;
BEGIN
  IF billing.partner_role(_partner_id, auth.uid()) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only a partner admin can create referral codes' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.platform_partners p WHERE p.id = _partner_id AND p.status = 'approved') THEN
    RAISE EXCEPTION 'Referral codes are available once the partnership is approved' USING ERRCODE = 'P0001';
  END IF;
  PERFORM 1 FROM public.platform_partners p WHERE p.id = _partner_id FOR UPDATE;
  IF (SELECT count(*) FROM billing.referral_codes c WHERE c.partner_id = _partner_id AND c.status = 'active') >= 20 THEN
    RAISE EXCEPTION 'Disable an existing code before creating another' USING ERRCODE = 'P0001';
  END IF;
  LOOP
    new_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM billing.referral_codes c WHERE c.code = new_code);
  END LOOP;
  INSERT INTO billing.referral_codes (partner_id, code, created_by) VALUES (_partner_id, new_code, auth.uid())
  RETURNING id INTO rid;
  PERFORM billing.write_audit('referral_code.created', 'partner', _partner_id::text, NULL, NULL,
    jsonb_build_object('code', new_code), 'Partner admin');
  RETURN jsonb_build_object('id', rid, 'code', new_code, 'status', 'active');
END $$;

CREATE OR REPLACE FUNCTION public.billing_partner_disable_code(_code_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  ref billing.referral_codes%ROWTYPE;
BEGIN
  SELECT * INTO ref FROM billing.referral_codes WHERE id = _code_id FOR UPDATE;
  IF NOT FOUND OR (billing.partner_role(ref.partner_id, auth.uid()) IS DISTINCT FROM 'admin'
                   AND NOT private.platform_can('billing.manage')) THEN
    RAISE EXCEPTION 'Choose one of your referral codes' USING ERRCODE = '42501';
  END IF;
  UPDATE billing.referral_codes SET status = 'disabled' WHERE id = _code_id;
  PERFORM billing.write_audit('referral_code.disabled', 'partner', ref.partner_id::text, NULL,
    jsonb_build_object('code', ref.code, 'status', ref.status), jsonb_build_object('code', ref.code, 'status', 'disabled'),
    'Code disabled');
  RETURN jsonb_build_object('id', ref.id, 'code', ref.code, 'status', 'disabled');
END $$;

-- ---------------------------------------------------------------- platform RPCs
CREATE OR REPLACE FUNCTION public.platform_partner_program() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  prog billing.partner_program%ROWTYPE;
BEGIN
  PERFORM private.require_platform('billing.view');
  SELECT * INTO prog FROM billing.partner_program;
  RETURN jsonb_build_object(
    'program', jsonb_build_object('attributionModel', prog.attribution_model,
      'attributionWindowDays', prog.attribution_window_days, 'payoutsEnabled', prog.payouts_enabled,
      'regulatoryReviewReference', prog.regulatory_review_reference, 'updatedAt', prog.updated_at),
    'changes', coalesce((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'change', c.change, 'reason', c.reason,
        'status', c.status, 'requestedBy', c.requested_by, 'decidedBy', c.decided_by, 'decisionReason', c.decision_reason,
        'createdAt', c.created_at) ORDER BY c.created_at DESC)
      FROM (SELECT * FROM billing.partner_program_changes ORDER BY created_at DESC LIMIT 50) c), '[]'::jsonb),
    'partners', coalesce((SELECT jsonb_agg(billing.partner_json(p) || jsonb_build_object(
        'referrals', (SELECT count(*) FROM billing.referral_attributions a WHERE a.partner_id = p.id AND a.status = 'active'),
        'codes', (SELECT count(*) FROM billing.referral_codes c WHERE c.partner_id = p.id AND c.status = 'active'),
        'balances', billing.partner_balances(p.id)) ORDER BY p.status <> 'pending', p.name)
      FROM public.platform_partners p), '[]'::jsonb),
    'rules', coalesce((SELECT jsonb_agg(billing.commission_rule_json(r) ORDER BY r.status, r.effective_from DESC)
      FROM billing.commission_rules r), '[]'::jsonb),
    'payouts', coalesce((SELECT jsonb_agg(jsonb_build_object('id', po.id, 'partnerId', po.partner_id,
        'partnerName', p.name, 'currency', po.currency, 'amountMinor', po.amount_minor, 'status', po.status,
        'requestedBy', po.requested_by, 'requestedAt', po.requested_at, 'approvedBy', po.approved_by,
        'paidAt', po.paid_at, 'paymentReference', po.payment_reference) ORDER BY po.requested_at DESC)
      FROM billing.partner_payouts po JOIN public.platform_partners p ON p.id = po.partner_id), '[]'::jsonb),
    'viewer', auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.platform_review_partner(_id uuid, _decision text, _evidence text, _reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  ptn public.platform_partners%ROWTYPE;
  before_row jsonb;
  next_status text;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF length(btrim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO ptn FROM public.platform_partners WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Choose a partner' USING ERRCODE = '22023';
  END IF;
  before_row := billing.partner_json(ptn);
  next_status := CASE
    WHEN _decision = 'approve' AND ptn.status IN ('pending', 'suspended') THEN 'approved'
    WHEN _decision = 'reject' AND ptn.status = 'pending' THEN 'rejected'
    WHEN _decision = 'suspend' AND ptn.status = 'approved' THEN 'suspended'
  END;
  IF next_status IS NULL THEN
    RAISE EXCEPTION 'That decision does not apply to a % partner', ptn.status USING ERRCODE = '22023';
  END IF;
  IF next_status = 'approved' THEN
    IF length(btrim(coalesce(_evidence, ptn.verification_evidence, ''))) < 3 THEN
      RAISE EXCEPTION 'Record what was verified before approving' USING ERRCODE = '22023';
    END IF;
    IF ptn.applied_by IS NOT DISTINCT FROM auth.uid() OR billing.partner_role(ptn.id, auth.uid()) IS NOT NULL THEN
      RAISE EXCEPTION 'You cannot approve a partnership you belong to' USING ERRCODE = '42501';
    END IF;
  END IF;
  UPDATE public.platform_partners
     SET status = next_status, verification_evidence = coalesce(nullif(btrim(_evidence), ''), verification_evidence),
         reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
   WHERE id = _id RETURNING * INTO ptn;
  PERFORM private.platform_log('partner.' || _decision, 'platform_partner', ptn.id::text, before_row,
    billing.partner_json(ptn), btrim(_reason));
  RETURN billing.partner_json(ptn);
END $$;

CREATE OR REPLACE FUNCTION public.platform_save_commission_rule(_data jsonb, _reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  rid uuid := nullif(_data ->> 'id', '')::uuid;
  existing billing.commission_rules%ROWTYPE;
  saved billing.commission_rules%ROWTYPE;
  rule_kind text := _data ->> 'kind';
  plans text[];
  country_list char(2)[];
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF length(btrim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(_data -> 'planCodes') = 'array' THEN
    plans := ARRAY(SELECT x FROM jsonb_array_elements_text(_data -> 'planCodes') x);
    IF cardinality(plans) = 0 THEN plans := NULL; END IF;
  END IF;
  IF jsonb_typeof(_data -> 'countries') = 'array' THEN
    country_list := ARRAY(SELECT upper(x) FROM jsonb_array_elements_text(_data -> 'countries') x);
    IF cardinality(country_list) = 0 THEN country_list := NULL; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(country_list) c WHERE NOT EXISTS (SELECT 1 FROM billing.countries k WHERE k.code = c)) THEN
    RAISE EXCEPTION 'Choose supported countries' USING ERRCODE = '22023';
  END IF;
  IF rid IS NOT NULL THEN
    SELECT * INTO existing FROM billing.commission_rules WHERE id = rid FOR UPDATE;
    IF NOT FOUND OR existing.status <> 'draft' THEN
      RAISE EXCEPTION 'Only draft rules can be edited' USING ERRCODE = '42501';
    END IF;
    DELETE FROM billing.commission_rules WHERE id = rid;
  END IF;
  INSERT INTO billing.commission_rules (id, name, partner_id, kind, percent_bps, fixed_minor, fixed_currency,
    plan_codes, countries, duration_months, hold_days, min_payout_minor, min_payout_currency,
    effective_from, effective_to, created_by, reason)
  VALUES (coalesce(rid, gen_random_uuid()), btrim(_data ->> 'name'), nullif(_data ->> 'partnerId', '')::uuid, rule_kind,
    CASE WHEN rule_kind = 'percent' THEN (_data ->> 'percentBps')::integer END,
    CASE WHEN rule_kind = 'fixed' THEN (_data ->> 'fixedMinor')::bigint END,
    CASE WHEN rule_kind = 'fixed' THEN upper(_data ->> 'fixedCurrency') END,
    plans, country_list, nullif(_data ->> 'durationMonths', '')::integer,
    (_data ->> 'holdDays')::integer, (_data ->> 'minPayoutMinor')::bigint, upper(_data ->> 'minPayoutCurrency'),
    (_data ->> 'effectiveFrom')::date, nullif(_data ->> 'effectiveTo', '')::date, auth.uid(), btrim(_reason))
  RETURNING * INTO saved;
  PERFORM private.platform_log('commission_rule.drafted', 'commission_rule', saved.id::text,
    CASE WHEN rid IS NULL THEN NULL ELSE billing.commission_rule_json(existing) END,
    billing.commission_rule_json(saved), btrim(_reason));
  RETURN billing.commission_rule_json(saved);
END $$;

CREATE OR REPLACE FUNCTION public.platform_approve_commission_rule(_id uuid, _reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  r billing.commission_rules%ROWTYPE;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF public.platform_role() IS DISTINCT FROM 'platform_owner' THEN
    RAISE EXCEPTION 'Only a platform owner can approve commission rules' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM billing.commission_rules WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR r.status <> 'draft' THEN
    RAISE EXCEPTION 'Choose a draft rule' USING ERRCODE = '22023';
  END IF;
  IF r.created_by = auth.uid() THEN
    RAISE EXCEPTION 'Another platform owner must approve a rule you drafted' USING ERRCODE = '42501';
  END IF;
  IF r.partner_id IS NOT NULL AND billing.partner_role(r.partner_id, auth.uid()) IS NOT NULL THEN
    RAISE EXCEPTION 'You cannot approve a rule for a partnership you belong to' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM billing.commission_rules WHERE status = 'approved' FOR UPDATE;
  IF EXISTS (SELECT 1 FROM billing.commission_rules o
              WHERE o.status = 'approved' AND o.partner_id IS NOT DISTINCT FROM r.partner_id
                AND daterange(o.effective_from, o.effective_to) && daterange(r.effective_from, r.effective_to)) THEN
    RAISE EXCEPTION 'Another approved rule already covers these dates; retire it first' USING ERRCODE = '23P01';
  END IF;
  UPDATE billing.commission_rules SET status = 'approved', approved_by = auth.uid(), approved_at = now()
   WHERE id = _id RETURNING * INTO r;
  PERFORM private.platform_log('commission_rule.approved', 'commission_rule', r.id::text,
    jsonb_build_object('status', 'draft'), billing.commission_rule_json(r), btrim(coalesce(_reason, '')));
  RETURN billing.commission_rule_json(r);
END $$;

CREATE OR REPLACE FUNCTION public.platform_retire_commission_rule(_id uuid, _effective_to date, _reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  r billing.commission_rules%ROWTYPE;
  before_row jsonb;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF length(btrim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO r FROM billing.commission_rules WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR r.status = 'retired' THEN
    RAISE EXCEPTION 'Choose an active rule' USING ERRCODE = '22023';
  END IF;
  IF r.status = 'draft' THEN
    DELETE FROM billing.commission_rules WHERE id = _id;
    PERFORM private.platform_log('commission_rule.discarded', 'commission_rule', r.id::text,
      billing.commission_rule_json(r), NULL, btrim(_reason));
    RETURN jsonb_build_object('id', r.id, 'status', 'discarded');
  END IF;
  IF _effective_to IS NULL OR _effective_to <= r.effective_from
     OR _effective_to < (now() AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION 'Choose an end date from today that is after the start date' USING ERRCODE = '22023';
  END IF;
  before_row := billing.commission_rule_json(r);
  UPDATE billing.commission_rules SET status = 'retired', effective_to = least(coalesce(effective_to, _effective_to), _effective_to)
   WHERE id = _id RETURNING * INTO r;
  PERFORM private.platform_log('commission_rule.retired', 'commission_rule', r.id::text, before_row,
    billing.commission_rule_json(r), btrim(_reason));
  RETURN billing.commission_rule_json(r);
END $$;


-- Programme settings, including the payouts kill switch, change only with a second owner.
CREATE OR REPLACE FUNCTION billing.validated_program_change(_change jsonb) RETURNS billing.partner_program
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE
  prog billing.partner_program%ROWTYPE;
BEGIN
  SELECT * INTO prog FROM billing.partner_program;
  IF _change IS NULL OR jsonb_typeof(_change) <> 'object' OR _change = '{}'::jsonb
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(_change) k
                 WHERE k NOT IN ('attributionModel', 'attributionWindowDays', 'payoutsEnabled', 'regulatoryReviewReference')) THEN
    RAISE EXCEPTION 'Describe a programme change' USING ERRCODE = '22023';
  END IF;
  IF _change ? 'attributionModel' THEN
    prog.attribution_model := coalesce(_change ->> 'attributionModel', '');
    IF prog.attribution_model NOT IN ('last_touch', 'first_touch') THEN
      RAISE EXCEPTION 'Choose last-touch or first-touch attribution' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF _change ? 'attributionWindowDays' THEN
    prog.attribution_window_days := (_change ->> 'attributionWindowDays')::integer;
    IF prog.attribution_window_days IS NOT NULL AND prog.attribution_window_days NOT BETWEEN 1 AND 730 THEN
      RAISE EXCEPTION 'Choose an attribution window between 1 and 730 days' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF _change ? 'regulatoryReviewReference' THEN
    prog.regulatory_review_reference := nullif(btrim(_change ->> 'regulatoryReviewReference'), '');
  END IF;
  IF _change ? 'payoutsEnabled' THEN
    IF jsonb_typeof(_change -> 'payoutsEnabled') <> 'boolean' THEN
      RAISE EXCEPTION 'Payouts must be on or off' USING ERRCODE = '22023';
    END IF;
    prog.payouts_enabled := (_change ->> 'payoutsEnabled')::boolean;
  END IF;
  IF prog.payouts_enabled AND prog.regulatory_review_reference IS NULL THEN
    RAISE EXCEPTION 'Record the regulatory review reference before enabling payouts' USING ERRCODE = '22023';
  END IF;
  RETURN prog;
END $$;

CREATE OR REPLACE FUNCTION public.platform_request_partner_program_change(_change jsonb, _reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  rid uuid;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF length(btrim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason' USING ERRCODE = '22023';
  END IF;
  PERFORM billing.validated_program_change(_change);
  INSERT INTO billing.partner_program_changes (change, reason, requested_by)
  VALUES (_change, btrim(_reason), auth.uid()) RETURNING id INTO rid;
  PERFORM private.platform_log('partner_program.change_requested', 'partner_program', rid::text, NULL, _change, btrim(_reason));
  RETURN jsonb_build_object('id', rid, 'status', 'pending');
END $$;

CREATE OR REPLACE FUNCTION public.platform_decide_partner_program_change(_id uuid, _approve boolean, _reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  req billing.partner_program_changes%ROWTYPE;
  before_row billing.partner_program%ROWTYPE;
  next_row billing.partner_program%ROWTYPE;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF public.platform_role() IS DISTINCT FROM 'platform_owner' THEN
    RAISE EXCEPTION 'Only a platform owner can decide programme changes' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO req FROM billing.partner_program_changes WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR req.status <> 'pending' THEN
    RAISE EXCEPTION 'Choose a pending change' USING ERRCODE = '22023';
  END IF;
  IF req.requested_by = auth.uid() THEN
    RAISE EXCEPTION 'Another platform owner must decide a change you requested' USING ERRCODE = '42501';
  END IF;
  IF NOT _approve THEN
    UPDATE billing.partner_program_changes SET status = 'rejected', decided_by = auth.uid(), decided_at = now(),
      decision_reason = btrim(coalesce(_reason, '')) WHERE id = _id;
    PERFORM private.platform_log('partner_program.change_rejected', 'partner_program', _id::text, req.change, NULL,
      btrim(coalesce(_reason, '')));
    RETURN jsonb_build_object('id', _id, 'status', 'rejected');
  END IF;
  SELECT * INTO before_row FROM billing.partner_program FOR UPDATE;
  next_row := billing.validated_program_change(req.change);
  UPDATE billing.partner_program
     SET attribution_model = next_row.attribution_model, attribution_window_days = next_row.attribution_window_days,
         payouts_enabled = next_row.payouts_enabled, regulatory_review_reference = next_row.regulatory_review_reference,
         updated_by = auth.uid(), updated_at = now();
  UPDATE billing.partner_program_changes SET status = 'applied', decided_by = auth.uid(), decided_at = now(),
    decision_reason = btrim(coalesce(_reason, '')) WHERE id = _id;
  PERFORM private.platform_log('partner_program.changed', 'partner_program', _id::text,
    to_jsonb(before_row) - 'id', to_jsonb(next_row) - 'id', req.reason);
  RETURN jsonb_build_object('id', _id, 'status', 'applied');
END $$;

CREATE OR REPLACE FUNCTION public.platform_adjust_partner_commission(
  _partner_id uuid, _company_id uuid, _currency text, _amount_minor bigint, _reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  eid bigint;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF public.platform_role() IS DISTINCT FROM 'platform_owner' THEN
    RAISE EXCEPTION 'Only a platform owner can adjust commission' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'Explain the adjustment (for example the chargeback reference)' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.platform_partners p WHERE p.id = _partner_id) THEN
    RAISE EXCEPTION 'Choose a partner' USING ERRCODE = '22023';
  END IF;
  IF billing.partner_role(_partner_id, auth.uid()) IS NOT NULL THEN
    RAISE EXCEPTION 'You cannot adjust commission for a partnership you belong to' USING ERRCODE = '42501';
  END IF;
  INSERT INTO billing.commission_ledger (partner_id, company_id, entry_type, amount_minor, currency, available_at, memo, created_by)
  VALUES (_partner_id, _company_id, 'adjustment', _amount_minor, upper(_currency), now(), btrim(_reason), auth.uid())
  RETURNING id INTO eid;
  PERFORM private.platform_log('commission.adjusted', 'platform_partner', _partner_id::text, NULL,
    jsonb_build_object('entryId', eid, 'amountMinor', _amount_minor, 'currency', upper(_currency), 'companyId', _company_id),
    btrim(_reason));
  RETURN jsonb_build_object('id', eid);
END $$;

-- ---------------------------------------------------------------- payouts (manual, disabled by default)
CREATE OR REPLACE FUNCTION billing.require_payouts_enabled() RETURNS void
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
BEGIN
  IF NOT coalesce((SELECT p.payouts_enabled FROM billing.partner_program p), false) THEN
    RAISE EXCEPTION 'Partner payouts are disabled' USING ERRCODE = '42501';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.platform_request_partner_payout(_partner_id uuid, _currency text, _reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  ccy char(3) := upper(_currency);
  available bigint;
  rule_row billing.commission_rules%ROWTYPE;
  pid uuid;
BEGIN
  PERFORM private.require_platform('billing.manage');
  PERFORM billing.require_payouts_enabled();
  IF length(btrim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.platform_partners p WHERE p.id = _partner_id AND p.status = 'approved') THEN
    RAISE EXCEPTION 'Payouts are only made to approved partners' USING ERRCODE = 'P0001';
  END IF;
  IF billing.partner_role(_partner_id, auth.uid()) IS NOT NULL THEN
    RAISE EXCEPTION 'You cannot request a payout for a partnership you belong to' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.platform_partners p WHERE p.id = _partner_id FOR UPDATE;
  SELECT coalesce(sum(l.amount_minor), 0) INTO available FROM billing.commission_ledger l
   WHERE l.partner_id = _partner_id AND l.currency = ccy AND l.available_at <= now();
  rule_row := billing.commission_rule_for(_partner_id, (now() AT TIME ZONE 'UTC')::date);
  IF rule_row.id IS NULL OR rule_row.min_payout_currency <> ccy THEN
    RAISE EXCEPTION 'No current commission rule sets a minimum payout in %', ccy USING ERRCODE = 'P0001';
  END IF;
  IF available <= 0 OR available < rule_row.min_payout_minor THEN
    RAISE EXCEPTION 'The available balance is below the minimum payout' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO billing.partner_payouts (partner_id, currency, amount_minor, requested_by, request_reason)
  VALUES (_partner_id, ccy, available, auth.uid(), btrim(_reason)) RETURNING id INTO pid;
  INSERT INTO billing.commission_ledger (partner_id, entry_type, amount_minor, currency, payout_id, available_at, memo, created_by)
  VALUES (_partner_id, 'payout', -available, ccy, pid, now(), 'Payout requested', auth.uid());
  PERFORM private.platform_log('partner_payout.requested', 'partner_payout', pid::text, NULL,
    jsonb_build_object('partnerId', _partner_id, 'amountMinor', available, 'currency', ccy), btrim(_reason));
  RETURN jsonb_build_object('id', pid, 'amountMinor', available, 'currency', ccy, 'status', 'requested');
END $$;

CREATE OR REPLACE FUNCTION public.platform_decide_partner_payout(_id uuid, _decision text, _reference text, _reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  po billing.partner_payouts%ROWTYPE;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF length(btrim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO po FROM billing.partner_payouts WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Choose a payout' USING ERRCODE = '22023';
  END IF;
  IF _decision = 'approve' AND po.status = 'requested' THEN
    PERFORM billing.require_payouts_enabled();
    IF public.platform_role() IS DISTINCT FROM 'platform_owner' THEN
      RAISE EXCEPTION 'Only a platform owner can approve payouts' USING ERRCODE = '42501';
    END IF;
    IF po.requested_by = auth.uid() OR billing.partner_role(po.partner_id, auth.uid()) IS NOT NULL THEN
      RAISE EXCEPTION 'Another platform owner must approve this payout' USING ERRCODE = '42501';
    END IF;
    UPDATE billing.partner_payouts SET status = 'approved', approved_by = auth.uid(), approved_at = now()
     WHERE id = _id RETURNING * INTO po;
  ELSIF _decision = 'mark_paid' AND po.status = 'approved' THEN
    PERFORM billing.require_payouts_enabled();
    IF length(btrim(coalesce(_reference, ''))) < 3 THEN
      RAISE EXCEPTION 'Record the bank transfer reference' USING ERRCODE = '22023';
    END IF;
    UPDATE billing.partner_payouts SET status = 'paid', paid_by = auth.uid(), paid_at = now(),
      payment_reference = btrim(_reference) WHERE id = _id RETURNING * INTO po;
  ELSIF _decision = 'cancel' AND po.status IN ('requested', 'approved') THEN
    UPDATE billing.partner_payouts SET status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now(),
      cancel_reason = btrim(_reason) WHERE id = _id RETURNING * INTO po;
    INSERT INTO billing.commission_ledger (partner_id, entry_type, amount_minor, currency, payout_id, available_at, memo, created_by)
    VALUES (po.partner_id, 'payout_cancelled', po.amount_minor, po.currency, po.id, now(), 'Payout cancelled', auth.uid());
  ELSE
    RAISE EXCEPTION 'That decision does not apply to a % payout', po.status USING ERRCODE = '22023';
  END IF;
  PERFORM private.platform_log('partner_payout.' || _decision, 'partner_payout', po.id::text, NULL,
    jsonb_build_object('status', po.status, 'amountMinor', po.amount_minor, 'currency', po.currency,
      'reference', po.payment_reference), btrim(_reason));
  RETURN jsonb_build_object('id', po.id, 'status', po.status);
END $$;

CREATE OR REPLACE FUNCTION public.platform_add_partner_user(_partner_id uuid, _email text, _role text, _reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid uuid;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF _role NOT IN ('admin', 'member') OR length(btrim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Choose a role and record a reason' USING ERRCODE = '22023';
  END IF;
  SELECT u.id INTO uid FROM auth.users u WHERE lower(u.email) = lower(btrim(_email));
  IF uid IS NULL OR NOT EXISTS (SELECT 1 FROM public.platform_partners p WHERE p.id = _partner_id) THEN
    RAISE EXCEPTION 'Choose an existing partner and user' USING ERRCODE = '22023';
  END IF;
  INSERT INTO billing.partner_users (partner_id, user_id, role, added_by) VALUES (_partner_id, uid, _role, auth.uid())
  ON CONFLICT (partner_id, user_id) DO UPDATE SET role = EXCLUDED.role;
  PERFORM private.platform_log('partner.user_added', 'platform_partner', _partner_id::text, NULL,
    jsonb_build_object('userId', uid, 'role', _role), btrim(_reason));
  RETURN jsonb_build_object('partnerId', _partner_id, 'userId', uid, 'role', _role);
END $$;

-- ---------------------------------------------------------------- grants
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'billing.guard_commission_rule()', 'billing.immutable_commission_entry()', 'billing.partner_role(uuid, uuid)',
    'billing.partner_json(public.platform_partners)', 'billing.commission_rule_json(billing.commission_rules)',
    'billing.partner_balances(uuid)', 'billing.commission_rule_for(uuid, date)', 'billing.accrue_partner_commission()',
    'billing.reverse_partner_commission()', 'billing.validated_program_change(jsonb)', 'billing.require_payouts_enabled()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', f);
    EXCEPTION WHEN undefined_object THEN NULL; END;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.billing_referral_status(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.billing_record_referral(uuid, text, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.billing_partner_apply(uuid, text, text, text, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.billing_partner_portal() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.billing_partner_create_code(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.billing_partner_disable_code(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_partner_program() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_review_partner(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_save_commission_rule(jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_approve_commission_rule(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_retire_commission_rule(uuid, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_request_partner_program_change(jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_decide_partner_program_change(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_adjust_partner_commission(uuid, uuid, text, bigint, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_request_partner_payout(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_decide_partner_payout(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_add_partner_user(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_referral_status(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.billing_record_referral(uuid, text, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.billing_partner_apply(uuid, text, text, text, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.billing_partner_portal() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.billing_partner_create_code(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.billing_partner_disable_code(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_partner_program() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_review_partner(uuid, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_save_commission_rule(jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_approve_commission_rule(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_retire_commission_rule(uuid, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_request_partner_program_change(jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_decide_partner_program_change(uuid, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_adjust_partner_commission(uuid, uuid, text, bigint, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_request_partner_payout(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_decide_partner_payout(uuid, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_add_partner_user(uuid, text, text, text) TO authenticated, service_role;
