# Property Management — Supabase CI commands and migration

Linked project: `ipxflpzfcqwtenodbxwc` (StreakBooks production / linked remote).

**Do not** run blind `supabase db push` on this project — remote history has versions with no local file (see `docs/decisions/006-main-and-migrations.md`).

## Migrations

| Version | File | Purpose | Live status (`ipxflpzfcqwtenodbxwc`) |
| --- | --- | --- | --- |
| `20261118150000` | `pm_foundation.sql` | Permissions, settings, properties, units, owners, ownership, agreements | **Applied** 2026-11-18 via `db query` + `migration repair` |
| `20261118160000` | `pm_operations_statements.sql` | Tenants, leases, rent, reservations, commissions, owner statements | **Applied** 2026-11-18 via `db query` + `migration repair` (DEFAULT-param order fix included) |
| `20261118170000` | `pm_posting_payouts_portals.sql` | COA mappings, rent/commission/distribution posting via `post_journal`, reserves, portal access, trust summary | **Applied** 2026-11-18 via `db query` + `migration repair` |
| `20261118180000` | `pm_fix_settings_volatility.sql` | Mark `get_pm_settings` / KPIs / trust summary VOLATILE (they INSERT via `pm_ensure_settings`) | **Applied** 2026-11-18 via `db query` + `migration repair` |

Verified after foundation+ops apply: `pm_properties` / `pm_tenants` / `pm_leases` / `pm_owner_statements` present; 92 `property.*` role_permission rows; owner has `property.view` / `property.settings.manage` / `property.statements.approve`; RPCs `get_pm_settings`, `list_pm_properties`, `generate_pm_owner_statement`, `approve_pm_owner_statement` present.

## Apply (approved method)

```powershell
cd D:\MyApp\StreakBooks
$env:SUPABASE_YES = "1"

$path = "supabase\migrations\20261118170000_pm_posting_payouts_portals.sql"
Write-Host "Applying $path..."
npx.cmd supabase db query --remote --yes --agent=no -f $path
if ($LASTEXITCODE -ne 0) { throw "Failed: $path" }
npx.cmd supabase migration repair 20261118170000 --status applied --remote --yes --agent=no
if ($LASTEXITCODE -ne 0) { throw "Repair failed: 20261118170000" }
```

## Verification (read-only)

```powershell
$env:SUPABASE_YES = "1"
npx.cmd supabase db query --remote --yes --read-only --agent=no "select to_regclass('public.pm_owner_distributions')::text, to_regclass('public.pm_portal_access')::text, to_regclass('public.pm_owner_reserves')::text;"
npx.cmd supabase db query --remote --yes --read-only --agent=no "select version from supabase_migrations.schema_migrations where version in ('20261118150000','20261118160000','20261118170000') order by version;"
npx.cmd supabase db query --remote --yes --read-only --agent=no "select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and proname in ('upsert_pm_account_mappings','post_pm_rent_charge','post_pm_commission','post_pm_owner_distribution','get_pm_trust_summary','list_pm_portal_access') order by 1;"
```

## App check after apply

Hard-refresh the app (or sign out/in) so active-company permission hints reload. Open `/property-management/settings`, map rent/receivable/payable/commission/operating bank accounts, then post a draft rent charge and create an owner payout.

## Not claimed

- Live OTA / PMS API credentials and sync
- Statutory trust certification / full bank reconciliation
- External self-serve owner/tenant portal login UI
- GitHub Actions green if org billing still blocks runners
- Blind `db push` / `db reset`
