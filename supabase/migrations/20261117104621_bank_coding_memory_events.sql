-- Coding Memory: authoritative posted-event evidence; legacy counters are not backfilled.
-- No ledger writes. Trigger privilege is needed because clients cannot forge learning events.
create unique index bank_coding_history_id_company_unique on public.bank_coding_history(id, company_id);

create table public.bank_coding_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  history_id uuid not null,
  bank_transaction_id uuid not null references public.bank_transactions(id) on delete restrict,
  bank_account_id uuid not null references public.bank_accounts(id) on delete restrict,
  journal_id uuid not null references public.journals(id) on delete restrict,
  currency_code text not null,
  amount_minor bigint not null check(amount_minor <> 0),
  allocations jsonb not null check(jsonb_typeof(allocations) = 'array'),
  approved_by uuid not null references auth.users(id) on delete restrict,
  approved_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key(history_id, company_id) references public.bank_coding_history(id, company_id) on delete restrict,
  unique(company_id, journal_id)
);
create index bank_coding_events_history on public.bank_coding_events(company_id, bank_account_id, history_id);
create index bank_coding_events_transaction on public.bank_coding_events(company_id, bank_transaction_id);

create table public.bank_coding_memory_preferences (
  history_id uuid primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  enabled boolean not null default true,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default clock_timestamp(),
  foreign key(history_id, company_id) references public.bank_coding_history(id, company_id) on delete restrict
);
create index bank_coding_memory_preferences_company on public.bank_coding_memory_preferences(company_id);

create table public.bank_coding_feedback (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  bank_transaction_id uuid not null references public.bank_transactions(id) on delete restrict,
  history_id uuid not null,
  actor_id uuid not null references auth.users(id),
  request_id uuid not null,
  journal_id uuid references public.journals(id) on delete restrict,
  state text not null check(state in ('accepted','edited','rejected')),
  created_at timestamptz not null default clock_timestamp(),
  foreign key(history_id, company_id) references public.bank_coding_history(id, company_id) on delete restrict,
  unique(company_id, actor_id, request_id)
);
create index bank_coding_feedback_transaction on public.bank_coding_feedback(company_id, bank_transaction_id, created_at desc);

alter table public.bank_coding_events enable row level security;
alter table public.bank_coding_memory_preferences enable row level security;
alter table public.bank_coding_feedback enable row level security;
revoke all on public.bank_coding_events, public.bank_coding_memory_preferences, public.bank_coding_feedback from public, anon, authenticated;
grant select on public.bank_coding_events, public.bank_coding_memory_preferences, public.bank_coding_feedback to authenticated;
grant insert, update on public.bank_coding_memory_preferences to authenticated;

create policy coding_events_read on public.bank_coding_events for select to authenticated
using ((select private.mfa_requirement_met()) and public.is_company_member(company_id) and public.has_company_permission(company_id,'banking.view'));
create policy coding_preferences_read on public.bank_coding_memory_preferences for select to authenticated
using ((select private.mfa_requirement_met()) and public.is_company_member(company_id) and public.has_company_permission(company_id,'banking.view'));
create policy coding_preferences_insert on public.bank_coding_memory_preferences for insert to authenticated
with check ((select private.mfa_requirement_met()) and public.is_company_member(company_id) and public.has_company_permission(company_id,'banking.categorise') and public.has_company_permission(company_id,'banking.view'));
create policy coding_preferences_update on public.bank_coding_memory_preferences for update to authenticated
using ((select private.mfa_requirement_met()) and public.is_company_member(company_id) and public.has_company_permission(company_id,'banking.categorise') and public.has_company_permission(company_id,'banking.view'))
with check ((select private.mfa_requirement_met()) and public.is_company_member(company_id) and public.has_company_permission(company_id,'banking.categorise') and public.has_company_permission(company_id,'banking.view'));
create policy coding_feedback_read on public.bank_coding_feedback for select to authenticated
using ((select private.mfa_requirement_met()) and public.is_company_member(company_id) and public.has_company_permission(company_id,'banking.view'));

create function private.capture_bank_coding_event() returns trigger language plpgsql security definer set search_path='' as $$
declare
  _txn public.bank_transactions%rowtype;
  _bank public.bank_accounts%rowtype;
  _journal public.journals%rowtype;
  _line public.journal_lines%rowtype;
  _offset uuid; _history uuid; _event uuid; _payee text; _allocations jsonb; _selected public.bank_coding_feedback%rowtype; _feedback_state text;
begin
  select * into _line from public.journal_lines where id=new.journal_line_id;
  select * into _journal from public.journals where id=_line.journal_id;
  -- Invoice/payment matching is not a new bank coding decision.
  if _journal.source_type::text <> 'bank_transaction' then return new; end if;
  if auth.uid() is null or not private.mfa_requirement_met()
    or not public.is_company_member(new.company_id)
    or not public.has_company_permission(new.company_id,'banking.categorise') then
    -- Reconciliation-only users retain their existing linking workflow, but cannot teach memory.
    return new;
  end if;
  select * into _txn from public.bank_transactions where id=new.bank_transaction_id and company_id=new.company_id;
  select * into _bank from public.bank_accounts where id=_txn.bank_account_id and company_id=new.company_id;
  if _txn.id is null or _bank.id is null or _line.company_id<>new.company_id
    or _journal.company_id<>new.company_id or _journal.source_id is distinct from _txn.id
    or _journal.status::text<>'posted' or _journal.reversed_by_journal_id is not null
    or _journal.reverses_journal_id is not null or _line.account_id<>_bank.gl_account_id
    or (_line.debit_minor-_line.credit_minor)<>_txn.amount_minor
    or _journal.currency_code::text<>_bank.currency_code::text
    or _txn.amount_minor=0 or _txn.status::text='excluded' then
    raise exception 'Coding evidence does not match the posted bank transaction';
  end if;
  -- Protect source facts against concurrent reversal until link/event commit.
  perform 1 from public.journals where id=_journal.id for share;
  select * into _journal from public.journals where id=_journal.id;
  if _journal.reversed_by_journal_id is not null or _journal.status::text<>'posted' then
    raise exception 'Coding journal is no longer posted';
  end if;
  if exists(select 1 from public.journal_lines l join public.accounts a on a.id=l.account_id
    where l.journal_id=_journal.id and (l.company_id<>new.company_id or a.company_id<>new.company_id)) then
    raise exception 'Cross-company coding allocation';
  end if;
  select l.account_id into _offset from public.journal_lines l join public.accounts a on a.id=l.account_id
    where l.journal_id=_journal.id and l.account_id<>_bank.gl_account_id
      and a.company_id=new.company_id and a.is_active and a.is_postable and not coalesce(a.is_control,false) and a.archived_at is null
    order by greatest(l.debit_minor,l.credit_minor) desc,l.line_no,l.id limit 1;
  if _offset is null then return new; end if;
  _payee:=left(trim(regexp_replace(regexp_replace(lower(coalesce(_txn.description,'')),'[^a-z0-9\s]',' ','g'),'\s+',' ','g')),120);
  if _payee='' then return new; end if;
  select jsonb_agg(jsonb_build_object('account_id',l.account_id,'debit_minor',l.debit_minor::text,'credit_minor',l.credit_minor::text) order by l.line_no)
    into _allocations from public.journal_lines l where l.journal_id=_journal.id and l.account_id<>_bank.gl_account_id;
  insert into public.bank_coding_history(company_id,payee_normalized,description_sample,offset_account_id,direction,times_used)
    values(new.company_id,_payee,left(_txn.description,500),_offset,case when _txn.amount_minor>0 then 'in' else 'out' end,1)
    on conflict(company_id,payee_normalized,offset_account_id,direction) do nothing;
  select id into _history from public.bank_coding_history where company_id=new.company_id and payee_normalized=_payee
    and offset_account_id=_offset and direction=case when _txn.amount_minor>0 then 'in' else 'out' end;
  insert into public.bank_coding_events(company_id,history_id,bank_transaction_id,bank_account_id,journal_id,currency_code,amount_minor,allocations,approved_by,approved_at)
    values(new.company_id,_history,_txn.id,_bank.id,_journal.id,_journal.currency_code,_txn.amount_minor,_allocations,coalesce(_journal.posted_by,_journal.created_by),coalesce(_journal.posted_at,clock_timestamp()))
    on conflict(company_id,journal_id) do nothing returning id into _event;
  if _event is not null then
    -- Complete account-level feedback only after a linked posting exists.
    select * into _selected from public.bank_coding_feedback where company_id=new.company_id
      and bank_transaction_id=_txn.id and actor_id=auth.uid() order by created_at desc,id desc limit 1;
    if _selected.id is not null and _selected.state='accepted' and _selected.journal_id is null then
      select case when h.offset_account_id=_offset and
        (select count(distinct l.account_id) from public.journal_lines l join public.accounts a on a.id=l.account_id
          where l.journal_id=_journal.id and l.account_id<>_bank.gl_account_id and not coalesce(a.is_control,false))=1
        then 'accepted' else 'edited' end into _feedback_state from public.bank_coding_history h where h.id=_selected.history_id and h.company_id=new.company_id;
      insert into public.bank_coding_feedback(company_id,bank_transaction_id,history_id,actor_id,request_id,journal_id,state)
        values(new.company_id,_txn.id,_selected.history_id,auth.uid(),_journal.id,_journal.id,_feedback_state)
        on conflict(company_id,actor_id,request_id) do nothing;
    end if;
    insert into public.audit_events(company_id,actor_user_id,action,entity_type,entity_id,details)
      values(new.company_id,auth.uid(),'bank_coding_memory.learned','bank_transaction',_txn.id,jsonb_build_object('event_id',_event,'journal_id',_journal.id));
  end if;
  return new;
end;
$$;
revoke all on function private.capture_bank_coding_event() from public,anon,authenticated;
create trigger capture_bank_coding_event after insert on public.reconciliation_links for each row execute function private.capture_bank_coding_event();

create function private.stamp_bank_coding_preference() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  new.updated_by:=auth.uid(); new.updated_at:=clock_timestamp(); return new;
end;
$$;
revoke all on function private.stamp_bank_coding_preference() from public,anon,authenticated;
create trigger stamp_bank_coding_preference before insert or update on public.bank_coding_memory_preferences for each row execute function private.stamp_bank_coding_preference();

create function private.audit_bank_coding_preference() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not private.mfa_requirement_met() or not public.is_company_member(new.company_id)
    or not public.has_company_permission(new.company_id,'banking.categorise') or not public.has_company_permission(new.company_id,'banking.view') then
    raise exception 'Coding preference permission required' using errcode='42501';
  end if;
  if tg_op='UPDATE' and (new.history_id<>old.history_id or new.company_id<>old.company_id) then raise exception 'Preference identity is immutable'; end if;
  if tg_op='INSERT' or new.enabled is distinct from old.enabled then
    insert into public.audit_events(company_id,actor_user_id,action,entity_type,entity_id,details)
      values(new.company_id,auth.uid(),'bank_coding_memory.preference','bank_coding_history',new.history_id,jsonb_build_object('enabled',new.enabled));
  end if;
  return new;
end;
$$;
revoke all on function private.audit_bank_coding_preference() from public,anon,authenticated;
create trigger audit_bank_coding_preference after insert or update on public.bank_coding_memory_preferences for each row execute function private.audit_bank_coding_preference();

-- All data reads execute under caller RLS. Revoked links/reversed journals never contribute.
create function public.get_bank_coding_memory(_company_id uuid,_bank_transaction_id uuid)
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
      a.code as account_code,a.name as account_name,coalesce(p.enabled,true) as enabled,
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
    where e.company_id=_company_id and e.bank_account_id=_txn.bank_account_id
      and e.currency_code=b.currency_code::text and b.is_active and a.id<>b.gl_account_id
      and j.status::text='posted' and j.source_type::text='bank_transaction' and j.source_id=t.id
      and j.currency_code::text=e.currency_code and jl.account_id=b.gl_account_id and (jl.debit_minor-jl.credit_minor)=e.amount_minor
      and j.reversed_by_journal_id is null and j.reverses_journal_id is null
      and t.status::text in ('matched','reconciled') and t.amount_minor=e.amount_minor
      and a.is_active and a.is_postable and not coalesce(a.is_control,false) and a.archived_at is null
      and h.direction=case when _txn.amount_minor>=0 then 'in' else 'out' end
      and _payee<>'' and h.payee_normalized<>'' and strpos(' '||_payee||' ',' '||h.payee_normalized||' ')>0
    group by h.id,a.code,a.name,p.enabled
    order by (h.payee_normalized=_payee) desc,count(*) desc,h.id limit 101
  ) r;
  return _result;
end;
$$;
revoke all on function public.get_bank_coding_memory(uuid,uuid) from public,anon;
grant execute on function public.get_bank_coding_memory(uuid,uuid) to authenticated;

create function public.record_bank_coding_feedback(_company_id uuid,_bank_transaction_id uuid,_history_id uuid,_state text,_request_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare _id uuid; _existing public.bank_coding_feedback%rowtype;
begin
  if auth.uid() is null or not private.mfa_requirement_met() or not public.is_company_member(_company_id)
    or not public.has_company_permission(_company_id,'banking.categorise') or not public.has_company_permission(_company_id,'banking.view') then
    raise exception 'Coding feedback permission required' using errcode='42501'; end if;
  if _state not in ('accepted','edited','rejected') or _state is null or _request_id is null then raise exception 'Invalid coding feedback'; end if;
  if not exists(select 1 from public.bank_transactions where id=_bank_transaction_id and company_id=_company_id)
    or not exists(select 1 from jsonb_array_elements(public.get_bank_coding_memory(_company_id,_bank_transaction_id)) r where (r->>'history_id')::uuid=_history_id) then
    raise exception 'Suggestion is not available for this company and transaction'; end if;
  insert into public.bank_coding_feedback(company_id,bank_transaction_id,history_id,actor_id,request_id,state)
    values(_company_id,_bank_transaction_id,_history_id,auth.uid(),_request_id,_state)
    on conflict(company_id,actor_id,request_id) do nothing returning id into _id;
  if _id is null then
    select * into _existing from public.bank_coding_feedback where company_id=_company_id and actor_id=auth.uid() and request_id=_request_id;
    if _existing.bank_transaction_id<>_bank_transaction_id or _existing.history_id<>_history_id or _existing.state<>_state then raise exception 'Feedback request ID already used with another payload'; end if;
    return _existing.id;
  end if;
  insert into public.audit_events(company_id,actor_user_id,action,entity_type,entity_id,details)
    values(_company_id,auth.uid(),'bank_coding_memory.feedback','bank_transaction',_bank_transaction_id,jsonb_build_object('feedback_id',_id,'state',_state,'history_id',_history_id));
  return _id;
end;
$$;
revoke all on function public.record_bank_coding_feedback(uuid,uuid,uuid,text,uuid) from public,anon;
grant execute on function public.record_bank_coding_feedback(uuid,uuid,uuid,text,uuid) to authenticated;

-- Old clients may still call this; disabling it prevents unaudited aggregate inflation.
revoke execute on function public.bump_bank_coding_history(uuid,text,text,uuid,text) from public,anon,authenticated;
revoke insert,update,delete on public.bank_coding_history from authenticated;
comment on table public.bank_coding_events is 'Immutable coding evidence captured after a posted bank journal is linked. Live eligibility is rechecked, never inferred from aggregate legacy counters.';
comment on table public.bank_coding_feedback is 'User feedback only; accepting/editing a suggestion never approves or posts an accounting entry.';

create function public.set_bank_coding_memory_preference(_company_id uuid,_bank_transaction_id uuid,_history_id uuid,_enabled boolean)
returns uuid language plpgsql security invoker set search_path='' as $$
begin
  if _enabled is null then raise exception 'Enabled is required'; end if;
  if not exists(select 1 from jsonb_array_elements(public.get_bank_coding_memory(_company_id,_bank_transaction_id)) r where (r->>'history_id')::uuid=_history_id) then
    raise exception 'Preference is not available for this transaction'; end if;
  insert into public.bank_coding_memory_preferences(history_id,company_id,enabled,updated_by)
    values(_history_id,_company_id,_enabled,auth.uid())
    on conflict(history_id) do update set enabled=excluded.enabled where bank_coding_memory_preferences.enabled is distinct from excluded.enabled;
  return _history_id;
end;
$$;
revoke all on function public.set_bank_coding_memory_preference(uuid,uuid,uuid,boolean) from public,anon;
grant execute on function public.set_bank_coding_memory_preference(uuid,uuid,uuid,boolean) to authenticated;
