-- READY-TO-APPLY. Not applied. One open case per business and subject. Closing records the change and does not delete the case.
-- Reverse: drop index platform_service_cases_one_open and constraint platform_service_cases_company_fk,
-- drop function public.platform_close_service_case(uuid, text), then reapply
-- public.platform_open_service_case from 20261102300000_service_desk.sql.

ALTER TABLE public.platform_service_cases
  ADD CONSTRAINT platform_service_cases_company_fk
  FOREIGN KEY (company_id) REFERENCES public.companies(id);

CREATE UNIQUE INDEX platform_service_cases_one_open
  ON public.platform_service_cases (company_id, subject)
  WHERE status = 'open';

CREATE OR REPLACE FUNCTION public.platform_open_service_case(_company_id uuid, _subject text, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid; _clean text;
BEGIN
  PERFORM private.require_platform('support.manage');
  _clean := trim(coalesce(_subject, ''));
  IF length(_clean) < 3 OR length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Name the case and record a reason';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = _company_id) THEN
    RAISE EXCEPTION 'That business was not found';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.platform_service_cases
    WHERE company_id = _company_id AND subject = _clean AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'That case is already open';
  END IF;
  BEGIN
    INSERT INTO public.platform_service_cases (company_id, subject, status, opened_by)
    VALUES (_company_id, _clean, 'open', auth.uid()) RETURNING id INTO _id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'That case is already open';
  END;
  PERFORM private.platform_log('service_case.open', 'company', _company_id::text, NULL,
    jsonb_build_object('case', _id, 'status', 'open'), trim(_reason));
  RETURN _id;
END;
$$;

CREATE FUNCTION public.platform_close_service_case(_case_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.platform_service_cases%ROWTYPE;
BEGIN
  PERFORM private.require_platform('support.manage');
  IF length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record a reason (at least 3 characters)';
  END IF;
  SELECT * INTO _row FROM public.platform_service_cases WHERE id = _case_id FOR UPDATE;
  IF NOT FOUND OR _row.status <> 'open' THEN
    RAISE EXCEPTION 'That case is no longer open';
  END IF;
  UPDATE public.platform_service_cases SET status = 'closed' WHERE id = _case_id;
  PERFORM private.platform_log('service_case.close', 'company', _row.company_id::text,
    jsonb_build_object('status', 'open'), jsonb_build_object('status', 'closed'), trim(_reason));
END;
$$;

REVOKE ALL ON FUNCTION public.platform_open_service_case(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.platform_close_service_case(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_open_service_case(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_close_service_case(uuid, text) TO authenticated;
