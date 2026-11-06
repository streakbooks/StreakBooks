-- Accounting reconciliation independent review & evidence (Batch 5).
-- Depends on 20261106233000_reconciliation_review_cases.sql.
-- A completed independent REVIEW is not verified resolution or journal approval.
-- No source ledger writes and no trusted re-audit proof can be asserted by this RPC.
alter table public.reconciliation_review_cases
  drop constraint if exists reconciliation_review_cases_status_check;
alter table public.reconciliation_review_cases
  add constraint reconciliation_review_cases_status_check
    check (status in ('open','in_review','blocked','ready_for_review','reviewed')),
  add column evidence_url text
    check (evidence_url is null or (
      char_length(evidence_url) between 9 and 500
      and evidence_url ~ '^https://[^[:space:][:cntrl:]]+$'
    )),
  add column evidence_added_by uuid references auth.users(id) on delete set null,
  add column evidence_added_at timestamptz,
  add column submitted_by uuid references auth.users(id) on delete restrict,
  add column submitted_at timestamptz,
  add column reviewed_by uuid references auth.users(id) on delete restrict,
  add column reviewed_at timestamptz,
  add constraint reconciliation_review_signoff_consistency check (
    (status not in ('ready_for_review','reviewed') or
      (submitted_by is not null and submitted_at is not null
        and evidence_url is not null and assigned_to is not null))
    and
    (status <> 'reviewed' or (
      reviewed_by is not null and reviewed_at is not null and
      reviewed_by = assigned_to and reviewed_by <> submitted_by and
      reviewed_by <> created_by
    ))
    and
    (status = 'reviewed' or (reviewed_by is null and reviewed_at is null))
    and
    (status in ('ready_for_review','reviewed') or
      (submitted_by is null and submitted_at is null))
  );

alter table public.reconciliation_review_events
  drop constraint if exists reconciliation_review_events_action_check;
alter table public.reconciliation_review_events
  add constraint reconciliation_review_events_action_check
  check (action in (
    'open','assign','comment','status','attach_evidence','submit','sign_off','reopen'
  ));

-- Restrict all updating paths, including the previously granted Batch-4 RPC,
-- from silently transitioning or reassigning a submitted/reviewed case.
create function private.guard_reconciliation_review_stage()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from old.id
     or new.company_id is distinct from old.company_id
     or new.source_type is distinct from old.source_type
     or new.finding_fingerprint is distinct from old.finding_fingerprint
     or new.severity is distinct from old.severity
     or new.title is distinct from old.title
     or new.detail is distinct from old.detail
     or new.source_reference is distinct from old.source_reference
     or new.journal_id is distinct from old.journal_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at
  then
    raise exception 'Original reconciliation finding evidence cannot be changed';
  end if;
  if old.status in ('ready_for_review','reviewed') then
    if new.assigned_to is distinct from old.assigned_to then
      raise exception 'Reopen the review before changing its assigned reviewer';
    end if;
    if old.status='ready_for_review' and
       new.status not in ('ready_for_review','reviewed','open') then
      raise exception 'Submitted review must be signed off or reopened';
    end if;
    if old.status='reviewed' and new.status not in ('reviewed','open') then
      raise exception 'Reviewed case must be reopened before changing status';
    end if;
    if new.status='open' and
       (new.submitted_by is not null or new.submitted_at is not null or
        new.reviewed_by is not null or new.reviewed_at is not null or
        new.evidence_url is not null) then
      raise exception 'A reopened review must clear its previous sign-off and evidence';
    end if;
    if new.status=old.status and (
       new.submitted_by is distinct from old.submitted_by or
       new.submitted_at is distinct from old.submitted_at or
       new.reviewed_by is distinct from old.reviewed_by or
       new.reviewed_at is distinct from old.reviewed_at or
       new.evidence_url is distinct from old.evidence_url
    ) then
      raise exception 'Submitted or reviewed evidence cannot be changed; reopen first';
    end if;
  end if;
  return new;
end $$;
create trigger reconciliation_review_stage_guard
before update on public.reconciliation_review_cases
for each row execute function private.guard_reconciliation_review_stage();

-- Strict server-reviewed workflow: records supporting evidence and reviewer
-- attestation, never a fabricated assertion that an exception was corrected.
create function public.progress_reconciliation_review_case(
  _company_id uuid,
  _case_id uuid,
  _action text,
  _expected_version integer,
  _note text default '',
  _evidence_url text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  _actor uuid := auth.uid();
  _case public.reconciliation_review_cases%rowtype;
  _before jsonb;
  _note_trim text := pg_catalog.btrim(coalesce(_note,''));
  _url text := nullif(pg_catalog.btrim(coalesce(_evidence_url,'')), '');
begin
  if _actor is null or not private.mfa_requirement_met()
    or not public.is_company_member(_company_id)
    or not public.has_company_permission(_company_id,'accounting.view')
    or not public.has_company_permission(_company_id,'accounting.post') then
    raise exception 'Accounting review access and required MFA are necessary'
      using errcode='42501';
  end if;
  if _action not in ('attach_evidence','submit','sign_off','reopen')
     or _action is null or _expected_version is null or _expected_version < 1 then
    raise exception 'Choose a supported review action and current version';
  end if;
  if pg_catalog.char_length(_note_trim) > 2000 then
    raise exception 'Review note exceeds 2000 characters';
  end if;
  if _url is not null and (
    pg_catalog.char_length(_url) > 500 or
    _url !~ '^https://[^[:space:][:cntrl:]]+$') then
    raise exception 'Supporting evidence must be a valid HTTPS reference, max 500 characters';
  end if;

  select * into _case from public.reconciliation_review_cases
    where id=_case_id and company_id=_company_id
    for update;
  if not found then
    raise exception 'Reconciliation review case does not belong to this organisation'
      using errcode='42501';
  end if;
  if _case.version <> _expected_version then
    raise exception 'Review was updated by another user. Reload before continuing'
      using errcode='40001';
  end if;
  _before := pg_catalog.to_jsonb(_case);

  if _action='attach_evidence' then
    if _case.status not in ('open','in_review','blocked') or _url is null
       or pg_catalog.char_length(_note_trim) < 3 then
      raise exception 'Attach an HTTPS evidence link and reason to an open review';
    end if;
    update public.reconciliation_review_cases
      set evidence_url=_url,evidence_added_by=_actor,
          evidence_added_at=clock_timestamp(),
          version=version+1,updated_by=_actor,updated_at=clock_timestamp()
      where id=_case.id returning * into _case;
  elsif _action='submit' then
    if _url is not null or _case.status <> 'in_review'
       or _case.evidence_url is null or _case.assigned_to is null
       or _case.assigned_to=_actor or
       not exists (
         select 1 from public.company_members m
          where m.company_id=_company_id and m.user_id=_case.assigned_to
            and m.status::text='active'
       ) or
       pg_catalog.char_length(_note_trim) < 10 then
      raise exception 'Assign an independent reviewer and attach evidence before submission';
    end if;
    update public.reconciliation_review_cases
      set status='ready_for_review',submitted_by=_actor,
          submitted_at=clock_timestamp(),
          version=version+1,updated_by=_actor,updated_at=clock_timestamp()
      where id=_case.id returning * into _case;
  elsif _action='sign_off' then
    if _url is not null or _case.status <> 'ready_for_review'
       or _case.assigned_to is distinct from _actor
       or _case.submitted_by=_actor or _case.created_by=_actor
       or _case.evidence_url is null or
       pg_catalog.char_length(_note_trim) < 10 then
      raise exception 'Independent assigned reviewer, source evidence, and conclusion required'
        using errcode='42501';
    end if;
    update public.reconciliation_review_cases
      set status='reviewed', reviewed_by=_actor,
          reviewed_at=clock_timestamp(),
          version=version+1,updated_by=_actor,updated_at=clock_timestamp()
      where id=_case.id returning * into _case;
  else
    if _url is not null or _case.status not in ('ready_for_review','reviewed')
       or pg_catalog.char_length(_note_trim) < 10 then
      raise exception 'Reopen requires a submitted or reviewed case and written reason';
    end if;
    update public.reconciliation_review_cases
      set status='open',submitted_by=null,submitted_at=null,
          reviewed_by=null,reviewed_at=null,
          evidence_url=null,evidence_added_by=null,evidence_added_at=null,
          version=version+1,updated_by=_actor,updated_at=clock_timestamp()
      where id=_case.id returning * into _case;
  end if;
  insert into public.reconciliation_review_events
    (company_id,case_id,actor_id,action,note,old_state,new_state)
  values (_company_id,_case.id,_actor,_action,_note_trim,
          _before,pg_catalog.to_jsonb(_case));
  return pg_catalog.jsonb_build_object(
    'id',_case.id,'status',_case.status,'version',_case.version,
    'assigned_to',_case.assigned_to,'updated_at',_case.updated_at,
    'evidence_url',_case.evidence_url,
    'submitted_by',_case.submitted_by,'reviewed_by',_case.reviewed_by
  );
end $$;

revoke all on function public.progress_reconciliation_review_case(uuid,uuid,text,integer,text,text)
 from public,anon,authenticated;
grant execute on function public.progress_reconciliation_review_case(uuid,uuid,text,integer,text,text)
 to authenticated;

comment on function public.progress_reconciliation_review_case(uuid,uuid,text,integer,text,text) is
 'Independent investigation review with HTTPS evidence and row-locked versions. Does not verify accounting remediation, post GL entries, or resolve findings.';
