-- LinkBooks Accounting reconciliation case tracking (Batch 4).
-- A case is NOT a journal approval, a posted correction, or verified resolution.
-- Direct client DML is denied; changes use one version-checked, permissioned RPC.
create table public.reconciliation_review_cases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  source_type text not null check (source_type in (
    'ledger', 'fx_realised', 'fx_revaluation', 'deferrals', 'payroll', 'fixed_assets'
  )),
  finding_fingerprint text not null check (finding_fingerprint ~ '^f[0-9a-f]{32}$'),
  severity text not null check (severity in ('error','warning')),
  title text not null check (char_length(title) between 1 and 220),
  detail text not null check (char_length(detail) between 1 and 2000),
  source_reference text check (source_reference is null or char_length(source_reference) <= 180),
  journal_id uuid references public.journals(id) on delete restrict,
  status text not null default 'open' check (status in ('open','in_review','blocked')),
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (company_id, source_type, finding_fingerprint)
);
create index reconciliation_review_cases_queue
  on public.reconciliation_review_cases(company_id, updated_at desc, id desc);
create index reconciliation_review_cases_assignees
  on public.reconciliation_review_cases(company_id, assigned_to, status);

create table public.reconciliation_review_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  case_id uuid not null references public.reconciliation_review_cases(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in ('open','assign','comment','status')),
  note text not null default '' check (char_length(note) <= 2000),
  old_state jsonb,
  new_state jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);
create index reconciliation_review_events_case
  on public.reconciliation_review_events(company_id, case_id, created_at desc, id desc);

alter table public.reconciliation_review_cases enable row level security;
alter table public.reconciliation_review_events enable row level security;
revoke all on public.reconciliation_review_cases from public, anon, authenticated;
revoke all on public.reconciliation_review_events from public, anon, authenticated;
grant select on public.reconciliation_review_cases to authenticated;
grant select on public.reconciliation_review_events to authenticated;

create policy reconciliation_review_cases_read on public.reconciliation_review_cases
  for select to authenticated using (
    (select auth.uid()) is not null
    and (select private.mfa_requirement_met())
    and public.is_company_member(company_id)
    and public.has_company_permission(company_id, 'accounting.view')
  );
create policy reconciliation_review_events_read on public.reconciliation_review_events
  for select to authenticated using (
    (select auth.uid()) is not null
    and (select private.mfa_requirement_met())
    and public.is_company_member(company_id)
    and public.has_company_permission(company_id, 'accounting.view')
  );

create function public.save_reconciliation_review_case(
  _company_id uuid,
  _source_type text,
  _fingerprint text,
  _action text,
  _title text default null,
  _detail text default null,
  _severity text default null,
  _source_reference text default null,
  _journal_id uuid default null,
  _assigned_to uuid default null,
  _status text default null,
  _note text default '',
  _expected_version integer default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  _actor uuid := (select auth.uid());
  _case public.reconciliation_review_cases%rowtype;
  _before jsonb;
  _note_trim text := pg_catalog.btrim(coalesce(_note,''));
begin
  if _actor is null or not private.mfa_requirement_met()
    or not public.is_company_member(_company_id)
    or not public.has_company_permission(_company_id,'accounting.view')
    or not public.has_company_permission(_company_id,'accounting.post')
  then
    raise exception 'Accounting review management requires an authenticated, authorised user'
      using errcode='42501';
  end if;
  if _source_type not in ('ledger','fx_realised','fx_revaluation','deferrals','payroll','fixed_assets')
     or _fingerprint is null or _fingerprint !~ '^f[0-9a-f]{32}$'
     or _action not in ('open','assign','comment','status') then
    raise exception 'Invalid reconciliation review source or action';
  end if;
  if pg_catalog.char_length(_note_trim) > 2000 then
    raise exception 'Review comments must not exceed 2000 characters';
  end if;

  if _action = 'open' then
    if _expected_version is not null or _assigned_to is not null or _status is not null
      or _title is null or pg_catalog.char_length(pg_catalog.btrim(_title)) not between 1 and 220
      or _detail is null or pg_catalog.char_length(pg_catalog.btrim(_detail)) not between 1 and 2000
      or _severity not in ('error','warning')
      or (_source_reference is not null and pg_catalog.char_length(_source_reference) > 180)
    then
      raise exception 'New reconciliation cases require valid finding evidence and no existing version';
    end if;
    if _journal_id is not null and not exists (
      select 1 from public.journals j
      where j.id = _journal_id and j.company_id = _company_id
    ) then
      raise exception 'Finding journal does not belong to this organisation' using errcode='42501';
    end if;
    insert into public.reconciliation_review_cases
      (company_id,source_type,finding_fingerprint,severity,title,detail,
       source_reference,journal_id,created_by,updated_by)
    values (_company_id,_source_type,_fingerprint,_severity,
      pg_catalog.btrim(_title),pg_catalog.btrim(_detail),
      _source_reference,_journal_id,_actor,_actor)
    returning * into _case;
    _before := null;
  else
    if _expected_version is null or _expected_version < 1
       or _title is not null or _detail is not null or _severity is not null
       or _journal_id is not null or _source_reference is not null then
      raise exception 'Existing cases require the current version; source evidence cannot be rewritten';
    end if;
    select * into _case from public.reconciliation_review_cases
    where company_id=_company_id and source_type=_source_type
      and finding_fingerprint=_fingerprint
    for update;
    if not found then raise exception 'Reconciliation review not found in this organisation'; end if;
    if _case.version <> _expected_version then
      raise exception 'Review was changed by another user. Refresh before continuing'
        using errcode='40001';
    end if;
    _before := pg_catalog.to_jsonb(_case);
    if _action = 'assign' then
      if _assigned_to is null or not exists (
        select 1 from public.company_members m
        where m.company_id=_company_id and m.user_id=_assigned_to
          and m.status::text='active'
          and (
            m.role::text='owner'
            or (
              (
                exists (select 1 from public.role_permissions rp
                  where rp.role=m.role and rp.permission='accounting.view')
                or exists (select 1 from public.member_permission_adjustments a
                  where a.company_id=_company_id and a.user_id=m.user_id
                    and a.permission='accounting.view' and a.effect='grant')
              )
              and not exists (select 1 from public.member_permission_adjustments d
                where d.company_id=_company_id and d.user_id=m.user_id
                  and d.permission='accounting.view' and d.effect='deny')
            )
          )
      ) then raise exception 'Choose an active reviewer in this organisation'; end if;
      update public.reconciliation_review_cases
        set assigned_to=_assigned_to, version=version+1,
          updated_by=_actor,updated_at=clock_timestamp()
      where id=_case.id returning * into _case;
    elsif _action = 'comment' then
      if pg_catalog.char_length(_note_trim) < 2 then
        raise exception 'Enter a comment of at least two characters';
      end if;
      update public.reconciliation_review_cases
        set version=version+1,updated_by=_actor,updated_at=clock_timestamp()
      where id=_case.id returning * into _case;
    else
      if _status not in ('open','in_review','blocked') or _status=_case.status then
        raise exception 'Choose a different operational review status';
      end if;
      if pg_catalog.char_length(_note_trim) < 5 then
        raise exception 'Explain a review status change in at least five characters';
      end if;
      update public.reconciliation_review_cases
        set status=_status,version=version+1,updated_by=_actor,
          updated_at=clock_timestamp()
      where id=_case.id returning * into _case;
    end if;
  end if;

  insert into public.reconciliation_review_events
    (company_id,case_id,actor_id,action,note,old_state,new_state)
  values (_company_id,_case.id,_actor,_action,_note_trim,_before,pg_catalog.to_jsonb(_case));

  return pg_catalog.jsonb_build_object(
    'id',_case.id,'status',_case.status,'version',_case.version,
    'assigned_to',_case.assigned_to,'updated_at',_case.updated_at
  );
end $$;

-- Explicit API grants are needed on current Supabase Data API configurations.
revoke all on function public.save_reconciliation_review_case(
  uuid,text,text,text,text,text,text,text,uuid,uuid,text,text,integer
) from public, anon, authenticated;
grant execute on function public.save_reconciliation_review_case(
  uuid,text,text,text,text,text,text,text,uuid,uuid,text,text,integer
) to authenticated;
comment on table public.reconciliation_review_cases is
  'Operational tracking only. No verified resolution, accounting approval or journal posting.';
