-- Read-only smoke coverage for the reviewed helpers, against a fully migrated
-- isolated database. No credentials, generated public tokens or source rows print.
begin;
set local search_path = pg_temp;
do $$
declare _fn record; _ok boolean; _caught boolean := false; _count integer := 0; _a text; _b text;
begin
  for _fn in
    select n.nspname, p.proname, p.proargtypes[0]::regtype as arg_type
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private' and p.proname like 'advisors_%_json' and p.pronargs=1
  loop
    execute format('select %I.%I(null::%s) is not null', _fn.nspname, _fn.proname, _fn.arg_type) into _ok;
    if not _ok then raise exception 'JSON helper failed: %', _fn.proname; end if;
    _count := _count + 1;
  end loop;
  if not public.payroll_run_employee_active_in_period('2026-01-01',null,'2026-11-01','2026-11-30')
    or public.payroll_run_employee_active_in_period('2026-12-01',null,'2026-11-01','2026-11-30') then
    raise exception 'Payroll active-period helper changed';
  end if;
  _count := _count + 1;
  if public.payroll_derive_payslip_payment_status(100,0)<>'unpaid'
    or public.payroll_derive_payslip_payment_status(100,25)<>'partial'
    or public.payroll_derive_payslip_payment_status(100,100)<>'paid' then
    raise exception 'Payroll payment-state helper changed';
  end if;
  _count := _count + 1;
  if public.messaging_dm_pair_key('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002')
    <> public.messaging_dm_pair_key('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001') then
    raise exception 'Direct-message pair order changed';
  end if;
  _count := _count + 1;
  begin
    perform public.payroll_assert_settings_accounts(null::public.payroll_settings);
  exception when raise_exception then
    if sqlerrm not like 'Configure payroll GL accounts%' then raise; end if;
    _caught := true;
  end;
  if not _caught then raise exception 'Missing payroll accounts were accepted'; end if;
  _count := _count + 1;
  if private.advisors_default_agreement_body('Bookkeeping',null,123,'GBP','monthly') not like '%Bookkeeping%' then
    raise exception 'Agreement text helper changed';
  end if;
  _count := _count + 1;
  _a := private.advisors_new_public_token(); _b := private.advisors_new_public_token();
  if _a !~ '^[0-9a-f]{48}$' or _b !~ '^[0-9a-f]{48}$' or _a=_b then
    raise exception 'Advisor token generator failed';
  end if;
  _count := _count + 1;
  if _count<>19 then raise exception 'Expected 19 reviewed helpers, exercised %',_count; end if;
  raise notice 'Search-path smoke: 19 helpers passed under a caller search_path of pg_temp';
end;
$$;
rollback;
