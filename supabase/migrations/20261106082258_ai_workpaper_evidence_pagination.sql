-- Phase 8: complete, paginated, account-specific AI review evidence.
-- SECURITY INVOKER preserves all existing RLS rules and tenant membership checks.
-- No journal, workpaper, AI review, or audit event is ever modified here.
create index if not exists journal_lines_company_account_journal_idx
  on public.journal_lines (company_id, account_id, journal_id);

create or replace function public.list_ai_workpaper_evidence_page(
  _company_id uuid,
  _account_id uuid,
  _as_of date,
  _page integer default 0
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  _total bigint;
  _rows jsonb;
begin
  if (select auth.uid()) is null
     or not public.is_company_member(_company_id)
     or not public.has_company_permission(_company_id, 'accounting.view')
     or not public.has_company_permission(_company_id, 'ai.use')
     or not public.has_company_permission(_company_id, 'reports.view') then
    raise exception 'Accounting, AI and reporting permissions are required.';
  end if;

  if _page is null or _page < 0 or _page > 10000 then
    raise exception 'Invalid AI evidence page.';
  end if;
  if _as_of is null then
    raise exception 'A workpaper date is required.';
  end if;
  if not exists (
    select 1 from public.accounts a
    where a.id = _account_id and a.company_id = _company_id
      and a.is_postable = true
      and a.account_type::text in ('asset','liability','equity')
  ) then
    raise exception 'Select a postable balance-sheet account in the active company.';
  end if;

  -- Filter by the actual account's journal lines BEFORE pagination.
  -- EXISTS prevents journals containing multiple lines for this account from
  -- appearing twice, and avoids the old newest-100-company-cases truncation.
  select count(*) into _total
  from public.ai_journal_review_cases c
  join public.journals j on j.id = c.journal_id and j.company_id = c.company_id
  where c.company_id = _company_id
    and j.journal_date <= _as_of
    and exists (
      select 1 from public.journal_lines l
      where l.company_id = _company_id and l.journal_id = j.id
        and l.account_id = _account_id
    );

  select coalesce(jsonb_agg(to_jsonb(p) order by p.updated_at desc, p.review_id desc),'[]'::jsonb)
    into _rows
  from (
    select
      c.id as review_id,
      c.journal_id,
      c.status as review_status,
      c.reviewed_by,
      c.reviewed_at,
      c.updated_at,
      j.journal_number,
      j.journal_date,
      j.status::text as journal_status,
      j.source_type::text as source_type
    from public.ai_journal_review_cases c
    join public.journals j on j.id = c.journal_id and j.company_id = c.company_id
    where c.company_id = _company_id
      and j.journal_date <= _as_of
      and exists (
        select 1 from public.journal_lines l
        where l.company_id = _company_id and l.journal_id = j.id
          and l.account_id = _account_id
      )
    order by c.updated_at desc, c.id desc
    limit 25 offset (_page * 25)
  ) p;
  return jsonb_build_object('total',_total,'page',_page,'pageSize',25,'rows',_rows);
end;
$$;

revoke all on function public.list_ai_workpaper_evidence_page(uuid,uuid,date,integer)
  from public, anon, authenticated;
grant execute on function public.list_ai_workpaper_evidence_page(uuid,uuid,date,integer)
  to authenticated;
