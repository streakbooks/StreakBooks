# Property Management — Supabase CI commands and migration

Linked project: `ipxflpzfcqwtenodbxwc` (LinkBooks production / linked remote).

**Do not** run blind `supabase db push` on this project — remote history has versions with no local file (see `docs/decisions/006-main-and-migrations.md`).

## Migrations

| Version | File | Purpose | Live status (`ipxflpzfcqwtenodbxwc`) |
| --- | --- | --- | --- |
| `20261118150000` | `pm_foundation.sql` | Permissions, settings, properties, units, owners, ownership, agreements | **Applied** 2026-11-18 via `db query` + `migration repair` |
| `20261118160000` | `pm_operations_statements.sql` | Tenants, leases, rent, reservations, commissions, owner statements | **Applied** 2026-11-18 via `db query` + `migration repair` (DEFAULT-param order fix included) |

Verified after apply: `pm_properties` / `pm_tenants` / `pm_leases` / `pm_owner_statements` present; 92 `property.*` role_permission rows; owner has `property.view` / `property.settings.manage` / `property.statements.approve`; RPCs `get_pm_settings`, `list_pm_properties`, `generate_pm_owner_statement`, `approve_pm_owner_statement` present.

## Apply (approved method)

```powershell
cd D:\MyApp\LinkBooks
$env:SUPABASE_YES = "1"

$files = @(
  "supabase\migrations\20261118150000_pm_foundation.sql",
  "supabase\migrations\20261118160000_pm_operations_statements.sql"
)
foreach ($path in $files) {
  Write-Host "Applying $path..."
  npx.cmd supabase db query --remote --yes --agent=no -f $path
  if ($LASTEXITCODE -ne 0) { throw "Failed: $path" }
  $version = [IO.Path]::GetFileNameWithoutExtension($path).Substring(0, 14)
  npx.cmd supabase migration repair $version --status applied --remote --yes --agent=no
  if ($LASTEXITCODE -ne 0) { throw "Repair failed: $version" }
}
```

## Verification (read-only)

```powershell
$env:SUPABASE_YES = "1"
npx.cmd supabase db query --remote --yes --read-only --agent=no "select to_regclass('public.pm_properties')::text, to_regclass('public.pm_owner_statements')::text;"
npx.cmd supabase db query --remote --yes --read-only --agent=no "select count(*)::int as property_perms from public.role_permissions where permission like 'property.%';"
npx.cmd supabase db query --remote --yes --read-only --agent=no "select version from supabase_migrations.schema_migrations where version in ('20261118150000','20261118160000') order by version;"
npx.cmd supabase db query --remote --yes --read-only --agent=no "select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and proname in ('get_pm_settings','generate_pm_owner_statement','approve_pm_owner_statement') order by 1;"
```

## App check after apply

Hard-refresh the app (or sign out/in) so active-company permission hints reload. Open `/property-management/settings`, enable the module, then `/property-management/properties` — settings load instead of a generic permission deny.

## Not claimed

- Full PM directive production readiness (payouts, trust recon, portals, live OTA APIs)
- GitHub Actions green if org billing still blocks runners
- Blind `db push` / `db reset`
