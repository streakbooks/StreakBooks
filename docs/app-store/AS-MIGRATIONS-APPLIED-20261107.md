# App Store migrations applied — 7 November 2026

Linked project: `ipxflpzfcqwtenodbxwc` (linkbook / production).

Applied with `npx supabase db query --remote --yes -f <file>` (not `db push`), then
`npx supabase migration repair <version> --status applied --remote --yes`.

| Version | Result |
|---------|--------|
| `20261107157000` | Applied + repaired |
| `20261107158000` | Applied + repaired |
| `20261107159000` | Applied + repaired |
| `20261107160000` | Applied + repaired |
| `20261107161000` | Applied + repaired |
| `20261107162000` | Applied + repaired |
| `20261107163000` | Applied + repaired |

Commands reference: `docs/app-store/AS-FINAL-SUPABASE-CI-COMMANDS.md`.

## Expected UI effect

`role_permissions` now includes `appstore.view` for owner/admin/accountant/bookkeeper/staff/read_only. After a hard refresh (or re-login), Demo Company should leave the **No App Store access** empty state.

Real customer data remains fail-closed (`real_customer_data_enabled = false`).
