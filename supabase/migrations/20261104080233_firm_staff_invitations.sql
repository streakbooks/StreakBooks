-- Practice invitations hold only a SHA-256 digest of the bearer token.
-- Private schema is outside the Data API; all actions are checked RPCs.
create table private.firm_staff_invitations (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  invite_email text not null check (char_length(invite_email) between 5 and 254),
  invited_role public.firm_member_role not null check (invited_role in ('member','admin')),
  token_hash bytea not null unique,
  status text not null default 'pending' check (status in ('pending','accepted','revoked')),
  expires_at timestamptz not null default (now()+interval '7 days'),
  created_by uuid not null references auth.users(id),
  accepted_by uuid references auth.users(id),
  accepted_at timestamptz,
  revoked_at timestamptz,
  delivery_status text not null default 'not_attempted'
    check (delivery_status in ('not_attempted','provider_accepted','failed','not_configured','domain_unverified')),
  provider_message_id text,
  delivery_updated_at timestamptz,
  created_at timestamptz not null default now(),
  constraint firm_invite_accept_consistency check (
    (status='accepted' and accepted_at is not null and accepted_by is not null)
    or (status<>'accepted' and accepted_at is null and accepted_by is null)
  )
);
create index firm_staff_invites_admin_list on private.firm_staff_invitations(firm_id,created_at desc);
create index firm_staff_invites_creator on private.firm_staff_invitations(created_by);
create index firm_staff_invites_accepted_by on private.firm_staff_invitations(accepted_by) where accepted_by is not null;
create unique index firm_staff_invites_one_pending on private.firm_staff_invitations(firm_id,invite_email) where status='pending';
alter table private.firm_staff_invitations enable row level security;
revoke all on private.firm_staff_invitations from public,anon,authenticated;

create function public.firm_invite_create(_firm_id uuid,_email text,_role text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid();
  actor_role public.firm_member_role;
  address text:=lower(btrim(coalesce(_email,'')));
  token text;
  rec_id uuid;
  deadline timestamptz;
begin
  if actor is null or not private.mfa_requirement_met() then
    raise exception 'Authenticated MFA-compliant session required' using errcode='42501';
  end if;
  select role into actor_role from public.firm_members where firm_id=_firm_id and user_id=actor;
  if actor_role is null or actor_role not in ('owner','admin') then
    raise exception 'Firm administrator required' using errcode='42501';
  end if;
  if _role not in ('member','admin') or (_role='admin' and actor_role<>'owner') then
    raise exception 'Only the firm owner can invite administrators' using errcode='42501';
  end if;
  if char_length(address)>254 or address !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid email address';
  end if;
  if (select count(*) from private.firm_staff_invitations
      where firm_id=_firm_id and created_at>now()-interval '24 hours')>=25 then
    raise exception 'Firm invitation rate limit reached';
  end if;
  if (select count(*) from private.firm_staff_invitations
      where firm_id=_firm_id and invite_email=address and created_at>now()-interval '24 hours')>=3 then
    raise exception 'Recipient invitation rate limit reached';
  end if;
  if exists(select 1 from auth.users u join public.firm_members m on m.user_id=u.id
    where m.firm_id=_firm_id and lower(u.email)=address) then
    raise exception 'This email already belongs to the firm';
  end if;
  update private.firm_staff_invitations set status='revoked',revoked_at=now()
  where firm_id=_firm_id and invite_email=address and status='pending';
  token:=encode(extensions.gen_random_bytes(32),'hex');
  insert into private.firm_staff_invitations
    (firm_id,invite_email,invited_role,token_hash,created_by)
  values (_firm_id,address,_role::public.firm_member_role,
    extensions.digest(token,'sha256'),actor)
  returning id,expires_at into rec_id,deadline;
  return jsonb_build_object('id',rec_id,'token',token,'email',address,
     'role',_role,'expiresAt',deadline);
end $$;

create function public.firm_invite_list(_firm_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not private.mfa_requirement_met() or
    not public.is_firm_admin(_firm_id) then
    raise exception 'Firm administrator required' using errcode='42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',i.id,'email',i.invite_email,'role',i.invited_role,
      'status',case when i.status='pending' and i.expires_at<=now()
         then 'expired' else i.status end,
      'expiresAt',i.expires_at,'createdAt',i.created_at,
      'deliveryStatus',i.delivery_status,
      'acceptedAt',i.accepted_at
    ) order by i.created_at desc)
    from (select * from private.firm_staff_invitations
      where firm_id=_firm_id order by created_at desc limit 100) i
  ),'[]'::jsonb);
end $$;

-- Never disclose the invite email or firm identity to a nonmatching signed-in user.
create function public.firm_invite_preview(_token text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare inv private.firm_staff_invitations%rowtype; address text;
begin
 if auth.uid() is null or not private.mfa_requirement_met() then
   raise exception 'Please sign in before opening this invitation' using errcode='42501';
 end if;
 if _token !~ '^[0-9a-f]{64}$' then return null; end if;
 select * into inv from private.firm_staff_invitations
 where token_hash=extensions.digest(_token,'sha256');
 if not found then return null; end if;
 select lower(email) into address from auth.users
 where id=auth.uid() and email_confirmed_at is not null;
 if address is distinct from inv.invite_email then
   return jsonb_build_object('status','different_account');
 end if;
 return jsonb_build_object(
   'firmId',inv.firm_id,'firmName',(select name from public.firms where id=inv.firm_id),
   'role',inv.invited_role,'expiresAt',inv.expires_at,
   'status',case when inv.status='pending' and inv.expires_at<=now()
                then 'expired' else inv.status end);
end $$;

create function public.firm_invite_accept(_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare inv private.firm_staff_invitations%rowtype; address text; membership_role public.firm_member_role;
begin
 if auth.uid() is null or not private.mfa_requirement_met() then
   raise exception 'Authenticated MFA-compliant session required' using errcode='42501';
 end if;
 if _token !~ '^[0-9a-f]{64}$' then
   raise exception 'Invalid invitation';
 end if;
 select * into inv from private.firm_staff_invitations
 where token_hash=extensions.digest(_token,'sha256') for update;
 if not found or inv.status<>'pending' or inv.expires_at<=now() then
   raise exception 'Invitation expired, revoked or already used' using errcode='42501';
 end if;
 select lower(email) into address from auth.users
 where id=auth.uid() and email_confirmed_at is not null;
 if address is null or address<>inv.invite_email then
   raise exception 'Sign in with the verified invited email address' using errcode='42501';
 end if;
 -- No firm invitation is permission to access existing client books.
 insert into public.firm_members(firm_id,user_id,role)
 values (inv.firm_id,auth.uid(),inv.invited_role)
 on conflict (firm_id,user_id) do nothing;
 select role into membership_role from public.firm_members
 where firm_id=inv.firm_id and user_id=auth.uid();
 update private.firm_staff_invitations
 set status='accepted',accepted_by=auth.uid(),accepted_at=now()
 where id=inv.id;
 return jsonb_build_object('firmId',inv.firm_id,'role',membership_role);
end $$;

create function public.firm_invite_revoke(_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare fid uuid;
begin
 if auth.uid() is null or not private.mfa_requirement_met() then
   raise exception 'Authenticated MFA-compliant session required' using errcode='42501';
 end if;
 select firm_id into fid from private.firm_staff_invitations where id=_id;
 if fid is null or not public.is_firm_admin(fid) then
   raise exception 'Firm administrator required' using errcode='42501';
 end if;
 update private.firm_staff_invitations
 set status='revoked',revoked_at=now()
 where id=_id and status='pending';
 return found;
end $$;

-- Delivery audit reflects provider API acceptance, not confirmed inbox delivery.
create function public.firm_invite_delivery(_id uuid,_status text,_provider_message_id text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.mfa_requirement_met() or
    _status not in ('provider_accepted','failed','not_configured','domain_unverified') then
   raise exception 'Invalid invitation delivery update' using errcode='42501';
 end if;
 update private.firm_staff_invitations
 set delivery_status=_status,
     provider_message_id=left(_provider_message_id,160),
     delivery_updated_at=now()
 where id=_id and created_by=auth.uid() and status='pending';
 return found;
end $$;

revoke all on function public.firm_invite_create(uuid,text,text),
 public.firm_invite_list(uuid),public.firm_invite_preview(text),
 public.firm_invite_accept(text),public.firm_invite_revoke(uuid),
 public.firm_invite_delivery(uuid,text,text) from public,anon;
grant execute on function public.firm_invite_create(uuid,text,text),
 public.firm_invite_list(uuid),public.firm_invite_preview(text),
 public.firm_invite_accept(text),public.firm_invite_revoke(uuid),
 public.firm_invite_delivery(uuid,text,text) to authenticated;
