-- Execute only against the isolated synthetic local company supplied via psql variables.
-- All fixture mutations are rolled back, including the authorised demo reset.
begin;
select set_config('request.jwt.claims',jsonb_build_object('sub',:'owner_id','aal','aal1')::text,true);
select set_config('merge.fixture_company',:'company_id',true);
select set_config('merge.fixture_attachment',gen_random_uuid()::text,true);
do $$ declare target text; begin
  foreach target in array array['document_email_inboxes','document_tags','document_attachment_tags',
    'document_attachment_versions','document_retention_settings','document_storage_cleanup_jobs',
    'firm_client_requests','hr_locations','pos_location_access','pos_registers','pos_register_sessions','pos_sales','pos_sale_lines','pos_sale_payments','pos_cash_movements','pos_refunds'] loop
    if not exists(select 1 from pg_catalog.pg_policy p join pg_catalog.pg_class c on c.oid=p.polrelid
      join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=target and c.relrowsecurity and not p.polpermissive
      and pg_get_expr(p.polqual,p.polrelid) like '%mfa_requirement_met%'
      and pg_get_expr(p.polwithcheck,p.polrelid) like '%mfa_requirement_met%') then
      raise exception 'Missing restrictive MFA guard for %',target;
    end if;
  end loop;
  begin
    perform public.reset_demo_company(current_setting('merge.fixture_company')::uuid);
    raise exception 'Production company reset unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm not like '%not a demo company%' then raise; end if;
  end;
end $$;
select set_config('merge.fixture_company',public.create_demo_company()::text,true);
insert into public.document_attachments(id,company_id,entity_type,entity_id,file_name,storage_bucket,storage_path)
values(current_setting('merge.fixture_attachment')::uuid,current_setting('merge.fixture_company')::uuid,'company',current_setting('merge.fixture_company')::uuid,
  'isolated-merge-reset.pdf','company-documents',current_setting('merge.fixture_company')||'/company/'||current_setting('merge.fixture_company')||'/isolated-reset.pdf');
set local role authenticated;
-- Even a spoofed reset GUC does not authorise a direct authenticated DELETE.
select set_config('streakbooks.demo_reset_company',current_setting('merge.fixture_company'),true);
do $$ begin
  begin
    delete from public.document_attachments where id=current_setting('merge.fixture_attachment')::uuid;
    raise exception 'Direct document purge unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm not like '%eligible for an authorized permanent purge%' then raise; end if;
  end;
end $$;
select public.reset_demo_company(current_setting('merge.fixture_company')::uuid);
reset role;
do $$ begin
  if exists(select 1 from public.document_attachments where id=current_setting('merge.fixture_attachment')::uuid) then
    raise exception 'Authorised demo reset left attachment metadata';
  end if;
  if not exists(select 1 from public.document_storage_cleanup_jobs
    where company_id=current_setting('merge.fixture_company')::uuid and original_attachment_id=current_setting('merge.fixture_attachment')::uuid
      and cardinality(storage_paths)=1 and completed_at is null) then
    raise exception 'Authorised demo reset lost the durable Storage cleanup receipt';
  end if;
  raise notice 'Merged workflows: 16 restrictive MFA policies, non-demo denial, spoofed-delete denial and authorised demo reset/cleanup receipt passed';
end $$;
rollback;
