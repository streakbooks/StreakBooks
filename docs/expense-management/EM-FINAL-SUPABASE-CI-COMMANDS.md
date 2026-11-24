# Final Supabase CI commands & migration (Expense Management)

Linked project: `ipxflpzfcqwtenodbxwc` (linkbook / production).

**Do not** run blind `supabase db push` on this project — remote history has versions with no local file (see `docs/decisions/006-main-and-migrations.md`).

## Apply new EM SQL (already done 2026-11-07 for `20261107120000`–`20261107156000`)

```powershell
cd D:\MyApp\StreakBooks
$env:SUPABASE_YES = "1"

Get-ChildItem supabase\migrations\20261107*.sql |
  Sort-Object Name |
  ForEach-Object {
    Write-Host "Applying $($_.Name)..."
    npx.cmd supabase db query --remote --yes -f $_.FullName
    if ($LASTEXITCODE -ne 0) { throw "Failed: $($_.Name)" }
    $version = $_.BaseName.Substring(0, 14)
    npx.cmd supabase migration repair $version --status applied --remote --yes
    if ($LASTEXITCODE -ne 0) { throw "Repair failed: $version" }
  }
```

## CI / verification (read-only)

```powershell
cd D:\MyApp\StreakBooks
$env:SUPABASE_YES = "1"

# History: every EM version should show local + remote
npx.cmd supabase migration list --remote

# Objects + smoke row
npx.cmd supabase db query --remote --yes --read-only @"
SELECT to_regclass('public.expense_claims') AS expense_claims,
       to_regclass('public.expense_management_settings') AS settings,
       EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'list_expense_claims') AS list_claims,
       EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'save_expense_claim') AS save_claim,
       EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'batch_reimburse_expense_claims') AS batch_pay,
       (SELECT count(*) FROM public.role_permissions WHERE permission LIKE 'expenses.%') AS expense_perms,
       (SELECT count(*) FROM public.expense_claims) AS claim_rows;
"@
```

## App gates (local)

```powershell
cd D:\MyApp\StreakBooks
npm.cmd run test -- --run src/lib/expenses
npm.cmd run check:ui
npm.cmd run check:navigation
# optional full: npm.cmd run typecheck
```

## Explicitly unsafe

- `npx supabase db push` / `db reset` against production
- `migration repair --status reverted` without a restore plan
- Force-push rewriting commits already on Lovable/GitHub main
