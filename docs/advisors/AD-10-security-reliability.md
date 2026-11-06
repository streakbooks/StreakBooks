# AD-10 — Security, reliability, performance, recovery

See:

- [AD-10-security-checklist.md](./AD-10-security-checklist.md)
- [AD-10-release-verification.md](./AD-10-release-verification.md)

## Hardening shipped

Migrations:

- `20261106210000_advisors_security_hardening.sql` — checkout id required; rate limits; reminder reclaim
- `20261106211000_advisors_revoke_anon_privileged.sql` — revoke explicit `anon` execute on platform/portal/worker RPCs

1. Attach checkout requires a concrete checkout id owned by the Advisors billing company.
2. Rate limits on slot listing and manage-token get/cancel/reschedule.
3. Reminder attempt accounting + stale claim reclaim; cancel/reschedule clears pending reminders.
4. Privileged RPCs are not executable by `anon` (explicit revoke, not only PUBLIC).

App:

- `createCheckoutFor` returns `checkoutId`; Advisors attach uses it.
- `npm run verify:advisors` local release gate.
- `tests/integration/advisors-foundation-security.sql` grant smoke.
