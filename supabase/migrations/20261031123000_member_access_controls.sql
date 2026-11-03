-- Member access: duty roles stay the baseline. Per-person grants and denials
-- adjust operational access and are enforced inside has_company_permission.
-- Governance rights (settings, people, billing, ownership, demo reset) stay on
-- the duty role so a customisation cannot create a shadow administrator.
-- Invitation links are accepted by the invited email address. Outbound email
-- is still not sent from this migration.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE public.company_invitations
  ADD COLUMN IF NOT EXISTS adjustments JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.company_invitations
  DROP CONSTRAINT IF EXISTS company_invitations_adjustments_array;
ALTER TABLE public.company_invitations
  ADD CONSTRAINT company_invitations_adjustments_array
  CHECK (jsonb_typeof(adjustments) = 'array');

CREATE TABLE IF NOT EXISTS public.member_permission_adjustments (
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  effect TEXT NOT NULL CHECK (effect IN ('grant', 'deny')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, user_id, permission)
);

GRANT SELECT ON public.member_permission_adjustments TO authenticated;
GRANT ALL ON public.member_permission_adjustments TO service_role;
ALTER TABLE public.member_permission_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view access adjustments" ON public.member_permission_adjustments;
CREATE POLICY "Members can view access adjustments"
  ON public.member_permission_adjustments
  FOR SELECT TO authenticated
  USING (
    public.has_company_permission(company_id, 'members.view')
    OR public.has_company_permission(company_id, 'members.manage')
  );

-- Writes go through security-definer functions so a client cannot insert a grant
-- the caller does not hold. No insert/update/delete policy is intentional.

CREATE OR REPLACE FUNCTION private.invitation_token_hash(_token TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT encode(extensions.digest(convert_to(_token, 'UTF8'), 'sha256'), 'hex');
$$;

REVOKE ALL ON FUNCTION private.invitation_token_hash(TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.assert_member_adjustments(
  _company_id UUID,
  _role public.company_role,
  _adjustments JSONB
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  rec RECORD;
  cleaned JSONB := '[]'::jsonb;
  locked TEXT[] := ARRAY[
    'company.view',
    'company.settings.edit',
    'members.view',
    'members.manage',
    'members.grant_owner',
    'billing.manage',
    'demo.reset'
  ];
BEGIN
  IF _adjustments IS NULL OR jsonb_typeof(_adjustments) <> 'array' THEN
    RAISE EXCEPTION 'Access changes must be a list';
  END IF;
  IF jsonb_array_length(_adjustments) > 64 THEN
    RAISE EXCEPTION 'Too many access changes';
  END IF;
  IF _role = 'owner' AND jsonb_array_length(_adjustments) > 0 THEN
    RAISE EXCEPTION 'Owner access follows the owner role and cannot be customised';
  END IF;

  FOR rec IN
    SELECT permission, effect
    FROM jsonb_to_recordset(_adjustments) AS a(permission TEXT, effect TEXT)
  LOOP
    IF rec.effect NOT IN ('grant', 'deny') OR rec.permission IS NULL OR rec.permission = '' THEN
      RAISE EXCEPTION 'Invalid access change';
    END IF;
    IF rec.permission = ANY (locked) THEN
      RAISE EXCEPTION 'That access follows the duty role and cannot be customised';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.role_permissions rp WHERE rp.permission = rec.permission
    ) THEN
      RAISE EXCEPTION 'Unknown access right';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM jsonb_to_recordset(cleaned) AS c(permission TEXT, effect TEXT)
      WHERE c.permission = rec.permission
    ) THEN
      RAISE EXCEPTION 'Each access right can only be changed once';
    END IF;
    IF rec.effect = 'grant' AND EXISTS (
      SELECT 1 FROM public.role_permissions rp
      WHERE rp.role = _role AND rp.permission = rec.permission
    ) THEN
      RAISE EXCEPTION 'That access is already included in the duty role';
    END IF;
    IF rec.effect = 'deny' AND NOT EXISTS (
      SELECT 1 FROM public.role_permissions rp
      WHERE rp.role = _role AND rp.permission = rec.permission
    ) THEN
      RAISE EXCEPTION 'That access is not included in the duty role';
    END IF;
    IF rec.effect = 'grant' AND NOT public.has_company_permission(_company_id, rec.permission) THEN
      RAISE EXCEPTION 'You can only grant access you already hold' USING ERRCODE = '42501';
    END IF;
    cleaned := cleaned || jsonb_build_array(
      jsonb_build_object('permission', rec.permission, 'effect', rec.effect)
    );
  END LOOP;
  RETURN cleaned;
END;
$$;

REVOKE ALL ON FUNCTION private.assert_member_adjustments(UUID, public.company_role, JSONB)
  FROM PUBLIC, anon, authenticated;

-- Membership rules already protect the last owner and who may grant ownership.
-- This replacement also stops people changing their own access, and clears
-- custom access when the duty role changes.
CREATE OR REPLACE FUNCTION public.company_members_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _company UUID := COALESCE(NEW.company_id, OLD.company_id);
  _remaining INT;
BEGIN
  IF current_setting('linkbooks.trusted', true) IS DISTINCT FROM 'on' THEN
    IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.role = 'owner'
       AND NOT public.has_company_role(_company, ARRAY['owner']::public.company_role[]) THEN
      RAISE EXCEPTION 'Only an owner can grant the owner role';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.role = 'owner'
       AND NOT public.has_company_role(_company, ARRAY['owner']::public.company_role[]) THEN
      RAISE EXCEPTION 'Only an owner can change another owner';
    END IF;
    IF TG_OP = 'DELETE' AND OLD.role = 'owner'
       AND NOT public.has_company_role(_company, ARRAY['owner']::public.company_role[]) THEN
      RAISE EXCEPTION 'Only an owner can remove an owner';
    END IF;
    IF auth.uid() IS NOT NULL THEN
      IF TG_OP = 'DELETE' AND OLD.user_id = auth.uid() THEN
        RAISE EXCEPTION 'You cannot remove your own access';
      END IF;
      IF TG_OP = 'UPDATE' AND OLD.user_id = auth.uid()
         AND (NEW.role IS DISTINCT FROM OLD.role OR NEW.status IS DISTINCT FROM OLD.status) THEN
        RAISE EXCEPTION 'You cannot change your own role or status';
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at = now();
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      DELETE FROM public.member_permission_adjustments
      WHERE company_id = NEW.company_id AND user_id = NEW.user_id;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.member_permission_adjustments
    WHERE company_id = OLD.company_id AND user_id = OLD.user_id;
  END IF;

  IF (TG_OP = 'DELETE' AND OLD.role = 'owner')
     OR (TG_OP = 'UPDATE' AND OLD.role = 'owner' AND (NEW.role <> 'owner' OR NEW.status <> 'active')) THEN
    SELECT count(*) INTO _remaining FROM public.company_members
      WHERE company_id = _company AND role = 'owner' AND status = 'active' AND id <> OLD.id;
    IF _remaining = 0 AND EXISTS (SELECT 1 FROM public.companies WHERE id = _company) THEN
      RAISE EXCEPTION 'A company must keep at least one active owner';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.company_members_guard() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.company_invitations_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.role = 'owner' THEN
      RAISE EXCEPTION 'Ownership is transferred by an owner, not by invitation';
    END IF;
    IF auth.uid() IS NULL OR NOT public.has_company_permission(NEW.company_id, 'members.manage') THEN
      RAISE EXCEPTION 'You do not have permission to invite people' USING ERRCODE = '42501';
    END IF;
    NEW.email := lower(trim(NEW.email));
    NEW.adjustments := private.assert_member_adjustments(
      NEW.company_id, NEW.role, COALESCE(NEW.adjustments, '[]'::jsonb)
    );
    RETURN NEW;
  END IF;

  IF NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.token_hash IS DISTINCT FROM OLD.token_hash
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.adjustments IS DISTINCT FROM OLD.adjustments
     OR NEW.invited_by IS DISTINCT FROM OLD.invited_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'An invitation cannot be rewritten';
  END IF;
  IF OLD.accepted_at IS NOT NULL AND (
    NEW.accepted_at IS DISTINCT FROM OLD.accepted_at OR NEW.revoked_at IS DISTINCT FROM OLD.revoked_at
  ) THEN
    RAISE EXCEPTION 'An accepted invitation cannot be changed';
  END IF;
  IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
    RAISE EXCEPTION 'A revoked invitation cannot be restored';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.company_invitations_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS company_invitations_guard ON public.company_invitations;
CREATE TRIGGER company_invitations_guard
  BEFORE INSERT OR UPDATE ON public.company_invitations
  FOR EACH ROW EXECUTE FUNCTION public.company_invitations_guard();

-- Role baseline, plus grants, minus denials. Platform scoped access is unchanged.
-- Owner rows ignore adjustments so an owner cannot be locked out.
CREATE OR REPLACE FUNCTION public.has_company_permission(_company_id UUID, _permission TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.customer_access_ok() AND (
    private.scoped_permission(_company_id, _permission)
    OR (
      (
        EXISTS (
          SELECT 1
          FROM public.company_members m
          JOIN public.role_permissions r ON r.role = m.role
          WHERE m.company_id = _company_id
            AND m.user_id = auth.uid()
            AND m.status = 'active'
            AND r.permission = _permission
        )
        OR EXISTS (
          SELECT 1
          FROM public.member_permission_adjustments a
          JOIN public.company_members m
            ON m.company_id = a.company_id AND m.user_id = a.user_id
          WHERE a.company_id = _company_id
            AND a.user_id = auth.uid()
            AND m.status = 'active'
            AND m.role <> 'owner'
            AND a.effect = 'grant'
            AND a.permission = _permission
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.member_permission_adjustments a
        JOIN public.company_members m
          ON m.company_id = a.company_id AND m.user_id = a.user_id
        WHERE a.company_id = _company_id
          AND a.user_id = auth.uid()
          AND m.status = 'active'
          AND m.role <> 'owner'
          AND a.effect = 'deny'
          AND a.permission = _permission
      )
    )
  )
  AND (
    _permission ~ '\.(view|export)$'
    OR private.platform_write_allowed(
      _company_id,
      CASE split_part(_permission, '.', 1)
        WHEN 'purchases' THEN 'purchases'
        WHEN 'sales' THEN 'sales'
        WHEN 'banking' THEN 'banking'
        WHEN 'budgets' THEN 'budgets'
        WHEN 'projects' THEN 'projects'
        WHEN 'fixed_assets' THEN 'fixed_assets'
        WHEN 'documents' THEN 'documents'
        ELSE 'accounting'
      END
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.issue_company_invitation(
  _company_id UUID,
  _email TEXT,
  _role public.company_role,
  _token_hash TEXT,
  _expires_at TIMESTAMPTZ,
  _adjustments JSONB
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
  _email_norm TEXT := lower(trim(_email));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'members.manage') THEN
    RAISE EXCEPTION 'You do not have permission to invite people' USING ERRCODE = '42501';
  END IF;
  IF _role = 'owner' THEN
    RAISE EXCEPTION 'Ownership is transferred by an owner, not by invitation';
  END IF;
  IF _email_norm !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Enter a valid email';
  END IF;
  IF _token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid invitation';
  END IF;
  IF _expires_at IS NULL OR _expires_at <= now() OR _expires_at > now() + interval '30 days' THEN
    RAISE EXCEPTION 'Choose an invitation expiry within 30 days';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.company_members m
    JOIN auth.users u ON u.id = m.user_id
    WHERE m.company_id = _company_id
      AND m.status = 'active'
      AND lower(u.email) = _email_norm
  ) THEN
    RAISE EXCEPTION 'That person already has access to this organisation';
  END IF;

  UPDATE public.company_invitations
  SET revoked_at = now()
  WHERE company_id = _company_id
    AND lower(email) = _email_norm
    AND accepted_at IS NULL
    AND revoked_at IS NULL;

  INSERT INTO public.company_invitations (
    company_id, email, role, token_hash, expires_at, invited_by, adjustments
  ) VALUES (
    _company_id, _email_norm, _role, _token_hash, _expires_at, auth.uid(),
    COALESCE(_adjustments, '[]'::jsonb)
  )
  RETURNING id INTO _id;

  PERFORM public.record_audit_event(
    _company_id, 'members.invite', 'company_invitation', _id,
    jsonb_build_object(
      'email', _email_norm,
      'role', _role,
      'email_sent', false,
      'reason', 'No outbound email provider configured'
    )
  );
  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_company_invitation(UUID, TEXT, public.company_role, TEXT, TIMESTAMPTZ, JSONB)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_company_invitation(UUID, TEXT, public.company_role, TEXT, TIMESTAMPTZ, JSONB)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_company_invitation(_company_id UUID, _invitation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _updated UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'members.manage') THEN
    RAISE EXCEPTION 'You do not have permission to invite people' USING ERRCODE = '42501';
  END IF;
  UPDATE public.company_invitations
  SET revoked_at = now()
  WHERE id = _invitation_id
    AND company_id = _company_id
    AND accepted_at IS NULL
    AND revoked_at IS NULL
  RETURNING id INTO _updated;
  IF _updated IS NULL THEN
    RAISE EXCEPTION 'That invitation can no longer be revoked';
  END IF;
  PERFORM public.record_audit_event(
    _company_id, 'members.invite_revoke', 'company_invitation', _invitation_id, '{}'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_company_invitation(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_company_invitation(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.preview_company_invitation(_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv public.company_invitations%ROWTYPE;
  v_name TEXT;
  v_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501';
  END IF;
  IF _token IS NULL OR _token !~ '^[0-9a-f]{64}$' THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_inv
  FROM public.company_invitations
  WHERE token_hash = private.invitation_token_hash(_token);
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF v_inv.revoked_at IS NOT NULL THEN
    v_status := 'revoked';
  ELSIF v_inv.accepted_at IS NOT NULL THEN
    v_status := 'accepted';
  ELSIF v_inv.expires_at <= now() THEN
    v_status := 'expired';
  ELSE
    v_status := 'pending';
  END IF;
  SELECT name INTO v_name FROM public.companies WHERE id = v_inv.company_id;
  RETURN jsonb_build_object(
    'companyName', v_name,
    'role', v_inv.role,
    'email', v_inv.email,
    'expiresAt', v_inv.expires_at,
    'status', v_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.preview_company_invitation(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_company_invitation(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.accept_company_invitation(_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_inv public.company_invitations%ROWTYPE;
  v_email TEXT;
  v_existing public.company_members%ROWTYPE;
  v_adj JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501';
  END IF;
  IF _token IS NULL OR _token !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'This invitation link is not valid';
  END IF;

  SELECT * INTO v_inv
  FROM public.company_invitations
  WHERE token_hash = private.invitation_token_hash(_token);
  IF NOT FOUND OR v_inv.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'This invitation is no longer valid';
  END IF;
  IF v_inv.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'This invitation has already been accepted';
  END IF;
  IF v_inv.expires_at <= now() THEN
    RAISE EXCEPTION 'This invitation has expired';
  END IF;

  SELECT lower(coalesce(email, '')) INTO v_email FROM auth.users WHERE id = v_uid;
  IF v_email = '' OR v_email <> lower(v_inv.email) THEN
    RAISE EXCEPTION 'Sign in with the invited email address to accept this invitation'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_existing
  FROM public.company_members
  WHERE company_id = v_inv.company_id AND user_id = v_uid;

  IF FOUND AND v_existing.status = 'active' THEN
    RAISE EXCEPTION 'You already have access to this organisation';
  END IF;

  -- The invited person is not yet an administrator. Trusted mode lets this
  -- function write their membership; the last-owner rule still applies.
  PERFORM set_config('linkbooks.trusted', 'on', true);

  IF FOUND THEN
    UPDATE public.company_members
    SET role = v_inv.role, status = 'active', invited_by = coalesce(invited_by, v_inv.invited_by)
    WHERE company_id = v_inv.company_id AND user_id = v_uid;
  ELSE
    INSERT INTO public.company_members (company_id, user_id, role, status, invited_by)
    VALUES (v_inv.company_id, v_uid, v_inv.role, 'active', v_inv.invited_by);
  END IF;

  DELETE FROM public.member_permission_adjustments
  WHERE company_id = v_inv.company_id AND user_id = v_uid;

  FOR v_adj IN
    SELECT value FROM jsonb_array_elements(coalesce(v_inv.adjustments, '[]'::jsonb))
  LOOP
    INSERT INTO public.member_permission_adjustments (
      company_id, user_id, permission, effect, created_by
    ) VALUES (
      v_inv.company_id,
      v_uid,
      v_adj->>'permission',
      v_adj->>'effect',
      v_inv.invited_by
    );
  END LOOP;

  UPDATE public.company_invitations
  SET accepted_at = now()
  WHERE id = v_inv.id;

  UPDATE public.profiles
  SET last_company_id = v_inv.company_id
  WHERE id = v_uid;

  PERFORM set_config('linkbooks.trusted', 'off', true);

  PERFORM public.record_audit_event(
    v_inv.company_id, 'members.invite_accept', 'company_invitation', v_inv.id,
    jsonb_build_object('role', v_inv.role)
  );

  RETURN jsonb_build_object('companyId', v_inv.company_id, 'role', v_inv.role);
EXCEPTION
  WHEN OTHERS THEN
    PERFORM set_config('linkbooks.trusted', 'off', true);
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_company_invitation(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_company_invitation(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_member_adjustments(
  _company_id UUID,
  _user_id UUID,
  _adjustments JSONB
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.company_role;
  cleaned JSONB;
  v_adj JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_company_permission(_company_id, 'members.manage') THEN
    RAISE EXCEPTION 'You do not have permission to change access' USING ERRCODE = '42501';
  END IF;
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot change your own access' USING ERRCODE = '42501';
  END IF;

  SELECT role INTO v_role
  FROM public.company_members
  WHERE company_id = _company_id AND user_id = _user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found';
  END IF;
  IF v_role = 'owner' THEN
    RAISE EXCEPTION 'Owner access follows the owner role and cannot be customised';
  END IF;

  cleaned := private.assert_member_adjustments(_company_id, v_role, COALESCE(_adjustments, '[]'::jsonb));

  DELETE FROM public.member_permission_adjustments
  WHERE company_id = _company_id AND user_id = _user_id;

  FOR v_adj IN SELECT value FROM jsonb_array_elements(cleaned)
  LOOP
    INSERT INTO public.member_permission_adjustments (
      company_id, user_id, permission, effect, created_by
    ) VALUES (
      _company_id, _user_id, v_adj->>'permission', v_adj->>'effect', auth.uid()
    );
  END LOOP;

  PERFORM public.record_audit_event(
    _company_id, 'members.access_change', 'company_member', _user_id,
    jsonb_build_object('adjustments', cleaned)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_member_adjustments(UUID, UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_member_adjustments(UUID, UUID, JSONB) TO authenticated;

-- Keep invitation history. Cancellation sets revoked_at through revoke_company_invitation.
REVOKE DELETE ON public.company_invitations FROM authenticated;
