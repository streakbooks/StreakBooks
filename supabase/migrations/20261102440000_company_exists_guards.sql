-- READY-TO-APPLY. Not applied. A break-glass request and a promotion request require businesses that exist.
-- Reverse: drop the three foreign keys, then reapply the two functions from
-- 20261102190000_break_glass.sql and 20261102320000_config_promotion.sql.

ALTER TABLE public.break_glass_grants
  ADD CONSTRAINT break_glass_grants_company_fk
  FOREIGN KEY (company_id) REFERENCES public.companies(id);

ALTER TABLE public.platform_promotions
  ADD CONSTRAINT platform_promotions_source_fk
  FOREIGN KEY (source_id) REFERENCES public.companies(id);

ALTER TABLE public.platform_promotions
  ADD CONSTRAINT platform_promotions_target_fk
  FOREIGN KEY (target_id) REFERENCES public.companies(id);

CREATE OR REPLACE FUNCTION public.platform_request_break_glass(
  _company_id uuid, _reason text, _expires_at timestamptz, _request_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  PERFORM private.require_platform('support.manage');
  IF length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason (at least 3 characters)';
  END IF;
  IF _expires_at <= now() THEN
    RAISE EXCEPTION 'Break-glass access must expire in the future';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = _company_id) THEN
    RAISE EXCEPTION 'That business was not found';
  END IF;
  INSERT INTO public.break_glass_grants (id, company_id, requester_id, status, reason, expires_at)
  VALUES (coalesce(_request_id, gen_random_uuid()), _company_id, auth.uid(), 'pending', trim(_reason), _expires_at)
  RETURNING id INTO _id;
  INSERT INTO public.break_glass_events (grant_id, company_id, action) VALUES (_id, _company_id, 'requested');
  PERFORM private.platform_log('break_glass.request', 'company', _company_id::text, NULL,
    jsonb_build_object('grant', _id), trim(_reason));
  RETURN _id;
END;
$$;

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
  INSERT INTO public.platform_promotions (source_id, target_id, requester_id, status)
  VALUES (_source, _target, auth.uid(), 'pending') RETURNING id INTO _id;
  PERFORM private.platform_log('promotion.request', 'platform_promotion', _id::text, NULL,
    jsonb_build_object('copied', false), trim(_reason));
  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_request_break_glass(uuid, text, timestamptz, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_request_promotion(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_request_break_glass(uuid, text, timestamptz, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_request_promotion(uuid, uuid, text) TO authenticated;
