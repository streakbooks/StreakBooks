-- Emergency rollback pauses new invitations while preserving every existing membership and token.
-- Reapply the forward migration to restore authenticated invitation access.
REVOKE EXECUTE ON FUNCTION public.invite_portal_user(jsonb) FROM PUBLIC, anon, authenticated;
