-- READY-TO-APPLY. Not applied. A service case is not a support grant and has no ledger attachment.
-- Reverse:
--   DROP FUNCTION IF EXISTS public.platform_open_service_case(uuid, text, text);
--   DROP TABLE IF EXISTS public.platform_service_cases;

CREATE TABLE public.platform_service_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  subject text NOT NULL CHECK (length(trim(subject)) >= 3),
  status text NOT NULL CHECK (status IN ('open', 'closed')),
  opened_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_service_cases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_service_cases FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.platform_open_service_case(_company_id uuid, _subject text, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  PERFORM private.require_platform('support.manage');
  IF length(trim(coalesce(_subject, ''))) < 3 OR length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Name the case and record a reason';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = _company_id) THEN
    RAISE EXCEPTION 'That business was not found';
  END IF;
  INSERT INTO public.platform_service_cases (company_id, subject, status, opened_by)
  VALUES (_company_id, trim(_subject), 'open', auth.uid()) RETURNING id INTO _id;
  PERFORM private.platform_log('service_case.open', 'company', _company_id::text, NULL,
    jsonb_build_object('case', _id), trim(_reason));
  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_open_service_case(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_open_service_case(uuid, text, text) TO authenticated;
