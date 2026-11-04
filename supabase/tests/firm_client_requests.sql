-- Transactional isolation and stale-write regression for practice requests.
begin;
do $$
declare
  u1 uuid:=gen_random_uuid(); u2 uuid:=gen_random_uuid();
  c1 uuid:=gen_random_uuid(); c2 uuid:=gen_random_uuid();
begin
 insert into auth.users(id,email,raw_user_meta_data)
 values(u1,'request-test-'||u1||'@example.invalid','{}'),(u2,'request-test-'||u2||'@example.invalid','{}');
 insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at)
 values(gen_random_uuid(),u1,'totp','verified',now(),now());
 insert into public.companies(id,name,country_code,base_currency,fiscal_year_end_month,fiscal_year_end_day,timezone,created_by)
 values(c1,'Request fixture A','GB','GBP',12,31,'UTC',u1),(c2,'Request fixture B','GB','GBP',12,31,'UTC',u2);
 perform set_config('linkbooks.trusted','on',true);
 insert into public.company_members(company_id,user_id,role) values(c1,u1,'owner'),(c1,u2,'accountant'),(c2,u2,'owner')
 on conflict(company_id,user_id) do nothing;
 perform set_config('linkbooks.trusted','off',true);
 perform set_config('test.request_u1',u1::text,true);
 perform set_config('test.request_u2',u2::text,true);
 perform set_config('test.request_c1',c1::text,true);
 perform set_config('test.request_c2',c2::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u1,'aal','aal2','role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$
declare
 u1 uuid:=current_setting('test.request_u1')::uuid;
 u2 uuid:=current_setting('test.request_u2')::uuid;
 c1 uuid:=current_setting('test.request_c1')::uuid;
 c2 uuid:=current_setting('test.request_c2')::uuid;
 fid uuid;
 rid uuid;
 changed integer;
begin
 fid:=public.create_practice_firm('Request fixture firm');
 insert into public.firm_members(firm_id,user_id,role) values(fid,u2,'member');
 perform public.manage_practice_client(fid,c1,'view',false);
 insert into public.firm_client_requests(firm_id,company_id,title,description,assigned_to,created_by,updated_by)
 values(fid,c1,'Provide October statements','Monthly review',u2,u1,u1)
 returning id into rid;
 update public.firm_client_requests set status='received',updated_by=u1
 where id=rid and version=1;
 if (select version from public.firm_client_requests where id=rid)<>2 then
  raise exception 'Request version missing'; end if;
 update public.firm_client_requests set status='reviewed',updated_by=u1
 where id=rid and version=1;
 get diagnostics changed=row_count;
 if changed<>0 then raise exception 'Stale edit applied';end if;
 begin
  update public.firm_client_requests set company_id=c2,updated_by=u1 where id=rid;
  raise exception 'TEST: cross-company reassignment allowed';
 exception when insufficient_privilege then null;end;
 begin
  insert into public.firm_client_requests(firm_id,company_id,title,created_by,updated_by)
  values(fid,c2,'Cross tenant request',u1,u1);
  raise exception 'TEST: foreign request inserted';
 exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u2,'aal','aal2','role','authenticated')::text,true);
 if (select count(*) from public.firm_client_requests where id=rid)<>1 then
  raise exception 'Permitted member cannot read'; end if;
 update public.firm_client_requests set status='reviewed',updated_by=u2 where id=rid;
 get diagnostics changed=row_count;
 if changed<>0 then raise exception 'Non-admin write allowed';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u1,'aal','aal1','role','authenticated')::text,true);
 if exists(select 1 from public.firm_client_requests where id=rid) then
  raise exception 'MFA AAL1 disclosure';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u1,'aal','aal2','role','authenticated')::text,true);
 perform public.manage_practice_client(fid,c1,null,true);
 if exists(select 1 from public.firm_client_requests where id=rid) then
  raise exception 'Revoked client still visible';end if;
end $$;
rollback;
select 'firm requests: tenant, MFA, assignment, stale-version and revocation checks passed; fixtures rolled back' as result;
