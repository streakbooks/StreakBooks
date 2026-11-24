# Messaging staging verification

## Supabase CLI

- Local workstation did not have a global `supabase` binary.
- `npx supabase@3.2.0` resolves successfully.
- Repo `supabase/config.toml` project_id: `ipxflpzfcqwtenodbxwc` (treat as sensitive; do not assume it is an isolated staging project).

## Migration apply policy

1. Confirm the linked project is authorised (staging or production with explicit approval).  
2. **Do not** use blind `supabase db push` on this project (history drift).  
3. Apply with `db query --remote --yes -f` + `migration repair --status applied` (see `MESSAGING-FINAL-SUPABASE-CI-COMMANDS.md`).  
4. Run `tests/integration/messaging-cross-tenant-rls-security.sql` and `tests/integration/messaging-rls-scenarios.sql` when a live harness is available.  
5. Keep `allow_customer` / `allow_vendor` off until portal isolation E2E passes.

## Applied (2026-11-17)

All 11 `20261117*_messaging_*.sql` files applied to linked project `ipxflpzfcqwtenodbxwc` (linkbook). Smoke query confirmed tables/RPCs, 46 `messaging.*` permissions, and demo companies enabled.

## Feature flag

Org-level: `messaging_settings.enabled` (demo companies seeded enabled).  
Catalogue key: `messaging_collaboration`.  
Keep `allow_customer` / `allow_vendor` off until portal isolation passes.

## Manual staging checklist

1. Enable messaging for a test org; confirm `/messages` loads.  
2. Two browsers: DM send appears for peer within 30s (`STREAKBOOKS_E2E_MESSAGING=1`).  
3. Portal customer: Message Business on invoice; another customer cannot open it.  
4. Firm user: accountant chat under client A is absent under client B.  
5. Mute 8h / archive / unarchive / rename group / remove member.  
6. Retention preview dry-run; cron `/api/messaging/retention-cron` returns `mode: dry_run`.  
7. Outbox cron `/api/messaging/outbox-cron` marks aged events processed.  
8. Digest cron returns messaging summary without demo companies.  
9. Formal review from chat creates Action Center item; invoice status unchanged.  
10. Create channel + forward message between authorised threads.  
11. Load older messages on a long thread; confirm latest window loads first.  
12. Apply search with a body keyword; open a global hit and land on the highlighted message.  
13. Enable push prefs + browser permission; background the tab; confirm desktop notification on inbound activity.  
14. Quiet hours suppress desktop notifications; Mark all read clears unread badges.  
15. Open `/messages?conversation=<id>&message=<id>` highlights the target message.  
16. Supplier payment Discuss opens a linked record thread with Open record.  
17. Drag or paste an allowed file onto the composer; confirm Shared files updates.  
18. Copy link opens the same conversation (and message highlight when present).  
19. Leave prompts for confirmation and removes the thread from inbox.  
20. Sales receipt Discuss creates a linked record conversation.

## Rollback

Disable `messaging_settings.enabled`. Do not DROP messaging tables with retained audit data without explicit authorization.
