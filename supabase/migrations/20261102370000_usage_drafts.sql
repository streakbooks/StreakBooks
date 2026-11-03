-- READY-TO-APPLY. Not applied. Saves an overage draft. It cannot be posted and it does not call a provider.
-- Reverse:
--   DROP FUNCTION IF EXISTS public.platform_save_usage_draft(uuid, text, integer, integer, text, text);
--   DROP TABLE IF EXISTS public.billing_usage_drafts;

CREATE TABLE public.billing_usage_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('none', 'unpriced', 'draft')),
  quantity integer NOT NULL CHECK (quantity >= 0),
  net_minor integer,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  posted boolean NOT NULL DEFAULT false CHECK (posted = false),
  provider_called boolean NOT NULL DEFAULT false CHECK (provider_called = false),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (status = 'unpriced' AND net_minor IS NULL)
    OR (status = 'draft' AND net_minor IS NOT NULL AND net_minor >= 0)
    OR (status = 'none' AND net_minor = 0)
  )
);

ALTER TABLE public.billing_usage_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_usage_drafts FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.platform_save_usage_draft(
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

REVOKE ALL ON FUNCTION public.platform_save_usage_draft(uuid, text, integer, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_save_usage_draft(uuid, text, integer, integer, text, text) TO authenticated;
