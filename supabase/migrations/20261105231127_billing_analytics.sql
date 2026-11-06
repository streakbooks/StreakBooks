-- Phase 10: billing analytics for platform staff and scoped API keys. Read-only.
-- Reuses public.mrr_movements (captured by platform_capture_mrr_movements) for MRR movements and
-- the immutable billing documents for cash, tax, refunds, discounts and commission. Amounts are
-- reported per currency in minor units; nothing is converted. Demo organisations are excluded
-- from subscription metrics, as in the existing MRR capture.
-- Re-runnable.

CREATE OR REPLACE FUNCTION billing.analytics_snapshot(_from timestamptz, _to timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  range_from timestamptz := coalesce(_from, date_trunc('month', now()));
  range_to timestamptz := coalesce(_to, now());
BEGIN
  IF range_to <= range_from OR range_to - range_from > interval '366 days' THEN
    RAISE EXCEPTION 'Choose a range of up to one year' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object(
    'range', jsonb_build_object('from', range_from, 'to', range_to),
    'generatedAt', now(),
    'subscriptions', jsonb_build_object(
      'byStatus', coalesce((SELECT jsonb_object_agg(x.status, x.n) FROM (
          SELECT s.status, count(*) AS n FROM public.company_subscriptions s
            JOIN public.companies c ON c.id = s.company_id
           WHERE NOT c.is_demo GROUP BY s.status) x), '{}'::jsonb),
      'byPlan', coalesce((SELECT jsonb_object_agg(x.plan_code, x.n) FROM (
          SELECT coalesce(s.plan_code, 'none') AS plan_code, count(*) AS n FROM public.company_subscriptions s
            JOIN public.companies c ON c.id = s.company_id
           WHERE NOT c.is_demo AND s.status IN ('active', 'past_due', 'paused') GROUP BY 1) x), '{}'::jsonb),
      'byCountry', coalesce((SELECT jsonb_object_agg(x.country, x.n) FROM (
          SELECT coalesce(s.country_code, upper(c.country_code), '??') AS country, count(*) AS n
            FROM public.company_subscriptions s JOIN public.companies c ON c.id = s.company_id
           WHERE NOT c.is_demo AND s.status IN ('active', 'past_due', 'paused') GROUP BY 1) x), '{}'::jsonb)),
    'mrr', coalesce((SELECT jsonb_agg(jsonb_build_object('currency', x.currency, 'mrrMinor', x.mrr,
        'arrMinor', x.mrr * 12, 'subscriptions', x.n) ORDER BY x.currency) FROM (
        SELECT btrim(s.currency::text) AS currency,
          sum((s.unit_amount_minor / CASE WHEN s.billing_interval = 'year' THEN 12 ELSE 1 END)::bigint) AS mrr,
          count(*) AS n
          FROM public.company_subscriptions s JOIN public.companies c ON c.id = s.company_id
         WHERE NOT c.is_demo AND s.status = 'active' AND s.unit_amount_minor IS NOT NULL
           AND (s.current_period_end IS NULL OR s.current_period_end > now())
         GROUP BY 1) x), '[]'::jsonb),
    'movements', coalesce((SELECT jsonb_agg(jsonb_build_object('currency', x.currency, 'movement', x.movement,
        'count', x.n, 'deltaMinor', x.delta) ORDER BY x.currency, x.movement) FROM (
        SELECT btrim(m.currency) AS currency, m.movement, count(*) AS n, sum(m.delta_minor) AS delta
          FROM public.mrr_movements m
         WHERE m.captured_at >= range_from AND m.captured_at < range_to AND m.movement <> 'baseline'
         GROUP BY 1, 2) x), '[]'::jsonb),
    'lastMrrCapture', (SELECT max(m.captured_at) FROM public.mrr_movements m),
    'revenue', coalesce((SELECT jsonb_agg(jsonb_build_object('currency', cur.currency,
        'invoices', coalesce(inv.n, 0), 'grossMinor', coalesce(inv.total, 0), 'netMinor', coalesce(inv.net, 0),
        'taxMinor', coalesce(inv.tax, 0), 'discountMinor', coalesce(inv.discount, 0),
        'creditNotes', coalesce(cn.n, 0), 'creditedMinor', coalesce(cn.total, 0),
        'creditedNetMinor', coalesce(cn.net, 0), 'creditedTaxMinor', coalesce(cn.tax, 0),
        'refundsMinor', coalesce(rf.total, 0)) ORDER BY cur.currency) FROM (
          SELECT i.currency FROM billing.invoices i WHERE i.issued_at >= range_from AND i.issued_at < range_to
          UNION SELECT n.currency FROM billing.credit_notes n WHERE n.issued_at >= range_from AND n.issued_at < range_to
          UNION SELECT r.currency FROM billing.refunds r
                 WHERE r.status = 'succeeded' AND r.completed_at >= range_from AND r.completed_at < range_to) cur
        LEFT JOIN (SELECT i.currency, count(*) AS n, sum(i.total_minor) AS total, sum(i.subtotal_minor) AS net,
                     sum(i.tax_minor) AS tax, sum(coalesce(i.discount_minor, 0)) AS discount
                     FROM billing.invoices i WHERE i.issued_at >= range_from AND i.issued_at < range_to
                    GROUP BY 1) inv ON inv.currency = cur.currency
        LEFT JOIN (SELECT n.currency, count(*) AS n, sum(n.total_minor) AS total, sum(n.subtotal_minor) AS net,
                     sum(n.tax_minor) AS tax
                     FROM billing.credit_notes n WHERE n.issued_at >= range_from AND n.issued_at < range_to
                    GROUP BY 1) cn ON cn.currency = cur.currency
        LEFT JOIN (SELECT r.currency, sum(r.amount_minor) AS total FROM billing.refunds r
                    WHERE r.status = 'succeeded' AND r.completed_at >= range_from AND r.completed_at < range_to
                    GROUP BY 1) rf ON rf.currency = cur.currency), '[]'::jsonb),
    'lifecycle', jsonb_build_object(
      'trialsStarted', (SELECT count(*) FROM billing.subscription_events e
                         WHERE e.event_type = 'trial_started' AND e.occurred_at >= range_from AND e.occurred_at < range_to),
      'trialsExpired', (SELECT count(*) FROM billing.subscription_events e
                         WHERE e.event_type = 'trial_expired' AND e.occurred_at >= range_from AND e.occurred_at < range_to),
      'activations', (SELECT count(*) FROM billing.subscription_events e
                       WHERE e.event_type = 'activated' AND e.occurred_at >= range_from AND e.occurred_at < range_to),
      'renewals', (SELECT count(*) FROM billing.subscription_events e
                    WHERE e.event_type = 'renewed' AND e.occurred_at >= range_from AND e.occurred_at < range_to),
      'failedPayments', (SELECT count(*) FROM billing.subscription_events e
                          WHERE e.event_type = 'payment_failed' AND e.occurred_at >= range_from AND e.occurred_at < range_to),
      'cancellationsRequested', (SELECT count(*) FROM billing.cancellation_requests r
                                  WHERE r.requested_at >= range_from AND r.requested_at < range_to),
      'cancellationsReversed', (SELECT count(*) FROM billing.cancellation_requests r
                                 WHERE r.reversed_at >= range_from AND r.reversed_at < range_to),
      'cancelled', (SELECT count(*) FROM billing.subscription_events e
                     WHERE e.event_type = 'cancelled' AND e.occurred_at >= range_from AND e.occurred_at < range_to),
      'cancellationReasons', coalesce((SELECT jsonb_object_agg(x.reason, x.n) FROM (
          SELECT coalesce(r.reason_code, 'not_given') AS reason, count(*) AS n FROM billing.cancellation_requests r
           WHERE r.requested_at >= range_from AND r.requested_at < range_to GROUP BY 1) x), '{}'::jsonb)),
    'coupons', coalesce((SELECT jsonb_agg(jsonb_build_object('code', x.offer_code, 'redemptions', x.n) ORDER BY x.n DESC)
      FROM (SELECT r.offer_code, count(*) AS n FROM billing.coupon_redemptions r
             WHERE r.status = 'redeemed' AND r.redeemed_at >= range_from AND r.redeemed_at < range_to
             GROUP BY 1) x), '[]'::jsonb),
    'partners', jsonb_build_object(
      'activeReferrals', (SELECT count(*) FROM billing.referral_attributions a WHERE a.status = 'active'),
      'commission', coalesce((SELECT jsonb_agg(jsonb_build_object('currency', x.currency, 'accruedMinor', x.accrued,
          'reversedMinor', x.reversed, 'adjustedMinor', x.adjusted, 'paidOutMinor', x.paid) ORDER BY x.currency) FROM (
          SELECT l.currency,
            coalesce(sum(l.amount_minor) FILTER (WHERE l.entry_type = 'accrual'), 0) AS accrued,
            coalesce(sum(l.amount_minor) FILTER (WHERE l.entry_type = 'reversal'), 0) AS reversed,
            coalesce(sum(l.amount_minor) FILTER (WHERE l.entry_type = 'adjustment'), 0) AS adjusted,
            coalesce(-sum(l.amount_minor) FILTER (WHERE l.entry_type = 'payout' AND po.status = 'paid'), 0) AS paid
            FROM billing.commission_ledger l LEFT JOIN billing.partner_payouts po ON po.id = l.payout_id
           WHERE l.created_at >= range_from AND l.created_at < range_to
           GROUP BY 1) x), '[]'::jsonb)),
    'webhooks', jsonb_build_object(
      'received', (SELECT count(*) FROM public.billing_events e WHERE e.created_at >= range_from AND e.created_at < range_to),
      'backlog', (SELECT count(*) FROM public.billing_events e WHERE e.status IN ('received', 'processing', 'failed')),
      'dead', (SELECT count(*) FROM public.billing_events e WHERE e.status = 'dead'),
      'oldestBacklogAt', (SELECT min(e.created_at) FROM public.billing_events e WHERE e.status IN ('received', 'processing', 'failed'))),
    'invoicesPending', (SELECT count(*) FROM billing.payments p WHERE p.invoice_issue_error IS NOT NULL
                          AND NOT EXISTS (SELECT 1 FROM billing.invoices i WHERE i.payment_id = p.id)));
END $$;

CREATE OR REPLACE FUNCTION public.platform_billing_analytics(_from timestamptz, _to timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.require_platform('billing.view');
  RETURN billing.analytics_snapshot(_from, _to);
END $$;

-- Service role only: REST v1 calls this for API keys holding billing:analytics.
CREATE OR REPLACE FUNCTION public.billing_api_analytics(_from timestamptz, _to timestamptz) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT billing.analytics_snapshot(_from, _to);
$$;

REVOKE ALL ON FUNCTION billing.analytics_snapshot(timestamptz, timestamptz) FROM PUBLIC;
DO $$ BEGIN
  REVOKE ALL ON FUNCTION billing.analytics_snapshot(timestamptz, timestamptz) FROM anon, authenticated;
EXCEPTION WHEN undefined_object THEN NULL; END $$;
REVOKE ALL ON FUNCTION public.platform_billing_analytics(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_billing_analytics(timestamptz, timestamptz) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.billing_api_analytics(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_api_analytics(timestamptz, timestamptz) TO service_role;
