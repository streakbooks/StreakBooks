-- READY-TO-APPLY. Not applied. Approval still copies presentation fields only.
-- An archived business cannot be the source or the target.
-- Reverse: reapply public.platform_decide_promotion from 20261102380000_promotion_presentation.sql.

CREATE OR REPLACE FUNCTION public.platform_decide_promotion(_id uuid, _decision text, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.platform_promotions%ROWTYPE;
BEGIN
  PERFORM private.require_platform('settings.manage');
  IF _decision NOT IN ('approved', 'rejected') OR length(trim(coalesce(_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Record an approve or reject decision and a reason';
  END IF;
  SELECT * INTO _row FROM public.platform_promotions WHERE id = _id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'That promotion is no longer pending'; END IF;
  IF _row.requester_id = auth.uid() THEN RAISE EXCEPTION 'A second person must decide this request'; END IF;
  IF _decision = 'approved' AND EXISTS (
    SELECT 1 FROM public.companies
    WHERE id IN (_row.source_id, _row.target_id) AND archived_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'An archived business cannot be promoted';
  END IF;
  UPDATE public.platform_promotions SET status = _decision, approver_id = auth.uid() WHERE id = _id;
  IF _decision = 'approved' THEN
    UPDATE public.companies AS target
    SET locale = source.locale,
        date_format = source.date_format,
        invoice_footer = source.invoice_footer,
        document_theme_color = source.document_theme_color,
        updated_at = now()
    FROM public.companies AS source
    WHERE target.id = _row.target_id
      AND source.id = _row.source_id
      AND source.archived_at IS NULL
      AND target.archived_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Those businesses were not found'; END IF;
  END IF;
  PERFORM private.platform_log(
    'promotion.decide', 'platform_promotion', _id::text,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object(
      'status', _decision,
      'copied', _decision = 'approved',
      'fields', CASE WHEN _decision = 'approved'
        THEN jsonb_build_array('locale', 'date_format', 'invoice_footer', 'document_theme_color')
        ELSE '[]'::jsonb END
    ),
    trim(_reason)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.platform_decide_promotion(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_decide_promotion(uuid, text, text) TO authenticated;
