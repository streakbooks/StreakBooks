-- Immutable daily onboarding progress observations, per linked firm/client.
-- No historical values are reconstructed or backfilled from current checklists.
CREATE TABLE public.firm_onboarding_daily_snapshots (
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  total_steps integer NOT NULL CHECK(total_steps BETWEEN 0 AND 1000000),
  completed_steps integer NOT NULL CHECK(completed_steps BETWEEN 0 AND total_steps),
  overdue_steps integer NOT NULL CHECK(overdue_steps BETWEEN 0 AND total_steps),
  unassigned_open_steps integer NOT NULL CHECK(unassigned_open_steps BETWEEN 0 AND total_steps),
  blocked_steps integer NOT NULL CHECK(blocked_steps BETWEEN 0 AND total_steps),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(firm_id,company_id,snapshot_date)
);
CREATE INDEX firm_daily_snapshots_recent_idx
 ON public.firm_onboarding_daily_snapshots(firm_id,snapshot_date DESC,company_id);
ALTER TABLE public.firm_onboarding_daily_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.firm_onboarding_daily_snapshots FROM public,anon,authenticated;
GRANT SELECT ON public.firm_onboarding_daily_snapshots TO authenticated;

CREATE POLICY firm_onboarding_snapshots_read
 ON public.firm_onboarding_daily_snapshots FOR SELECT TO authenticated
 USING (
   public.is_firm_member(firm_id)
   AND public.has_company_permission(company_id,'accounting.view')
   AND EXISTS (
     SELECT 1 FROM public.firm_client_links l
     WHERE l.firm_id=firm_onboarding_daily_snapshots.firm_id
       AND l.company_id=firm_onboarding_daily_snapshots.company_id
       AND l.revoked_at IS NULL
   )
 );
CREATE POLICY firm_onboarding_snapshots_mfa
 ON public.firm_onboarding_daily_snapshots AS RESTRICTIVE
 FOR ALL TO authenticated
 USING ((SELECT private.mfa_requirement_met()))
 WITH CHECK ((SELECT private.mfa_requirement_met()));

-- Scheduled capture runs in its own transaction, once per date.
-- A duplicate invocation never rewrites a historical observation.
CREATE FUNCTION private.capture_firm_onboarding_daily_snapshots()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE recorded integer;
BEGIN
  WITH eligible_steps AS (
    SELECT s.firm_id,s.company_id,s.task_key,s.completed_at,s.due_date,
      s.assignee_id,s.depends_on_task_key
    FROM public.firm_client_onboarding_steps s
    JOIN public.firm_client_links l ON l.firm_id=s.firm_id
      AND l.company_id=s.company_id AND l.revoked_at IS NULL
  ), totals AS (
    SELECT s.firm_id,s.company_id,
      count(*)::integer AS total_steps,
      count(*) FILTER (WHERE s.completed_at IS NOT NULL)::integer AS completed_steps,
      count(*) FILTER (
        WHERE s.completed_at IS NULL AND s.due_date<current_date
      )::integer AS overdue_steps,
      count(*) FILTER (
        WHERE s.completed_at IS NULL AND s.assignee_id IS NULL
      )::integer AS unassigned_open_steps,
      count(*) FILTER (
        WHERE s.completed_at IS NULL AND s.depends_on_task_key IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM public.firm_client_onboarding_steps previous
            WHERE previous.firm_id=s.firm_id AND previous.company_id=s.company_id
              AND previous.task_key=s.depends_on_task_key
              AND previous.completed_at IS NOT NULL
          )
      )::integer AS blocked_steps
    FROM eligible_steps s
    GROUP BY s.firm_id,s.company_id
  )
  INSERT INTO public.firm_onboarding_daily_snapshots(
    firm_id,company_id,snapshot_date,total_steps,completed_steps,
    overdue_steps,unassigned_open_steps,blocked_steps
  )
  SELECT firm_id,company_id,current_date,total_steps,completed_steps,
    overdue_steps,unassigned_open_steps,blocked_steps
  FROM totals
  ON CONFLICT(firm_id,company_id,snapshot_date) DO NOTHING;
  GET DIAGNOSTICS recorded=ROW_COUNT;
  RETURN recorded;
END $$;
REVOKE ALL ON FUNCTION private.capture_firm_onboarding_daily_snapshots()
 FROM public,anon,authenticated;

DO $$
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM cron.job WHERE jobname='linkbooks-firm-onboarding-daily-snapshots'
 ) THEN
   PERFORM cron.schedule(
     'linkbooks-firm-onboarding-daily-snapshots',
     '45 1 * * *',
     'SELECT private.capture_firm_onboarding_daily_snapshots();'
   );
 END IF;
END $$;
