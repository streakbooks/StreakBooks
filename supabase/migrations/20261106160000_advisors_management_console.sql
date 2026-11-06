-- AD-05: Advisors inquiry, client and staff management console.
-- Extends leads/conversations; introduces clients CRM; admin SECURITY DEFINER RPCs.

ALTER TABLE public.advisors_leads
  ADD COLUMN IF NOT EXISTS assigned_advisor_id uuid REFERENCES public.advisors_staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS admin_notes text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.advisors_conversations
  ADD COLUMN IF NOT EXISTS assigned_advisor_id uuid REFERENCES public.advisors_staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS admin_notes text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS public.advisors_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text NOT NULL DEFAULT '',
  business_name text NOT NULL DEFAULT '',
  phone text,
  status text NOT NULL DEFAULT 'prospect'
    CHECK (status IN ('prospect', 'active', 'paused', 'churned')),
  primary_service_code text
    CHECK (primary_service_code IS NULL OR primary_service_code IN ('bookkeeping', 'coaching')),
  assigned_advisor_id uuid REFERENCES public.advisors_staff(id) ON DELETE SET NULL,
  source_lead_id uuid REFERENCES public.advisors_leads(id) ON DELETE SET NULL,
  source_appointment_id uuid REFERENCES public.advisors_appointments(id) ON DELETE SET NULL,
  linked_user_id uuid,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT advisors_clients_email_nonempty CHECK (char_length(btrim(email)) > 2)
);

CREATE UNIQUE INDEX IF NOT EXISTS advisors_clients_email_uidx
  ON public.advisors_clients (lower(email));
CREATE INDEX IF NOT EXISTS advisors_clients_status_idx
  ON public.advisors_clients (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS advisors_clients_advisor_idx
  ON public.advisors_clients (assigned_advisor_id, status);
CREATE INDEX IF NOT EXISTS advisors_leads_status_idx
  ON public.advisors_leads (status, created_at DESC);
CREATE INDEX IF NOT EXISTS advisors_leads_assigned_idx
  ON public.advisors_leads (assigned_advisor_id, status);
CREATE INDEX IF NOT EXISTS advisors_conversations_assigned_idx
  ON public.advisors_conversations (assigned_advisor_id, status);

ALTER TABLE public.advisors_clients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.advisors_clients FROM PUBLIC;
DO $$ BEGIN
  REVOKE ALL ON public.advisors_clients FROM anon, authenticated;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION private.advisors_staff_json(s public.advisors_staff)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'id', s.id,
    'displayName', s.display_name,
    'email', s.email,
    'timezone', s.timezone,
    'isActive', s.is_active,
    'createdAt', s.created_at,
    'updatedAt', s.updated_at
  );
$$;

CREATE OR REPLACE FUNCTION private.advisors_lead_json(l public.advisors_leads)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'id', l.id,
    'conversationId', l.conversation_id,
    'serviceCode', l.service_code,
    'planCode', l.plan_code,
    'name', l.name,
    'email', l.email,
    'businessName', l.business_name,
    'phone', l.phone,
    'notes', l.notes,
    'adminNotes', l.admin_notes,
    'source', l.source,
    'status', l.status,
    'assignedAdvisorId', l.assigned_advisor_id,
    'createdAt', l.created_at,
    'updatedAt', l.updated_at
  );
$$;

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
    'notes', c.notes,
    'createdAt', c.created_at,
    'updatedAt', c.updated_at
  );
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
      WHERE status = 'confirmed'
        AND starts_at >= now()
        AND starts_at < now() + interval '7 days'
    ),
    'activeClients', (SELECT count(*)::int FROM public.advisors_clients WHERE status = 'active'),
    'prospectClients', (SELECT count(*)::int FROM public.advisors_clients WHERE status = 'prospect'),
    'activeAdvisors', (SELECT count(*)::int FROM public.advisors_staff WHERE is_active),
    'recentInquiries', COALESCE((
      SELECT jsonb_agg(private.advisors_lead_json(l) ORDER BY l.created_at DESC)
      FROM (
        SELECT * FROM public.advisors_leads ORDER BY created_at DESC LIMIT 8
      ) l
    ), '[]'::jsonb),
    'upcoming', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id,
        'status', a.status,
        'startsAt', a.starts_at,
        'endsAt', a.ends_at,
        'customerName', a.customer_name,
        'customerEmail', a.customer_email,
        'businessName', a.business_name,
        'serviceCode', a.service_code
      ) ORDER BY a.starts_at)
      FROM (
        SELECT * FROM public.advisors_appointments
        WHERE status = 'confirmed' AND starts_at >= now()
        ORDER BY starts_at
        LIMIT 8
      ) a
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_advisors_list_inquiries(
  _status text DEFAULT NULL,
  _search text DEFAULT NULL,
  _limit integer DEFAULT 100
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  needle text := lower(btrim(coalesce(_search, '')));
  lim integer := least(greatest(coalesce(_limit, 100), 1), 200);
BEGIN
  PERFORM private.require_platform('billing.view');
  IF _status IS NOT NULL AND _status NOT IN ('new', 'contacted', 'qualified', 'closed') THEN
    RAISE EXCEPTION 'Unsupported inquiry status filter' USING ERRCODE = '22023';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(private.advisors_lead_json(l) ORDER BY l.created_at DESC)
    FROM (
      SELECT *
      FROM public.advisors_leads l
      WHERE (_status IS NULL OR l.status = _status)
        AND (
          needle = ''
          OR lower(coalesce(l.email, '')) LIKE '%' || needle || '%'
          OR lower(coalesce(l.name, '')) LIKE '%' || needle || '%'
          OR lower(coalesce(l.business_name, '')) LIKE '%' || needle || '%'
        )
      ORDER BY l.created_at DESC
      LIMIT lim
    ) l
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_advisors_update_inquiry(
  _inquiry_id uuid,
  _payload jsonb,
  _reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lead public.advisors_leads;
  next_status text;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason (at least 3 characters)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO lead FROM public.advisors_leads WHERE id = _inquiry_id FOR UPDATE;
  IF lead.id IS NULL THEN
    RAISE EXCEPTION 'Inquiry not found' USING ERRCODE = 'P0002';
  END IF;

  next_status := coalesce(nullif(_payload->>'status', ''), lead.status);
  IF next_status NOT IN ('new', 'contacted', 'qualified', 'closed') THEN
    RAISE EXCEPTION 'Unsupported inquiry status' USING ERRCODE = '22023';
  END IF;

  UPDATE public.advisors_leads
     SET status = next_status,
         assigned_advisor_id = CASE
           WHEN _payload ? 'assignedAdvisorId' AND nullif(_payload->>'assignedAdvisorId', '') IS NULL THEN NULL
           WHEN nullif(_payload->>'assignedAdvisorId', '') IS NOT NULL THEN (_payload->>'assignedAdvisorId')::uuid
           ELSE assigned_advisor_id
         END,
         admin_notes = coalesce(nullif(_payload->>'adminNotes', ''), admin_notes),
         updated_at = now()
   WHERE id = lead.id
   RETURNING * INTO lead;

  PERFORM private.platform_log(
    'advisors.inquiry.update',
    'advisors_leads',
    lead.id::text,
    NULL,
    _payload,
    _reason
  );
  RETURN private.advisors_lead_json(lead);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_advisors_list_conversations(
  _status text DEFAULT NULL,
  _search text DEFAULT NULL,
  _limit integer DEFAULT 100
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  needle text := lower(btrim(coalesce(_search, '')));
  lim integer := least(greatest(coalesce(_limit, 100), 1), 200);
BEGIN
  PERFORM private.require_platform('billing.view');
  IF _status IS NOT NULL AND _status NOT IN ('open', 'closed', 'handed_off') THEN
    RAISE EXCEPTION 'Unsupported conversation status filter' USING ERRCODE = '22023';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', c.id,
      'serviceCode', c.service_code,
      'status', c.status,
      'recommendedPlanCode', c.recommended_plan_code,
      'messageCount', c.message_count,
      'visitorName', c.visitor_name,
      'visitorEmail', c.visitor_email,
      'assignedAdvisorId', c.assigned_advisor_id,
      'adminNotes', c.admin_notes,
      'createdAt', c.created_at,
      'lastMessageAt', c.last_message_at,
      'updatedAt', c.updated_at
    ) ORDER BY coalesce(c.last_message_at, c.created_at) DESC)
    FROM (
      SELECT *
      FROM public.advisors_conversations c
      WHERE (_status IS NULL OR c.status = _status)
        AND (
          needle = ''
          OR lower(coalesce(c.visitor_email, '')) LIKE '%' || needle || '%'
          OR lower(coalesce(c.visitor_name, '')) LIKE '%' || needle || '%'
        )
      ORDER BY coalesce(c.last_message_at, c.created_at) DESC
      LIMIT lim
    ) c
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_advisors_get_conversation(_conversation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conv public.advisors_conversations;
BEGIN
  PERFORM private.require_platform('billing.view');
  SELECT * INTO conv FROM public.advisors_conversations WHERE id = _conversation_id;
  IF conv.id IS NULL THEN
    RAISE EXCEPTION 'Conversation not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN jsonb_build_object(
    'id', conv.id,
    'serviceCode', conv.service_code,
    'status', conv.status,
    'recommendedPlanCode', conv.recommended_plan_code,
    'messageCount', conv.message_count,
    'visitorName', conv.visitor_name,
    'visitorEmail', conv.visitor_email,
    'qualification', conv.qualification,
    'assignedAdvisorId', conv.assigned_advisor_id,
    'adminNotes', conv.admin_notes,
    'createdAt', conv.created_at,
    'lastMessageAt', conv.last_message_at,
    'updatedAt', conv.updated_at,
    'messages', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', m.id,
        'role', m.role,
        'content', m.content,
        'createdAt', m.created_at
      ) ORDER BY m.created_at)
      FROM public.advisors_messages m
      WHERE m.conversation_id = conv.id
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_advisors_update_conversation(
  _conversation_id uuid,
  _payload jsonb,
  _reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conv public.advisors_conversations;
  next_status text;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason (at least 3 characters)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO conv FROM public.advisors_conversations WHERE id = _conversation_id FOR UPDATE;
  IF conv.id IS NULL THEN
    RAISE EXCEPTION 'Conversation not found' USING ERRCODE = 'P0002';
  END IF;
  next_status := coalesce(nullif(_payload->>'status', ''), conv.status);
  IF next_status NOT IN ('open', 'closed', 'handed_off') THEN
    RAISE EXCEPTION 'Unsupported conversation status' USING ERRCODE = '22023';
  END IF;

  UPDATE public.advisors_conversations
     SET status = next_status,
         assigned_advisor_id = CASE
           WHEN _payload ? 'assignedAdvisorId' AND nullif(_payload->>'assignedAdvisorId', '') IS NULL THEN NULL
           WHEN nullif(_payload->>'assignedAdvisorId', '') IS NOT NULL THEN (_payload->>'assignedAdvisorId')::uuid
           ELSE assigned_advisor_id
         END,
         admin_notes = coalesce(nullif(_payload->>'adminNotes', ''), admin_notes),
         updated_at = now()
   WHERE id = conv.id
   RETURNING * INTO conv;

  PERFORM private.platform_log(
    'advisors.conversation.update',
    'advisors_conversations',
    conv.id::text,
    NULL,
    _payload,
    _reason
  );
  RETURN public.platform_advisors_get_conversation(conv.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_advisors_list_clients(
  _status text DEFAULT NULL,
  _search text DEFAULT NULL,
  _limit integer DEFAULT 100
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  needle text := lower(btrim(coalesce(_search, '')));
  lim integer := least(greatest(coalesce(_limit, 100), 1), 200);
BEGIN
  PERFORM private.require_platform('billing.view');
  IF _status IS NOT NULL AND _status NOT IN ('prospect', 'active', 'paused', 'churned') THEN
    RAISE EXCEPTION 'Unsupported client status filter' USING ERRCODE = '22023';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(private.advisors_client_json(c) ORDER BY c.updated_at DESC)
    FROM (
      SELECT *
      FROM public.advisors_clients c
      WHERE (_status IS NULL OR c.status = _status)
        AND (
          needle = ''
          OR lower(c.email) LIKE '%' || needle || '%'
          OR lower(c.name) LIKE '%' || needle || '%'
          OR lower(c.business_name) LIKE '%' || needle || '%'
        )
      ORDER BY c.updated_at DESC
      LIMIT lim
    ) c
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_advisors_upsert_client(
  _payload jsonb,
  _reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  client public.advisors_clients;
  email_norm text;
  next_status text;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason (at least 3 characters)' USING ERRCODE = '22023';
  END IF;
  email_norm := lower(btrim(coalesce(_payload->>'email', '')));
  IF char_length(email_norm) < 3 OR position('@' in email_norm) = 0 THEN
    RAISE EXCEPTION 'A valid client email is required' USING ERRCODE = '22023';
  END IF;
  next_status := coalesce(nullif(_payload->>'status', ''), 'prospect');
  IF next_status NOT IN ('prospect', 'active', 'paused', 'churned') THEN
    RAISE EXCEPTION 'Unsupported client status' USING ERRCODE = '22023';
  END IF;

  IF nullif(_payload->>'id', '') IS NOT NULL THEN
    UPDATE public.advisors_clients
       SET email = email_norm,
           name = coalesce(nullif(btrim(_payload->>'name'), ''), name),
           business_name = coalesce(nullif(btrim(_payload->>'businessName'), ''), business_name),
           phone = coalesce(nullif(btrim(_payload->>'phone'), ''), phone),
           status = next_status,
           primary_service_code = CASE
             WHEN _payload ? 'primaryServiceCode' AND nullif(_payload->>'primaryServiceCode', '') IS NULL THEN NULL
             WHEN nullif(_payload->>'primaryServiceCode', '') IS NOT NULL THEN _payload->>'primaryServiceCode'
             ELSE primary_service_code
           END,
           assigned_advisor_id = CASE
             WHEN _payload ? 'assignedAdvisorId' AND nullif(_payload->>'assignedAdvisorId', '') IS NULL THEN NULL
             WHEN nullif(_payload->>'assignedAdvisorId', '') IS NOT NULL THEN (_payload->>'assignedAdvisorId')::uuid
             ELSE assigned_advisor_id
           END,
           notes = coalesce(nullif(_payload->>'notes', ''), notes),
           updated_at = now()
     WHERE id = (_payload->>'id')::uuid
     RETURNING * INTO client;
    IF client.id IS NULL THEN
      RAISE EXCEPTION 'Client not found' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    INSERT INTO public.advisors_clients(
      email, name, business_name, phone, status, primary_service_code, assigned_advisor_id, notes,
      source_lead_id, source_appointment_id
    ) VALUES (
      email_norm,
      coalesce(nullif(btrim(_payload->>'name'), ''), ''),
      coalesce(nullif(btrim(_payload->>'businessName'), ''), ''),
      nullif(btrim(_payload->>'phone'), ''),
      next_status,
      nullif(_payload->>'primaryServiceCode', ''),
      nullif(_payload->>'assignedAdvisorId', '')::uuid,
      coalesce(_payload->>'notes', ''),
      nullif(_payload->>'sourceLeadId', '')::uuid,
      nullif(_payload->>'sourceAppointmentId', '')::uuid
    )
    ON CONFLICT ((lower(email))) DO UPDATE
      SET name = coalesce(nullif(btrim(EXCLUDED.name), ''), public.advisors_clients.name),
          business_name = coalesce(nullif(btrim(EXCLUDED.business_name), ''), public.advisors_clients.business_name),
          phone = coalesce(EXCLUDED.phone, public.advisors_clients.phone),
          status = EXCLUDED.status,
          primary_service_code = coalesce(EXCLUDED.primary_service_code, public.advisors_clients.primary_service_code),
          assigned_advisor_id = coalesce(EXCLUDED.assigned_advisor_id, public.advisors_clients.assigned_advisor_id),
          notes = CASE
            WHEN nullif(EXCLUDED.notes, '') IS NULL THEN public.advisors_clients.notes
            ELSE EXCLUDED.notes
          END,
          source_lead_id = coalesce(EXCLUDED.source_lead_id, public.advisors_clients.source_lead_id),
          updated_at = now()
    RETURNING * INTO client;
  END IF;

  PERFORM private.platform_log(
    'advisors.client.upsert',
    'advisors_clients',
    client.id::text,
    NULL,
    _payload,
    _reason
  );
  RETURN private.advisors_client_json(client);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_advisors_promote_inquiry(
  _inquiry_id uuid,
  _reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lead public.advisors_leads;
  client jsonb;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason (at least 3 characters)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO lead FROM public.advisors_leads WHERE id = _inquiry_id;
  IF lead.id IS NULL THEN
    RAISE EXCEPTION 'Inquiry not found' USING ERRCODE = 'P0002';
  END IF;
  IF nullif(lead.email, '') IS NULL THEN
    RAISE EXCEPTION 'Inquiry email is required to create a client' USING ERRCODE = '22023';
  END IF;

  client := public.platform_advisors_upsert_client(
    jsonb_build_object(
      'email', lead.email,
      'name', coalesce(lead.name, ''),
      'businessName', coalesce(lead.business_name, ''),
      'phone', lead.phone,
      'status', 'prospect',
      'primaryServiceCode', lead.service_code,
      'assignedAdvisorId', lead.assigned_advisor_id,
      'sourceLeadId', lead.id,
      'notes', coalesce(lead.notes, '')
    ),
    _reason
  );

  UPDATE public.advisors_leads
     SET status = CASE WHEN status IN ('new', 'contacted') THEN 'qualified' ELSE status END,
         updated_at = now()
   WHERE id = lead.id;

  RETURN client;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_advisors_list_staff()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM private.require_platform('billing.view');
  RETURN COALESCE((
    SELECT jsonb_agg(private.advisors_staff_json(s) ORDER BY s.is_active DESC, s.display_name)
    FROM public.advisors_staff s
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_advisors_upsert_staff(
  _payload jsonb,
  _reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  staff public.advisors_staff;
  display text;
BEGIN
  PERFORM private.require_platform('billing.manage');
  IF length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason (at least 3 characters)' USING ERRCODE = '22023';
  END IF;
  display := btrim(coalesce(_payload->>'displayName', ''));
  IF char_length(display) < 2 THEN
    RAISE EXCEPTION 'Advisor display name is required' USING ERRCODE = '22023';
  END IF;

  IF nullif(_payload->>'id', '') IS NOT NULL THEN
    UPDATE public.advisors_staff
       SET display_name = display,
           email = nullif(lower(btrim(coalesce(_payload->>'email', ''))), ''),
           timezone = coalesce(nullif(btrim(_payload->>'timezone'), ''), timezone),
           is_active = coalesce((_payload->>'isActive')::boolean, is_active),
           updated_at = now()
     WHERE id = (_payload->>'id')::uuid
     RETURNING * INTO staff;
    IF staff.id IS NULL THEN
      RAISE EXCEPTION 'Advisor not found' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    INSERT INTO public.advisors_staff(display_name, email, timezone, is_active)
    VALUES (
      display,
      nullif(lower(btrim(coalesce(_payload->>'email', ''))), ''),
      coalesce(nullif(btrim(_payload->>'timezone'), ''), 'UTC'),
      coalesce((_payload->>'isActive')::boolean, true)
    )
    RETURNING * INTO staff;

    INSERT INTO public.advisors_booking_settings(advisor_id)
    VALUES (staff.id)
    ON CONFLICT (advisor_id) DO NOTHING;

    INSERT INTO public.advisors_working_hours(advisor_id, weekday, start_minute, end_minute)
    SELECT staff.id, weekday, 9 * 60, 17 * 60
    FROM generate_series(1, 5) AS weekday
    ON CONFLICT (advisor_id, weekday) DO NOTHING;
  END IF;

  PERFORM private.platform_log(
    'advisors.staff.upsert',
    'advisors_staff',
    staff.id::text,
    NULL,
    _payload,
    _reason
  );
  RETURN private.advisors_staff_json(staff);
END;
$$;

REVOKE ALL ON FUNCTION public.platform_advisors_overview() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_advisors_list_inquiries(text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_advisors_update_inquiry(uuid, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_advisors_list_conversations(text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_advisors_get_conversation(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_advisors_update_conversation(uuid, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_advisors_list_clients(text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_advisors_upsert_client(jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_advisors_promote_inquiry(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_advisors_list_staff() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_advisors_upsert_staff(jsonb, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.platform_advisors_overview() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_advisors_list_inquiries(text, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_advisors_update_inquiry(uuid, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_advisors_list_conversations(text, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_advisors_get_conversation(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_advisors_update_conversation(uuid, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_advisors_list_clients(text, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_advisors_upsert_client(jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_advisors_promote_inquiry(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_advisors_list_staff() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_advisors_upsert_staff(jsonb, text) TO authenticated, service_role;

-- Drop the zero-arg AD-03 list helper if present; replaced by the filtered overload.
DO $$ BEGIN
  DROP FUNCTION IF EXISTS public.platform_advisors_list_conversations();
EXCEPTION WHEN undefined_function THEN NULL; END $$;
