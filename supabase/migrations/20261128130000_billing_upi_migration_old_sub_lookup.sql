-- Look up UPI migrations by the *retired* Razorpay subscription id so delayed
-- webhooks remain identifiable after company_subscriptions points at the new sub.

CREATE OR REPLACE FUNCTION public.billing_migration_by_old_subscription(_subscription_id text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.billing_migration_get(m.id)
    FROM billing.subscription_migrations m
   WHERE m.old_provider_subscription_id = nullif(_subscription_id, '')
   ORDER BY
     CASE WHEN m.status NOT IN ('completed', 'failed') THEN 0 ELSE 1 END,
     m.created_at DESC
   LIMIT 1;
$$;

CREATE INDEX IF NOT EXISTS subscription_migrations_old_sub_idx
  ON billing.subscription_migrations (old_provider_subscription_id);

REVOKE ALL ON FUNCTION public.billing_migration_by_old_subscription(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_migration_by_old_subscription(text) TO service_role;
