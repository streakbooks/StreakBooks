# Final Supabase CI commands & migration (Messaging)

Linked project: `ipxflpzfcqwtenodbxwc` (linkbook / production).

**Do not** run blind `supabase db push` on this project — remote history has versions with no local file (see `docs/decisions/006-main-and-migrations.md`).

## Applied 2026-11-17 (`20261117120000`–`20261117210000`)

```powershell
cd D:\MyApp\LinkBooks
$env:SUPABASE_YES = "1"

Get-ChildItem supabase\migrations\20261117*_messaging_*.sql |
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
cd D:\MyApp\LinkBooks
$env:SUPABASE_YES = "1"

npx.cmd supabase migration list --remote

npx.cmd supabase db query --remote --yes --read-only -f tmp-messaging-verify.sql
# or inline:
# SELECT to_regclass('public.messaging_settings'),
#        EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'messaging_ensure_settings'),
#        (SELECT count(*) FROM public.role_permissions WHERE permission LIKE 'messaging.%');
```

Verified after apply: tables present, `messaging_ensure_settings` / `messaging_send_message` / `messaging_create_channel` exist, 46 `messaging.*` role permissions, demo companies enabled.

## App gates (local)

```powershell
cd D:\MyApp\LinkBooks
npx.cmd vitest run src/lib/messaging src/hooks/use-messaging-connection.test.ts
npm.cmd run check:modules
npm.cmd run check:ui
npm.cmd run check:navigation
```

## Explicitly unsafe

- `npx supabase db push` / `db reset` against production
- `migration repair --status reverted` without a restore plan
- Force-push rewriting commits already on Lovable/GitHub main
