-- Keep the public versioned price catalogue in sync with platform-managed
-- billing plan visibility. Existing subscriptions and versioned price rows
-- are never modified by a visibility change.
CREATE OR REPLACE FUNCTION public.list_public_billing_plans()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(jsonb_agg(row_to_json(p)::jsonb ORDER BY p.sort_order), '[]'::jsonb)
  FROM (
    SELECT v.plan_code AS code, v.name, v.audience, v.summary, v.badge, v.sort_order,
      (
        SELECT jsonb_agg(jsonb_build_object(
          'currency', pr.currency,
          'interval', pr.billing_interval,
          'amountMinor', pr.amount_minor,
          'needsReview', pr.needs_review
        ))
        FROM public.plan_prices pr
        WHERE pr.version_id = v.id AND pr.archived_at IS NULL
      ) AS prices
    FROM public.plan_versions v
    INNER JOIN public.billing_plans bp ON bp.code = v.plan_code
    WHERE v.status = 'published'
      AND v.visibility = 'live'
      AND bp.is_active
      AND bp.is_public
  ) p;
$$;
COMMENT ON FUNCTION public.list_public_billing_plans()
  IS 'Only live published versions whose base plan is active and public; hides legacy retired plans without modifying subscriptions.';
