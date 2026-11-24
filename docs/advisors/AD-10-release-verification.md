# AD-10 — Advisors release verification

Local-only. Do **not** run GitHub CI unless explicitly authorized.

## Automated local gate

```powershell
cd D:\MyApp\StreakBooks
npm.cmd run verify:advisors
```

This runs typecheck, UI/bundle contracts, and Advisors unit tests.

## Manual smoke (authenticated staging / local)

1. `/advisors` — services + plans render; chat does not auto-open.
2. Book a consultation — conflict protection + manage token.
3. Proposal/agreement token pages — accept does **not** open paid checkout.
4. Admin: prepare Advisors subscription → checkout → attached checkout id matches created row.
5. Portal invite → accept with invited email → `/advisors-portal` home.
6. Document mark-uploaded + portal message round-trip.
7. With Resend configured: `dispatchAdvisorsBookingReminders` sends due rows.

## Recovery

- Remote Advisors SQL applied via `supabase db query --remote --yes -f …` (not silent `db push`).
- Record versions in `supabase_migrations.schema_migrations` and `NOTIFY pgrst, 'reload schema'`.
- Abandoned reminder claims reclaim after 15 minutes.

## Out of scope for this gate

GitHub Actions, production deploy, calendar OAuth, second payment engine.
