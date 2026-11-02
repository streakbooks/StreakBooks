-- READY-TO-APPLY. Not applied. Expiry writes a platform audit row. The customer log stays action and time only.
-- Reverse: reapply public.platform_expire_break_glass from 20261102190000_break_glass.sql.

CREATE OR REPLACE FUNCTION public.platform_expire_break_glass(_grant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.break_glass_grants%ROWTYPE;
BEGIN
  PERFORM private.require_platform('support.manage');
  SELECT * INTO _row FROM public.break_glass_grants WHERE id = _grant_id FOR UPDATE;
  IF NOT FOUND OR _row.status <> 'active' OR _row.expires_at > now() THEN
    RAISE EXCEPTION 'Only active break-glass access past expiry can expire';
  END IF;
  UPDATE public.break_glass_grants SET status = 'expired' WHERE id = _grant_id;
  INSERT INTO public.break_glass_events (grant_id, company_id, action)
  VALUES (_grant_id, _row.company_id, 'expired');
  PERFORM private.platform_log(
    'break_glass.expire', 'company', _row.company_id::text,
    jsonb_build_object('status', 'active'), jsonb_build_object('status', 'expired'),
    'Access reached its expiry'
  );
END;
$$;
