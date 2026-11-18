-- Keep the bank/currency derived by each checked control stable until commit.
-- Row locks also prevent moving the target transaction to another bank between
-- scope derivation, eligibility checks and the watermark/preference write.


create or replace function private.set_scoped_bank_coding_preference(_company_id uuid,_bank_transaction_id uuid,_history_id uuid,_enabled boolean)
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
    where t.company_id=_company_id and t.id=_bank_transaction_id for share of t,b;
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

create or replace function private.reset_scoped_bank_coding_memory(_company_id uuid,_bank_transaction_id uuid,_history_id uuid,_request_id uuid)
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
    where t.company_id=_company_id and t.id=_bank_transaction_id for share of t,b;
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
