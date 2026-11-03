-- READY-TO-APPLY. Not applied. One usage draft per business. A later save updates that draft and does not post it.
-- Reverse: drop index billing_usage_drafts_one_company, then reapply
-- public.platform_save_usage_draft from 20261102400000_usage_draft_quantity.sql.

CREATE UNIQUE INDEX billing_usage_drafts_one_company
  ON public.billing_usage_drafts (company_id);

CREATE OR REPLACE FUNCTION public.platform_save_usage_draft(
  _company_id uuid,
  _status text,
  _quantity integer,
  _net_minor integer,
  _currency text,
  _reason text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid; _row public.billing_usage_drafts%ROWTYPE;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF _status NOT IN ('none', 'unpriced', 'draft') OR _currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Name the draft status and currency';
  END IF;
  IF _quantity IS NULL OR _quantity < 0 OR length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a quantity and a reason';
  END IF;
  IF _status = 'unpriced' AND (_net_minor IS NOT NULL OR _quantity < 1) THEN
    RAISE EXCEPTION 'An unpriced draft has no amount';
  END IF;
  IF _status = 'draft' AND (_net_minor IS NULL OR _net_minor < 0 OR _quantity < 1) THEN
    RAISE EXCEPTION 'A priced draft needs a non-negative amount';
  END IF;
  IF _status = 'none' AND (_net_minor IS DISTINCT FROM 0 OR _quantity IS DISTINCT FROM 0) THEN
    RAISE EXCEPTION 'Usage inside the included quantity is zero';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = _company_id) THEN
    RAISE EXCEPTION 'That business was not found';
  END IF;
  SELECT * INTO _row FROM public.billing_usage_drafts WHERE company_id = _company_id FOR UPDATE;
  IF FOUND THEN
    UPDATE public.billing_usage_drafts
    SET status = _status, quantity = _quantity, net_minor = _net_minor, currency = _currency
    WHERE id = _row.id;
    PERFORM private.platform_log('usage.draft', 'company', _company_id::text,
      jsonb_build_object('status', _row.status, 'quantity', _row.quantity, 'net', _row.net_minor, 'posted', false),
      jsonb_build_object('status', _status, 'quantity', _quantity, 'net', _net_minor, 'posted', false),
      trim(_reason));
    RETURN _row.id;
  END IF;
  BEGIN
    INSERT INTO public.billing_usage_drafts (company_id, status, quantity, net_minor, currency, created_by)
    VALUES (_company_id, _status, _quantity, _net_minor, _currency, auth.uid())
    RETURNING id INTO _id;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO _row FROM public.billing_usage_drafts WHERE company_id = _company_id FOR UPDATE;
    UPDATE public.billing_usage_drafts
    SET status = _status, quantity = _quantity, net_minor = _net_minor, currency = _currency
    WHERE id = _row.id;
    PERFORM private.platform_log('usage.draft', 'company', _company_id::text,
      jsonb_build_object('status', _row.status, 'quantity', _row.quantity, 'net', _row.net_minor, 'posted', false),
      jsonb_build_object('status', _status, 'quantity', _quantity, 'net', _net_minor, 'posted', false),
      trim(_reason));
    RETURN _row.id;
  END;
  PERFORM private.platform_log('usage.draft', 'company', _company_id::text, NULL,
    jsonb_build_object('status', _status, 'quantity', _quantity, 'net', _net_minor, 'posted', false),
    trim(_reason));
  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_save_usage_draft(uuid, text, integer, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_save_usage_draft(uuid, text, integer, integer, text, text) TO authenticated;
