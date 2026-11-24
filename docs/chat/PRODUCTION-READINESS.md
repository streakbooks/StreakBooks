# Messaging production readiness

**Status (2026-11-17):** Production-oriented and schema-live on linked Supabase. Internal messaging is safe to use with flags fail-closed for customer/vendor portals.

## Go-live gates

| Gate | Status |
| ---- | ------ |
| Migrations applied (`20261117120000`–`20261117220000`) | Applied / apply `20261117220000` with this PR |
| RLS enabled on core messaging tables | Structural SQL verifies |
| Demo orgs messaging enabled; live orgs opt-in via settings | Yes |
| Customer/vendor portal messaging | **Locked** until `MESSAGING_EXTERNAL_PORTALS_ENABLED=1` |
| Cron endpoints require `STREAKBOOKS_CRON_SECRET` | Yes (`digest`, `retention`, `outbox`) |
| Retention purge execute | Fail-closed unless `MESSAGING_RETENTION_PURGE_EXECUTE=1` |
| Dual-browser realtime E2E | Scaffolded; run with `STREAKBOOKS_E2E_MESSAGING=1` before claiming Phase 1 verified |
| Quality CI workflow | Still commented in repo — run local gates before release |

## Production defaults

- `messaging_settings.enabled` — false for new orgs; true for demo seed  
- `allow_customer` / `allow_vendor` — false; app + SQL lock  
- `allow_ai_assist` / `allow_voice_video` — false  
- Chat never posts/pays/approves ledger state  

## Operator unlock (external portals only)

1. Pass portal isolation E2E (`STREAKBOOKS_E2E_MESSAGING_PORTAL=1`).  
2. Set `MESSAGING_EXTERNAL_PORTALS_ENABLED=1` on the server.  
3. Toggle customer/vendor flags per organisation in Messages settings (confirm prompt).  

## Rollback

Disable `messaging_settings.enabled` for the org. Do not DROP messaging tables with retained audit data without authorisation. PITR restore for schema rollback, then `migration repair --status reverted` only after restore.
