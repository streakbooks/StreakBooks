-- Invoker semantics retain the caller's tenant and row-level visibility.
create or replace function public.report_pack_counts(_company_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce((select jsonb_object_agg(status, n) from
    (select status, count(*) n from public.report_packs where company_id = _company_id group by status) counts), '{}'::jsonb)
    || jsonb_build_object('enabled_schedules', (select count(*) from public.report_schedules where company_id = _company_id and enabled));
$$;
revoke all on function public.report_pack_counts(uuid) from public, anon;
grant execute on function public.report_pack_counts(uuid) to authenticated;
