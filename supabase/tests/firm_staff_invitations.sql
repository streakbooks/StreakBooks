-- Execute after migration; fixture users, firm and invites are rolled back.
BEGIN;
DO $$
DECLARE
 u1 uuid:=gen_random_uuid(); u2 uuid:=gen_random_uuid(); u3 uuid:=gen_random_uuid();
BEGIN
 insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
 values(u1,'owner-'||u1||'@example.invalid',now(),'{}'),
       (u2,'invitee-'||u2||'@example.invalid',now(),'{}'),
       (u3,'stranger-'||u3||'@example.invalid',now(),'{}');
 insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at)
 values(gen_random_uuid(),u1,'totp','verified',now(),now());
 perform set_config('test.fi_owner',u1::text,true);
 perform set_config('test.fi_recipient',u2::text,true);
 perform set_config('test.fi_wrong',u3::text,true);
 perform set_config('request.jwt.claims',
   jsonb_build_object('sub',u1,'aal','aal2','role','authenticated')::text,true);
END $$;
SET LOCAL ROLE authenticated;
DO $$
DECLARE
 owner uuid:=current_setting('test.fi_owner')::uuid;
 recipient uuid:=current_setting('test.fi_recipient')::uuid;
 wrong uuid:=current_setting('test.fi_wrong')::uuid;
 fid uuid; payload jsonb; invite text; invited_id uuid; result jsonb; pending jsonb;
BEGIN
 fid:=public.create_practice_firm('Test staff invitation firm');
 payload:=public.firm_invite_create(fid,
   'invitee-'||recipient||'@example.invalid','member');
 invite:=payload->>'token'; invited_id:=(payload->>'id')::uuid;
 if invite !~ '^[a-f0-9]{64}$' then
   raise exception 'Not a random-length invitation token'; end if;
 if (select count(*) from private.firm_staff_invitations where token_hash=
   extensions.digest(invite,'sha256'))<>1 then
   raise exception 'Token digest missing'; end if;
 if encode((select token_hash from private.firm_staff_invitations where id=invited_id),'hex')=invite then
   raise exception 'Raw invite token persisted';end if;

 perform set_config('request.jwt.claims',
  jsonb_build_object('sub',wrong,'aal','aal1','role','authenticated')::text,true);
 if public.firm_invite_preview(invite)->>'status'<>'different_account' then
   raise exception 'Wrong user preview leaked invitation';end if;
 begin
  perform public.firm_invite_accept(invite);
  raise exception 'TEST: Wrong account accepted invite';
 exception when insufficient_privilege then null; end;

 perform set_config('request.jwt.claims',
  jsonb_build_object('sub',recipient,'aal','aal1','role','authenticated')::text,true);
 result:=public.firm_invite_preview(invite);
 if result->>'status'<>'pending' then raise exception 'Recipient preview failed';end if;
 result:=public.firm_invite_accept(invite);
 if result->>'role'<>'member' or result->>'firmId'<>fid::text then
   raise exception 'Firm acceptance returned incorrect role';end if;
 if not exists(select 1 from public.firm_members
  where firm_id=fid and user_id=recipient and role='member') then
   raise exception 'Recipient not added';end if;
 if exists(select 1 from public.company_members where user_id=recipient) then
   raise exception 'Invite granted company access unexpectedly';end if;
 begin
  perform public.firm_invite_accept(invite);
  raise exception 'TEST: Replayed token was accepted';
 exception when insufficient_privilege then null; end;
 begin
  perform public.firm_invite_create(fid,'stranger-'||wrong||'@example.invalid','admin');
  raise exception 'TEST: Member invited admin';
 exception when insufficient_privilege then null; end;

 perform set_config('request.jwt.claims',
  jsonb_build_object('sub',owner,'aal','aal2','role','authenticated')::text,true);
 pending:=public.firm_invite_create(fid,'stranger-'||wrong||'@example.invalid','member');
 if not public.firm_invite_revoke((pending->>'id')::uuid) then
   raise exception 'Revoke failed';end if;
 perform set_config('request.jwt.claims',
  jsonb_build_object('sub',wrong,'aal','aal1','role','authenticated')::text,true);
 begin
  perform public.firm_invite_accept(pending->>'token');
  raise exception 'TEST: Revoked invite accepted';
 exception when insufficient_privilege then null; end;
END $$;
ROLLBACK;
SELECT 'firm staff invitations: one-time, verified email, permissions, no book access and revocation passed; rolled back' AS result;
