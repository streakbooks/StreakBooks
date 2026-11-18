# POS Supabase CI commands and migration

Linked project: `ipxflpzfcqwtenodbxwc` (linkbook / production).

**Do not** run blind `supabase db push` on this project — remote history has versions with no local file (see `docs/decisions/006-main-and-migrations.md`).

## Applied 2026-11-18

| Version | File | Status |
| ------- | ---- | ------ |
| `20261117220001` | `pos_register_session_foundation.sql` | Applied via `db query` + `migration repair` |
| `20261118140000` | `pos_cash_sale_expected_cash.sql` | Applied via `db query` + `migration repair` |

```powershell
cd D:\MyApp\LinkBooks
$env:SUPABASE_YES = "1"

$files = @(
  "supabase\migrations\20261117220001_pos_register_session_foundation.sql",
  "supabase\migrations\20261118140000_pos_cash_sale_expected_cash.sql"
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
npx.cmd supabase db query --remote --yes --read-only --agent=no "select to_regclass('public.pos_registers')::text, to_regclass('public.pos_sales')::text;"
npx.cmd supabase db query --remote --yes --read-only --agent=no "select count(*)::int from public.role_permissions where permission like 'pos.%';"
npx.cmd supabase db query --remote --yes --read-only --agent=no "select version from supabase_migrations.schema_migrations where version in ('20261117220001','20261118140000');"
```

Verified after apply: `pos_registers` / `pos_sales` / `pos_cash_movements` present; 33 `pos.*` role_permission rows; owner includes `pos.view` and sale/refund/adjust keys; public RPCs `pos_get_workspace`, `pos_complete_cash_sale`, `pos_refund_cash_sale` present.

## App check after apply

Hard-refresh the app (or sign out/in) so active-company permission hints reload. Open `/pos/registers` — workspace should load instead of the permission error that appeared when `pos.view` was absent from `role_permissions`.

## Not claimed

- Full POS directive production readiness
- GitHub Actions green (billing may still block runners)
- Merge of PR #238
- Card providers, stock/COGS, offline, hardware
