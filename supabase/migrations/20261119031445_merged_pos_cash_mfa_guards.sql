-- Cash-sale reads require the same opted-in MFA assurance as POS writes.
-- Preserve the tenant/permission policies and add a restrictive guard.
do $$ declare target text; begin
  foreach target in array array['pos_sales','pos_sale_lines','pos_sale_payments',
    'pos_cash_movements','pos_refunds'] loop
    execute format('create policy merged_workflow_mfa on public.%I as restrictive for all to authenticated using ((select private.mfa_requirement_met())) with check ((select private.mfa_requirement_met()))',target);
  end loop;
end $$;
notify pgrst,'reload schema';
