-- Scoped controls forget earlier learning without deleting financial or approval evidence.
-- Identity assignment rewrites the event table: review lock duration on a staging copy
-- before an approved production rollout. Never seed legacy aggregate counts as events.
alter table public.bank_coding_events add column event_no bigint generated always as identity;
create unique index bank_coding_events_event_no on public.bank_coding_events(event_no);
create index bank_coding_events_reset_scope on public.bank_coding_events(company_id,bank_account_id,currency_code,history_id,event_no);

create table public.bank_coding_memory_controls (
  company_id uuid not null references public.companies(id) on delete cascade,
  bank_account_id uuid not null references public.bank_accounts(id) on delete restrict,
  currency_code text not null,
  history_id uuid not null,
  enabled boolean not null default true,
  reset_event_no bigint not null default 0 check(reset_event_no>=0),
  reset_at timestamptz,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default clock_timestamp(),
  primary key(company_id,bank_account_id,currency_code,history_id),
  foreign key(history_id,company_id) references public.bank_coding_history(id,company_id) on delete restrict
);
create table public.bank_coding_memory_resets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  bank_transaction_id uuid not null references public.bank_transactions(id) on delete restrict,
  bank_account_id uuid not null references public.bank_accounts(id) on delete restrict,
  currency_code text not null,
  history_id uuid not null,
  actor_id uuid not null references auth.users(id),
  request_id uuid not null,
  through_event_no bigint not null check(through_event_no>0),
  created_at timestamptz not null default clock_timestamp(),
  foreign key(history_id,company_id) references public.bank_coding_history(id,company_id) on delete restrict,
  unique(company_id,actor_id,request_id)
);
create index bank_coding_memory_resets_transaction on public.bank_coding_memory_resets(company_id,bank_transaction_id);
alter table public.bank_coding_memory_controls enable row level security;
alter table public.bank_coding_memory_resets enable row level security;
revoke all on public.bank_coding_memory_controls,public.bank_coding_memory_resets from public,anon,authenticated;
grant select on public.bank_coding_memory_controls,public.bank_coding_memory_resets to authenticated;
create policy coding_controls_read on public.bank_coding_memory_controls for select to authenticated
using ((select private.mfa_requirement_met()) and public.is_company_member(company_id) and public.has_company_permission(company_id,'banking.view'));
create policy coding_resets_read on public.bank_coding_memory_resets for select to authenticated
using ((select private.mfa_requirement_met()) and public.is_company_member(company_id) and public.has_company_permission(company_id,'banking.view'));
-- Preserve legacy choices as a fallback, but all future mutations use the checked scoped RPC.
revoke insert,update,delete on public.bank_coding_memory_preferences from authenticated;
comment on table public.bank_coding_memory_controls is 'Checked RPC-only controls, scoped to company, bank, currency and learned pattern. Reset excludes earlier event numbers without deleting evidence.';
comment on table public.bank_coding_memory_resets is 'Immutable authorised reset receipts. Request identity and audit commit atomically; retries cannot forget newer approvals.';

create or replace function public.get_bank_coding_memory(_company_id uuid,_bank_transaction_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare _txn public.bank_transactions%rowtype; _payee text; _result jsonb;
begin
  if auth.uid() is null or not private.mfa_requirement_met() or not public.is_company_member(_company_id)
    or not public.has_company_permission(_company_id,'banking.view') then raise exception 'Banking read permission required' using errcode='42501'; end if;
  select * into _txn from public.bank_transactions where id=_bank_transaction_id and company_id=_company_id;
  if not found then raise exception 'Transaction not found'; end if;
  _payee:=left(trim(regexp_replace(regexp_replace(lower(coalesce(_txn.description,'')),'[^a-z0-9\s]',' ','g'),'\s+',' ','g')),120);
  select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) into _result from (
    select h.id as history_id,h.payee_normalized,h.offset_account_id,h.direction,count(*)::integer as times_used,
      a.code as account_code,a.name as account_name,coalesce(c.enabled,p.enabled,true) as enabled,c.reset_at as last_reset_at,
      (select jsonb_build_object('state',f.state,'posted',f.journal_id is not null,'created_at',f.created_at)
        from public.bank_coding_feedback f where f.company_id=_company_id and f.bank_transaction_id=_bank_transaction_id and f.history_id=h.id
        order by f.created_at desc,f.id desc limit 1) as last_feedback,
      max(e.approved_at) as last_approved_at,
      (array_agg(e.journal_id order by e.approved_at desc,e.id))[1] as latest_journal_id
    from public.bank_coding_events e join public.bank_coding_history h on h.id=e.history_id and h.company_id=e.company_id
      join public.accounts a on a.id=h.offset_account_id and a.company_id=e.company_id
      join public.journals j on j.id=e.journal_id and j.company_id=e.company_id
      join public.bank_transactions t on t.id=e.bank_transaction_id and t.company_id=e.company_id
      join public.bank_accounts b on b.id=e.bank_account_id and b.company_id=e.company_id
      join public.reconciliation_links l on l.bank_transaction_id=t.id and l.company_id=e.company_id
      join public.journal_lines jl on jl.id=l.journal_line_id and jl.journal_id=j.id and jl.company_id=e.company_id
      left join public.bank_coding_memory_preferences p on p.history_id=h.id and p.company_id=e.company_id
      left join public.bank_coding_memory_controls c on c.company_id=e.company_id
        and c.bank_account_id=e.bank_account_id and c.currency_code=e.currency_code and c.history_id=h.id
    where e.company_id=_company_id and e.bank_account_id=_txn.bank_account_id
      and e.event_no>coalesce(c.reset_event_no,0)
      and e.currency_code=b.currency_code::text and b.is_active and a.id<>b.gl_account_id
      and j.status::text='posted' and j.source_type::text='bank_transaction' and j.source_id=t.id
      and j.currency_code::text=e.currency_code and jl.account_id=b.gl_account_id and (jl.debit_minor-jl.credit_minor)=e.amount_minor
      and j.reversed_by_journal_id is null and j.reverses_journal_id is null
      -- Single-account hints must not flatten an approved multi-account split.
      and (select count(distinct split.account_id) from public.journal_lines split
        join public.accounts sa on sa.id=split.account_id and sa.company_id=e.company_id
        where split.journal_id=j.id and split.account_id<>b.gl_account_id and not coalesce(sa.is_control,false))=1
      and t.status::text in ('matched','reconciled') and t.amount_minor=e.amount_minor
      and a.is_active and a.is_postable and not coalesce(a.is_control,false) and a.archived_at is null
      and h.direction=case when _txn.amount_minor>=0 then 'in' else 'out' end
      and _payee<>'' and h.payee_normalized<>'' and strpos(' '||_payee||' ',' '||h.payee_normalized||' ')>0
    group by h.id,a.code,a.name,p.enabled,c.enabled,c.reset_at
    order by (h.payee_normalized=_payee) desc,count(*) desc,h.id limit 101
  ) r;
  return _result;
end;
$$;

-- Clients have no direct write grants. Private definer functions own the narrowly
-- scoped mutation after explicit membership, MFA and both Banking permissions.
create function private.set_scoped_bank_coding_preference(_company_id uuid,_bank_transaction_id uuid,_history_id uuid,_enabled boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare _bank uuid; _currency text; _previous boolean;
begin
  if auth.uid() is null or not private.mfa_requirement_met() or not public.is_company_member(_company_id)
    or not public.has_company_permission(_company_id,'banking.categorise') or not public.has_company_permission(_company_id,'banking.view') then
    raise exception 'Coding preference permission required' using errcode='42501'; end if;
  if _enabled is null or _history_id is null or _bank_transaction_id is null then raise exception 'Invalid coding preference'; end if;
  perform pg_advisory_xact_lock_shared(hashtextextended(_company_id::text||':workflow-reset',0));
  select t.bank_account_id,b.currency_code::text into _bank,_currency
    from public.bank_transactions t join public.bank_accounts b on b.id=t.bank_account_id and b.company_id=t.company_id
    where t.company_id=_company_id and t.id=_bank_transaction_id;
  if not found then raise exception 'Transaction not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(_company_id::text||':'||_bank::text||':'||_currency||':'||_history_id::text||':coding-control',0));
  if not exists(select 1 from jsonb_array_elements(public.get_bank_coding_memory(_company_id,_bank_transaction_id)) r where (r->>'history_id')::uuid=_history_id) then
    raise exception 'Preference is not available for this transaction'; end if;
  select coalesce(c.enabled,p.enabled,true) into _previous from public.bank_coding_history h
    left join public.bank_coding_memory_preferences p on p.company_id=h.company_id and p.history_id=h.id
    left join public.bank_coding_memory_controls c on c.company_id=h.company_id and c.history_id=h.id and c.bank_account_id=_bank and c.currency_code=_currency
    where h.company_id=_company_id and h.id=_history_id;
  insert into public.bank_coding_memory_controls(company_id,bank_account_id,currency_code,history_id,enabled,updated_by)
    values(_company_id,_bank,_currency,_history_id,_enabled,auth.uid())
    on conflict(company_id,bank_account_id,currency_code,history_id) do update
      set enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=clock_timestamp()
      where bank_coding_memory_controls.enabled is distinct from excluded.enabled;
  if _previous is distinct from _enabled then
    insert into public.audit_events(company_id,actor_user_id,action,entity_type,entity_id,details)
      values(_company_id,auth.uid(),'bank_coding_memory.preference','bank_coding_history',_history_id,
        jsonb_build_object('enabled',_enabled,'bank_account_id',_bank,'currency_code',_currency));
  end if;
  return _history_id;
end;
$$;
create or replace function public.set_bank_coding_memory_preference(_company_id uuid,_bank_transaction_id uuid,_history_id uuid,_enabled boolean)
returns uuid language sql security invoker set search_path='' as $$
  select private.set_scoped_bank_coding_preference(_company_id,_bank_transaction_id,_history_id,_enabled)
$$;

create function private.reset_scoped_bank_coding_memory(_company_id uuid,_bank_transaction_id uuid,_history_id uuid,_request_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare _existing public.bank_coding_memory_resets%rowtype; _bank uuid; _currency text; _through bigint; _id uuid; _at timestamptz;
begin
  if auth.uid() is null or not private.mfa_requirement_met() or not public.is_company_member(_company_id)
    or not public.has_company_permission(_company_id,'banking.categorise') or not public.has_company_permission(_company_id,'banking.view') then
    raise exception 'Coding reset permission required' using errcode='42501'; end if;
  if _history_id is null or _bank_transaction_id is null or _request_id is null then raise exception 'Invalid coding reset'; end if;
  perform pg_advisory_xact_lock_shared(hashtextextended(_company_id::text||':workflow-reset',0));
  perform pg_advisory_xact_lock(hashtextextended(_company_id::text||':'||auth.uid()::text||':'||_request_id::text||':coding-reset',0));
  -- Replay after authorisation but before eligibility: the committed reset hid the
  -- history, and later postings must never be consumed by a lost-response retry.
  select * into _existing from public.bank_coding_memory_resets where company_id=_company_id and actor_id=auth.uid() and request_id=_request_id;
  if found then
    if _existing.bank_transaction_id is distinct from _bank_transaction_id or _existing.history_id is distinct from _history_id then
      raise exception 'Reset request ID already used with another payload'; end if;
    return _existing.id;
  end if;
  select t.bank_account_id,b.currency_code::text into _bank,_currency
    from public.bank_transactions t join public.bank_accounts b on b.id=t.bank_account_id and b.company_id=t.company_id
    where t.company_id=_company_id and t.id=_bank_transaction_id;
  if not found then raise exception 'Transaction not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(_company_id::text||':'||_bank::text||':'||_currency||':'||_history_id::text||':coding-control',0));
  if not exists(select 1 from jsonb_array_elements(public.get_bank_coding_memory(_company_id,_bank_transaction_id)) r where (r->>'history_id')::uuid=_history_id) then
    raise exception 'Preference is not available for this transaction'; end if;
  select max(event_no) into _through from public.bank_coding_events where company_id=_company_id
    and bank_account_id=_bank and currency_code=_currency and history_id=_history_id;
  _at:=clock_timestamp();
  insert into public.bank_coding_memory_resets(company_id,bank_transaction_id,bank_account_id,currency_code,history_id,actor_id,request_id,through_event_no,created_at)
    values(_company_id,_bank_transaction_id,_bank,_currency,_history_id,auth.uid(),_request_id,_through,_at) returning id into _id;
  insert into public.bank_coding_memory_controls(company_id,bank_account_id,currency_code,history_id,enabled,reset_event_no,reset_at,updated_by,updated_at)
    values(_company_id,_bank,_currency,_history_id,true,_through,_at,auth.uid(),_at)
    on conflict(company_id,bank_account_id,currency_code,history_id) do update set enabled=true,
      reset_event_no=greatest(bank_coding_memory_controls.reset_event_no,excluded.reset_event_no),
      reset_at=excluded.reset_at,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
  insert into public.audit_events(company_id,actor_user_id,action,entity_type,entity_id,details)
    values(_company_id,auth.uid(),'bank_coding_memory.reset','bank_coding_history',_history_id,
      jsonb_build_object('reset_id',_id,'bank_transaction_id',_bank_transaction_id,'bank_account_id',_bank,'currency_code',_currency,'through_event_no',_through::text));
  return _id;
end;
$$;
create function public.reset_bank_coding_memory_preference(_company_id uuid,_bank_transaction_id uuid,_history_id uuid,_request_id uuid)
returns uuid language sql security invoker set search_path='' as $$
  select private.reset_scoped_bank_coding_memory(_company_id,_bank_transaction_id,_history_id,_request_id)
$$;

-- Feedback retries also survive a later reset, reversal or unmatch. Fresh feedback
-- still requires eligible evidence, and revoked permissions still block replays.
create function private.record_retry_safe_bank_coding_feedback(_company_id uuid,_bank_transaction_id uuid,_history_id uuid,_state text,_request_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare _id uuid; _existing public.bank_coding_feedback%rowtype;
begin
  if auth.uid() is null or not private.mfa_requirement_met() or not public.is_company_member(_company_id)
    or not public.has_company_permission(_company_id,'banking.categorise') or not public.has_company_permission(_company_id,'banking.view') then
    raise exception 'Coding feedback permission required' using errcode='42501'; end if;
  if _state not in ('accepted','edited','rejected') or _state is null or _request_id is null or _history_id is null or _bank_transaction_id is null then
    raise exception 'Invalid coding feedback'; end if;
  perform pg_advisory_xact_lock_shared(hashtextextended(_company_id::text||':workflow-reset',0));
  perform pg_advisory_xact_lock(hashtextextended(_company_id::text||':'||auth.uid()::text||':'||_request_id::text||':coding-feedback',0));
  select * into _existing from public.bank_coding_feedback where company_id=_company_id and actor_id=auth.uid() and request_id=_request_id;
  if found then
    if _existing.bank_transaction_id is distinct from _bank_transaction_id or _existing.history_id is distinct from _history_id or _existing.state is distinct from _state then
      raise exception 'Feedback request ID already used with another payload'; end if;
    return _existing.id;
  end if;
  if not exists(select 1 from public.bank_transactions where id=_bank_transaction_id and company_id=_company_id)
    or not exists(select 1 from jsonb_array_elements(public.get_bank_coding_memory(_company_id,_bank_transaction_id)) r where (r->>'history_id')::uuid=_history_id) then
    raise exception 'Suggestion is not available for this company and transaction'; end if;
  insert into public.bank_coding_feedback(company_id,bank_transaction_id,history_id,actor_id,request_id,state)
    values(_company_id,_bank_transaction_id,_history_id,auth.uid(),_request_id,_state) returning id into _id;
  insert into public.audit_events(company_id,actor_user_id,action,entity_type,entity_id,details)
    values(_company_id,auth.uid(),'bank_coding_memory.feedback','bank_transaction',_bank_transaction_id,jsonb_build_object('feedback_id',_id,'state',_state,'history_id',_history_id));
  return _id;
end;
$$;
create or replace function public.record_bank_coding_feedback(_company_id uuid,_bank_transaction_id uuid,_history_id uuid,_state text,_request_id uuid)
returns uuid language sql security invoker set search_path='' as $$
  select private.record_retry_safe_bank_coding_feedback(_company_id,_bank_transaction_id,_history_id,_state,_request_id)
$$;
revoke all on function private.set_scoped_bank_coding_preference(uuid,uuid,uuid,boolean),private.reset_scoped_bank_coding_memory(uuid,uuid,uuid,uuid),
  private.record_retry_safe_bank_coding_feedback(uuid,uuid,uuid,text,uuid),public.reset_bank_coding_memory_preference(uuid,uuid,uuid,uuid) from public,anon;
grant execute on function private.set_scoped_bank_coding_preference(uuid,uuid,uuid,boolean),private.reset_scoped_bank_coding_memory(uuid,uuid,uuid,uuid),
  private.record_retry_safe_bank_coding_feedback(uuid,uuid,uuid,text,uuid),public.reset_bank_coding_memory_preference(uuid,uuid,uuid,uuid) to authenticated;

-- Only the established demo reset can purge receipts and controls, atomically with
-- the existing evidence cleanup. Ordinary resets never delete any of these records.
create or replace function private.reset_demo_company_with_coding_memory(_company uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not private.mfa_requirement_met() or not public.is_company_member(_company)
    or not public.has_company_permission(_company,'demo.reset') then
    raise exception 'Demo reset access denied' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(_company::text||':workflow-reset',0));
  if not exists(select 1 from public.companies where id=_company and is_demo) then
    raise exception 'Reset denied: company is not a demo company'; end if;
  delete from public.bank_coding_memory_resets where company_id=_company;
  delete from public.bank_coding_memory_controls where company_id=_company;
  delete from public.bank_coding_feedback where company_id=_company;
  delete from public.bank_coding_memory_preferences where company_id=_company;
  delete from public.bank_coding_events where company_id=_company;
  perform private.reset_demo_company_before_coding_memory(_company);
end;
$$;
notify pgrst,'reload schema';
