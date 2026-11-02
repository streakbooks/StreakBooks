-- READY-TO-APPLY. Not applied. Included usage must be quantity zero. A priced or unpriced draft must have a positive quantity.
-- Reverse: reapply public.platform_save_usage_draft from 20261102390000_usage_draft_guard.sql
-- and restore the previous table check.

DO $$
DECLARE _name text;
BEGIN
  SELECT c.conname INTO _name
  FROM pg_constraint c
  WHERE c.conrelid = 'public.billing_usage_drafts'::regclass
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%unpriced%';
  IF _name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.billing_usage_drafts DROP CONSTRAINT %I', _name);
  END IF;
END $$;

ALTER TABLE public.billing_usage_drafts
  ADD CONSTRAINT billing_usage_drafts_status_amount CHECK (
    (status = 'unpriced' AND net_minor IS NULL AND quantity > 0)
    OR (status = 'draft' AND net_minor IS NOT NULL AND net_minor >= 0 AND quantity > 0)
    OR (status = 'none' AND net_minor = 0 AND quantity = 0)
  );

CREATE OR REPLACE FUNCTION public.platform_save_usage_draft(
  _company_id uuid,
  _status text,
  _quantity integer,
  _net_minor integer,
  _currency text,
  _reason text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
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
  INSERT INTO public.billing_usage_drafts (company_id, status, quantity, net_minor, currency, created_by)
  VALUES (_company_id, _status, _quantity, _net_minor, _currency, auth.uid())
  RETURNING id INTO _id;
  PERFORM private.platform_log('usage.draft', 'company', _company_id::text, NULL,
    jsonb_build_object('status', _status, 'posted', false), trim(_reason));
  RETURN _id;
END;
$$;
