-- Pin reviewed pure helpers without changing their SQL bodies, volatility or grants.
alter function private.advisors_agreement_json(public.advisors_agreements) set search_path = '';
alter function private.advisors_client_json(public.advisors_clients) set search_path = '';
alter function private.advisors_default_agreement_body(text,text,integer,text,text) set search_path = '';
alter function private.advisors_delivery_task_json(public.advisors_delivery_tasks) set search_path = '';
alter function private.advisors_document_request_json(public.advisors_document_requests) set search_path = '';
alter function private.advisors_engagement_json(public.advisors_engagements) set search_path = '';
alter function private.advisors_lead_json(public.advisors_leads) set search_path = '';
alter function private.advisors_onboarding_task_json(public.advisors_onboarding_tasks) set search_path = '';
alter function private.advisors_proposal_json(public.advisors_proposals) set search_path = '';
alter function private.advisors_staff_json(public.advisors_staff) set search_path = '';
alter function private.advisors_subscription_json(public.advisors_subscriptions) set search_path = '';
alter function private.advisors_work_period_json(public.advisors_work_periods) set search_path = '';
alter function private.advisors_workspace_json(public.advisors_workspaces) set search_path = '';
alter function private.advisors_workspace_note_json(public.advisors_workspace_notes) set search_path = '';
alter function public.messaging_dm_pair_key(uuid,uuid) set search_path = '';
alter function public.payroll_assert_settings_accounts(public.payroll_settings) set search_path = '';
alter function public.payroll_derive_payslip_payment_status(bigint,bigint) set search_path = '';
alter function public.payroll_run_employee_active_in_period(date,date,date,date) set search_path = '';

-- The token helper needs pgcrypto's actual installation schema. Derive that
-- trusted namespace from the extension catalogue, not a caller's search_path.
do $$
declare _crypto_schema text;
begin
  select n.nspname into _crypto_schema
  from pg_extension e join pg_namespace n on n.oid=e.extnamespace
  where e.extname='pgcrypto';
  if _crypto_schema is null then raise exception 'pgcrypto is required for advisor tokens'; end if;
  execute format(
    'alter function private.advisors_new_public_token() set search_path = pg_catalog, %I, pg_temp',
    _crypto_schema
  );
end;
$$;
