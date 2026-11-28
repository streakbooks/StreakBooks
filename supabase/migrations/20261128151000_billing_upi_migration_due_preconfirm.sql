-- Include pre-confirm stuck states in cron recovery so abandon timeout can release the lock.
CREATE OR REPLACE FUNCTION public.billing_migration_due(_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(m.id ORDER BY coalesce(m.next_retry_at, m.updated_at)), '[]'::jsonb)
  FROM (
    SELECT id, next_retry_at, updated_at
      FROM billing.subscription_migrations
     WHERE status IN (
             'initiated',
             'new_subscription_created',
             'old_subscription_cancellation_pending',
             'old_subscription_cancellation_failed',
             'new_subscription_confirmed',
             'awaiting_customer_authorization',
             'awaiting_payment'
           )
       AND coalesce(next_retry_at, updated_at) <= now()
     ORDER BY coalesce(next_retry_at, updated_at)
     LIMIT greatest(1, least(coalesce(_limit, 20), 100))
  ) m;
$$;

REVOKE ALL ON FUNCTION public.billing_migration_due(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_migration_due(integer) TO service_role;
