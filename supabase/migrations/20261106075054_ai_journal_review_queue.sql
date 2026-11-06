-- AI journal review queue. Review sign-off is NOT a journal approval or posting.
-- All changes use one version-checked SQL transaction with immutable event history.
create table if not exists public.ai_journal_review_cases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  journal_id uuid not null references public.journals(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  assigned_to uuid references auth.users(id) on delete set null,
  status text not null default 'open'
    check (status in ('open','assigned','reviewed','reopened')),
  version integer not null default 1 check (version > 0),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id,journal_id),
  check (assigned_to is null or assigned_to <> created_by),
  check ((status = 'reviewed') = (reviewed_at is not null and reviewed_by is not null))
);
create index if not exists ai_journal_review_cases_recent_idx
  on public.ai_journal_review_cases (company_id,updated_at desc,id desc);
create index if not exists ai_journal_review_cases_assignee_idx
  on public.ai_journal_review_cases (company_id,assigned_to,status);

create table if not exists public.ai_journal_review_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  case_id uuid not null references public.ai_journal_review_cases(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in ('open','assign','comment','sign_off','reopen')),
  note text not null default '' check (char_length(note) <= 2000),
  previous_status text,
  new_status text not null,
  assigned_to uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists ai_journal_review_events_recent_idx
  on public.ai_journal_review_events (company_id,case_id,created_at desc,id desc);

alter table public.ai_journal_review_cases enable row level security;
alter table public.ai_journal_review_events enable row level security;

create policy ai_journal_review_cases_read on public.ai_journal_review_cases
  for select to authenticated using (
    public.is_company_member(company_id)
    and public.has_company_permission(company_id,'ai.use')
    and public.has_company_permission(company_id,'reports.view')
  );
create policy ai_journal_review_events_read on public.ai_journal_review_events
  for select to authenticated using (
    public.is_company_member(company_id)
    and public.has_company_permission(company_id,'ai.use')
    and public.has_company_permission(company_id,'reports.view')
  );
create policy mfa_aal2_required on public.ai_journal_review_cases
  as restrictive for all to authenticated
  using ((select private.mfa_requirement_met()))
  with check ((select private.mfa_requirement_met()));
create policy mfa_aal2_required on public.ai_journal_review_events
  as restrictive for all to authenticated
  using ((select private.mfa_requirement_met()))
  with check ((select private.mfa_requirement_met()));

-- No client-side direct INSERT/UPDATE/DELETE, including through inherited grants.
revoke all on public.ai_journal_review_cases from public,anon,authenticated;
revoke all on public.ai_journal_review_events from public,anon,authenticated;
grant select on public.ai_journal_review_cases to authenticated;
grant select on public.ai_journal_review_events to authenticated;

create or replace function public.save_ai_journal_review(
  _company_id uuid,
  _journal_id uuid,
  _case_id uuid,
  _action text,
  _note text default '',
  _assigned_to uuid default null,
  _expected_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  _actor uuid := auth.uid();
  _record public.ai_journal_review_cases%rowtype;
  _before text;
  _eligible boolean;
  _message text := btrim(coalesce(_note,''));
begin
  if _actor is null or not private.mfa_requirement_met() then
    raise exception 'Authentication and required MFA are needed for AI review.';
  end if;
  if not public.is_company_member(_company_id)
    or not public.has_company_permission(_company_id,'ai.use')
    or not public.has_company_permission(_company_id,'reports.view') then
    raise exception 'AI and reporting access is required.';
  end if;
  if _action not in ('open','assign','comment','sign_off','reopen') then
    raise exception 'Unsupported AI review action.';
  end if;
  if char_length(_message) > 2000 then
    raise exception 'Review note exceeds 2000 characters.';
  end if;
  if not exists (
    select 1 from public.journals j
    where j.id = _journal_id and j.company_id = _company_id and j.status::text = 'posted'
  ) then
    raise exception 'Only an accessible posted journal can be reviewed.';
  end if;

  if _action = 'open' then
    if _case_id is not null or _expected_version is not null or _assigned_to is not null then
      raise exception 'New reviews must not specify a case, assignee, or version.';
    end if;
    insert into public.ai_journal_review_cases (company_id,journal_id,created_by)
      values (_company_id,_journal_id,_actor)
      returning * into _record;
    insert into public.ai_journal_review_events
      (company_id,case_id,actor_id,action,note,previous_status,new_status)
      values (_company_id,_record.id,_actor,'open',_message,null,'open');
    return jsonb_build_object('id',_record.id,'status',_record.status,'version',_record.version);
  end if;

  if _case_id is null or _expected_version is null or _expected_version < 1 then
    raise exception 'Select an existing review and current version.';
  end if;
  select * into _record from public.ai_journal_review_cases
    where id = _case_id and company_id = _company_id and journal_id = _journal_id
    for update;
  if not found then raise exception 'Review case not found for this organisation and journal.'; end if;
  if _record.version <> _expected_version then
    raise exception 'Review was updated by another user. Refresh before trying again.';
  end if;
  _before := _record.status;

  if _action = 'assign' then
    if not public.has_company_permission(_company_id,'ai.apply_suggestion')
      or not public.has_company_permission(_company_id,'members.view') then
      raise exception 'Reviewer management permission required.';
    end if;
    if _record.status = 'reviewed' then
      raise exception 'Reopen the completed review before changing the reviewer.';
    end if;
    if _assigned_to is null or _assigned_to = _record.created_by then
      raise exception 'Choose another active eligible reviewer; self-review is prohibited.';
    end if;
    select exists(
      select 1
        from public.company_members m
       where m.company_id = _company_id and m.user_id = _assigned_to
         and m.status::text = 'active'
         and (
           m.role::text = 'owner'
           or (
             (
               exists (select 1 from public.role_permissions rp
                 where rp.role = m.role and rp.permission = 'ai.apply_suggestion')
               or exists (select 1 from public.member_permission_adjustments a
                 where a.company_id = _company_id and a.user_id = m.user_id
                   and a.permission = 'ai.apply_suggestion' and a.effect = 'grant')
             )
             and not exists (select 1 from public.member_permission_adjustments d
               where d.company_id = _company_id and d.user_id = m.user_id
                 and d.permission = 'ai.apply_suggestion' and d.effect = 'deny')
           )
         )
    ) into _eligible;
    if not _eligible then raise exception 'Selected reviewer lacks active AI review permission.'; end if;
    update public.ai_journal_review_cases
      set assigned_to = _assigned_to,status = 'assigned',reviewed_by = null,
          reviewed_at = null,version = version+1,updated_at = now()
      where id = _record.id returning * into _record;
  elsif _action = 'sign_off' then
    if not public.has_company_permission(_company_id,'ai.apply_suggestion')
      or _record.assigned_to is distinct from _actor
      or _record.created_by = _actor then
      raise exception 'Only the independent assigned reviewer may sign off this review.';
    end if;
    if _record.status not in ('assigned','reopened') then
      raise exception 'The review must be assigned or reopened before sign-off.';
    end if;
    if char_length(_message) < 10 then raise exception 'Provide a review rationale of at least 10 characters.'; end if;
    update public.ai_journal_review_cases
      set status='reviewed',reviewed_by=_actor,reviewed_at=now(),
          version=version+1,updated_at=now()
      where id=_record.id returning * into _record;
  elsif _action = 'reopen' then
    if not public.has_company_permission(_company_id,'ai.apply_suggestion')
       or _record.status <> 'reviewed' then
       raise exception 'A reviewer with permission may reopen a completed review.';
    end if;
    if char_length(_message) < 10 then raise exception 'Give a reason for reopening (10 or more characters).'; end if;
    update public.ai_journal_review_cases
      set status='reopened',reviewed_by=null,reviewed_at=null,
          version=version+1,updated_at=now()
      where id=_record.id returning * into _record;
  else
    if char_length(_message) < 2 then raise exception 'Enter a comment of at least 2 characters.'; end if;
    update public.ai_journal_review_cases
      set version=version+1,updated_at=now()
      where id=_record.id returning * into _record;
  end if;
  insert into public.ai_journal_review_events
    (company_id,case_id,actor_id,action,note,previous_status,new_status,assigned_to)
    values (_company_id,_record.id,_actor,_action,_message,_before,_record.status,_record.assigned_to);
  return jsonb_build_object('id',_record.id,'status',_record.status,'version',_record.version);
end;
$$;
revoke all on function public.save_ai_journal_review(uuid,uuid,uuid,text,text,uuid,integer)
  from public,anon,authenticated;
grant execute on function public.save_ai_journal_review(uuid,uuid,uuid,text,text,uuid,integer)
  to authenticated;

-- No trigger or RPC on this queue can post, reverse, correct, or approve a journal.
