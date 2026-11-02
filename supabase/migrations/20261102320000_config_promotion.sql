-- READY-TO-APPLY. Not applied. Records a promotion decision. Company settings are not copied.
-- Reverse:
--   DROP FUNCTION IF EXISTS public.platform_decide_promotion(uuid, text, text);
--   DROP FUNCTION IF EXISTS public.platform_request_promotion(uuid, uuid, text);
--   DROP TABLE IF EXISTS public.platform_promotions;

CREATE TABLE public.platform_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL,
  target_id uuid NOT NULL,
  requester_id uuid NOT NULL,
  approver_id uuid,
  status text NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source_id <> target_id)
);

ALTER TABLE public.platform_promotions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_promotions FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.platform_request_promotion(_source uuid, _target uuid, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  PERFORM private.require_platform('settings.manage');
  IF _source = _target OR length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Choose two businesses and record a reason';
  END IF;
  INSERT INTO public.platform_promotions (source_id, target_id, requester_id, status)
  VALUES (_source, _target, auth.uid(), 'pending') RETURNING id INTO _id;
  PERFORM private.platform_log('promotion.request', 'platform_promotion', _id::text, NULL,
    jsonb_build_object('copied', false), trim(_reason));
  RETURN _id;
END;
$$;

CREATE FUNCTION public.platform_decide_promotion(_id uuid, _decision text, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _requester uuid;
BEGIN
  PERFORM private.require_platform('settings.manage');
  IF _decision NOT IN ('approved', 'rejected') OR length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record an approve or reject decision and a reason';
  END IF;
  SELECT requester_id INTO _requester FROM public.platform_promotions WHERE id = _id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'That promotion is no longer pending'; END IF;
  IF _requester = auth.uid() THEN RAISE EXCEPTION 'A second person must decide this request'; END IF;
  UPDATE public.platform_promotions SET status = _decision, approver_id = auth.uid() WHERE id = _id;
  PERFORM private.platform_log('promotion.decide', 'platform_promotion', _id::text,
    jsonb_build_object('status', 'pending'), jsonb_build_object('status', _decision, 'copied', false), trim(_reason));
END;
$$;

REVOKE ALL ON FUNCTION public.platform_request_promotion(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_decide_promotion(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_request_promotion(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_decide_promotion(uuid, text, text) TO authenticated;
