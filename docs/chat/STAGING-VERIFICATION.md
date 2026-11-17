# Messaging staging verification

## Supabase CLI

- Local workstation did not have a global `supabase` binary.
- `npx supabase@3.2.0` resolves successfully.
- Repo `supabase/config.toml` project_id: `ipxflpzfcqwtenodbxwc` (treat as sensitive; do not assume it is an isolated staging project).

## Migration apply policy

1. Confirm the linked project is an **authorized isolated staging** environment.  
2. `npx supabase db push` (or project-approved migration pipeline) only after confirmation.  
3. Run `tests/integration/messaging-cross-tenant-rls-security.sql` and `tests/integration/messaging-rls-scenarios.sql`.  
4. Do **not** apply to production until staging RLS + two-browser E2E pass and deployment is authorised.

## Feature flag

Org-level: `messaging_settings.enabled` (demo companies seeded enabled).  
Catalogue key: `messaging_collaboration`.

## Rollback

Disable `messaging_settings.enabled`. Do not DROP messaging tables with retained audit data without explicit authorization.
