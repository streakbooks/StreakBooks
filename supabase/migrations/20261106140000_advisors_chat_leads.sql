-- AD-03: Advisors public chat conversations and lead capture.
-- Visitor chats are isolated from tenant accounting data. Rate limits apply.

CREATE TABLE IF NOT EXISTS public.advisors_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_token text NOT NULL UNIQUE,
  service_code text NOT NULL CHECK (service_code IN ('bookkeeping', 'coaching')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'handed_off')),
  consent_at timestamptz,
  visitor_email text,
  visitor_name text,
  recommended_plan_code text,
  qualification jsonb NOT NULL DEFAULT '{}'::jsonb,
  message_count integer NOT NULL DEFAULT 0 CHECK (message_count >= 0),
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.advisors_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.advisors_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('assistant', 'visitor', 'system')),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.advisors_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.advisors_conversations(id) ON DELETE SET NULL,
  service_code text NOT NULL CHECK (service_code IN ('bookkeeping', 'coaching')),
  plan_code text,
  name text,
  email text,
  business_name text,
  phone text,
  notes text,
  source text NOT NULL DEFAULT 'chat' CHECK (source IN ('chat', 'plans', 'handoff')),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.advisors_chat_rate_limits (
  bucket_key text PRIMARY KEY,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0)
);

CREATE INDEX IF NOT EXISTS advisors_messages_conversation_idx
  ON public.advisors_messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS advisors_leads_created_idx
  ON public.advisors_leads (created_at DESC);
CREATE INDEX IF NOT EXISTS advisors_conversations_service_idx
  ON public.advisors_conversations (service_code, created_at DESC);

ALTER TABLE public.advisors_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advisors_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advisors_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advisors_chat_rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.advisors_conversations, public.advisors_messages, public.advisors_leads, public.advisors_chat_rate_limits FROM PUBLIC;
DO $$ BEGIN
  REVOKE ALL ON public.advisors_conversations, public.advisors_messages, public.advisors_leads, public.advisors_chat_rate_limits FROM anon, authenticated;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION private.advisors_chat_rate_ok(_bucket text, _limit integer DEFAULT 30)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row public.advisors_chat_rate_limits;
BEGIN
  INSERT INTO public.advisors_chat_rate_limits(bucket_key, window_started_at, request_count)
  VALUES (_bucket, now(), 1)
  ON CONFLICT (bucket_key) DO UPDATE
    SET request_count = CASE
          WHEN public.advisors_chat_rate_limits.window_started_at < now() - interval '1 hour'
            THEN 1
          ELSE public.advisors_chat_rate_limits.request_count + 1
        END,
        window_started_at = CASE
          WHEN public.advisors_chat_rate_limits.window_started_at < now() - interval '1 hour'
            THEN now()
          ELSE public.advisors_chat_rate_limits.window_started_at
        END
  RETURNING * INTO row;

  IF row.request_count > _limit THEN
    RAISE EXCEPTION 'Advisors chat rate limit reached. Try again later.' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.advisors_start_conversation(
  _service_code text,
  _consent boolean,
  _bucket text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  token text;
  conv public.advisors_conversations;
BEGIN
  IF _service_code NOT IN ('bookkeeping', 'coaching') THEN
    RAISE EXCEPTION 'Choose a valid Advisors service' USING ERRCODE = '22023';
  END IF;
  IF coalesce(_consent, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Consent is required to start an Advisors chat' USING ERRCODE = '22023';
  END IF;
  PERFORM private.advisors_chat_rate_ok(coalesce(nullif(_bucket, ''), 'anonymous'), 20);

  token := encode(gen_random_bytes(24), 'hex');
  INSERT INTO public.advisors_conversations(public_token, service_code, consent_at)
  VALUES (token, _service_code, now())
  RETURNING * INTO conv;

  RETURN jsonb_build_object(
    'id', conv.id,
    'token', conv.public_token,
    'serviceCode', conv.service_code,
    'status', conv.status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.advisors_append_message(
  _token text,
  _role text,
  _content text,
  _bucket text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conv public.advisors_conversations;
  msg public.advisors_messages;
BEGIN
  PERFORM private.advisors_chat_rate_ok(coalesce(nullif(_bucket, ''), 'anonymous'), 60);
  IF _role NOT IN ('assistant', 'visitor', 'system') THEN
    RAISE EXCEPTION 'Invalid chat role' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO conv FROM public.advisors_conversations WHERE public_token = _token;
  IF conv.id IS NULL THEN
    RAISE EXCEPTION 'Conversation not found' USING ERRCODE = 'P0002';
  END IF;
  IF conv.consent_at IS NULL THEN
    RAISE EXCEPTION 'Consent is required before storing chat messages' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.advisors_messages(conversation_id, role, content)
  VALUES (conv.id, _role, left(btrim(_content), 4000))
  RETURNING * INTO msg;

  UPDATE public.advisors_conversations
     SET message_count = message_count + 1,
         last_message_at = now(),
         updated_at = now()
   WHERE id = conv.id;

  RETURN jsonb_build_object(
    'id', msg.id,
    'role', msg.role,
    'content', msg.content,
    'createdAt', msg.created_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.advisors_capture_lead(
  _token text,
  _payload jsonb,
  _bucket text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conv public.advisors_conversations;
  lead public.advisors_leads;
BEGIN
  PERFORM private.advisors_chat_rate_ok(coalesce(nullif(_bucket, ''), 'anonymous'), 20);
  SELECT * INTO conv FROM public.advisors_conversations WHERE public_token = _token;
  IF conv.id IS NULL THEN
    RAISE EXCEPTION 'Conversation not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.advisors_leads(
    conversation_id, service_code, plan_code, name, email, business_name, phone, notes, source
  ) VALUES (
    conv.id,
    conv.service_code,
    nullif(_payload->>'planCode', ''),
    nullif(btrim(_payload->>'name'), ''),
    nullif(lower(btrim(_payload->>'email')), ''),
    nullif(btrim(_payload->>'businessName'), ''),
    nullif(btrim(_payload->>'phone'), ''),
    nullif(btrim(_payload->>'notes'), ''),
    coalesce(nullif(_payload->>'source', ''), 'chat')
  )
  RETURNING * INTO lead;

  UPDATE public.advisors_conversations
     SET visitor_email = coalesce(lead.email, visitor_email),
         visitor_name = coalesce(lead.name, visitor_name),
         recommended_plan_code = coalesce(lead.plan_code, recommended_plan_code),
         status = CASE WHEN coalesce(_payload->>'source', '') = 'handoff' THEN 'handed_off' ELSE status END,
         updated_at = now()
   WHERE id = conv.id;

  RETURN jsonb_build_object('id', lead.id, 'status', lead.status);
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_advisors_list_conversations()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM private.require_platform('billing.view');
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', c.id,
      'serviceCode', c.service_code,
      'status', c.status,
      'recommendedPlanCode', c.recommended_plan_code,
      'messageCount', c.message_count,
      'visitorEmail', c.visitor_email,
      'createdAt', c.created_at,
      'lastMessageAt', c.last_message_at
    ) ORDER BY c.created_at DESC)
    FROM (
      SELECT * FROM public.advisors_conversations ORDER BY created_at DESC LIMIT 100
    ) c
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.advisors_start_conversation(text, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advisors_append_message(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advisors_capture_lead(text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_advisors_list_conversations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.advisors_start_conversation(text, boolean, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.advisors_append_message(text, text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.advisors_capture_lead(text, jsonb, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_advisors_list_conversations() TO authenticated, service_role;
