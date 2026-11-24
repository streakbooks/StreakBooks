# Final Supabase CI commands & migration (App Store)

Linked project: `ipxflpzfcqwtenodbxwc` (linkbook / production).

**Do not** run blind `supabase db push` on this project — remote history has versions with no local file (see `docs/decisions/006-main-and-migrations.md`).

This unlocks `appstore.view` (and related marketplace permissions) in `role_permissions`, which is why Demo Company otherwise shows **No App Store access**.

## Marketplace migrations (apply in order)

| Version | File |
|---------|------|
| `20261107157000` | `marketplace_catalogue_foundation.sql` |
| `20261107158000` | `marketplace_connections_foundation.sql` |
| `20261107159000` | `marketplace_xero_parity_addendum.sql` |
| `20261107160000` | `marketplace_integration_engine.sql` |
| `20261107161000` | `marketplace_security_controls.sql` |
| `20261107162000` | `marketplace_oauth_approval_consent.sql` |
| `20261107163000` | `marketplace_oauth_suspend_catalogue_hardening.sql` |

## Apply App Store SQL

```powershell
cd D:\MyApp\StreakBooks
$env:SUPABASE_YES = "1"

$files = @(
  "20261107157000_marketplace_catalogue_foundation.sql",
  "20261107158000_marketplace_connections_foundation.sql",
  "20261107159000_marketplace_xero_parity_addendum.sql",
  "20261107160000_marketplace_integration_engine.sql",
  "20261107161000_marketplace_security_controls.sql",
  "20261107162000_marketplace_oauth_approval_consent.sql",
  "20261107163000_marketplace_oauth_suspend_catalogue_hardening.sql"
)

foreach ($name in $files) {
  $path = Join-Path "supabase\migrations" $name
  Write-Host "Applying $name..."
  npx.cmd supabase db query --remote --yes -f $path
  if ($LASTEXITCODE -ne 0) { throw "Failed: $name" }
  $version = $name.Substring(0, 14)
  npx.cmd supabase migration repair $version --status applied --remote --yes
  if ($LASTEXITCODE -ne 0) { throw "Repair failed: $version" }
}
```

## CI / verification (read-only)

```powershell
cd D:\MyApp\StreakBooks
$env:SUPABASE_YES = "1"

npx.cmd supabase migration list --remote

npx.cmd supabase db query --remote --yes --read-only @"
SELECT to_regclass('public.marketplace_apps') AS marketplace_apps,
       to_regclass('public.app_installations') AS app_installations,
       to_regclass('public.integration_connections') AS integration_connections,
       to_regclass('public.app_connection_consents') AS consents,
       to_regclass('public.marketplace_security_reviews') AS security_reviews,
       EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'list_company_marketplace_apps') AS list_company_apps,
       EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'request_marketplace_app_install') AS request_install,
       EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'list_public_marketplace_catalogue') AS public_catalogue,
       (SELECT count(*) FROM public.role_permissions WHERE permission LIKE 'appstore.%') AS appstore_perms,
       (SELECT count(*) FROM public.role_permissions WHERE permission LIKE 'developer.%') AS developer_perms,
       (SELECT count(*) FROM public.marketplace_apps) AS app_rows,
       (SELECT count(*) FROM public.role_permissions WHERE role = 'owner' AND permission = 'appstore.view') AS owner_has_view;
"@
```

After apply: hard-refresh the browser (or sign out/in) so the session permission cache reloads. Demo Company owners/admins should leave the **No App Store access** empty state.

## App gates (local — do not start GitHub Actions)

```powershell
cd D:\MyApp\StreakBooks
npm.cmd exec -- vitest run src/lib/app-store
# optional: npm.cmd run check:ui
# optional: npm.cmd run check:navigation
```

## Explicitly unsafe

- `npx supabase db push` / `db reset` against production
- `migration repair --status reverted` without a restore plan
- Setting `real_customer_data_enabled = true` before vault + E2E + isolation verification
- Force-push rewriting commits already on Lovable/GitHub main
- Triggering GitHub Actions / `workflow_dispatch` for this apply
