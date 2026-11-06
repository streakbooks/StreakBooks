-- AD-09: Advisors customer portal, portal notifications, booking reminders.
-- Calendar OAuth (Google/Microsoft) remains optional and is not required here.
-- Reuses existing LinkBooks auth; does not invent a second payment or portal engine.

ALTER TABLE public.advisors_clients
  DROP CONSTRAINT IF EXISTS advisors_clients_linked_user_id_fkey;

ALTER TABLE public.advisors_clients
  ADD CONSTRAINT advisors_clients_linked_user_id_fkey
  FOREIGN KEY (linked_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS advisors_clients_linked_user_uidx
  ON public.advisors_clients (linked_user_id)
  WHERE linked_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.advisors_portal_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.advisors_clients(id) ON DELETE CASCADE,
  email text NOT NULL,
  token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT advisors_portal_invites_email_nonempty CHECK (char_length(btrim(email)) > 2)
);

CREATE INDEX IF NOT EXISTS advisors_portal_invites_client_idx
  ON public.advisors_portal_invites (client_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS advisors_portal_invites_email_idx
  ON public.advisors_portal_invites (lower(email), status);

CREATE TABLE IF NOT EXISTS public.advisors_portal_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.advisors_clients(id) ON DELETE CASCADE,
  author_role text NOT NULL CHECK (author_role IN ('customer', 'advisor', 'system')),
  author_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_advisor_id uuid REFERENCES public.advisors_staff(id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT advisors_portal_messages_body_nonempty CHECK (char_length(btrim(body)) > 0)
);

CREATE INDEX IF NOT EXISTS advisors_portal_messages_client_idx
  ON public.advisors_portal_messages (client_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.advisors_portal_service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.advisors_clients(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('plan_change', 'cancellation')),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_review', 'accepted', 'declined', 'cancelled')),
  details text NOT NULL DEFAULT '',
  preferred_plan_code text,
  admin_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS advisors_portal_service_requests_client_idx
  ON public.advisors_portal_service_requests (client_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS advisors_portal_service_requests_status_idx
  ON public.advisors_portal_service_requests (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.advisors_portal_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.advisors_clients(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  href text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS advisors_portal_notifications_client_idx
  ON public.advisors_portal_notifications (client_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS public.advisors_appointment_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.advisors_appointments(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'email' CHECK (channel IN ('email')),
  due_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'claimed', 'sent', 'failed', 'cancelled')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  sent_at timestamptz,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (appointment_id, channel, due_at)
);

CREATE INDEX IF NOT EXISTS advisors_appointment_reminders_due_idx
  ON public.advisors_appointment_reminders (status, due_at)
  WHERE status IN ('pending', 'claimed');

ALTER TABLE public.advisors_portal_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advisors_portal_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advisors_portal_service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advisors_portal_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advisors_appointment_reminders ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.advisors_portal_invites FROM PUBLIC;
REVOKE ALL ON TABLE public.advisors_portal_messages FROM PUBLIC;
REVOKE ALL ON TABLE public.advisors_portal_service_requests FROM PUBLIC;
REVOKE ALL ON TABLE public.advisors_portal_notifications FROM PUBLIC;
REVOKE ALL ON TABLE public.advisors_appointment_reminders FROM PUBLIC;
DO $$ BEGIN
  REVOKE ALL ON TABLE public.advisors_portal_invites FROM anon, authenticated;
  REVOKE ALL ON TABLE public.advisors_portal_messages FROM anon, authenticated;
  REVOKE ALL ON TABLE public.advisors_portal_service_requests FROM anon, authenticated;
  REVOKE ALL ON TABLE public.advisors_portal_notifications FROM anon, authenticated;
  REVOKE ALL ON TABLE public.advisors_appointment_reminders FROM anon, authenticated;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION private.advisors_client_json(c public.advisors_clients)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'id', c.id,
    'email', c.email,
    'name', c.name,
    'businessName', c.business_name,
    'phone', c.phone,
    'status', c.status,
    'primaryServiceCode', c.primary_service_code,
    'assignedAdvisorId', c.assigned_advisor_id,
    'sourceLeadId', c.source_lead_id,
    'sourceAppointmentId', c.source_appointment_id,
    'companyId', c.company_id,
    'linkedUserId', c.linked_user_id,
    'notes', c.notes,
    'createdAt', c.created_at,
    'updatedAt', c.updated_at
  );
$$;

CREATE OR REPLACE FUNCTION private.advisors_require_portal_client()
RETURNS public.advisors_clients
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  client public.advisors_clients;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to open your Advisors portal' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO client
  FROM public.advisors_clients
  WHERE linked_user_id = auth.uid()
  LIMIT 1;
  IF client.id IS NULL THEN
    RAISE EXCEPTION 'No Advisors portal account is linked to this sign-in. Accept an invitation from your advisor.'
      USING ERRCODE = 'P0002';
  END IF;
  IF client.status = 'churned' THEN
    RAISE EXCEPTION 'This Advisors portal account is closed' USING ERRCODE = '42501';
  END IF;
  RETURN client;
END;
$$;

CREATE OR REPLACE FUNCTION private.advisors_portal_notify(
  _client_id uuid, _kind text, _title text, _body text DEFAULT '', _href text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.advisors_portal_notifications(client_id, kind, title, body, href)
  VALUES (_client_id, left(_kind, 80), left(_title, 200), left(coalesce(_body, ''), 2000), _href);
END;
$$;

CREATE OR REPLACE FUNCTION private.advisors_schedule_appointment_reminders(_appointment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  appt public.advisors_appointments;
BEGIN
  SELECT * INTO appt FROM public.advisors_appointments WHERE id = _appointment_id;
  IF appt.id IS NULL OR appt.status <> 'confirmed' THEN
    RETURN;
  END IF;
  INSERT INTO public.advisors_appointment_reminders(appointment_id, channel, due_at)
  VALUES
    (_appointment_id, 'email', appt.starts_at - interval '24 hours'),
    (_appointment_id, 'email', appt.starts_at - interval '2 hours')
  ON CONFLICT (appointment_id, channel, due_at) DO NOTHING;
  UPDATE public.advisors_appointment_reminders
  SET status = 'cancelled', last_error = 'Appointment time already passed when scheduled'
  WHERE appointment_id = _appointment_id
    AND status = 'pending'
    AND due_at <= now();
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

  PERFORM private.advisors_schedule_appointment_reminders(created.id);

  RETURN jsonb_build_object(
    'id', created.id,
    'status', created.status,
    'startsAt', created.starts_at,
    'endsAt', created.ends_at,
    'manageToken', created.manage_token,
    'isFreeConsultation', settings.is_free_consultation,
    'durationMinutes', settings.consultation_minutes,
    'replayed', false,
    'message', 'Booking confirmed. Email reminders are scheduled for 24 hours and 2 hours before the appointment.'
  );
EXCEPTION
  WHEN exclusion_violation THEN
    RAISE EXCEPTION 'That time was just booked. Choose another slot.' USING ERRCODE = 'P0001';
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_advisors_create_portal_invite(
  _client_id uuid, _reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  client public.advisors_clients;
  invite public.advisors_portal_invites;
  token text;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason (at least 3 characters)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO client FROM public.advisors_clients WHERE id = _client_id FOR UPDATE;
  IF client.id IS NULL THEN
    RAISE EXCEPTION 'Client not found' USING ERRCODE = 'P0002';
  END IF;
  IF client.linked_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'This client already has a linked portal login' USING ERRCODE = '22023';
  END IF;

  UPDATE public.advisors_portal_invites
  SET status = 'revoked'
  WHERE client_id = client.id AND status = 'pending';

  token := encode(gen_random_bytes(24), 'hex');
  INSERT INTO public.advisors_portal_invites(client_id, email, token, expires_at, created_by)
  VALUES (client.id, lower(client.email), token, now() + interval '14 days', auth.uid())
  RETURNING * INTO invite;

  PERFORM private.platform_log(
    'advisors.portal.invite', 'advisors_portal_invites', invite.id::text, NULL,
    jsonb_build_object('clientId', client.id, 'email', client.email), _reason
  );

  RETURN jsonb_build_object(
    'id', invite.id,
    'clientId', invite.client_id,
    'email', invite.email,
    'token', invite.token,
    'status', invite.status,
    'expiresAt', invite.expires_at,
    'createdAt', invite.created_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_advisors_unlink_portal_user(
  _client_id uuid, _reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  client public.advisors_clients;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason (at least 3 characters)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO client FROM public.advisors_clients WHERE id = _client_id FOR UPDATE;
  IF client.id IS NULL THEN
    RAISE EXCEPTION 'Client not found' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.advisors_portal_invites
  SET status = 'revoked'
  WHERE client_id = client.id AND status = 'pending';
  UPDATE public.advisors_clients
  SET linked_user_id = NULL, updated_at = now()
  WHERE id = client.id
  RETURNING * INTO client;
  PERFORM private.platform_log(
    'advisors.portal.unlink', 'advisors_clients', client.id::text, NULL,
    jsonb_build_object('clientId', client.id), _reason
  );
  RETURN private.advisors_client_json(client);
END;
$$;

CREATE OR REPLACE FUNCTION public.advisors_portal_accept_invite(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite public.advisors_portal_invites;
  client public.advisors_clients;
  user_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in before accepting a portal invitation' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO invite
  FROM public.advisors_portal_invites
  WHERE token = nullif(btrim(_token), '')
  FOR UPDATE;
  IF invite.id IS NULL THEN
    RAISE EXCEPTION 'Invitation not found' USING ERRCODE = 'P0002';
  END IF;
  IF invite.status = 'accepted' AND invite.accepted_user_id = auth.uid() THEN
    SELECT * INTO client FROM public.advisors_clients WHERE id = invite.client_id;
    RETURN private.advisors_client_json(client);
  END IF;
  IF invite.status <> 'pending' THEN
    RAISE EXCEPTION 'This invitation is no longer valid' USING ERRCODE = '22023';
  END IF;
  IF invite.expires_at < now() THEN
    UPDATE public.advisors_portal_invites SET status = 'expired' WHERE id = invite.id;
    RAISE EXCEPTION 'This invitation has expired' USING ERRCODE = '22023';
  END IF;

  user_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  IF user_email = '' OR user_email <> lower(invite.email) THEN
    RAISE EXCEPTION 'Sign in with % to accept this invitation', invite.email USING ERRCODE = '42501';
  END IF;

  SELECT * INTO client FROM public.advisors_clients WHERE id = invite.client_id FOR UPDATE;
  IF client.linked_user_id IS NOT NULL AND client.linked_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'This client already has a different portal login' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.advisors_clients
    WHERE linked_user_id = auth.uid() AND id <> client.id
  ) THEN
    RAISE EXCEPTION 'This sign-in is already linked to another Advisors client' USING ERRCODE = '22023';
  END IF;

  UPDATE public.advisors_clients
  SET linked_user_id = auth.uid(), updated_at = now(),
      status = CASE WHEN status = 'prospect' THEN 'active' ELSE status END
  WHERE id = client.id
  RETURNING * INTO client;

  UPDATE public.advisors_portal_invites
  SET status = 'accepted', accepted_at = now(), accepted_user_id = auth.uid()
  WHERE id = invite.id;

  PERFORM private.advisors_portal_notify(
    client.id, 'portal_welcome', 'Welcome to your Advisors portal',
    'Your account is linked. You can review plans, appointments, documents and messages here.',
    '/advisors-portal'
  );

  RETURN private.advisors_client_json(client);
END;
$$;

CREATE OR REPLACE FUNCTION public.advisors_portal_home()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  client public.advisors_clients;
  engagement public.advisors_engagements;
  plan_row public.advisors_service_plans;
  subscription public.advisors_subscriptions;
  completed_sessions integer;
BEGIN
  client := private.advisors_require_portal_client();

  SELECT * INTO engagement
  FROM public.advisors_engagements
  WHERE client_id = client.id
    AND status IN ('onboarding', 'active', 'paused')
  ORDER BY
    CASE status WHEN 'active' THEN 0 WHEN 'onboarding' THEN 1 ELSE 2 END,
    updated_at DESC
  LIMIT 1;

  IF engagement.id IS NOT NULL THEN
    SELECT * INTO plan_row FROM public.advisors_service_plans WHERE code = engagement.plan_code;
    SELECT * INTO subscription
    FROM public.advisors_subscriptions
    WHERE engagement_id = engagement.id
    ORDER BY updated_at DESC
    LIMIT 1;
  END IF;

  SELECT count(*)::int INTO completed_sessions
  FROM public.advisors_work_periods p
  JOIN public.advisors_workspaces w ON w.id = p.workspace_id
  WHERE w.engagement_id = engagement.id
    AND w.kind = 'coaching'
    AND p.status = 'completed';

  RETURN jsonb_build_object(
    'client', private.advisors_client_json(client),
    'engagement', CASE WHEN engagement.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', engagement.id,
      'title', engagement.title,
      'status', engagement.status,
      'serviceCode', engagement.service_code,
      'planCode', engagement.plan_code,
      'billingInterval', engagement.billing_interval,
      'amountMinor', engagement.amount_minor,
      'currency', engagement.currency,
      'scopeSummary', engagement.scope_summary
    ) END,
    'plan', CASE WHEN plan_row.code IS NULL THEN NULL ELSE jsonb_build_object(
      'code', plan_row.code,
      'name', plan_row.name,
      'serviceCode', plan_row.service_code,
      'summary', plan_row.summary,
      'cadence', plan_row.cadence,
      'inclusions', plan_row.inclusions,
      'features', plan_row.features,
      'currency', plan_row.currency,
      'amountMinor', plan_row.amount_minor,
      'annualAmountMinor', plan_row.annual_amount_minor,
      'sessionsIncluded', plan_row.sessions_included
    ) END,
    'subscription', CASE WHEN subscription.id IS NULL THEN NULL ELSE private.advisors_subscription_json(subscription) END,
    'coachingSessionsCompleted', coalesce(completed_sessions, 0),
    'upcomingAppointments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id, 'status', a.status, 'startsAt', a.starts_at, 'endsAt', a.ends_at,
        'serviceCode', a.service_code, 'manageToken', a.manage_token,
        'advisorName', s.display_name
      ) ORDER BY a.starts_at)
      FROM (
        SELECT * FROM public.advisors_appointments
        WHERE lower(customer_email) = lower(client.email)
          AND status = 'confirmed'
          AND starts_at >= now()
        ORDER BY starts_at
        LIMIT 8
      ) a
      LEFT JOIN public.advisors_staff s ON s.id = a.advisor_id
    ), '[]'::jsonb),
    'openTasks', (
      SELECT count(*)::int
      FROM public.advisors_delivery_tasks t
      JOIN public.advisors_workspaces w ON w.id = t.workspace_id
      WHERE w.engagement_id = engagement.id
        AND t.status NOT IN ('done', 'skipped')
    ),
    'openDocuments', (
      SELECT count(*)::int
      FROM public.advisors_document_requests d
      JOIN public.advisors_workspaces w ON w.id = d.workspace_id
      WHERE w.engagement_id = engagement.id
        AND d.status = 'requested'
    ),
    'unreadNotifications', (
      SELECT count(*)::int FROM public.advisors_portal_notifications
      WHERE client_id = client.id AND read_at IS NULL
    ),
    'calendarOAuth', jsonb_build_object(
      'google', 'not_configured',
      'microsoft', 'not_configured',
      'note', 'Native Advisors booking is the source of truth. External calendar OAuth is optional and not enabled.'
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.advisors_portal_list_appointments()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  client public.advisors_clients;
BEGIN
  client := private.advisors_require_portal_client();
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', a.id,
      'status', a.status,
      'startsAt', a.starts_at,
      'endsAt', a.ends_at,
      'serviceCode', a.service_code,
      'planCode', a.plan_code,
      'manageToken', a.manage_token,
      'notes', a.notes,
      'advisorName', s.display_name,
      'customerTimezone', a.customer_timezone
    ) ORDER BY a.starts_at DESC)
    FROM public.advisors_appointments a
    LEFT JOIN public.advisors_staff s ON s.id = a.advisor_id
    WHERE lower(a.customer_email) = lower(client.email)
    LIMIT 100
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.advisors_portal_list_tasks()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  client public.advisors_clients;
BEGIN
  client := private.advisors_require_portal_client();
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', t.id,
      'workspaceId', t.workspace_id,
      'periodId', t.period_id,
      'code', t.code,
      'title', t.title,
      'description', t.description,
      'status', t.status,
      'dueAt', t.due_at,
      'customerNote', t.customer_note,
      'requiresDocument', t.requires_document,
      'workspaceTitle', w.title,
      'kind', w.kind
    ) ORDER BY
      CASE t.status WHEN 'blocked' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END,
      t.sort_order, t.created_at
    )
    FROM public.advisors_delivery_tasks t
    JOIN public.advisors_workspaces w ON w.id = t.workspace_id
    JOIN public.advisors_engagements e ON e.id = w.engagement_id
    WHERE e.client_id = client.id
      AND w.status <> 'closed'
    LIMIT 200
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.advisors_portal_list_documents()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  client public.advisors_clients;
BEGIN
  client := private.advisors_require_portal_client();
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', d.id,
      'workspaceId', d.workspace_id,
      'title', d.title,
      'instructions', d.instructions,
      'status', d.status,
      'dueAt', d.due_at,
      'companyId', client.company_id,
      'workspaceTitle', w.title
    ) ORDER BY
      CASE d.status WHEN 'requested' THEN 0 WHEN 'received' THEN 1 ELSE 2 END,
      d.due_at NULLS LAST, d.created_at DESC
    )
    FROM public.advisors_document_requests d
    JOIN public.advisors_workspaces w ON w.id = d.workspace_id
    JOIN public.advisors_engagements e ON e.id = w.engagement_id
    WHERE e.client_id = client.id
    LIMIT 200
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.advisors_portal_mark_document_received(
  _request_id uuid, _note text DEFAULT ''
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  client public.advisors_clients;
  req public.advisors_document_requests;
BEGIN
  client := private.advisors_require_portal_client();
  SELECT d.* INTO req
  FROM public.advisors_document_requests d
  JOIN public.advisors_workspaces w ON w.id = d.workspace_id
  JOIN public.advisors_engagements e ON e.id = w.engagement_id
  WHERE d.id = _request_id AND e.client_id = client.id
  FOR UPDATE OF d;
  IF req.id IS NULL THEN
    RAISE EXCEPTION 'Document request not found' USING ERRCODE = 'P0002';
  END IF;
  IF req.status = 'cancelled' THEN
    RAISE EXCEPTION 'This document request was cancelled' USING ERRCODE = '22023';
  END IF;
  UPDATE public.advisors_document_requests
  SET status = 'received',
      received_at = coalesce(received_at, now()),
      admin_note = CASE
        WHEN nullif(btrim(_note), '') IS NULL THEN admin_note
        ELSE left(btrim(admin_note || E'\n' || 'Customer: ' || btrim(_note)), 4000)
      END,
      updated_at = now()
  WHERE id = req.id
  RETURNING * INTO req;
  PERFORM private.advisors_portal_notify(
    client.id, 'document_received', 'Document marked as uploaded',
    req.title, '/advisors-portal/documents'
  );
  RETURN private.advisors_document_request_json(req);
END;
$$;

CREATE OR REPLACE FUNCTION public.advisors_portal_list_messages(_limit integer DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  client public.advisors_clients;
  lim integer := least(greatest(coalesce(_limit, 100), 1), 200);
BEGIN
  client := private.advisors_require_portal_client();
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', m.id,
      'authorRole', m.author_role,
      'body', m.body,
      'createdAt', m.created_at
    ) ORDER BY m.created_at)
    FROM (
      SELECT * FROM public.advisors_portal_messages
      WHERE client_id = client.id
      ORDER BY created_at DESC
      LIMIT lim
    ) m
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.advisors_portal_send_message(_body text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  client public.advisors_clients;
  message public.advisors_portal_messages;
BEGIN
  client := private.advisors_require_portal_client();
  IF char_length(btrim(coalesce(_body, ''))) < 1 THEN
    RAISE EXCEPTION 'Enter a message' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.advisors_portal_messages(client_id, author_role, author_user_id, body)
  VALUES (client.id, 'customer', auth.uid(), left(btrim(_body), 4000))
  RETURNING * INTO message;
  RETURN jsonb_build_object(
    'id', message.id,
    'authorRole', message.author_role,
    'body', message.body,
    'createdAt', message.created_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_advisors_reply_portal_message(
  _client_id uuid, _body text, _reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  client public.advisors_clients;
  message public.advisors_portal_messages;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason (at least 3 characters)' USING ERRCODE = '22023';
  END IF;
  IF char_length(btrim(coalesce(_body, ''))) < 1 THEN
    RAISE EXCEPTION 'Enter a message' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO client FROM public.advisors_clients WHERE id = _client_id;
  IF client.id IS NULL THEN
    RAISE EXCEPTION 'Client not found' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.advisors_portal_messages(
    client_id, author_role, author_user_id, author_advisor_id, body
  ) VALUES (
    client.id, 'advisor', auth.uid(), client.assigned_advisor_id, left(btrim(_body), 4000)
  )
  RETURNING * INTO message;
  PERFORM private.advisors_portal_notify(
    client.id, 'advisor_message', 'New message from your advisor',
    left(btrim(_body), 180), '/advisors-portal/messages'
  );
  PERFORM private.platform_log(
    'advisors.portal.message', 'advisors_portal_messages', message.id::text, NULL,
    jsonb_build_object('clientId', client.id), _reason
  );
  RETURN jsonb_build_object(
    'id', message.id,
    'authorRole', message.author_role,
    'body', message.body,
    'createdAt', message.created_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.advisors_portal_update_contact(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  client public.advisors_clients;
BEGIN
  client := private.advisors_require_portal_client();
  UPDATE public.advisors_clients
  SET
    name = coalesce(nullif(btrim(_payload->>'name'), ''), name),
    business_name = coalesce(nullif(btrim(_payload->>'businessName'), ''), business_name),
    phone = coalesce(nullif(btrim(_payload->>'phone'), ''), phone),
    updated_at = now()
  WHERE id = client.id
  RETURNING * INTO client;
  -- Email changes require staff action (unique login key).
  RETURN private.advisors_client_json(client);
END;
$$;

CREATE OR REPLACE FUNCTION public.advisors_portal_create_service_request(
  _kind text, _details text, _preferred_plan_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  client public.advisors_clients;
  req public.advisors_portal_service_requests;
BEGIN
  client := private.advisors_require_portal_client();
  IF _kind NOT IN ('plan_change', 'cancellation') THEN
    RAISE EXCEPTION 'Unsupported request kind' USING ERRCODE = '22023';
  END IF;
  IF char_length(btrim(coalesce(_details, ''))) < 3 THEN
    RAISE EXCEPTION 'Add a short explanation (at least 3 characters)' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.advisors_portal_service_requests(
    client_id, kind, details, preferred_plan_code
  ) VALUES (
    client.id, _kind, left(btrim(_details), 4000), nullif(btrim(_preferred_plan_code), '')
  )
  RETURNING * INTO req;
  PERFORM private.advisors_portal_notify(
    client.id, 'service_request', 'Request received',
    'Your ' || replace(_kind, '_', ' ') || ' request was sent to the Advisors team.',
    '/advisors-portal/account'
  );
  RETURN jsonb_build_object(
    'id', req.id,
    'kind', req.kind,
    'status', req.status,
    'details', req.details,
    'preferredPlanCode', req.preferred_plan_code,
    'createdAt', req.created_at,
    'updatedAt', req.updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.advisors_portal_list_notifications(_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  client public.advisors_clients;
  lim integer := least(greatest(coalesce(_limit, 50), 1), 100);
BEGIN
  client := private.advisors_require_portal_client();
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', n.id,
      'kind', n.kind,
      'title', n.title,
      'body', n.body,
      'href', n.href,
      'readAt', n.read_at,
      'createdAt', n.created_at
    ) ORDER BY n.created_at DESC)
    FROM (
      SELECT * FROM public.advisors_portal_notifications
      WHERE client_id = client.id
      ORDER BY created_at DESC
      LIMIT lim
    ) n
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.advisors_portal_mark_notifications_read(_ids uuid[] DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  client public.advisors_clients;
  updated integer;
BEGIN
  client := private.advisors_require_portal_client();
  UPDATE public.advisors_portal_notifications
  SET read_at = now()
  WHERE client_id = client.id
    AND read_at IS NULL
    AND (_ids IS NULL OR id = ANY (_ids));
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
  -- Callable by authenticated platform operators or service_role workers.
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    PERFORM private.require_platform('billing.manage');
  END IF;

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

-- Mark claimed rows after selecting them (separate update for clarity with FOR UPDATE).
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
      attempts = CASE WHEN _status IN ('claimed', 'failed', 'sent') THEN attempts + 1 ELSE attempts END,
      last_error = CASE WHEN _status = 'failed' THEN left(coalesce(_error, ''), 1000) ELSE last_error END,
      sent_at = CASE WHEN _status = 'sent' THEN now() ELSE sent_at END,
      claimed_at = CASE WHEN _status = 'claimed' THEN now() ELSE claimed_at END
  WHERE id = _reminder_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_advisors_list_portal_requests(
  _status text DEFAULT NULL, _limit integer DEFAULT 100
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lim integer := least(greatest(coalesce(_limit, 100), 1), 200);
BEGIN
  PERFORM private.require_platform('billing.view');
  IF _status IS NOT NULL AND _status NOT IN ('open', 'in_review', 'accepted', 'declined', 'cancelled') THEN
    RAISE EXCEPTION 'Unsupported portal request status' USING ERRCODE = '22023';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', r.id,
      'clientId', r.client_id,
      'clientName', c.name,
      'clientEmail', c.email,
      'kind', r.kind,
      'status', r.status,
      'details', r.details,
      'preferredPlanCode', r.preferred_plan_code,
      'adminNote', r.admin_note,
      'createdAt', r.created_at,
      'updatedAt', r.updated_at
    ) ORDER BY r.created_at DESC)
    FROM (
      SELECT * FROM public.advisors_portal_service_requests
      WHERE (_status IS NULL OR status = _status)
      ORDER BY created_at DESC
      LIMIT lim
    ) r
    JOIN public.advisors_clients c ON c.id = r.client_id
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_advisors_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM private.require_platform('billing.view');
  RETURN jsonb_build_object(
    'newInquiries', (SELECT count(*)::int FROM public.advisors_leads WHERE status = 'new'),
    'openConversations', (SELECT count(*)::int FROM public.advisors_conversations WHERE status = 'open'),
    'handedOffConversations', (SELECT count(*)::int FROM public.advisors_conversations WHERE status = 'handed_off'),
    'pendingConsultations', (
      SELECT count(*)::int FROM public.advisors_appointments
      WHERE status = 'confirmed' AND starts_at >= now()
    ),
    'upcomingAppointments', (
      SELECT count(*)::int FROM public.advisors_appointments
      WHERE status = 'confirmed' AND starts_at >= now() AND starts_at < now() + interval '7 days'
    ),
    'activeClients', (SELECT count(*)::int FROM public.advisors_clients WHERE status = 'active'),
    'prospectClients', (SELECT count(*)::int FROM public.advisors_clients WHERE status = 'prospect'),
    'activeAdvisors', (SELECT count(*)::int FROM public.advisors_staff WHERE is_active),
    'openProposals', (SELECT count(*)::int FROM public.advisors_proposals WHERE status = 'sent'),
    'onboardingEngagements', (SELECT count(*)::int FROM public.advisors_engagements WHERE status = 'onboarding'),
    'pendingBilling', (
      SELECT count(*)::int FROM public.advisors_subscriptions
      WHERE status IN ('pending_checkout', 'checkout_open')
    ),
    'activeBilling', (
      SELECT count(*)::int FROM public.advisors_subscriptions
      WHERE status IN ('active', 'trialing', 'manual_active')
    ),
    'activeWorkspaces', (SELECT count(*)::int FROM public.advisors_workspaces WHERE status = 'active'),
    'openDeliveryTasks', (
      SELECT count(*)::int FROM public.advisors_delivery_tasks
      WHERE status NOT IN ('done', 'skipped')
    ),
    'openDocumentRequests', (
      SELECT count(*)::int FROM public.advisors_document_requests WHERE status = 'requested'
    ),
    'linkedPortalClients', (
      SELECT count(*)::int FROM public.advisors_clients WHERE linked_user_id IS NOT NULL
    ),
    'openPortalRequests', (
      SELECT count(*)::int FROM public.advisors_portal_service_requests WHERE status IN ('open', 'in_review')
    ),
    'pendingReminders', (
      SELECT count(*)::int FROM public.advisors_appointment_reminders WHERE status = 'pending'
    ),
    'recentInquiries', COALESCE((
      SELECT jsonb_agg(private.advisors_lead_json(l) ORDER BY l.created_at DESC)
      FROM (SELECT * FROM public.advisors_leads ORDER BY created_at DESC LIMIT 8) l
    ), '[]'::jsonb),
    'upcoming', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id, 'status', a.status, 'startsAt', a.starts_at, 'endsAt', a.ends_at,
        'customerName', a.customer_name, 'customerEmail', a.customer_email,
        'businessName', a.business_name, 'serviceCode', a.service_code
      ) ORDER BY a.starts_at)
      FROM (
        SELECT * FROM public.advisors_appointments
        WHERE status = 'confirmed' AND starts_at >= now()
        ORDER BY starts_at LIMIT 8
      ) a
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.platform_advisors_create_portal_invite(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_advisors_unlink_portal_user(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_advisors_reply_portal_message(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_advisors_list_portal_requests(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advisors_portal_accept_invite(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advisors_portal_home() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advisors_portal_list_appointments() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advisors_portal_list_tasks() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advisors_portal_list_documents() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advisors_portal_mark_document_received(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advisors_portal_list_messages(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advisors_portal_send_message(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advisors_portal_update_contact(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advisors_portal_create_service_request(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advisors_portal_list_notifications(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advisors_portal_mark_notifications_read(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advisors_claim_due_reminders(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advisors_mark_reminder_status(uuid, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.platform_advisors_create_portal_invite(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_advisors_unlink_portal_user(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_advisors_reply_portal_message(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_advisors_list_portal_requests(text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.advisors_portal_accept_invite(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.advisors_portal_home() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.advisors_portal_list_appointments() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.advisors_portal_list_tasks() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.advisors_portal_list_documents() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.advisors_portal_mark_document_received(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.advisors_portal_list_messages(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.advisors_portal_send_message(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.advisors_portal_update_contact(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.advisors_portal_create_service_request(text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.advisors_portal_list_notifications(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.advisors_portal_mark_notifications_read(uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.advisors_claim_due_reminders(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.advisors_mark_reminder_status(uuid, text, text) TO authenticated, service_role;
