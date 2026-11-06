-- Action Center full-history free-text search acceleration.
-- Matches the security-invoker inbox view search_text expression; preserves RLS.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE INDEX IF NOT EXISTS action_notifications_search_trgm_idx
  ON public.action_notifications
  USING gin (
    (pg_catalog.lower(title || ' ' || coalesce(body, '')))
      extensions.gin_trgm_ops
  );

COMMENT ON INDEX public.action_notifications_search_trgm_idx IS
  'GIN trigram index for Action Center title/body ILIKE search; RLS remains enforced on action_notifications.';
