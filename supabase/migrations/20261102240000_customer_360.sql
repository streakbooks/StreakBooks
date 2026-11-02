-- READY-TO-APPLY. Not applied. Business identity and subscription only. Amounts are omitted.
-- Reverse:
--   DROP FUNCTION IF EXISTS public.platform_customer_360(uuid);

CREATE FUNCTION public.platform_customer_360(_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _name text;
  _demo boolean;
  _plan text;
  _status text;
  _users bigint;
BEGIN
  PERFORM private.require_platform('businesses.view');
  SELECT c.name, c.is_demo, s.plan_code, s.status,
    (SELECT count(*) FROM public.company_members m WHERE m.company_id = c.id AND m.status = 'active')
  INTO _name, _demo, _plan, _status, _users
  FROM public.companies c
  LEFT JOIN public.company_subscriptions s ON s.company_id = c.id
  WHERE c.id = _company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'That business was not found'; END IF;
  PERFORM private.platform_log(
    'customer.view', 'company', _company_id::text, NULL,
    jsonb_build_object('plan', _plan), 'Opened customer summary'
  );
  RETURN jsonb_build_object(
    'companyId', _company_id,
    'name', _name,
    'planCode', _plan,
    'subscriptionStatus', _status,
    'userCount', _users,
    'isDemo', _demo,
    'ledgerIncluded', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.platform_customer_360(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_customer_360(uuid) TO authenticated;
