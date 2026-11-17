create function private.mfa_requirement_met() returns boolean language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'aal'='aal2',false) $$;
grant execute on function private.mfa_requirement_met() to authenticated;
create table public.test_assertions(label text);
create function public.test_assert(ok boolean,label text) returns void language plpgsql security definer set search_path='' as $$ begin if ok is distinct from true then raise exception 'FAILED: %',label; end if; insert into public.test_assertions values(label); end $$;
create function public.test_denied(statement text,label text) returns void language plpgsql security definer set search_path='' as $$
begin
  -- Test payloads use SET LOCAL ROLE inside a subtransaction; errors roll it back.
  begin
    execute 'set local role authenticated';
    execute statement;
  exception when insufficient_privilege or raise_exception then
    execute 'reset role'; perform public.test_assert(true,label); return;
  end;
  execute 'reset role'; raise exception 'FAILED: expected denial: %',label;
end;
$$;
-- SET ROLE is prohibited in SECURITY DEFINER; denial helper is deliberately invoker.
alter function public.test_denied(text,text) security invoker;

grant select on public.bank_accounts,public.bank_transactions,public.reconciliation_links,public.bank_coding_history to authenticated;
grant insert,delete on public.reconciliation_links to authenticated;
grant update on public.bank_transactions to authenticated;
-- Mirror tenant enforcement on authoritative fixture sources; helpers are fixture-only.
do $$ declare _table text; begin
 foreach _table in array array['accounts','journals','journal_lines','bank_accounts','bank_transactions','reconciliation_links','bank_coding_history'] loop
 execute format('alter table public.%I enable row level security',_table);
 execute format('create policy tenant_read on public.%I for select to authenticated using (public.is_company_member(company_id))',_table);
 end loop;
end $$;
create policy link_insert on public.reconciliation_links for insert to authenticated with check (public.has_company_permission(company_id,'banking.categorise'));
create policy link_delete on public.reconciliation_links for delete to authenticated using (public.has_company_permission(company_id,'banking.categorise'));
create policy txn_update on public.bank_transactions for update to authenticated using (public.has_company_permission(company_id,'banking.categorise')) with check(public.has_company_permission(company_id,'banking.categorise'));
insert into auth.users values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
insert into public.companies(id,name) values(md5('company-a')::uuid,'Fixture A'),(md5('company-b')::uuid,'Fixture B');
insert into public.test_permissions values(md5('company-a')::uuid,'11111111-1111-4111-8111-111111111111','banking.view'),(md5('company-a')::uuid,'11111111-1111-4111-8111-111111111111','banking.categorise'),(md5('company-b')::uuid,'22222222-2222-4222-8222-222222222222','banking.view');
insert into public.accounts(id,company_id,code,name,is_control) values
 (md5('bank-gl')::uuid,md5('company-a')::uuid,'100','Bank',false),
 (md5('expense')::uuid,md5('company-a')::uuid,'600','Expenses',false),
 (md5('other')::uuid,md5('company-a')::uuid,'601','Other',false),
 (md5('tax')::uuid,md5('company-a')::uuid,'200','Tax',true);
insert into public.bank_accounts(id,company_id,name,currency_code,gl_account_id) values(md5('bank')::uuid,md5('company-a')::uuid,'Bank','GBP',md5('bank-gl')::uuid);
create function public.test_seed(tag text) returns void language plpgsql as $$
begin
 insert into public.bank_transactions(id,company_id,bank_account_id,txn_date,amount_minor,description,status)
 values(md5(tag||'-txn')::uuid,md5('company-a')::uuid,md5('bank')::uuid,'2026-11-01',-10000,'Cloud Hosting','uncategorised');
 insert into public.journals(id,company_id,journal_date,status,source_type,source_id,currency_code,created_by,posted_by,posted_at)
 values(md5(tag||'-journal')::uuid,md5('company-a')::uuid,'2026-11-01','posted','bank_transaction',md5(tag||'-txn')::uuid,'GBP','11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111',now());
 insert into public.journal_lines(id,journal_id,company_id,line_no,account_id,debit_minor,credit_minor) values
 (md5(tag||'-bankline')::uuid,md5(tag||'-journal')::uuid,md5('company-a')::uuid,1,md5('bank-gl')::uuid,0,10000),
 (md5(tag||'-offsetline')::uuid,md5(tag||'-journal')::uuid,md5('company-a')::uuid,2,md5('expense')::uuid,10000,0);
end $$;
create function public.test_link(tag text) returns void language plpgsql security invoker as $$
begin
 insert into public.reconciliation_links(company_id,bank_transaction_id,journal_line_id)
 values(md5('company-a')::uuid,md5(tag||'-txn')::uuid,md5(tag||'-bankline')::uuid);
 update public.bank_transactions set status='matched' where id=md5(tag||'-txn')::uuid;
end $$;
grant execute on function public.test_assert(boolean,text),public.test_link(text) to authenticated;
