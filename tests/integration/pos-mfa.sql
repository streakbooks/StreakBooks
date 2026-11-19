-- Real canonical MFA helper, isolated factor fixture and existing sale/refund rows.
INSERT INTO auth.mfa_factors(user_id,status)
VALUES ('10000000-0000-4000-8000-000000000001','verified');
SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","aal":"aal1"}',false);
DO $$ DECLARE target text; visible bigint; BEGIN
  FOREACH target IN ARRAY ARRAY['pos_sales','pos_sale_lines','pos_sale_payments','pos_cash_movements','pos_refunds'] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I',target) INTO visible;
    PERFORM public.test_assert(visible=0,'AAL1 cannot read '||target);
  END LOOP;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","aal":"aal2"}',false);
DO $$ DECLARE target text; visible bigint; BEGIN
  FOREACH target IN ARRAY ARRAY['pos_sales','pos_sale_lines','pos_sale_payments','pos_refunds'] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I',target) INTO visible;
    PERFORM public.test_assert(visible>0,'AAL2 retains authorised reads of '||target);
  END LOOP;
END $$;
RESET ROLE;
DELETE FROM auth.mfa_factors;
