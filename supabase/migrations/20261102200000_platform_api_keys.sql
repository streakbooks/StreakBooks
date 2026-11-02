-- READY-TO-APPLY. Not applied. Hash-only platform API keys. The raw key is returned once and is not stored.
-- Reverse:
--   DROP FUNCTION IF EXISTS public.platform_rotate_api_key(uuid, text, text);
--   DROP TABLE IF EXISTS public.platform_api_keys;

CREATE TABLE public.platform_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  key_hash text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz
);

ALTER TABLE public.platform_api_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_api_keys FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.platform_rotate_api_key(_key_id uuid, _label text, _reason text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _raw text; _hash text; _new uuid;
BEGIN
  PERFORM private.require_platform('api.manage');
  IF length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason (at least 3 characters)';
  END IF;
  IF length(trim(coalesce(_label, ''))) < 1 THEN
    RAISE EXCEPTION 'Name the replacement key';
  END IF;
  IF _key_id IS NOT NULL THEN
    UPDATE public.platform_api_keys SET retired_at = now()
    WHERE id = _key_id AND retired_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'That platform API key is not active'; END IF;
  END IF;
  _raw := encode(extensions.gen_random_bytes(32), 'hex');
  _hash := encode(extensions.digest(convert_to(_raw, 'UTF8'), 'sha256'), 'hex');
  INSERT INTO public.platform_api_keys (label, key_hash, created_by)
  VALUES (trim(_label), _hash, auth.uid())
  RETURNING id INTO _new;
  PERFORM private.platform_log(
    'api_key.rotate', 'platform_api_key', _new::text,
    CASE WHEN _key_id IS NULL THEN NULL ELSE jsonb_build_object('retired', _key_id) END,
    jsonb_build_object('key', _new), trim(_reason)
  );
  RETURN _raw;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_rotate_api_key(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_rotate_api_key(uuid, text, text) TO authenticated;
