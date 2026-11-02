-- READY-TO-APPLY. Not applied. One pending promotion per target business. This does not copy settings.
-- Reverse: drop index platform_promotions_one_pending_target, then reapply
-- public.platform_request_promotion from 20261102440000_company_exists_guards.sql.

CREATE UNIQUE INDEX platform_promotions_one_pending_target
  ON public.platform_promotions (target_id)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.platform_request_promotion(_source uuid, _target uuid, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  PERFORM private.require_platform('settings.manage');
  IF _source IS NULL OR _target IS NULL OR _source = _target OR length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Choose two businesses and record a reason';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = _source)
     OR NOT EXISTS (SELECT 1 FROM public.companies WHERE id = _target) THEN
    RAISE EXCEPTION 'That business was not found';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.platform_promotions
    WHERE target_id = _target AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'That business already has a pending promotion';
  END IF;
  BEGIN
    INSERT INTO public.platform_promotions (source_id, target_id, requester_id, status)
    VALUES (_source, _target, auth.uid(), 'pending') RETURNING id INTO _id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'That business already has a pending promotion';
  END;
  PERFORM private.platform_log('promotion.request', 'platform_promotion', _id::text, NULL,
    jsonb_build_object('copied', false), trim(_reason));
  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_request_promotion(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_request_promotion(uuid, uuid, text) TO authenticated;
