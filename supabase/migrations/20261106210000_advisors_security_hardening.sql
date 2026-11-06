-- AD-10: Advisors security/reliability hardening.
-- - Require explicit checkout ids (no latest-checkout fallback)
-- - Rate-limit public slot listing and manage-token RPCs
-- - Fix reminder attempt counting and reclaim abandoned claims

CREATE OR REPLACE FUNCTION public.platform_advisors_attach_checkout(
  _subscription_id uuid, _checkout_id uuid, _reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sub public.advisors_subscriptions;
  checkout_company uuid;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason (at least 3 characters)' USING ERRCODE = '22023';
  END IF;
  IF _checkout_id IS NULL THEN
    RAISE EXCEPTION 'Checkout id is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO sub FROM public.advisors_subscriptions WHERE id = _subscription_id FOR UPDATE;
  IF sub.id IS NULL THEN
    RAISE EXCEPTION 'Advisors subscription not found' USING ERRCODE = 'P0002';
  END IF;
  IF sub.status NOT IN ('pending_checkout', 'checkout_open', 'expired', 'cancelled') THEN
    RAISE EXCEPTION 'Subscription is not open for checkout' USING ERRCODE = '22023';
  END IF;

  SELECT c.company_id INTO checkout_company
  FROM public.billing_checkouts c
  WHERE c.id = _checkout_id;
  IF checkout_company IS NULL THEN
    RAISE EXCEPTION 'Checkout not found' USING ERRCODE = 'P0002';
  END IF;
  IF checkout_company IS DISTINCT FROM sub.company_id THEN
    RAISE EXCEPTION 'Checkout does not belong to this Advisors billing company'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.advisors_subscriptions
     SET checkout_id = _checkout_id,
         status = 'checkout_open',
         updated_at = now()
   WHERE id = sub.id
   RETURNING * INTO sub;
  PERFORM private.platform_log(
    'advisors.subscription.checkout',
    'advisors_subscriptions',
    sub.id::text,
    NULL,
    jsonb_build_object('checkoutId', sub.checkout_id),
    _reason
  );
  RETURN private.advisors_subscription_json(sub);
END;
$$;

CREATE OR REPLACE FUNCTION public.advisors_list_available_slots(
  _day date,
  _customer_timezone text,
  _advisor_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  advisor public.advisors_staff;
  settings public.advisors_booking_settings;
  day_of_week integer;
  work public.advisors_working_hours;
  slot_start timestamptz;
  slot_end timestamptz;
  day_start timestamptz;
  cursor_ts timestamptz;
  slots jsonb := '[]'::jsonb;
  daily_count integer;
  notice_cutoff timestamptz;
  blocked boolean;
BEGIN
  PERFORM private.advisors_chat_rate_ok(
    'slots:' || coalesce(_advisor_id::text, 'default') || ':' || coalesce(_day::text, 'noday'),
    60
  );

  SELECT * INTO advisor
  FROM public.advisors_staff
  WHERE id = coalesce(_advisor_id, private.advisors_default_advisor_id())
    AND is_active;
  IF advisor.id IS NULL THEN
    RETURN jsonb_build_object('slots', '[]'::jsonb, 'reason', 'No active advisor calendar');
  END IF;

  SELECT * INTO settings FROM public.advisors_booking_settings WHERE advisor_id = advisor.id;
  IF settings.id IS NULL THEN
    RETURN jsonb_build_object('slots', '[]'::jsonb, 'reason', 'Booking settings missing');
  END IF;

  IF _day < (timezone(advisor.timezone, now()))::date THEN
    RETURN jsonb_build_object('slots', '[]'::jsonb, 'advisorId', advisor.id, 'timezone', advisor.timezone);
  END IF;
  IF _day > ((timezone(advisor.timezone, now()))::date + settings.booking_horizon_days) THEN
    RETURN jsonb_build_object('slots', '[]'::jsonb, 'advisorId', advisor.id, 'timezone', advisor.timezone);
  END IF;

  day_of_week := extract(dow FROM _day)::integer;
  SELECT * INTO work
  FROM public.advisors_working_hours
  WHERE advisor_id = advisor.id AND weekday = day_of_week;
  IF work.id IS NULL THEN
    RETURN jsonb_build_object('slots', '[]'::jsonb, 'advisorId', advisor.id, 'timezone', advisor.timezone);
  END IF;

  day_start := (_day::timestamp + make_interval(mins => work.start_minute)) AT TIME ZONE advisor.timezone;
  cursor_ts := day_start;
  notice_cutoff := now() + make_interval(hours => settings.notice_hours);

  SELECT count(*) INTO daily_count
  FROM public.advisors_appointments a
  WHERE a.advisor_id = advisor.id
    AND a.status IN ('confirmed', 'completed')
    AND (a.starts_at AT TIME ZONE advisor.timezone)::date = _day;

  WHILE cursor_ts + make_interval(mins => settings.consultation_minutes)
        <= (_day::timestamp + make_interval(mins => work.end_minute)) AT TIME ZONE advisor.timezone
  LOOP
    slot_start := cursor_ts;
    slot_end := cursor_ts + make_interval(mins => settings.consultation_minutes);

    IF slot_start >= notice_cutoff AND daily_count < settings.max_daily_appointments THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.advisors_availability_exceptions e
        WHERE e.advisor_id = advisor.id
          AND tstzrange(e.starts_at, e.ends_at, '[)') && tstzrange(slot_start, slot_end, '[)')
      ) INTO blocked;

      IF NOT blocked THEN
        SELECT EXISTS (
          SELECT 1
          FROM public.advisors_appointments a
          WHERE a.advisor_id = advisor.id
            AND a.status IN ('confirmed', 'completed')
            AND tstzrange(
                  a.starts_at - make_interval(mins => settings.buffer_minutes),
                  a.ends_at + make_interval(mins => settings.buffer_minutes),
                  '[)'
                ) && tstzrange(slot_start, slot_end, '[)')
        ) INTO blocked;
      END IF;

      IF NOT blocked THEN
        slots := slots || jsonb_build_array(jsonb_build_object(
          'startsAt', slot_start,
          'endsAt', slot_end,
          'customerStartsAt', slot_start,
          'customerEndsAt', slot_end,
          'customerTimezone', coalesce(nullif(_customer_timezone, ''), 'UTC'),
          'durationMinutes', settings.consultation_minutes,
          'isFreeConsultation', settings.is_free_consultation
        ));
      END IF;
    END IF;

    cursor_ts := cursor_ts + make_interval(mins => settings.consultation_minutes + settings.buffer_minutes);
  END LOOP;

  RETURN jsonb_build_object(
    'advisorId', advisor.id,
    'advisorName', advisor.display_name,
    'timezone', advisor.timezone,
    'slots', slots
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.advisors_get_appointment(_manage_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  appt public.advisors_appointments;
BEGIN
  PERFORM private.advisors_chat_rate_ok(
    'manage-get:' || left(coalesce(_manage_token, 'missing'), 24),
    40
  );
  SELECT * INTO appt FROM public.advisors_appointments WHERE manage_token = _manage_token;
  IF appt.id IS NULL THEN
    RAISE EXCEPTION 'Appointment not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN jsonb_build_object(
    'id', appt.id,
    'status', appt.status,
    'startsAt', appt.starts_at,
    'endsAt', appt.ends_at,
    'customerTimezone', appt.customer_timezone,
    'customerName', appt.customer_name,
    'customerEmail', appt.customer_email,
    'businessName', appt.business_name,
    'serviceCode', appt.service_code,
    'planCode', appt.plan_code,
    'notes', appt.notes
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.advisors_cancel_appointment(
  _manage_token text, _reason text DEFAULT ''
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  appt public.advisors_appointments;
BEGIN
  PERFORM private.advisors_chat_rate_ok(
    'manage-cancel:' || left(coalesce(_manage_token, 'missing'), 24),
    20
  );
  SELECT * INTO appt FROM public.advisors_appointments WHERE manage_token = _manage_token FOR UPDATE;
  IF appt.id IS NULL THEN
    RAISE EXCEPTION 'Appointment not found' USING ERRCODE = 'P0002';
  END IF;
  IF appt.status = 'cancelled' THEN
    RETURN jsonb_build_object('id', appt.id, 'status', appt.status);
  END IF;
  IF appt.status NOT IN ('confirmed', 'rescheduled') THEN
    RAISE EXCEPTION 'This appointment cannot be cancelled' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.advisors_appointments
     SET status = 'cancelled',
         cancelled_at = now(),
         cancellation_reason = nullif(btrim(_reason), ''),
         updated_at = now()
   WHERE id = appt.id
   RETURNING * INTO appt;
  UPDATE public.advisors_appointment_reminders
     SET status = 'cancelled'
   WHERE appointment_id = appt.id AND status IN ('pending', 'claimed');
  RETURN jsonb_build_object('id', appt.id, 'status', appt.status);
END;
$$;

CREATE OR REPLACE FUNCTION public.advisors_reschedule_appointment(
  _manage_token text, _starts_at timestamptz, _idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  appt public.advisors_appointments;
  booked jsonb;
BEGIN
  PERFORM private.advisors_chat_rate_ok(
    'manage-reschedule:' || left(coalesce(_manage_token, 'missing'), 24),
    20
  );
  SELECT * INTO appt FROM public.advisors_appointments WHERE manage_token = _manage_token FOR UPDATE;
  IF appt.id IS NULL THEN
    RAISE EXCEPTION 'Appointment not found' USING ERRCODE = 'P0002';
  END IF;
  IF appt.status NOT IN ('confirmed', 'rescheduled') THEN
    RAISE EXCEPTION 'This appointment cannot be rescheduled' USING ERRCODE = 'P0001';
  END IF;

  booked := public.advisors_book_appointment(jsonb_build_object(
    'advisorId', appt.advisor_id,
    'startsAt', _starts_at,
    'customerTimezone', appt.customer_timezone,
    'customerName', appt.customer_name,
    'customerEmail', appt.customer_email,
    'businessName', appt.business_name,
    'customerPhone', appt.customer_phone,
    'notes', appt.notes,
    'serviceCode', appt.service_code,
    'planCode', appt.plan_code,
    'idempotencyKey', coalesce(nullif(_idempotency_key, ''), 'reschedule:' || appt.id::text || ':' || _starts_at::text),
    'bucket', 'reschedule:' || appt.customer_email
  ));

  UPDATE public.advisors_appointments
     SET status = 'rescheduled', updated_at = now()
   WHERE id = appt.id;
  UPDATE public.advisors_appointment_reminders
     SET status = 'cancelled'
   WHERE appointment_id = appt.id AND status IN ('pending', 'claimed');

  RETURN booked || jsonb_build_object('previousAppointmentId', appt.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.advisors_mark_reminder_status(
  _reminder_id uuid, _status text, _error text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    PERFORM private.require_platform('billing.manage');
  END IF;
  IF _status NOT IN ('claimed', 'sent', 'failed', 'cancelled', 'pending') THEN
    RAISE EXCEPTION 'Unsupported reminder status' USING ERRCODE = '22023';
  END IF;
  UPDATE public.advisors_appointment_reminders
  SET status = _status,
      -- Claim already increments attempts; only bump again on failed retries.
      attempts = CASE
        WHEN _status = 'failed' THEN attempts + 1
        WHEN _status = 'claimed' AND claimed_at IS NULL THEN attempts + 1
        ELSE attempts
      END,
      last_error = CASE WHEN _status = 'failed' THEN left(coalesce(_error, ''), 1000) ELSE last_error END,
      sent_at = CASE WHEN _status = 'sent' THEN now() ELSE sent_at END,
      claimed_at = CASE WHEN _status = 'claimed' THEN coalesce(claimed_at, now()) ELSE claimed_at END
  WHERE id = _reminder_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.advisors_reclaim_stale_reminders(
  _older_than interval DEFAULT interval '15 minutes'
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    PERFORM private.require_platform('billing.manage');
  END IF;
  UPDATE public.advisors_appointment_reminders
  SET status = 'pending',
      last_error = left(coalesce(last_error || E'\n', '') || 'Reclaimed stale claim', 1000),
      claimed_at = NULL
  WHERE status = 'claimed'
    AND claimed_at IS NOT NULL
    AND claimed_at < now() - _older_than;
  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.advisors_claim_due_reminders(_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lim integer := least(greatest(coalesce(_limit, 20), 1), 100);
  ids uuid[];
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    PERFORM private.require_platform('billing.manage');
  END IF;

  PERFORM public.advisors_reclaim_stale_reminders(interval '15 minutes');

  WITH due AS (
    SELECT rem.id
    FROM public.advisors_appointment_reminders rem
    JOIN public.advisors_appointments a ON a.id = rem.appointment_id
    WHERE rem.status = 'pending'
      AND rem.due_at <= now()
      AND a.status = 'confirmed'
      AND a.starts_at > now()
    ORDER BY rem.due_at
    LIMIT lim
    FOR UPDATE OF rem SKIP LOCKED
  ),
  claimed AS (
    UPDATE public.advisors_appointment_reminders rem
    SET status = 'claimed', claimed_at = now(), attempts = rem.attempts + 1
    FROM due
    WHERE rem.id = due.id
    RETURNING rem.id
  )
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO ids FROM claimed;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'reminderId', r.id,
      'appointmentId', a.id,
      'dueAt', r.due_at,
      'startsAt', a.starts_at,
      'endsAt', a.ends_at,
      'customerName', a.customer_name,
      'customerEmail', a.customer_email,
      'manageToken', a.manage_token,
      'advisorName', s.display_name,
      'attempts', r.attempts
    ) ORDER BY r.due_at)
    FROM public.advisors_appointment_reminders r
    JOIN public.advisors_appointments a ON a.id = r.appointment_id
    LEFT JOIN public.advisors_staff s ON s.id = a.advisor_id
    WHERE r.id = ANY (ids)
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.advisors_reclaim_stale_reminders(interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.advisors_reclaim_stale_reminders(interval) TO authenticated, service_role;
