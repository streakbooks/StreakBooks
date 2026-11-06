-- AD-04: Native Advisors appointment booking with conflict protection.
-- Canonical timestamps are timestamptz (UTC). No fake availability.

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.advisors_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  email text,
  timezone text NOT NULL DEFAULT 'UTC',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.advisors_booking_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id uuid NOT NULL UNIQUE REFERENCES public.advisors_staff(id) ON DELETE CASCADE,
  consultation_minutes integer NOT NULL DEFAULT 30 CHECK (consultation_minutes BETWEEN 15 AND 180),
  buffer_minutes integer NOT NULL DEFAULT 15 CHECK (buffer_minutes BETWEEN 0 AND 120),
  notice_hours integer NOT NULL DEFAULT 24 CHECK (notice_hours BETWEEN 0 AND 720),
  max_daily_appointments integer NOT NULL DEFAULT 8 CHECK (max_daily_appointments BETWEEN 1 AND 40),
  booking_horizon_days integer NOT NULL DEFAULT 28 CHECK (booking_horizon_days BETWEEN 1 AND 120),
  is_free_consultation boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.advisors_working_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id uuid NOT NULL REFERENCES public.advisors_staff(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6), -- 0=Sunday
  start_minute integer NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
  end_minute integer NOT NULL CHECK (end_minute BETWEEN 1 AND 1440),
  UNIQUE (advisor_id, weekday),
  CONSTRAINT advisors_working_hours_range CHECK (start_minute < end_minute)
);

CREATE TABLE IF NOT EXISTS public.advisors_availability_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id uuid NOT NULL REFERENCES public.advisors_staff(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('holiday', 'unavailable', 'break')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  label text NOT NULL DEFAULT '',
  CONSTRAINT advisors_availability_exceptions_range CHECK (starts_at < ends_at)
);

CREATE TABLE IF NOT EXISTS public.advisors_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id uuid NOT NULL REFERENCES public.advisors_staff(id),
  service_code text CHECK (service_code IS NULL OR service_code IN ('bookkeeping', 'coaching')),
  plan_code text,
  status text NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed', 'cancelled', 'completed', 'no_show', 'rescheduled')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  customer_timezone text NOT NULL,
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  business_name text NOT NULL DEFAULT '',
  customer_phone text,
  notes text,
  manage_token text NOT NULL UNIQUE,
  idempotency_key text,
  conversation_token text,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT advisors_appointments_range CHECK (starts_at < ends_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS advisors_appointments_idempotency_uidx
  ON public.advisors_appointments (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS advisors_appointments_advisor_time_idx
  ON public.advisors_appointments (advisor_id, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS advisors_appointments_email_idx
  ON public.advisors_appointments (customer_email, starts_at DESC);
CREATE INDEX IF NOT EXISTS advisors_availability_exceptions_advisor_idx
  ON public.advisors_availability_exceptions (advisor_id, starts_at, ends_at);

DO $$ BEGIN
  ALTER TABLE public.advisors_appointments
    ADD CONSTRAINT advisors_appointments_no_overlap
    EXCLUDE USING gist (
      advisor_id WITH =,
      tstzrange(starts_at, ends_at, '[)') WITH &&
    )
    WHERE (status IN ('confirmed', 'completed'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE public.advisors_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advisors_booking_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advisors_working_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advisors_availability_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advisors_appointments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.advisors_staff, public.advisors_booking_settings, public.advisors_working_hours,
  public.advisors_availability_exceptions, public.advisors_appointments FROM PUBLIC;
DO $$ BEGIN
  REVOKE ALL ON public.advisors_staff, public.advisors_booking_settings, public.advisors_working_hours,
    public.advisors_availability_exceptions, public.advisors_appointments FROM anon, authenticated;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

-- Seed a default advisor calendar when none exists.
INSERT INTO public.advisors_staff (id, display_name, email, timezone, is_active)
SELECT gen_random_uuid(), 'LinkBooks Advisors', NULL, 'UTC', true
WHERE NOT EXISTS (SELECT 1 FROM public.advisors_staff);

INSERT INTO public.advisors_booking_settings (advisor_id)
SELECT s.id FROM public.advisors_staff s
WHERE NOT EXISTS (
  SELECT 1 FROM public.advisors_booking_settings b WHERE b.advisor_id = s.id
);

INSERT INTO public.advisors_working_hours (advisor_id, weekday, start_minute, end_minute)
SELECT s.id, d.weekday, 9 * 60, 17 * 60
FROM public.advisors_staff s
CROSS JOIN (VALUES (1),(2),(3),(4),(5)) AS d(weekday)
WHERE NOT EXISTS (
  SELECT 1 FROM public.advisors_working_hours w WHERE w.advisor_id = s.id
);

CREATE OR REPLACE FUNCTION private.advisors_default_advisor_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT id FROM public.advisors_staff WHERE is_active ORDER BY created_at LIMIT 1;
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

CREATE OR REPLACE FUNCTION public.advisors_book_appointment(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  advisor_id uuid;
  settings public.advisors_booking_settings;
  starts_at timestamptz;
  ends_at timestamptz;
  day date;
  availability jsonb;
  slot jsonb;
  found boolean := false;
  idem text;
  existing public.advisors_appointments;
  created public.advisors_appointments;
  token text;
  daily_count integer;
BEGIN
  PERFORM private.advisors_chat_rate_ok(
    coalesce(nullif(_payload->>'bucket', ''), 'booking:' || coalesce(_payload->>'customerEmail', 'anon')),
    20
  );

  idem := nullif(btrim(_payload->>'idempotencyKey'), '');
  IF idem IS NOT NULL THEN
    SELECT * INTO existing FROM public.advisors_appointments WHERE idempotency_key = idem;
    IF existing.id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'id', existing.id,
        'status', existing.status,
        'startsAt', existing.starts_at,
        'endsAt', existing.ends_at,
        'manageToken', existing.manage_token,
        'replayed', true
      );
    END IF;
  END IF;

  advisor_id := coalesce(nullif(_payload->>'advisorId', '')::uuid, private.advisors_default_advisor_id());
  starts_at := (_payload->>'startsAt')::timestamptz;
  IF starts_at IS NULL THEN
    RAISE EXCEPTION 'Choose an available time slot' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(_payload->>'customerName', ''))) < 2 THEN
    RAISE EXCEPTION 'Enter your name' USING ERRCODE = '22023';
  END IF;
  IF coalesce(_payload->>'customerEmail', '') !~* '^[^@]+@[^@]+\.[^@]+$' THEN
    RAISE EXCEPTION 'Enter a valid email address' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO settings FROM public.advisors_booking_settings WHERE advisor_id = advisor_id;
  ends_at := starts_at + make_interval(mins => settings.consultation_minutes);
  day := (starts_at AT TIME ZONE (SELECT timezone FROM public.advisors_staff WHERE id = advisor_id))::date;

  availability := public.advisors_list_available_slots(day, coalesce(_payload->>'customerTimezone', 'UTC'), advisor_id);
  FOR slot IN SELECT value FROM jsonb_array_elements(availability->'slots')
  LOOP
    IF (slot->>'startsAt')::timestamptz = starts_at THEN
      found := true;
      EXIT;
    END IF;
  END LOOP;
  IF NOT found THEN
    RAISE EXCEPTION 'That time is no longer available. Choose another slot.' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO daily_count
  FROM public.advisors_appointments a
  WHERE a.advisor_id = advisor_id
    AND a.status IN ('confirmed', 'completed')
    AND (a.starts_at AT TIME ZONE (SELECT timezone FROM public.advisors_staff WHERE id = advisor_id))::date = day;
  IF daily_count >= settings.max_daily_appointments THEN
    RAISE EXCEPTION 'No remaining appointments for that day' USING ERRCODE = 'P0001';
  END IF;

  token := encode(gen_random_bytes(24), 'hex');
  INSERT INTO public.advisors_appointments (
    advisor_id, service_code, plan_code, status, starts_at, ends_at, customer_timezone,
    customer_name, customer_email, business_name, customer_phone, notes, manage_token,
    idempotency_key, conversation_token
  ) VALUES (
    advisor_id,
    nullif(_payload->>'serviceCode', ''),
    nullif(_payload->>'planCode', ''),
    'confirmed',
    starts_at,
    ends_at,
    coalesce(nullif(_payload->>'customerTimezone', ''), 'UTC'),
    btrim(_payload->>'customerName'),
    lower(btrim(_payload->>'customerEmail')),
    coalesce(btrim(_payload->>'businessName'), ''),
    nullif(btrim(_payload->>'customerPhone'), ''),
    nullif(btrim(_payload->>'notes'), ''),
    token,
    idem,
    nullif(_payload->>'conversationToken', '')
  )
  RETURNING * INTO created;

  RETURN jsonb_build_object(
    'id', created.id,
    'status', created.status,
    'startsAt', created.starts_at,
    'endsAt', created.ends_at,
    'manageToken', created.manage_token,
    'isFreeConsultation', settings.is_free_consultation,
    'durationMinutes', settings.consultation_minutes,
    'replayed', false,
    'customer', 'Booking confirmed. Reminder delivery is configured in a later notifications batch.'
  );
EXCEPTION
  WHEN exclusion_violation THEN
    RAISE EXCEPTION 'That time was just booked. Choose another slot.' USING ERRCODE = 'P0001';
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

  RETURN booked || jsonb_build_object('previousAppointmentId', appt.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_advisors_booking_admin()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  advisor public.advisors_staff;
BEGIN
  PERFORM private.require_platform('billing.view');
  SELECT * INTO advisor FROM public.advisors_staff WHERE is_active ORDER BY created_at LIMIT 1;
  RETURN jsonb_build_object(
    'advisor', CASE WHEN advisor.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', advisor.id,
      'displayName', advisor.display_name,
      'email', advisor.email,
      'timezone', advisor.timezone,
      'isActive', advisor.is_active
    ) END,
    'settings', (
      SELECT jsonb_build_object(
        'consultationMinutes', s.consultation_minutes,
        'bufferMinutes', s.buffer_minutes,
        'noticeHours', s.notice_hours,
        'maxDailyAppointments', s.max_daily_appointments,
        'bookingHorizonDays', s.booking_horizon_days,
        'isFreeConsultation', s.is_free_consultation
      )
      FROM public.advisors_booking_settings s
      WHERE s.advisor_id = advisor.id
    ),
    'workingHours', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'weekday', w.weekday,
        'startMinute', w.start_minute,
        'endMinute', w.end_minute
      ) ORDER BY w.weekday)
      FROM public.advisors_working_hours w
      WHERE w.advisor_id = advisor.id
    ), '[]'::jsonb),
    'exceptions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', e.id,
        'kind', e.kind,
        'startsAt', e.starts_at,
        'endsAt', e.ends_at,
        'label', e.label
      ) ORDER BY e.starts_at)
      FROM public.advisors_availability_exceptions e
      WHERE e.advisor_id = advisor.id AND e.ends_at >= now() - interval '1 day'
    ), '[]'::jsonb),
    'appointments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id,
        'status', a.status,
        'startsAt', a.starts_at,
        'endsAt', a.ends_at,
        'customerName', a.customer_name,
        'customerEmail', a.customer_email,
        'businessName', a.business_name,
        'serviceCode', a.service_code,
        'planCode', a.plan_code
      ) ORDER BY a.starts_at)
      FROM (
        SELECT * FROM public.advisors_appointments
        WHERE starts_at >= now() - interval '7 days'
        ORDER BY starts_at
        LIMIT 200
      ) a
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_advisors_save_booking_settings(
  _payload jsonb, _reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  advisor_id uuid;
  hours jsonb;
  item jsonb;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason (at least 3 characters)' USING ERRCODE = '22023';
  END IF;
  advisor_id := coalesce(nullif(_payload->>'advisorId', '')::uuid, private.advisors_default_advisor_id());

  UPDATE public.advisors_staff
     SET display_name = coalesce(nullif(btrim(_payload->>'displayName'), ''), display_name),
         timezone = coalesce(nullif(btrim(_payload->>'timezone'), ''), timezone),
         updated_at = now()
   WHERE id = advisor_id;

  UPDATE public.advisors_booking_settings
     SET consultation_minutes = coalesce((_payload->>'consultationMinutes')::integer, consultation_minutes),
         buffer_minutes = coalesce((_payload->>'bufferMinutes')::integer, buffer_minutes),
         notice_hours = coalesce((_payload->>'noticeHours')::integer, notice_hours),
         max_daily_appointments = coalesce((_payload->>'maxDailyAppointments')::integer, max_daily_appointments),
         booking_horizon_days = coalesce((_payload->>'bookingHorizonDays')::integer, booking_horizon_days),
         is_free_consultation = coalesce((_payload->>'isFreeConsultation')::boolean, is_free_consultation),
         updated_at = now()
   WHERE advisor_id = advisor_id;

  IF jsonb_typeof(_payload->'workingHours') = 'array' THEN
    DELETE FROM public.advisors_working_hours WHERE advisor_id = advisor_id;
    FOR item IN SELECT value FROM jsonb_array_elements(_payload->'workingHours')
    LOOP
      INSERT INTO public.advisors_working_hours(advisor_id, weekday, start_minute, end_minute)
      VALUES (
        advisor_id,
        (item->>'weekday')::integer,
        (item->>'startMinute')::integer,
        (item->>'endMinute')::integer
      );
    END LOOP;
  END IF;

  PERFORM private.platform_log(
    'advisors.booking_settings.save',
    'advisors_staff',
    advisor_id::text,
    NULL,
    _payload,
    _reason
  );

  RETURN public.platform_advisors_booking_admin();
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_advisors_add_exception(
  _payload jsonb, _reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  advisor_id uuid;
  created public.advisors_availability_exceptions;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason (at least 3 characters)' USING ERRCODE = '22023';
  END IF;
  advisor_id := coalesce(nullif(_payload->>'advisorId', '')::uuid, private.advisors_default_advisor_id());
  INSERT INTO public.advisors_availability_exceptions(advisor_id, kind, starts_at, ends_at, label)
  VALUES (
    advisor_id,
    coalesce(_payload->>'kind', 'unavailable'),
    (_payload->>'startsAt')::timestamptz,
    (_payload->>'endsAt')::timestamptz,
    coalesce(_payload->>'label', '')
  )
  RETURNING * INTO created;
  PERFORM private.platform_log(
    'advisors.exception.add',
    'advisors_availability_exceptions',
    created.id::text,
    NULL,
    to_jsonb(created),
    _reason
  );
  RETURN jsonb_build_object('id', created.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_advisors_set_appointment_status(
  _appointment_id uuid, _status text, _reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  appt public.advisors_appointments;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF _status NOT IN ('confirmed', 'cancelled', 'completed', 'no_show') THEN
    RAISE EXCEPTION 'Unsupported appointment status' USING ERRCODE = '22023';
  END IF;
  IF length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason (at least 3 characters)' USING ERRCODE = '22023';
  END IF;
  UPDATE public.advisors_appointments
     SET status = _status,
         cancelled_at = CASE WHEN _status = 'cancelled' THEN now() ELSE cancelled_at END,
         cancellation_reason = CASE WHEN _status = 'cancelled' THEN _reason ELSE cancellation_reason END,
         updated_at = now()
   WHERE id = _appointment_id
   RETURNING * INTO appt;
  IF appt.id IS NULL THEN
    RAISE EXCEPTION 'Appointment not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM private.platform_log(
    'advisors.appointment.status',
    'advisors_appointments',
    appt.id::text,
    NULL,
    jsonb_build_object('status', appt.status),
    _reason
  );
  RETURN jsonb_build_object('id', appt.id, 'status', appt.status);
END;
$$;

REVOKE ALL ON FUNCTION public.advisors_list_available_slots(date, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advisors_book_appointment(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advisors_get_appointment(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advisors_cancel_appointment(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advisors_reschedule_appointment(text, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_advisors_booking_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_advisors_save_booking_settings(jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_advisors_add_exception(jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_advisors_set_appointment_status(uuid, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.advisors_list_available_slots(date, text, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.advisors_book_appointment(jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.advisors_get_appointment(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.advisors_cancel_appointment(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.advisors_reschedule_appointment(text, timestamptz, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_advisors_booking_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_advisors_save_booking_settings(jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_advisors_add_exception(jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_advisors_set_appointment_status(uuid, text, text) TO authenticated, service_role;
