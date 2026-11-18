-- Carry the established MFA requirement onto tables introduced by merged branches.
-- Restrictive policies compose with, rather than replace, tenant and permission policies.
do $$ declare target text; begin
  foreach target in array array['document_email_inboxes','document_tags','document_attachment_tags',
    'document_attachment_versions','document_retention_settings','document_storage_cleanup_jobs',
    'firm_client_requests','hr_locations','pos_location_access','pos_registers','pos_register_sessions'] loop
    execute format('create policy merged_workflow_mfa on public.%I as restrictive for all to authenticated using ((select private.mfa_requirement_met())) with check ((select private.mfa_requirement_met()))',target);
  end loop;
end $$;

CREATE OR REPLACE FUNCTION private.pos_require_permission(_company_id uuid,_permission text)
RETURNS void LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF private.mfa_requirement_met() IS NOT TRUE OR auth.uid() IS NULL OR public.is_company_member(_company_id) IS NOT TRUE
    OR public.has_company_permission(_company_id,_permission) IS NOT TRUE THEN
   RAISE EXCEPTION 'POS permission denied' USING ERRCODE='42501';
 END IF;
END $$;

CREATE OR REPLACE FUNCTION private.pos_can_access_location(_company_id uuid,_location_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(private.mfa_requirement_met() AND auth.uid() IS NOT NULL AND public.is_company_member(_company_id)
 AND public.has_company_permission(_company_id,'pos.view') AND (
  public.has_company_permission(_company_id,'pos.settings.manage') OR EXISTS(
   SELECT 1 FROM public.pos_location_access a WHERE a.company_id=_company_id
    AND a.location_id=_location_id AND a.user_id=auth.uid())),false)
$$;

CREATE OR REPLACE FUNCTION public.purge_document_from_recycle_bin(
  _company_id uuid, _attachment_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  a public.document_attachments%ROWTYPE;
  objects text[];
  job_id uuid;
BEGIN
  IF private.mfa_requirement_met() IS NOT TRUE THEN
    RAISE EXCEPTION 'MFA verification required' USING ERRCODE='42501';
  END IF;
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to purge a document'; END IF;
  SELECT * INTO a FROM public.document_attachments
    WHERE company_id=_company_id AND id=_attachment_id FOR UPDATE;
  IF NOT FOUND
     OR NOT public.can_access_attachment(_company_id,a.entity_type,'manage')
     OR NOT public.can_access_attachment(_company_id,'company','manage') THEN
    RAISE EXCEPTION 'File not found or access denied';
  END IF;
  IF a.deleted_at IS NULL OR a.purge_after > now() OR a.retention_hold THEN
    RAISE EXCEPTION 'Retention period or protection prevents permanent deletion';
  END IF;
  IF a.entity_type='company' AND EXISTS (
    SELECT 1 FROM public.document_reviews r
    WHERE r.company_id=_company_id AND r.attachment_id=_attachment_id
      AND r.status IN ('ready','approved')
  ) THEN
    RAISE EXCEPTION 'Approved evidence must not be permanently purged';
  END IF;

  SELECT coalesce(array_agg(DISTINCT path), '{}'::text[]) INTO objects FROM (
    SELECT a.storage_path AS path WHERE a.storage_bucket='company-documents'
    UNION ALL
    SELECT v.storage_path AS path FROM public.document_attachment_versions v
      WHERE v.company_id=_company_id AND v.attachment_id=_attachment_id
  ) source WHERE path IS NOT NULL;
  IF coalesce(array_length(objects,1),0)>50 THEN
    RAISE EXCEPTION 'Too many Storage objects for a single cleanup request';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(objects) p WHERE
    p NOT LIKE (_company_id::text || '/' || a.entity_type || '/' || a.entity_id::text || '/%')
  ) THEN
    RAISE EXCEPTION 'Historical Storage path is outside this document';
  END IF;
  INSERT INTO public.document_storage_cleanup_jobs(
    company_id, original_attachment_id, storage_paths, requested_by, completed_at
  ) VALUES (_company_id, _attachment_id, objects, auth.uid(),
            CASE WHEN cardinality(objects)=0 THEN now() ELSE NULL END)
    RETURNING id INTO job_id;

  PERFORM set_config('linkbooks.document_purge','allowed',true);
  DELETE FROM public.document_attachments
    WHERE company_id=_company_id AND id=_attachment_id;
  PERFORM set_config('linkbooks.document_purge','',true);
  RETURN job_id;
END $$;

CREATE OR REPLACE FUNCTION public.finish_document_storage_cleanup(
  _company_id uuid, _job_id uuid
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  job public.document_storage_cleanup_jobs%ROWTYPE;
BEGIN
  IF private.mfa_requirement_met() IS NOT TRUE THEN
    RAISE EXCEPTION 'MFA verification required' USING ERRCODE='42501';
  END IF;
  IF auth.uid() IS NULL OR NOT public.can_access_attachment(
    _company_id,'company','manage'
  ) THEN RAISE EXCEPTION 'Not authorized to complete Storage cleanup'; END IF;
  SELECT * INTO job FROM public.document_storage_cleanup_jobs
    WHERE company_id=_company_id AND id=_job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Storage cleanup job not found'; END IF;
  IF job.completed_at IS NOT NULL THEN RETURN true; END IF;
  IF EXISTS (
    SELECT 1 FROM storage.objects o WHERE o.bucket_id='company-documents'
      AND o.name=ANY(job.storage_paths)
  ) THEN
    RETURN false;
  END IF;
  UPDATE public.document_storage_cleanup_jobs
    SET completed_at=now() WHERE id=_job_id AND company_id=_company_id;
  RETURN true;
END $$;

notify pgrst,'reload schema';

-- The pre-existing authorised demo reset deletes document metadata. Preserve that
-- workflow without opening the ordinary authenticated DELETE/retention boundary.
alter function private.reset_demo_company_with_coding_memory(uuid) rename to reset_demo_company_before_merged_files;
revoke all on function private.reset_demo_company_before_merged_files(uuid) from public,anon,authenticated,service_role;
create function private.reset_demo_company_with_coding_memory(_company uuid)
returns void language plpgsql security definer set search_path='' as $$
declare _previous text;
begin
  if auth.uid() is null or not private.mfa_requirement_met() or not public.is_company_member(_company)
    or not public.has_company_permission(_company,'demo.reset') then
    raise exception 'Demo reset access denied' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(_company::text||':workflow-reset',0));
  if not exists(select 1 from public.companies where id=_company and is_demo) then
    raise exception 'Reset denied: company is not a demo company';
  end if;
  -- Retain a durable cleanup receipt for safe company-owned Storage paths, including
  -- older versions. Metadata deletion and receipts roll back together on failure.
  insert into public.document_storage_cleanup_jobs(company_id,original_attachment_id,storage_paths,requested_by,completed_at)
    select a.company_id,a.id,paths.objects,auth.uid(),case when cardinality(paths.objects)=0 then clock_timestamp() else null end
    from public.document_attachments a
    cross join lateral (
      select coalesce(array_agg(distinct p.path),'{}'::text[]) as objects from (
        select a.storage_path as path where a.storage_bucket='company-documents'
        union all select v.storage_path from public.document_attachment_versions v where v.company_id=a.company_id and v.attachment_id=a.id
      ) p where p.path like (_company::text||'/'||a.entity_type||'/'||a.entity_id::text||'/%')
    ) paths where a.company_id=_company
    on conflict(company_id,original_attachment_id) do nothing;
  _previous:=current_setting('linkbooks.demo_reset_company',true);
  perform set_config('linkbooks.demo_reset_company',_company::text,true);
  perform private.reset_demo_company_before_merged_files(_company);
  perform set_config('linkbooks.demo_reset_company',coalesce(_previous,''),true);
end;
$$;
revoke all on function private.reset_demo_company_with_coding_memory(uuid) from public,anon;
grant execute on function private.reset_demo_company_with_coding_memory(uuid) to authenticated;
create or replace function public.reset_demo_company(_company_id uuid)
returns void language sql security invoker set search_path='' as $$
  select private.reset_demo_company_with_coding_memory(_company_id)
$$;
create or replace function public.reject_uncontrolled_document_purge()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if current_user <> 'authenticated'
    and current_setting('linkbooks.demo_reset_company',true)=old.company_id::text
    and auth.uid() is not null and private.mfa_requirement_met()
    and public.is_company_member(old.company_id) and public.has_company_permission(old.company_id,'demo.reset')
    and exists(select 1 from public.companies where id=old.company_id and is_demo) then
    return old;
  end if;
  if current_setting('linkbooks.document_purge',true) is distinct from 'allowed'
    or current_user='authenticated' or old.deleted_at is null or old.retention_hold or old.purge_after>now() then
    raise exception 'Document must be eligible for an authorized permanent purge';
  end if;
  return old;
end;
$$;
notify pgrst,'reload schema';
