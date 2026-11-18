-- A pattern shared by two banks must have independent controls. Legacy choices
-- remain effective until an authorised caller explicitly overrides that scope.
set request.jwt.claims='{"sub":"11111111-1111-4111-8111-111111111111","aal":"aal2"}';
insert into public.accounts(id,company_id,code,name) values(md5('bank2-gl')::uuid,md5('company-a')::uuid,'101','Bank 2');
insert into public.bank_accounts(id,company_id,name,currency_code,gl_account_id)
  values(md5('bank2')::uuid,md5('company-a')::uuid,'Bank 2','GBP',md5('bank2-gl')::uuid);
select public.test_seed('bank2');
update public.bank_transactions set bank_account_id=md5('bank2')::uuid where id=md5('bank2-txn')::uuid;
update public.journal_lines set account_id=md5('bank2-gl')::uuid where id=md5('bank2-bankline')::uuid;
set role authenticated; select public.test_link('bank2'); reset role;
insert into public.bank_coding_memory_preferences(history_id,company_id,enabled,updated_by)
  select history_id,company_id,false,auth.uid() from public.bank_coding_events where journal_id=md5('base-journal')::uuid;
select public.test_assert((public.get_bank_coding_memory(md5('company-a')::uuid,md5('bank2-txn')::uuid)->0->>'enabled')::boolean=false,'legacy disabled preference preserved as scoped fallback');
set role authenticated;
select public.set_bank_coding_memory_preference(md5('company-a')::uuid,md5('next-txn')::uuid,(select history_id from public.bank_coding_events where journal_id=md5('base-journal')::uuid),false);
select public.set_bank_coding_memory_preference(md5('company-a')::uuid,md5('bank2-txn')::uuid,(select history_id from public.bank_coding_events where journal_id=md5('base-journal')::uuid),true);
reset role;
select public.test_assert((public.get_bank_coding_memory(md5('company-a')::uuid,md5('next-txn')::uuid)->0->>'enabled')::boolean=false,'first bank remains disabled');
select public.test_assert((public.get_bank_coding_memory(md5('company-a')::uuid,md5('bank2-txn')::uuid)->0->>'enabled')::boolean,'second bank independently re-enabled');
set role authenticated;
select public.set_bank_coding_memory_preference(md5('company-a')::uuid,md5('bank2-txn')::uuid,(select history_id from public.bank_coding_events where journal_id=md5('base-journal')::uuid),false);
reset role;
update public.bank_accounts set currency_code='USD' where id=md5('bank2')::uuid;
select public.test_seed('bank2-usd');
update public.bank_transactions set bank_account_id=md5('bank2')::uuid where id=md5('bank2-usd-txn')::uuid;
update public.journals set currency_code='USD' where id=md5('bank2-usd-journal')::uuid;
update public.journal_lines set account_id=md5('bank2-gl')::uuid where id=md5('bank2-usd-bankline')::uuid;
set role authenticated; select public.test_link('bank2-usd'); reset role;
-- Legacy disabled choices still apply to a new currency until explicitly overridden.
select public.test_assert((public.get_bank_coding_memory(md5('company-a')::uuid,md5('bank2-usd-txn')::uuid)->0->>'enabled')::boolean=false,'new currency preserves legacy fallback');
set role authenticated;
select public.set_bank_coding_memory_preference(md5('company-a')::uuid,md5('bank2-usd-txn')::uuid,(select history_id from public.bank_coding_events where journal_id=md5('base-journal')::uuid),true);
reset role;
select public.test_assert((public.get_bank_coding_memory(md5('company-a')::uuid,md5('bank2-usd-txn')::uuid)->0->>'times_used')::int=1,'currency filters exclude old currency approvals');
update public.bank_accounts set currency_code='GBP' where id=md5('bank2')::uuid;
select public.test_assert((public.get_bank_coding_memory(md5('company-a')::uuid,md5('bank2-txn')::uuid)->0->>'enabled')::boolean=false,'currency-specific enable leaves prior currency disabled');
set role authenticated;
select public.set_bank_coding_memory_preference(md5('company-a')::uuid,md5('bank2-txn')::uuid,(select history_id from public.bank_coding_events where journal_id=md5('base-journal')::uuid),true);
reset role;
select public.test_denied($q$update public.bank_coding_memory_preferences set enabled=true$q$,'legacy global preference writes frozen');
select public.test_denied($q$update public.bank_coding_memory_controls set reset_event_no=0$q$,'scoped control watermark cannot be forged');
select public.test_denied($q$insert into public.bank_coding_memory_resets(company_id) values(md5('company-a')::uuid)$q$,'reset receipts cannot be forged');
create temp table reset_baseline as select (select count(*) from public.bank_coding_events) events,(select count(*) from public.journals) journals;
set role authenticated;
select public.reset_bank_coding_memory_preference(md5('company-a')::uuid,md5('next-txn')::uuid,(select history_id from public.bank_coding_events where journal_id=md5('base-journal')::uuid),md5('reset-request')::uuid);
select public.reset_bank_coding_memory_preference(md5('company-a')::uuid,md5('next-txn')::uuid,(select history_id from public.bank_coding_events where journal_id=md5('base-journal')::uuid),md5('reset-request')::uuid);
-- Previously committed feedback remains replayable after its evidence is hidden.
select public.record_bank_coding_feedback(md5('company-a')::uuid,md5('next-txn')::uuid,(select history_id from public.bank_coding_events where journal_id=md5('base-journal')::uuid),'rejected',md5('reject-request')::uuid);
reset role;
select public.test_assert(public.get_bank_coding_memory(md5('company-a')::uuid,md5('next-txn')::uuid)='[]'::jsonb,'reset forgets prior learning');
select public.test_assert((select count(*)=1 from public.bank_coding_memory_resets),'reset receipt retry deduplicated');
select public.test_assert((select count(*)=1 from public.audit_events where action='bank_coding_memory.reset'),'reset audit retry deduplicated');
select public.test_assert((select count(*) from public.bank_coding_events)=(select events from reset_baseline),'reset preserves immutable approval evidence');
select public.test_assert((select count(*) from public.journals)=(select journals from reset_baseline),'reset never posts or removes journals');
select public.test_assert((public.get_bank_coding_memory(md5('company-a')::uuid,md5('bank2-txn')::uuid)->0->>'times_used')::int=1,'reset leaves other bank learning intact');
select public.test_assert((select enabled and reset_event_no>0 and reset_at is not null from public.bank_coding_memory_controls where bank_account_id=md5('bank')::uuid),'reset enables future learning with watermark');
select public.test_denied($q$select public.record_bank_coding_feedback(md5('company-a')::uuid,md5('next-txn')::uuid,(select history_id from public.bank_coding_events where journal_id=md5('base-journal')::uuid),'accepted',md5('fresh-after-reset')::uuid)$q$,'fresh feedback cannot use forgotten evidence');
select public.test_denied($q$select public.reset_bank_coding_memory_preference(md5('company-a')::uuid,md5('bank2-txn')::uuid,(select history_id from public.bank_coding_events where journal_id=md5('base-journal')::uuid),md5('reset-request')::uuid)$q$,'reset request payload mismatch denied');
select public.test_denied($q$update public.bank_coding_memory_resets set through_event_no=1$q$,'reset receipt immutable');
select public.test_denied($q$delete from public.bank_coding_memory_resets$q$,'reset receipts cannot be deleted');
-- A backdated approval is still new learning; wall-clock/posted dates cannot cause
-- old evidence to reappear, or prevent a later approval teaching a fresh preference.
select public.test_seed('after-reset');
update public.journals set posted_at='2020-01-01' where id=md5('after-reset-journal')::uuid;
set role authenticated; select public.test_link('after-reset'); reset role;
select public.test_assert((public.get_bank_coding_memory(md5('company-a')::uuid,md5('next-txn')::uuid)->0->>'times_used')::int=1,'new backdated approval learns once after reset');
select public.test_assert(public.get_bank_coding_memory(md5('company-a')::uuid,md5('next-txn')::uuid)->0->>'last_reset_at' is not null,'reset date explains new learning boundary');
set role authenticated;
select public.reset_bank_coding_memory_preference(md5('company-a')::uuid,md5('next-txn')::uuid,(select history_id from public.bank_coding_events where journal_id=md5('base-journal')::uuid),md5('reset-request')::uuid);
reset role;
select public.test_assert((public.get_bank_coding_memory(md5('company-a')::uuid,md5('next-txn')::uuid)->0->>'times_used')::int=1,'lost reset response retry never consumes newer learning');
-- Audit failures roll the control and receipt back together.
set test.fail_audit='on';
select public.test_denied($q$select public.reset_bank_coding_memory_preference(md5('company-a')::uuid,md5('next-txn')::uuid,(select history_id from public.bank_coding_events where journal_id=md5('base-journal')::uuid),md5('failed-reset')::uuid)$q$,'reset audit failure propagates');
set test.fail_audit='off';
select public.test_assert((select count(*)=1 from public.bank_coding_memory_resets),'failed reset audit leaves no receipt');
select public.test_assert((public.get_bank_coding_memory(md5('company-a')::uuid,md5('next-txn')::uuid)->0->>'times_used')::int=1,'failed reset audit leaves learning intact');
-- Replays recheck permissions even though they perform no new mutation.
delete from public.test_permissions where permission='banking.categorise';
select public.test_denied($q$select public.reset_bank_coding_memory_preference(md5('company-a')::uuid,md5('next-txn')::uuid,(select history_id from public.bank_coding_events where journal_id=md5('base-journal')::uuid),md5('reset-request')::uuid)$q$,'revoked permission denies reset replay');
select public.test_denied($q$select public.record_bank_coding_feedback(md5('company-a')::uuid,md5('next-txn')::uuid,(select history_id from public.bank_coding_events where journal_id=md5('base-journal')::uuid),'rejected',md5('reject-request')::uuid)$q$,'revoked permission denies feedback replay');
insert into public.test_permissions values(md5('company-a')::uuid,'11111111-1111-4111-8111-111111111111','banking.categorise');
delete from public.test_permissions where permission='banking.view' and company_id=md5('company-a')::uuid;
select public.test_denied($q$select public.reset_bank_coding_memory_preference(md5('company-a')::uuid,md5('next-txn')::uuid,md5('history')::uuid,md5('reset-request')::uuid)$q$,'revoked Banking view denies reset');
insert into public.test_permissions values(md5('company-a')::uuid,'11111111-1111-4111-8111-111111111111','banking.view');
select public.test_assert(not has_function_privilege('anon','public.reset_bank_coding_memory_preference(uuid,uuid,uuid,uuid)','execute'),'anonymous reset execution revoked');
select public.test_assert(not has_function_privilege('anon','private.reset_scoped_bank_coding_memory(uuid,uuid,uuid,uuid)','execute'),'anonymous private reset execution revoked');
select public.test_assert(not has_function_privilege('anon','private.set_scoped_bank_coding_preference(uuid,uuid,uuid,boolean)','execute'),'anonymous private preference execution revoked');
select public.test_assert(not has_function_privilege('anon','private.record_retry_safe_bank_coding_feedback(uuid,uuid,uuid,text,uuid)','execute'),'anonymous private feedback execution revoked');
set request.jwt.claims='{"sub":"11111111-1111-4111-8111-111111111111","aal":"aal1"}';
select public.test_denied($q$select public.reset_bank_coding_memory_preference(md5('company-a')::uuid,md5('next-txn')::uuid,md5('history')::uuid,md5('reset-request')::uuid)$q$,'MFA denies reset');
set role authenticated;
select public.test_assert((select count(*)=0 from public.bank_coding_memory_controls),'MFA hides scoped controls');
select public.test_assert((select count(*)=0 from public.bank_coding_memory_resets),'MFA hides reset receipts');
reset role;
set request.jwt.claims='{"sub":"22222222-2222-4222-8222-222222222222","aal":"aal2"}';
select public.test_denied($q$select public.reset_bank_coding_memory_preference(md5('company-a')::uuid,md5('next-txn')::uuid,md5('history')::uuid,md5('cross-reset')::uuid)$q$,'cross-company reset denied');
set role authenticated;
select public.test_assert((select count(*)=0 from public.bank_coding_memory_controls),'scoped control tenant isolation');
select public.test_assert((select count(*)=0 from public.bank_coding_memory_resets),'reset receipt tenant isolation');
reset role;
set request.jwt.claims='{"sub":"11111111-1111-4111-8111-111111111111","aal":"aal2"}';
