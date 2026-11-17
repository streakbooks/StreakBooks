select public.test_seed('base'); select public.test_seed('next'); select public.test_seed('reversed'); select public.test_seed('edited'); select public.test_seed('bad');
set request.jwt.claims='{"sub":"11111111-1111-4111-8111-111111111111","aal":"aal2"}';
select public.test_assert(public.get_bank_coding_memory(md5('company-a')::uuid,md5('next-txn')::uuid)='[]'::jsonb,'no unposted learning');
set role authenticated;
select public.test_link('base');
reset role;
select public.test_assert((select count(*)=1 from public.bank_coding_events),'one approved event');
select public.test_assert((select allocations->0->>'debit_minor'='10000' from public.bank_coding_events),'exact minor-unit allocation evidence');
select public.test_assert((select approved_by='11111111-1111-4111-8111-111111111111'::uuid from public.bank_coding_events),'posted approver captured');
select public.test_assert((public.get_bank_coding_memory(md5('company-a')::uuid,md5('next-txn')::uuid)->0->>'times_used')::int=1,'approved history count');
-- Legacy aggregates cannot be promoted to approved memory.
update public.bank_coding_history set times_used=99999;
select public.test_assert((public.get_bank_coding_memory(md5('company-a')::uuid,md5('next-txn')::uuid)->0->>'times_used')::int=1,'legacy count ignored');
-- Feedback is durable but never new learning; duplicate request must not duplicate audit.
set role authenticated;
select public.record_bank_coding_feedback(md5('company-a')::uuid,md5('next-txn')::uuid,(select history_id from public.bank_coding_events limit 1),'rejected',md5('reject-request')::uuid);
select public.record_bank_coding_feedback(md5('company-a')::uuid,md5('next-txn')::uuid,(select history_id from public.bank_coding_events limit 1),'rejected',md5('reject-request')::uuid);
reset role;
select public.test_assert((select count(*)=1 from public.bank_coding_feedback),'feedback retry deduplicated');
select public.test_assert((select count(*)=1 from public.audit_events where action='bank_coding_memory.feedback'),'feedback audit deduplicated');
select public.test_assert((select count(*)=1 from public.bank_coding_events),'rejection never learns');
select public.test_denied($q$select public.record_bank_coding_feedback(md5('company-a')::uuid,md5('next-txn')::uuid,(select history_id from public.bank_coding_events limit 1),'accepted',md5('reject-request')::uuid)$q$,'request payload mismatch denied');
set role authenticated;
select public.set_bank_coding_memory_preference(md5('company-a')::uuid,md5('next-txn')::uuid,(select history_id from public.bank_coding_events limit 1),false);
select public.set_bank_coding_memory_preference(md5('company-a')::uuid,md5('next-txn')::uuid,(select history_id from public.bank_coding_events limit 1),false);
reset role;
select public.test_assert((public.get_bank_coding_memory(md5('company-a')::uuid,md5('next-txn')::uuid)->0->>'enabled')::boolean=false,'disabled preference returned for management');
select public.test_assert((select count(*)=1 from public.audit_events where action='bank_coding_memory.preference'),'preference retry audit deduplicated');
set role authenticated;
select public.set_bank_coding_memory_preference(md5('company-a')::uuid,md5('next-txn')::uuid,(select history_id from public.bank_coding_events limit 1),true);
select public.record_bank_coding_feedback(md5('company-a')::uuid,md5('edited-txn')::uuid,(select history_id from public.bank_coding_events limit 1),'accepted',md5('edit-intent')::uuid);
reset role;
select public.test_assert((public.get_bank_coding_memory(md5('company-a')::uuid,md5('next-txn')::uuid)->0->>'enabled')::boolean,'re-enabled preference');
update public.journal_lines set account_id=md5('other')::uuid where id=md5('edited-offsetline')::uuid;
set role authenticated; select public.test_link('edited'); reset role;
select public.test_assert((select state='edited' from public.bank_coding_feedback where journal_id=md5('edited-journal')::uuid),'changed classification produces edited posted feedback');
select public.test_assert(jsonb_array_length(public.get_bank_coding_memory(md5('company-a')::uuid,md5('next-txn')::uuid))=2,'conflicting approved accounts preserved');
-- Reversal invalidates live eligibility without altering immutable evidence.
update public.journals set reversed_by_journal_id=md5('reversal')::uuid where id=md5('edited-journal')::uuid;
select public.test_assert(jsonb_array_length(public.get_bank_coding_memory(md5('company-a')::uuid,md5('next-txn')::uuid))=1,'reversal removes approved suggestion');
select public.test_assert((select count(*)=2 from public.bank_coding_events),'reversal preserves event history');
-- Failed links roll back the event/history/audit together.
update public.journals set status='draft' where id=md5('bad-journal')::uuid;
select public.test_denied($q$select public.test_link('bad')$q$,'draft journal cannot learn');
select public.test_assert((select count(*)=0 from public.reconciliation_links where bank_transaction_id=md5('bad-txn')::uuid),'failed link fully rolled back');
update public.journals set status='posted',source_id=md5('next-txn')::uuid where id=md5('bad-journal')::uuid;
select public.test_denied($q$select public.test_link('bad')$q$,'wrong transaction source denied');
update public.journals set source_id=md5('bad-txn')::uuid,reversed_by_journal_id=md5('reversal')::uuid where id=md5('bad-journal')::uuid;
select public.test_denied($q$select public.test_link('bad')$q$,'reversed journal cannot learn');
update public.journals set reversed_by_journal_id=null,currency_code='USD' where id=md5('bad-journal')::uuid;
select public.test_denied($q$select public.test_link('bad')$q$,'currency mismatch denied');
update public.journals set currency_code='GBP',company_id=md5('company-b')::uuid where id=md5('bad-journal')::uuid;
select public.test_denied($q$select public.test_link('bad')$q$,'cross-company journal denied');
-- Direct event/feedback forgery and legacy counter writes are denied.
select public.test_denied($q$delete from public.bank_coding_events$q$,'events cannot be deleted');
select public.test_denied($q$update public.bank_coding_events set amount_minor=1$q$,'events cannot be rewritten');
select public.test_denied($q$insert into public.bank_coding_feedback(company_id) values(md5('company-a')::uuid)$q$,'feedback cannot be inserted directly');
select public.test_denied($q$update public.bank_coding_history set times_used=999$q$,'legacy history cannot be inflated');
-- MFA and company isolation.
set request.jwt.claims='{"sub":"11111111-1111-4111-8111-111111111111","aal":"aal1"}';
select public.test_denied($q$select public.get_bank_coding_memory(md5('company-a')::uuid,md5('next-txn')::uuid)$q$,'MFA denial');
set request.jwt.claims='{"sub":"22222222-2222-4222-8222-222222222222","aal":"aal2"}';
select public.test_denied($q$select public.get_bank_coding_memory(md5('company-a')::uuid,md5('next-txn')::uuid)$q$,'cross-company read denial');
set role authenticated;
select public.test_assert((select count(*)=0 from public.bank_coding_events),'event RLS company isolation');
select public.test_assert((select count(*)=0 from public.bank_coding_feedback),'feedback RLS company isolation');
reset role;
set request.jwt.claims='{"sub":"11111111-1111-4111-8111-111111111111","aal":"aal2"}';
delete from public.test_permissions where permission='banking.categorise';
select public.test_seed('reconcile-only');
set role authenticated;
-- Fixture link RLS is intentionally broadened below for this reconciliation-only scenario.
reset role;
alter policy link_insert on public.reconciliation_links with check(public.is_company_member(company_id));
set role authenticated;
insert into public.reconciliation_links(company_id,bank_transaction_id,journal_line_id)
values(md5('company-a')::uuid,md5('reconcile-only-txn')::uuid,md5('reconcile-only-bankline')::uuid);
reset role;
select public.test_assert((select count(*)=0 from public.bank_coding_events where journal_id=md5('reconcile-only-journal')::uuid),'reconciliation-only link cannot teach memory');
alter policy link_insert on public.reconciliation_links with check(public.has_company_permission(company_id,'banking.categorise'));

select public.test_denied($q$select public.set_bank_coding_memory_preference(md5('company-a')::uuid,md5('next-txn')::uuid,(select history_id from public.bank_coding_events limit 1),false)$q$,'revoked coding permission denies preference');
select public.test_denied($q$select public.record_bank_coding_feedback(md5('company-a')::uuid,md5('next-txn')::uuid,(select history_id from public.bank_coding_events limit 1),'rejected',md5('revoked-request')::uuid)$q$,'revoked coding permission denies feedback');
insert into public.test_permissions values(md5('company-a')::uuid,'11111111-1111-4111-8111-111111111111','banking.categorise');
-- Unmatching removes the precedent, re-linking does not create a second event.
delete from public.reconciliation_links where bank_transaction_id=md5('base-txn')::uuid;
select public.test_assert(public.get_bank_coding_memory(md5('company-a')::uuid,md5('next-txn')::uuid)='[]'::jsonb,'unmatched precedent excluded');
set role authenticated;
select public.test_link('base');
reset role;
select public.test_assert((select count(*)=1 from public.bank_coding_events where journal_id=md5('base-journal')::uuid),'relink retry deduplicated');
-- Live account eligibility and direction/bank partitions are rechecked at read time.
update public.bank_transactions set amount_minor=10000 where id=md5('next-txn')::uuid;
select public.test_assert(public.get_bank_coding_memory(md5('company-a')::uuid,md5('next-txn')::uuid)='[]'::jsonb,'opposite direction never borrows evidence');
update public.bank_transactions set amount_minor=-10000 where id=md5('next-txn')::uuid;
update public.accounts set is_active=false where id=md5('expense')::uuid;
select public.test_assert(public.get_bank_coding_memory(md5('company-a')::uuid,md5('next-txn')::uuid)='[]'::jsonb,'inactive account excluded');
update public.accounts set is_active=true,is_control=true where id=md5('expense')::uuid;
select public.test_assert(public.get_bank_coding_memory(md5('company-a')::uuid,md5('next-txn')::uuid)='[]'::jsonb,'control account excluded');
update public.accounts set is_control=false,is_postable=false where id=md5('expense')::uuid;
select public.test_assert(public.get_bank_coding_memory(md5('company-a')::uuid,md5('next-txn')::uuid)='[]'::jsonb,'non-postable account excluded');
update public.accounts set is_postable=true,archived_at=now() where id=md5('expense')::uuid;
select public.test_assert(public.get_bank_coding_memory(md5('company-a')::uuid,md5('next-txn')::uuid)='[]'::jsonb,'archived account excluded');
update public.accounts set archived_at=null where id=md5('expense')::uuid;
update public.bank_accounts set is_active=false where id=md5('bank')::uuid;
select public.test_assert(public.get_bank_coding_memory(md5('company-a')::uuid,md5('next-txn')::uuid)='[]'::jsonb,'archived bank excluded');
update public.bank_accounts set is_active=true where id=md5('bank')::uuid;
-- A mandatory audit failure cannot leave learning or the new link behind.
select public.test_seed('audit-fail');
set test.fail_audit='on';
select public.test_denied($q$select public.test_link('audit-fail')$q$,'audit failure blocks learning atomically');
set test.fail_audit='off';
select public.test_assert((select count(*)=0 from public.bank_coding_events where journal_id=md5('audit-fail-journal')::uuid),'failed audit leaves no event');
select public.test_assert((select count(*)=0 from public.reconciliation_links where bank_transaction_id=md5('audit-fail-txn')::uuid),'failed audit leaves no link');
