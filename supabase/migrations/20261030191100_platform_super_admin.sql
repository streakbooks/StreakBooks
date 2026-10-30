-- LinkBooks Super Admin: privileged actions are transactional, audited and MFA-gated.
-- First platform owner is provisioned separately via a trusted Supabase SQL session.
-- Do not auto-promote company owners to platform owners.

-- Remove legacy self-service bootstrap for global billing operators.
DROP POLICY IF EXISTS billing_operators_insert ON public.billing_operators;
REVOKE INSERT ON public.billing_operators FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.platform_set_plan_visibility(
  _plan_code text, _is_public boolean, _reason text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _actor uuid := auth.uid();
  _before jsonb;
BEGIN
  IF _actor IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.platform_roles
       WHERE user_id = _actor AND role = 'platform_owner'
     ) THEN
    RAISE EXCEPTION 'Only LinkBooks platform owners can change plan visibility'
      USING ERRCODE = '42501';
  END IF;
  IF coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' THEN
    RAISE EXCEPTION 'Verified MFA session required' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(_reason, ''))) NOT BETWEEN 12 AND 500 THEN
    RAISE EXCEPTION 'An audit reason of 12 to 500 characters is required';
  END IF;

  SELECT to_jsonb(p) INTO _before
  FROM public.billing_plans p WHERE p.code = _plan_code FOR UPDATE;
  IF _before IS NULL THEN RAISE EXCEPTION 'Unknown billing plan'; END IF;
  IF _is_public AND NOT (_before ->> 'is_active')::boolean THEN
    RAISE EXCEPTION 'An inactive plan cannot be published';
  END IF;
  IF (_before ->> 'is_public')::boolean = _is_public THEN
    RETURN; -- Idempotent: no redundant audit events.
  END IF;

  UPDATE public.billing_plans
  SET is_public = _is_public, updated_at = now()
  WHERE code = _plan_code;

  INSERT INTO public.platform_billing_audit
    (actor_user_id, action, entity_type, entity_id, before_state, after_state, reason)
  VALUES
    (_actor, 'plan_visibility_changed', 'billing_plan', _plan_code,
     jsonb_build_object('is_public', (_before ->> 'is_public')::boolean),
     jsonb_build_object('is_public', _is_public), btrim(_reason));
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_set_staff_role(
  _user_id uuid, _role text, _reason text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _actor uuid := auth.uid();
  _current_role text;
BEGIN
  IF _actor IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.platform_roles
      WHERE user_id = _actor AND role = 'platform_owner'
    ) THEN
    RAISE EXCEPTION 'Only LinkBooks platform owners can manage platform staff'
      USING ERRCODE = '42501';
  END IF;
  IF coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' THEN
    RAISE EXCEPTION 'Verified MFA session required' USING ERRCODE = '42501';
  END IF;
  IF _user_id IS NULL OR _user_id = _actor THEN
    RAISE EXCEPTION 'Cannot change your own platform role';
  END IF;
  IF _role IS NOT NULL AND _role NOT IN ('platform_support', 'platform_finance') THEN
    RAISE EXCEPTION 'Only support or finance roles may be delegated';
  END IF;
  IF length(btrim(coalesce(_reason, ''))) NOT BETWEEN 12 AND 500 THEN
    RAISE EXCEPTION 'An audit reason of 12 to 500 characters is required';
  END IF;
  -- Row lock prevents concurrent changes to the same existing assignment.
  SELECT role INTO _current_role
  FROM public.platform_roles
  WHERE user_id = _user_id FOR UPDATE;
  IF _current_role = 'platform_owner' THEN
    RAISE EXCEPTION 'Platform owner assignments require separate privileged provisioning';
  END IF;
  IF _current_role IS NOT DISTINCT FROM _role THEN RETURN; END IF;

  IF _role IS NULL THEN
    DELETE FROM public.platform_roles WHERE user_id = _user_id;
  ELSE
    INSERT INTO public.platform_roles(user_id, role)
    VALUES (_user_id, _role)
    ON CONFLICT (user_id) DO UPDATE SET role = excluded.role;
  END IF;

  INSERT INTO public.platform_billing_audit
    (actor_user_id, action, entity_type, entity_id, before_state, after_state, reason)
  VALUES
    (_actor, 'platform_staff_role_changed', 'platform_role', _user_id::text,
     jsonb_build_object('role', _current_role),
     jsonb_build_object('role', _role), btrim(_reason));
END;
$$;

REVOKE ALL ON FUNCTION public.platform_set_plan_visibility(text, boolean, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_set_staff_role(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_set_plan_visibility(text, boolean, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_set_staff_role(uuid, text, text)
  TO authenticated;

COMMENT ON FUNCTION public.platform_set_staff_role(uuid, text, text)
  IS 'MFA-gated platform owner command; transactional role mutation and audit.';
COMMENT ON FUNCTION public.platform_set_plan_visibility(text, boolean, text)
  IS 'MFA-gated platform owner command; transactional plan visibility mutation and audit.';
