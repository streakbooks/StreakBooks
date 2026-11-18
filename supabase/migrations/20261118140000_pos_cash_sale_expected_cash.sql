-- POS cash sale batch: expected session cash, sale/payment/movement tables, guarded checkout RPCs.
INSERT INTO public.role_permissions(role, permission)
SELECT role::public.company_role, 'pos.sale.create' FROM
  (VALUES ('owner'), ('admin'), ('bookkeeper'), ('staff')) roles(role)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions(role, permission)
SELECT role::public.company_role, permission FROM
  (VALUES ('owner'), ('admin'), ('bookkeeper')) roles(role)
CROSS JOIN (VALUES ('pos.cash.adjust'), ('pos.refund.create')) permissions(permission)
ON CONFLICT DO NOTHING;

ALTER TYPE public.journal_source_type ADD VALUE IF NOT EXISTS 'pos_sale';
ALTER TYPE public.journal_source_type ADD VALUE IF NOT EXISTS 'pos_refund';

ALTER TABLE public.pos_register_sessions
  ADD COLUMN IF NOT EXISTS expected_cash_minor bigint NOT NULL DEFAULT 0 CHECK (expected_cash_minor >= 0);

UPDATE public.pos_register_sessions SET expected_cash_minor = opening_float_minor;

ALTER TABLE public.pos_register_sessions DROP CONSTRAINT IF EXISTS pos_session_unchanged_float_close;

CREATE UNIQUE INDEX IF NOT EXISTS products_tenant_identity ON public.products (company_id, id);

CREATE TABLE public.pos_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  session_id uuid NOT NULL,
  register_id uuid NOT NULL,
  sale_operation_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('completed', 'refunded')),
  subtotal_minor bigint NOT NULL CHECK (subtotal_minor >= 0),
  tax_minor bigint NOT NULL CHECK (tax_minor >= 0),
  total_minor bigint NOT NULL CHECK (total_minor >= 0),
  journal_id uuid,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, sale_operation_id),
  FOREIGN KEY (company_id, session_id) REFERENCES public.pos_register_sessions (company_id, id),
  FOREIGN KEY (company_id, register_id) REFERENCES public.pos_registers (company_id, id),
  CONSTRAINT pos_sales_journal_fk FOREIGN KEY (journal_id) REFERENCES public.journals (id) ON DELETE RESTRICT
);

CREATE TABLE public.pos_sale_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  sale_id uuid NOT NULL,
  line_no integer NOT NULL CHECK (line_no >= 1),
  product_id uuid,
  product_kind public.product_kind NOT NULL,
  description text NOT NULL,
  quantity numeric(18, 6) NOT NULL CHECK (quantity > 0),
  unit_price_minor bigint NOT NULL CHECK (unit_price_minor >= 0),
  tax_rate_bps integer NOT NULL CHECK (tax_rate_bps >= 0 AND tax_rate_bps <= 10000),
  net_minor bigint NOT NULL CHECK (net_minor >= 0),
  tax_minor bigint NOT NULL CHECK (tax_minor >= 0),
  gross_minor bigint NOT NULL CHECK (gross_minor >= 0),
  income_account_id uuid NOT NULL,
  UNIQUE (sale_id, line_no),
  FOREIGN KEY (company_id, sale_id) REFERENCES public.pos_sales (company_id, id) ON DELETE CASCADE,
  FOREIGN KEY (company_id, product_id) REFERENCES public.products (company_id, id),
  FOREIGN KEY (company_id, income_account_id) REFERENCES public.accounts (company_id, id)
);

CREATE TABLE public.pos_sale_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  sale_id uuid NOT NULL,
  method text NOT NULL CHECK (method = 'cash'),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  tendered_minor bigint NOT NULL CHECK (tendered_minor >= 0),
  change_minor bigint NOT NULL CHECK (change_minor >= 0),
  UNIQUE (sale_id),
  FOREIGN KEY (company_id, sale_id) REFERENCES public.pos_sales (company_id, id) ON DELETE CASCADE
);

CREATE TABLE public.pos_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  sale_id uuid NOT NULL,
  session_id uuid NOT NULL,
  refund_operation_id uuid NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  journal_id uuid,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, refund_operation_id),
  UNIQUE (company_id, sale_id),
  FOREIGN KEY (company_id, sale_id) REFERENCES public.pos_sales (company_id, id),
  FOREIGN KEY (company_id, session_id) REFERENCES public.pos_register_sessions (company_id, id),
  CONSTRAINT pos_refunds_journal_fk FOREIGN KEY (journal_id) REFERENCES public.journals (id) ON DELETE RESTRICT
);

CREATE TABLE public.pos_cash_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  session_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('sale_tender_net', 'cash_in', 'cash_out', 'refund_cash')),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  sale_id uuid,
  refund_id uuid,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, operation_id),
  FOREIGN KEY (company_id, session_id) REFERENCES public.pos_register_sessions (company_id, id),
  FOREIGN KEY (company_id, sale_id) REFERENCES public.pos_sales (company_id, id),
  FOREIGN KEY (company_id, refund_id) REFERENCES public.pos_refunds (company_id, id)
);

CREATE INDEX pos_sales_session ON public.pos_sales (company_id, session_id, created_at DESC);
CREATE INDEX pos_cash_movements_session ON public.pos_cash_movements (company_id, session_id, created_at DESC);

ALTER TABLE public.pos_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_sale_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_sale_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_refunds ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.pos_sales, public.pos_sale_lines, public.pos_sale_payments, public.pos_cash_movements, public.pos_refunds
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.pos_sales, public.pos_sale_lines, public.pos_sale_payments, public.pos_cash_movements, public.pos_refunds TO authenticated;

CREATE POLICY pos_sales_read ON public.pos_sales FOR SELECT TO authenticated
  USING (public.is_company_member(company_id) AND public.has_company_permission(company_id, 'pos.view'));
CREATE POLICY pos_sale_lines_read ON public.pos_sale_lines FOR SELECT TO authenticated
  USING (public.is_company_member(company_id) AND public.has_company_permission(company_id, 'pos.view'));
CREATE POLICY pos_sale_payments_read ON public.pos_sale_payments FOR SELECT TO authenticated
  USING (public.is_company_member(company_id) AND public.has_company_permission(company_id, 'pos.view'));
CREATE POLICY pos_cash_movements_read ON public.pos_cash_movements FOR SELECT TO authenticated
  USING (public.is_company_member(company_id) AND public.has_company_permission(company_id, 'pos.view'));
CREATE POLICY pos_refunds_read ON public.pos_refunds FOR SELECT TO authenticated
  USING (public.is_company_member(company_id) AND public.has_company_permission(company_id, 'pos.view'));

CREATE OR REPLACE FUNCTION private.pos_half_up_div(_numer bigint, _denom bigint)
RETURNS bigint LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
  IF _denom <= 0 THEN RAISE EXCEPTION 'Invalid divisor'; END IF;
  IF _numer >= 0 THEN RETURN (_numer + _denom / 2) / _denom; END IF;
  RETURN -((-_numer + _denom / 2) / _denom);
END;
$$;

CREATE OR REPLACE FUNCTION private.pos_compute_tax_line(
  _quantity numeric,
  _unit_price_minor bigint,
  _discount_minor bigint,
  _tax_rate_bps integer,
  _prices_include_tax boolean
) RETURNS TABLE (net_minor bigint, tax_minor bigint, gross_minor bigint)
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  _qty_scaled bigint;
  _extended bigint;
  _amount bigint;
  _bps bigint;
BEGIN
  IF _quantity IS NULL OR _quantity <= 0 OR NOT (_quantity * 1000000 = trunc(_quantity * 1000000)) THEN
    RAISE EXCEPTION 'Quantity must be positive with at most six decimal places';
  END IF;
  IF _unit_price_minor IS NULL OR _unit_price_minor < 0 THEN RAISE EXCEPTION 'Invalid unit price'; END IF;
  _discount_minor := coalesce(_discount_minor, 0);
  IF _discount_minor < 0 THEN RAISE EXCEPTION 'Invalid discount'; END IF;
  IF _tax_rate_bps IS NULL OR _tax_rate_bps < 0 OR _tax_rate_bps > 10000 THEN RAISE EXCEPTION 'Invalid tax rate'; END IF;
  _qty_scaled := round(_quantity * 1000000)::bigint;
  IF _qty_scaled < 1 THEN RAISE EXCEPTION 'Quantity too small'; END IF;
  _extended := private.pos_half_up_div(_unit_price_minor * _qty_scaled, 1000000);
  _amount := _extended - _discount_minor;
  IF _amount < 0 THEN RAISE EXCEPTION 'Discount exceeds line amount'; END IF;
  _bps := _tax_rate_bps;
  IF _prices_include_tax THEN
    IF _bps = 0 THEN
      net_minor := _amount; tax_minor := 0; gross_minor := _amount;
    ELSE
      net_minor := private.pos_half_up_div(_amount * 10000, 10000 + _bps);
      tax_minor := _amount - net_minor;
      gross_minor := _amount;
    END IF;
  ELSE
    tax_minor := private.pos_half_up_div(_amount * _bps, 10000);
    net_minor := _amount;
    gross_minor := _amount + tax_minor;
  END IF;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION private.pos_sale_result_json(_sale public.pos_sales, _payment public.pos_sale_payments, _expected bigint)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'sale_id', _sale.id,
    'operation_id', _sale.sale_operation_id,
    'subtotal_minor', _sale.subtotal_minor::text,
    'tax_minor', _sale.tax_minor::text,
    'total_minor', _sale.total_minor::text,
    'tendered_minor', _payment.tendered_minor::text,
    'change_minor', _payment.change_minor::text,
    'expected_cash_minor', _expected::text,
    'journal_id', _sale.journal_id
  );
$$;

CREATE OR REPLACE FUNCTION public.post_journal(payload JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid UUID := auth.uid();
  _company_id UUID;
  _journal_date DATE;
  _memo TEXT;
  _currency CHAR(3);
  _fx NUMERIC(18,8);
  _source_type public.journal_source_type;
  _source_id UUID;
  _idem TEXT;
  _reverses UUID;
  _period_id UUID;
  _period_status public.period_status;
  _journal_id UUID;
  _existing UUID;
  _line JSONB;
  _line_no INT := 0;
  _account_id UUID;
  _debit BIGINT;
  _credit BIGINT;
  _sum_debit BIGINT := 0;
  _sum_credit BIGINT := 0;
  _acct RECORD;
  _base_currency CHAR(3);
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;

  _company_id := (payload->>'company_id')::UUID;
  IF _company_id IS NULL THEN RAISE EXCEPTION 'company_id is required'; END IF;

  _source_type := COALESCE((payload->>'source_type')::public.journal_source_type, 'manual');

  IF NOT public.is_company_member(_company_id) THEN
    RAISE EXCEPTION 'You do not have access to that organisation';
  END IF;
  IF NOT (
    public.has_company_permission(_company_id, 'accounting.post')
    OR public.has_company_permission(_company_id, 'journals.manual')
    OR (
      _source_type = 'payroll'::public.journal_source_type
      AND (
        public.has_company_permission(_company_id, 'payroll.run.post')
        OR public.has_company_permission(_company_id, 'payroll.pay')
      )
    )
    OR (
      _source_type = 'expense'::public.journal_source_type
      AND (
        public.has_company_permission(_company_id, 'expenses.post')
        OR public.has_company_permission(_company_id, 'expenses.reimburse')
      )
      AND NULLIF(payload->>'source_id', '')::UUID IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.expense_claims c
        WHERE c.id = NULLIF(payload->>'source_id', '')::UUID
          AND c.company_id = _company_id
      )
    )
    OR (
      _source_type = 'expense'::public.journal_source_type
      AND public.has_company_permission(_company_id, 'expenses.manage_advances')
      AND NULLIF(payload->>'source_id', '')::UUID IS NOT NULL
      AND (
        EXISTS (
          SELECT 1 FROM public.expense_cash_advances a
          WHERE a.id = NULLIF(payload->>'source_id', '')::UUID
            AND a.company_id = _company_id
        )
        OR EXISTS (
          SELECT 1 FROM public.expense_petty_cash_floats f
          WHERE f.id = NULLIF(payload->>'source_id', '')::UUID
            AND f.company_id = _company_id
        )
      )
    )
    OR (
      _source_type = 'pos_sale'::public.journal_source_type
      AND public.has_company_permission(_company_id, 'pos.sale.create')
      AND NULLIF(payload->>'source_id', '')::UUID IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.pos_sales s
        WHERE s.id = NULLIF(payload->>'source_id', '')::UUID AND s.company_id = _company_id
      )
    )
    OR (
      _source_type = 'pos_refund'::public.journal_source_type
      AND public.has_company_permission(_company_id, 'pos.refund.create')
      AND NULLIF(payload->>'source_id', '')::UUID IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.pos_refunds r
        WHERE r.id = NULLIF(payload->>'source_id', '')::UUID AND r.company_id = _company_id
      )
    )
  ) THEN
    RAISE EXCEPTION 'You do not have permission to post journals';
  END IF;

  _journal_date := (payload->>'journal_date')::DATE;
  IF _journal_date IS NULL THEN RAISE EXCEPTION 'journal_date is required'; END IF;
  _memo := NULLIF(trim(COALESCE(payload->>'memo', '')), '');
  _currency := upper(COALESCE(payload->>'currency_code', ''));
  _fx := COALESCE((payload->>'fx_rate_to_base')::NUMERIC, 1);
  IF _fx <= 0 THEN RAISE EXCEPTION 'fx_rate_to_base must be positive'; END IF;
  _source_id := NULLIF(payload->>'source_id', '')::UUID;
  _idem := NULLIF(trim(COALESCE(payload->>'idempotency_key', '')), '');
  _reverses := NULLIF(payload->>'reverses_journal_id', '')::UUID;

  SELECT base_currency INTO _base_currency FROM public.companies WHERE id = _company_id;
  IF _currency = '' THEN _currency := _base_currency; END IF;
  IF length(_currency) <> 3 THEN RAISE EXCEPTION 'Invalid currency_code'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.currency_decimals WHERE code = _currency) THEN
    RAISE EXCEPTION 'Unsupported currency %', _currency;
  END IF;

  IF _idem IS NOT NULL THEN
    SELECT id INTO _existing FROM public.journals
    WHERE company_id = _company_id AND idempotency_key = _idem;
    IF _existing IS NOT NULL THEN
      RETURN _existing;
    END IF;
  END IF;

  SELECT id, status INTO _period_id, _period_status
  FROM public.accounting_periods
  WHERE company_id = _company_id
    AND start_date <= _journal_date
    AND end_date >= _journal_date
  LIMIT 1;

  IF _period_id IS NULL THEN
    RAISE EXCEPTION 'No accounting period covers posting date %', _journal_date;
  END IF;
  IF _period_status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'Accounting period is %; posting is not allowed', _period_status;
  END IF;

  PERFORM public.assert_journal_date_unlocked(_company_id, _journal_date);

  IF jsonb_typeof(payload->'lines') <> 'array' OR jsonb_array_length(payload->'lines') < 2 THEN
    RAISE EXCEPTION 'Journal requires at least two lines';
  END IF;

  PERFORM set_config('linkbooks.trusted', 'on', true);

  INSERT INTO public.journals (
    company_id, journal_number, journal_date, period_id, status,
    source_type, source_id, idempotency_key, memo, currency_code, fx_rate_to_base,
    reverses_journal_id, created_by, posted_at, posted_by
  ) VALUES (
    _company_id, public.next_journal_number(_company_id), _journal_date, _period_id, 'posted',
    _source_type, _source_id, _idem, _memo, _currency, _fx,
    _reverses, _uid, now(), _uid
  ) RETURNING id INTO _journal_id;

  FOR _line IN SELECT value FROM jsonb_array_elements(payload->'lines')
  LOOP
    _line_no := _line_no + 1;
    _account_id := (_line->>'account_id')::UUID;
    _debit := COALESCE((_line->>'debit_minor')::BIGINT, 0);
    _credit := COALESCE((_line->>'credit_minor')::BIGINT, 0);

    IF _account_id IS NULL THEN
      RAISE EXCEPTION 'Line % missing account_id', _line_no;
    END IF;
    IF (_debit > 0 AND _credit > 0) OR (_debit = 0 AND _credit = 0) THEN
      RAISE EXCEPTION 'Line % must have either debit_minor or credit_minor > 0, not both', _line_no;
    END IF;
    IF _debit < 0 OR _credit < 0 THEN
      RAISE EXCEPTION 'Line % amounts must be non-negative minor units', _line_no;
    END IF;

    SELECT * INTO _acct FROM public.accounts WHERE id = _account_id AND company_id = _company_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Account % not found in organisation', _account_id;
    END IF;
    IF NOT _acct.is_active OR _acct.archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'Account % is inactive', _acct.code;
    END IF;
    IF NOT _acct.is_postable THEN
      RAISE EXCEPTION 'Account % is not postable', _acct.code;
    END IF;

    INSERT INTO public.journal_lines (
      journal_id, company_id, line_no, account_id, description, debit_minor, credit_minor
    ) VALUES (
      _journal_id, _company_id, _line_no, _account_id,
      NULLIF(trim(COALESCE(_line->>'description', '')), ''),
      _debit, _credit
    );

    _sum_debit := _sum_debit + _debit;
    _sum_credit := _sum_credit + _credit;
  END LOOP;

  IF _sum_debit <> _sum_credit THEN
    RAISE EXCEPTION 'Journal does not balance: debits % <> credits % (minor units)', _sum_debit, _sum_credit;
  END IF;
  IF _sum_debit = 0 THEN
    RAISE EXCEPTION 'Journal total cannot be zero';
  END IF;

  IF _reverses IS NOT NULL THEN
    UPDATE public.journals
    SET reversed_by_journal_id = _journal_id, updated_at = now()
    WHERE id = _reverses AND company_id = _company_id AND status = 'posted';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Journal to reverse not found or not posted';
    END IF;
  END IF;

  INSERT INTO public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, details)
  VALUES (
    _company_id, _uid, 'journal.posted', 'journal', _journal_id,
    jsonb_build_object(
      'debit_minor', _sum_debit,
      'credit_minor', _sum_credit,
      'source_type', _source_type,
      'idempotency_key', _idem,
      'reverses_journal_id', _reverses
    )
  );

  PERFORM set_config('linkbooks.trusted', 'off', true);
  RETURN _journal_id;

EXCEPTION WHEN unique_violation THEN
  IF _idem IS NOT NULL THEN
    SELECT id INTO _existing FROM public.journals
    WHERE company_id = _company_id AND idempotency_key = _idem;
    IF _existing IS NOT NULL THEN
      PERFORM set_config('linkbooks.trusted', 'off', true);
      RETURN _existing;
    END IF;
  END IF;
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION private.pos_open_session(
 _company_id uuid,_register_id uuid,_operation_id uuid,_opening_float_minor bigint
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE _r public.pos_registers%ROWTYPE; _s public.pos_register_sessions%ROWTYPE; _currency text;
BEGIN
 PERFORM private.pos_require_permission(_company_id,'pos.register.open');
 IF _operation_id IS NULL OR _opening_float_minor IS NULL OR _opening_float_minor<0 THEN
  RAISE EXCEPTION 'Invalid opening float or operation' USING ERRCODE='22023';
 END IF;
 SELECT * INTO _r FROM public.pos_registers WHERE company_id=_company_id AND id=_register_id FOR UPDATE;
 IF NOT FOUND OR NOT private.pos_can_access_location(_company_id,_r.location_id) THEN
  RAISE EXCEPTION 'Register unavailable' USING ERRCODE='42501';
 END IF;
 SELECT * INTO _s FROM public.pos_register_sessions WHERE company_id=_company_id AND open_operation_id=_operation_id;
 IF FOUND THEN
  IF _s.register_id IS DISTINCT FROM _register_id OR _s.opening_float_minor IS DISTINCT FROM _opening_float_minor
     OR _s.opened_by IS DISTINCT FROM auth.uid() THEN
   RAISE EXCEPTION 'Opening operation payload differs' USING ERRCODE='22023';
  END IF;
  RETURN _s.id;
 END IF;
 IF NOT _r.is_active OR NOT EXISTS(SELECT 1 FROM public.hr_locations WHERE company_id=_company_id AND id=_r.location_id AND is_active) THEN
  RAISE EXCEPTION 'Register or location is inactive' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.accounts a JOIN public.companies c ON c.id=a.company_id
   WHERE a.company_id=_company_id AND a.id=_r.cash_account_id AND a.is_active AND a.is_postable
   AND a.account_type='asset' AND a.account_kind IN ('bank','current_asset')
   AND (a.currency_code IS NULL OR a.currency_code=c.base_currency)) THEN
  RAISE EXCEPTION 'Register cash mapping is no longer valid' USING ERRCODE='22023';
 END IF;
 SELECT base_currency INTO _currency FROM public.companies WHERE id=_company_id;
 INSERT INTO public.pos_register_sessions(company_id,register_id,opened_by,opening_float_minor,expected_cash_minor,currency_code,open_operation_id)
 VALUES(_company_id,_register_id,auth.uid(),_opening_float_minor,_opening_float_minor,_currency,_operation_id) RETURNING id INTO _s.id;
 PERFORM public.record_audit_event(_company_id,'pos.session.opened','pos_register_session',_s.id,
  jsonb_build_object('register_id',_register_id,'opening_float_minor',_opening_float_minor::text,'currency',_currency));
 RETURN _s.id;
END $$;

CREATE OR REPLACE FUNCTION private.pos_close_session(
 _company_id uuid,_session_id uuid,_operation_id uuid,_closing_count_minor bigint
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE _s public.pos_register_sessions%ROWTYPE; _location uuid; _variance bigint;
BEGIN
 PERFORM private.pos_require_permission(_company_id,'pos.register.close');
 PERFORM private.pos_require_permission(_company_id,'pos.cash.count');
 IF _operation_id IS NULL OR _closing_count_minor IS NULL OR _closing_count_minor<0 THEN
  RAISE EXCEPTION 'Invalid closing count or operation' USING ERRCODE='22023';
 END IF;
 SELECT * INTO _s FROM public.pos_register_sessions WHERE company_id=_company_id AND id=_session_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Session unavailable' USING ERRCODE='42501'; END IF;
 SELECT location_id INTO _location FROM public.pos_registers WHERE company_id=_company_id AND id=_s.register_id;
 IF NOT private.pos_can_access_location(_company_id,_location)
    OR (_s.opened_by IS DISTINCT FROM auth.uid() AND NOT public.has_company_permission(_company_id,'pos.settings.manage')) THEN
  RAISE EXCEPTION 'Session unavailable for this cashier' USING ERRCODE='42501';
 END IF;
 IF _s.closed_at IS NOT NULL THEN
  IF _s.close_operation_id IS DISTINCT FROM _operation_id OR _s.closing_count_minor IS DISTINCT FROM _closing_count_minor THEN
   RAISE EXCEPTION 'Session is locked; closing operation differs' USING ERRCODE='22023';
  END IF;
  RETURN _s.id;
 END IF;
 IF _closing_count_minor<>_s.expected_cash_minor THEN
  _variance := _closing_count_minor - _s.expected_cash_minor;
  RAISE EXCEPTION 'Cash variance requires an approved accounting adjustment; session remains open' USING ERRCODE='22023',
    DETAIL = format('variance_minor=%s', _variance::text);
 END IF;
 UPDATE public.pos_register_sessions SET closed_at=clock_timestamp(),closed_by=auth.uid(),
  closing_count_minor=_closing_count_minor,close_operation_id=_operation_id WHERE id=_session_id;
 PERFORM public.record_audit_event(_company_id,'pos.session.closed','pos_register_session',_session_id,
  jsonb_build_object('count_minor',_closing_count_minor::text,'variance_minor','0','expected_cash_minor',_s.expected_cash_minor::text));
 RETURN _session_id;
END $$;

CREATE OR REPLACE FUNCTION private.pos_complete_cash_sale(
  _company_id uuid,
  _session_id uuid,
  _operation_id uuid,
  _cash_tendered_minor bigint,
  _lines jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _s public.pos_register_sessions%ROWTYPE;
  _r public.pos_registers%ROWTYPE;
  _existing public.pos_sales%ROWTYPE;
  _payment public.pos_sale_payments%ROWTYPE;
  _item jsonb;
  _line_no int := 0;
  _product public.products%ROWTYPE;
  _inclusive boolean;
  _tax uuid;
  _cash_acct uuid;
  _subtotal bigint := 0;
  _tax_total bigint := 0;
  _gross_total bigint := 0;
  _change bigint;
  _sale_id uuid := gen_random_uuid();
  _journal_id uuid;
  _journal_lines jsonb := '[]'::jsonb;
  _revenue jsonb := '{}'::jsonb;
  _k text;
  _credit bigint;
  _qty numeric;
  _tax_line record;
  _rev record;
  _expected bigint;
  _movement_op uuid;
  _today date := (timezone((SELECT timezone FROM public.companies WHERE id = _company_id), now()))::date;
BEGIN
  PERFORM private.pos_require_permission(_company_id, 'pos.sale.create');
  IF _operation_id IS NULL OR _cash_tendered_minor IS NULL OR _cash_tendered_minor < 0 THEN
    RAISE EXCEPTION 'Invalid sale request' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) < 1 OR jsonb_array_length(_lines) > 100 THEN
    RAISE EXCEPTION 'Sale requires between 1 and 100 lines' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _s FROM public.pos_register_sessions WHERE company_id = _company_id AND id = _session_id FOR UPDATE;
  IF NOT FOUND OR _s.closed_at IS NOT NULL THEN RAISE EXCEPTION 'Session unavailable' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _r FROM public.pos_registers WHERE company_id = _company_id AND id = _s.register_id;
  IF NOT private.pos_can_access_location(_company_id, _r.location_id)
     OR (_s.opened_by IS DISTINCT FROM auth.uid()
         AND NOT public.has_company_permission(_company_id, 'pos.settings.manage')) THEN
    RAISE EXCEPTION 'Session unavailable for this cashier' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _existing FROM public.pos_sales WHERE company_id = _company_id AND sale_operation_id = _operation_id;
  IF FOUND THEN
    SELECT * INTO _payment FROM public.pos_sale_payments WHERE sale_id = _existing.id;
    IF _existing.session_id IS DISTINCT FROM _session_id
       OR _payment.tendered_minor IS DISTINCT FROM _cash_tendered_minor
       OR _payment.amount_minor IS DISTINCT FROM _existing.total_minor THEN
      RAISE EXCEPTION 'Sale operation payload differs' USING ERRCODE = '22023';
    END IF;
    -- Line fingerprint: same product_id/quantity order and values as the durable sale lines.
    IF EXISTS (
      SELECT 1
      FROM (
        SELECT ordinality::int AS line_no,
               (value->>'product_id')::uuid AS product_id,
               (value->>'quantity')::numeric AS quantity
        FROM jsonb_array_elements(_lines) WITH ORDINALITY
      ) requested
      FULL OUTER JOIN public.pos_sale_lines stored
        ON stored.sale_id = _existing.id AND stored.line_no = requested.line_no
      WHERE stored.id IS NULL
         OR requested.product_id IS NULL
         OR stored.product_id IS DISTINCT FROM requested.product_id
         OR stored.quantity IS DISTINCT FROM requested.quantity
    ) THEN
      RAISE EXCEPTION 'Sale operation payload differs' USING ERRCODE = '22023';
    END IF;
    SELECT expected_cash_minor INTO _expected FROM public.pos_register_sessions WHERE id = _existing.session_id;
    RETURN private.pos_sale_result_json(_existing, _payment, _expected);
  END IF;

  SELECT coalesce(prices_include_tax, false) INTO _inclusive FROM public.company_tax_settings WHERE company_id = _company_id;
  _cash_acct := _r.cash_account_id;

  DROP TABLE IF EXISTS _pos_sale_work;
  CREATE TEMP TABLE _pos_sale_work (
    line_no int PRIMARY KEY,
    product_id uuid,
    product_kind public.product_kind,
    description text,
    quantity numeric(18, 6),
    unit_price_minor bigint,
    tax_rate_bps integer,
    net_minor bigint,
    tax_minor bigint,
    gross_minor bigint,
    income_account_id uuid
  ) ON COMMIT DROP;

  FOR _item IN SELECT value FROM jsonb_array_elements(_lines) WITH ORDINALITY AS t(value, ord) ORDER BY ord
  LOOP
    _line_no := _line_no + 1;
    IF _item ? 'product_id' IS NOT TRUE OR _item ? 'quantity' IS NOT TRUE THEN
      RAISE EXCEPTION 'Line % missing product or quantity', _line_no USING ERRCODE = '22023';
    END IF;
    _qty := (_item->>'quantity')::numeric;
    SELECT * INTO _product FROM public.products
    WHERE id = (_item->>'product_id')::uuid AND company_id = _company_id AND is_active AND archived_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product unavailable on line %', _line_no USING ERRCODE = '22023'; END IF;
    IF _product.kind NOT IN ('service', 'product', 'non_inventory') THEN
      RAISE EXCEPTION 'Product kind not sellable on line %', _line_no USING ERRCODE = '22023';
    END IF;
    IF _product.income_account_id IS NULL THEN
      RAISE EXCEPTION 'Product missing income account on line %', _line_no USING ERRCODE = '22023';
    END IF;
    SELECT * INTO _tax_line FROM private.pos_compute_tax_line(
      _qty, _product.sales_price_minor, 0, _product.sales_tax_rate_bps, _inclusive);
    INSERT INTO _pos_sale_work VALUES (
      _line_no, _product.id, _product.kind, _product.name, _qty, _product.sales_price_minor, _product.sales_tax_rate_bps,
      _tax_line.net_minor, _tax_line.tax_minor, _tax_line.gross_minor, _product.income_account_id);
    _subtotal := _subtotal + _tax_line.net_minor;
    _tax_total := _tax_total + _tax_line.tax_minor;
    _gross_total := _gross_total + _tax_line.gross_minor;
  END LOOP;

  IF _gross_total <= 0 THEN RAISE EXCEPTION 'Sale total must be greater than zero' USING ERRCODE = '22023'; END IF;
  IF _cash_tendered_minor < _gross_total THEN
    RAISE EXCEPTION 'Cash tendered is below sale total' USING ERRCODE = '22023';
  END IF;
  _change := _cash_tendered_minor - _gross_total;

  INSERT INTO public.pos_sales (
    id, company_id, session_id, register_id, sale_operation_id, status,
    subtotal_minor, tax_minor, total_minor, created_by
  ) VALUES (
    _sale_id, _company_id, _session_id, _r.id, _operation_id, 'completed',
    _subtotal, _tax_total, _gross_total, auth.uid()
  );

  FOR _rev IN
    SELECT income_account_id, sum(net_minor) AS net_minor
    FROM _pos_sale_work GROUP BY income_account_id
  LOOP
    _revenue := _revenue || jsonb_build_object(_rev.income_account_id::text, _rev.net_minor);
  END LOOP;

  _journal_lines := jsonb_build_array(
    jsonb_build_object('account_id', _cash_acct, 'description', 'POS cash sale', 'debit_minor', _gross_total, 'credit_minor', 0)
  );
  FOR _k, _credit IN SELECT key, value::bigint FROM jsonb_each_text(_revenue) LOOP
    _journal_lines := _journal_lines || jsonb_build_array(
      jsonb_build_object('account_id', _k::uuid, 'description', 'POS revenue', 'debit_minor', 0, 'credit_minor', _credit)
    );
  END LOOP;
  IF _tax_total > 0 THEN
    _tax := public.ops_output_tax_account(_company_id);
    IF _tax IS NULL THEN RAISE EXCEPTION 'Output tax account is not configured' USING ERRCODE = '22023'; END IF;
    _journal_lines := _journal_lines || jsonb_build_array(
      jsonb_build_object('account_id', _tax, 'description', 'Output tax', 'debit_minor', 0, 'credit_minor', _tax_total)
    );
  END IF;

  _journal_id := public.post_journal(jsonb_build_object(
    'company_id', _company_id,
    'journal_date', _today,
    'currency_code', _s.currency_code,
    'source_type', 'pos_sale',
    'source_id', _sale_id,
    'idempotency_key', 'pos-sale:' || _operation_id::text,
    'memo', 'POS cash sale',
    'lines', _journal_lines
  ));

  UPDATE public.pos_sales SET journal_id = _journal_id WHERE id = _sale_id;

  INSERT INTO public.pos_sale_lines (
    company_id, sale_id, line_no, product_id, product_kind, description, quantity, unit_price_minor,
    tax_rate_bps, net_minor, tax_minor, gross_minor, income_account_id
  )
  SELECT _company_id, _sale_id, line_no, product_id, product_kind, description, quantity, unit_price_minor,
    tax_rate_bps, net_minor, tax_minor, gross_minor, income_account_id
  FROM _pos_sale_work;

  INSERT INTO public.pos_sale_payments (company_id, sale_id, method, amount_minor, tendered_minor, change_minor)
  VALUES (_company_id, _sale_id, 'cash', _gross_total, _cash_tendered_minor, _change)
  RETURNING * INTO _payment;

  _movement_op := gen_random_uuid();
  INSERT INTO public.pos_cash_movements (
    company_id, session_id, operation_id, kind, amount_minor, sale_id, created_by
  ) VALUES (
    _company_id, _session_id, _movement_op, 'sale_tender_net', _gross_total, _sale_id, auth.uid()
  );

  UPDATE public.pos_register_sessions
  SET expected_cash_minor = expected_cash_minor + _gross_total
  WHERE id = _session_id
  RETURNING expected_cash_minor INTO _expected;

  PERFORM public.record_audit_event(_company_id, 'pos.sale.completed', 'pos_sale', _sale_id,
    jsonb_build_object('total_minor', _gross_total::text, 'operation_id', _operation_id::text));

  SELECT * INTO _existing FROM public.pos_sales WHERE id = _sale_id;
  RETURN private.pos_sale_result_json(_existing, _payment, _expected);
END;
$$;

CREATE OR REPLACE FUNCTION private.pos_record_cash_movement(
  _company_id uuid,
  _session_id uuid,
  _operation_id uuid,
  _kind text,
  _amount_minor bigint,
  _note text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _s public.pos_register_sessions%ROWTYPE;
  _r public.pos_registers%ROWTYPE;
  _existing public.pos_cash_movements%ROWTYPE;
  _movement_id uuid;
  _expected bigint;
BEGIN
  PERFORM private.pos_require_permission(_company_id, 'pos.cash.adjust');
  IF _operation_id IS NULL OR _amount_minor IS NULL OR _amount_minor <= 0 OR _kind NOT IN ('cash_in', 'cash_out') THEN
    RAISE EXCEPTION 'Invalid cash movement' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _existing FROM public.pos_cash_movements WHERE company_id = _company_id AND operation_id = _operation_id;
  IF FOUND THEN
  IF _existing.session_id IS DISTINCT FROM _session_id OR _existing.kind IS DISTINCT FROM _kind
     OR _existing.amount_minor IS DISTINCT FROM _amount_minor THEN
      RAISE EXCEPTION 'Cash movement operation payload differs' USING ERRCODE = '22023';
    END IF;
    SELECT expected_cash_minor INTO _expected FROM public.pos_register_sessions WHERE id = _session_id;
    RETURN jsonb_build_object(
      'movement_id', _existing.id,
      'expected_cash_minor', _expected::text
    );
  END IF;

  SELECT * INTO _s FROM public.pos_register_sessions WHERE company_id = _company_id AND id = _session_id FOR UPDATE;
  IF NOT FOUND OR _s.closed_at IS NOT NULL THEN RAISE EXCEPTION 'Session unavailable' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _r FROM public.pos_registers WHERE company_id = _company_id AND id = _s.register_id;
  IF NOT private.pos_can_access_location(_company_id, _r.location_id)
     OR (_s.opened_by IS DISTINCT FROM auth.uid()
         AND NOT public.has_company_permission(_company_id, 'pos.settings.manage')) THEN
    RAISE EXCEPTION 'Session unavailable for this cashier' USING ERRCODE = '42501';
  END IF;

  IF _kind = 'cash_out' AND _s.expected_cash_minor < _amount_minor THEN
    RAISE EXCEPTION 'Cash out exceeds expected drawer balance' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.pos_cash_movements (
    company_id, session_id, operation_id, kind, amount_minor, note, created_by
  ) VALUES (_company_id, _session_id, _operation_id, _kind, _amount_minor, _note, auth.uid())
  RETURNING id INTO _movement_id;

  IF _kind = 'cash_in' THEN
    UPDATE public.pos_register_sessions SET expected_cash_minor = expected_cash_minor + _amount_minor
    WHERE id = _session_id RETURNING expected_cash_minor INTO _expected;
  ELSE
    UPDATE public.pos_register_sessions SET expected_cash_minor = expected_cash_minor - _amount_minor
    WHERE id = _session_id RETURNING expected_cash_minor INTO _expected;
  END IF;

  PERFORM public.record_audit_event(_company_id, 'pos.cash.movement', 'pos_register_session', _session_id,
    jsonb_build_object('kind', _kind, 'amount_minor', _amount_minor::text, 'operation_id', _operation_id::text));

  RETURN jsonb_build_object('movement_id', _movement_id, 'expected_cash_minor', _expected::text);
END;
$$;

CREATE OR REPLACE FUNCTION private.pos_refund_cash_sale(
  _company_id uuid,
  _sale_id uuid,
  _operation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _sale public.pos_sales%ROWTYPE;
  _session public.pos_register_sessions%ROWTYPE;
  _register public.pos_registers%ROWTYPE;
  _refund_id uuid := gen_random_uuid();
  _journal_id uuid;
  _lines jsonb;
  _tax uuid;
  _today date := (timezone((SELECT timezone FROM public.companies WHERE id = _company_id), now()))::date;
  _expected bigint;
  _movement_op uuid;
  _existing public.pos_refunds%ROWTYPE;
BEGIN
  PERFORM private.pos_require_permission(_company_id, 'pos.refund.create');
  IF _operation_id IS NULL THEN RAISE EXCEPTION 'Invalid refund operation' USING ERRCODE = '22023'; END IF;

  SELECT * INTO _existing FROM public.pos_refunds WHERE company_id = _company_id AND refund_operation_id = _operation_id;
  IF FOUND THEN
    IF _existing.sale_id IS DISTINCT FROM _sale_id THEN
      RAISE EXCEPTION 'Refund operation payload differs' USING ERRCODE = '22023';
    END IF;
    SELECT expected_cash_minor INTO _expected FROM public.pos_register_sessions WHERE id = _existing.session_id;
    RETURN jsonb_build_object(
      'refund_id', _existing.id,
      'sale_id', _existing.sale_id,
      'amount_minor', _existing.amount_minor::text,
      'expected_cash_minor', _expected::text,
      'journal_id', _existing.journal_id
    );
  END IF;

  SELECT * INTO _sale FROM public.pos_sales WHERE company_id = _company_id AND id = _sale_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale not found' USING ERRCODE = '42501'; END IF;
  IF _sale.status <> 'completed' THEN RAISE EXCEPTION 'Sale is not refundable' USING ERRCODE = '22023'; END IF;

  SELECT * INTO _session FROM public.pos_register_sessions WHERE company_id = _company_id AND id = _sale.session_id FOR UPDATE;
  IF NOT FOUND OR _session.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Refund requires the original session to remain open' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO _register FROM public.pos_registers WHERE company_id = _company_id AND id = _sale.register_id;
  IF NOT private.pos_can_access_location(_company_id, _register.location_id)
     OR (_session.opened_by IS DISTINCT FROM auth.uid()
         AND NOT public.has_company_permission(_company_id, 'pos.settings.manage')) THEN
    RAISE EXCEPTION 'Session unavailable for this cashier' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM public.pos_refunds WHERE company_id = _company_id AND sale_id = _sale.id) THEN
    RAISE EXCEPTION 'Sale was already refunded' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.pos_refunds (
    id, company_id, sale_id, session_id, refund_operation_id, amount_minor, created_by
  ) VALUES (
    _refund_id, _company_id, _sale.id, _session.id, _operation_id, _sale.total_minor, auth.uid()
  );

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('account_id', income_account_id, 'description', 'POS revenue reversal',
      'debit_minor', net_minor, 'credit_minor', 0)
  ), '[]'::jsonb) INTO _lines
  FROM (SELECT income_account_id, sum(net_minor) AS net_minor FROM public.pos_sale_lines WHERE sale_id = _sale.id GROUP BY income_account_id) rev;
  _lines := jsonb_build_array(
    jsonb_build_object('account_id', _register.cash_account_id, 'description', 'POS cash refund', 'debit_minor', 0, 'credit_minor', _sale.total_minor)
  ) || _lines;

  IF _sale.tax_minor > 0 THEN
    _tax := public.ops_output_tax_account(_company_id);
    IF _tax IS NULL THEN RAISE EXCEPTION 'Output tax account is not configured' USING ERRCODE = '22023'; END IF;
    _lines := _lines || jsonb_build_array(
      jsonb_build_object('account_id', _tax, 'description', 'Output tax reversal', 'debit_minor', _sale.tax_minor, 'credit_minor', 0)
    );
  END IF;

  IF _sale.journal_id IS NULL THEN
    RAISE EXCEPTION 'Sale has no posted journal to reverse' USING ERRCODE = '22023';
  END IF;
  _journal_id := public.post_journal(jsonb_build_object(
    'company_id', _company_id,
    'journal_date', _today,
    'currency_code', _session.currency_code,
    'source_type', 'pos_refund',
    'source_id', _refund_id,
    'idempotency_key', 'pos-refund:' || _operation_id::text,
    'memo', 'POS cash refund',
    'reverses_journal_id', _sale.journal_id,
    'lines', _lines
  ));

  UPDATE public.pos_refunds SET journal_id = _journal_id WHERE id = _refund_id;
  UPDATE public.pos_sales SET status = 'refunded' WHERE id = _sale.id;

  _movement_op := gen_random_uuid();
  INSERT INTO public.pos_cash_movements (
    company_id, session_id, operation_id, kind, amount_minor, sale_id, refund_id, created_by
  ) VALUES (
    _company_id, _session.id, _movement_op, 'refund_cash', _sale.total_minor, _sale.id, _refund_id, auth.uid()
  );

  UPDATE public.pos_register_sessions
  SET expected_cash_minor = expected_cash_minor - _sale.total_minor
  WHERE id = _session.id
  RETURNING expected_cash_minor INTO _expected;

  PERFORM public.record_audit_event(_company_id, 'pos.sale.refunded', 'pos_sale', _sale.id,
    jsonb_build_object('refund_id', _refund_id, 'amount_minor', _sale.total_minor::text));

  RETURN jsonb_build_object(
    'refund_id', _refund_id,
    'sale_id', _sale.id,
    'amount_minor', _sale.total_minor::text,
    'expected_cash_minor', _expected::text,
    'journal_id', _journal_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.pos_get_workspace(_company_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE _registers jsonb; _open jsonb; _history jsonb; _locations jsonb; _accounts jsonb;
 _currency text; _manage boolean; _ids uuid[]; _members jsonb; _access jsonb;
BEGIN
 PERFORM private.pos_require_permission(_company_id,'pos.view');
 SELECT base_currency INTO _currency FROM public.companies WHERE id=_company_id;
 _manage:=coalesce(public.has_company_permission(_company_id,'pos.settings.manage'),false);
 SELECT coalesce(array_agg(r.id),ARRAY[]::uuid[]) INTO _ids FROM (
  SELECT id FROM public.pos_registers WHERE company_id=_company_id
    AND private.pos_can_access_location(_company_id,location_id) ORDER BY code,id LIMIT 100
 ) r;
 SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.code,r.id),'[]') INTO _registers FROM (
  SELECT r.id,r.code,r.name,r.location_id,r.cash_account_id,r.is_active,l.name AS location_name
  FROM public.pos_registers r JOIN public.hr_locations l ON l.company_id=r.company_id AND l.id=r.location_id
  WHERE r.company_id=_company_id AND r.id=ANY(_ids)
 ) r;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'register_id',s.register_id,'opened_by',s.opened_by,
  'opened_at',s.opened_at,'opening_float_minor',s.opening_float_minor::text,'expected_cash_minor',s.expected_cash_minor::text,
  'currency_code',s.currency_code,'closed_at',s.closed_at,'closing_count_minor',s.closing_count_minor::text) ORDER BY s.opened_at DESC,s.id),'[]')
 INTO _open FROM public.pos_register_sessions s WHERE s.company_id=_company_id AND s.register_id=ANY(_ids) AND s.closed_at IS NULL;
 SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.closed_at DESC,s.id),'[]') INTO _history FROM (
  SELECT id,register_id,opened_by,opened_at,opening_float_minor::text,expected_cash_minor::text,currency_code,closed_at,closing_count_minor::text
  FROM public.pos_register_sessions WHERE company_id=_company_id AND register_id=ANY(_ids) AND closed_at IS NOT NULL
  ORDER BY closed_at DESC,id LIMIT 50
 ) s;
 SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.name,l.id),'[]') INTO _locations FROM (
  SELECT id,name,code FROM public.hr_locations WHERE company_id=_company_id AND is_active
   AND (_manage OR private.pos_can_access_location(_company_id,id)) ORDER BY name,id LIMIT 100
 ) l;
 SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.code,a.id),'[]') INTO _accounts FROM (
  SELECT a.id,a.code,a.name FROM public.accounts a WHERE _manage AND a.company_id=_company_id
   AND a.is_active AND a.is_postable AND a.account_type='asset' AND a.account_kind IN ('bank','current_asset')
   AND (a.currency_code IS NULL OR a.currency_code=_currency) ORDER BY a.code,a.id LIMIT 500
 ) a;
 SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.name,m.id),'[]') INTO _members FROM (
  SELECT m.user_id AS id,coalesce(nullif(p.full_name,''),p.email,'Unnamed member') AS name,p.email
  FROM public.company_members m LEFT JOIN public.profiles p ON p.id=m.user_id
  WHERE _manage AND public.has_company_permission(_company_id,'members.view')
   AND m.company_id=_company_id AND m.status='active' ORDER BY name,m.user_id LIMIT 100
 ) m;
 SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.location_id,a.user_id),'[]') INTO _access FROM (
  SELECT location_id,user_id FROM public.pos_location_access WHERE company_id=_company_id AND _manage
  ORDER BY location_id,user_id LIMIT 1000
 ) a;
 RETURN jsonb_build_object('members',_members,'locationAccess',_access,'userId',auth.uid(),'currency',_currency,'registers',_registers,'openSessions',_open,'recentSessions',_history,
  'locations',_locations,'cashAccounts',_accounts,
  'canManage',_manage,'canOpen',public.has_company_permission(_company_id,'pos.register.open'),
  'canClose',public.has_company_permission(_company_id,'pos.register.close') AND public.has_company_permission(_company_id,'pos.cash.count'),
  'canSell',public.has_company_permission(_company_id,'pos.sale.create'),
  'canAdjustCash',public.has_company_permission(_company_id,'pos.cash.adjust'),
  'canRefund',public.has_company_permission(_company_id,'pos.refund.create'));
END $$;

CREATE FUNCTION public.pos_complete_cash_sale(_company_id uuid,_session_id uuid,_operation_id uuid,_cash_tendered_minor bigint,_lines jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT private.pos_complete_cash_sale(_company_id,_session_id,_operation_id,_cash_tendered_minor,_lines)
$$;
CREATE FUNCTION public.pos_record_cash_movement(_company_id uuid,_session_id uuid,_operation_id uuid,_kind text,_amount_minor bigint,_note text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT private.pos_record_cash_movement(_company_id,_session_id,_operation_id,_kind,_amount_minor,_note)
$$;
CREATE FUNCTION public.pos_refund_cash_sale(_company_id uuid,_sale_id uuid,_operation_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT private.pos_refund_cash_sale(_company_id,_sale_id,_operation_id)
$$;

REVOKE ALL ON FUNCTION private.pos_half_up_div(bigint,bigint),private.pos_compute_tax_line(numeric,bigint,bigint,integer,boolean),
 private.pos_sale_result_json(public.pos_sales,public.pos_sale_payments,bigint),
 private.pos_complete_cash_sale(uuid,uuid,uuid,bigint,jsonb),
 private.pos_record_cash_movement(uuid,uuid,uuid,text,bigint,text),
 private.pos_refund_cash_sale(uuid,uuid,uuid),
 public.pos_complete_cash_sale(uuid,uuid,uuid,bigint,jsonb),
 public.pos_record_cash_movement(uuid,uuid,uuid,text,bigint,text),
 public.pos_refund_cash_sale(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.pos_half_up_div(bigint,bigint),private.pos_compute_tax_line(numeric,bigint,bigint,integer,boolean),
 private.pos_sale_result_json(public.pos_sales,public.pos_sale_payments,bigint),
 private.pos_complete_cash_sale(uuid,uuid,uuid,bigint,jsonb),
 private.pos_record_cash_movement(uuid,uuid,uuid,text,bigint,text),
 private.pos_refund_cash_sale(uuid,uuid,uuid),
 public.pos_complete_cash_sale(uuid,uuid,uuid,bigint,jsonb),
 public.pos_record_cash_movement(uuid,uuid,uuid,text,bigint,text),
 public.pos_refund_cash_sale(uuid,uuid,uuid) TO authenticated;