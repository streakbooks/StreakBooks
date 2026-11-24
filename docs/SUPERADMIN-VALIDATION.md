# Validation results

Date: 30 October 2026.

## Verified

| Check                    | Result                                                                                                                                                                                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline regression      | 132 files, 903 tests passed before changes.                                                                                                                                                                                              |
| Final regression         | **134 files, 916 tests passed**. Includes accounting, tax, sales, purchases, banking, subscription and existing tenant-isolation tests, plus new request/CSV/refund-policy/scoped-permission tests.                                      |
| TypeScript               | `npm run typecheck` passed.                                                                                                                                                                                                              |
| Changed-source ESLint    | Passed for new platform code and modified billing, routing, company-context, permission-hook, creation-menu and journal components. This is a targeted lint run, not a claim that all pre-existing repository lint issues were repaired. |
| Production build         | `npm run build` passed and generated the existing Nitro/Vercel output. Existing validator deprecation/bundler warnings remain.                                                                                                           |
| Whitespace               | `git diff --check` passed.                                                                                                                                                                                                               |
| Platform security SQL    | Passed against the connected StreakBooks database after the final migration. Fixtures rolled back.                                                                                                                                         |
| Platform operations SQL  | Passed against the connected database, including explicit Create versus Edit permissions, separately authorized Export, scoped company navigation, firm link caps and transactional price publication/rollback. Fixtures rolled back.    |
| Platform enforcement SQL | Passed against the connected database: custom storage limits, preservation of existing fixture invoices after suspension, and maintenance read/write separation. Fixtures rolled back.                                                   |
| New RPC exposure audit   | Twelve new public entry points were verified as invoker functions with no anonymous EXECUTE. No direct authenticated grants on seven control-plane tables.                                                                               |
| Fixture cleanup          | Checked fixture-user prefixes had zero remaining records; all database suites end with ROLLBACK.                                                                                                                                         |

The integration tests exercise actual PostgreSQL functions, RLS, grants, triggers and transactions with disposable fixtures. They simulate Auth claims only within administrator-run test transactions; they do not prove HTTP token verification, actual MFA enrollment or end-to-end browser authentication. Existing signed-token middleware is preserved.

## Browser and provider status

`npm run test:e2e` completed with **8 skipped tests**, because authorized E2E credentials/session state were not supplied. This is **not a UI pass**. A separate Chromium launch probe also confirmed that the Playwright browser executable is absent. Three Superadmin browser scenarios are supplied in `e2e/platform.spec.ts` for an authorized AAL2 test session.

No provider payment, refund, email or infrastructure probe was executed. Refund ownership/currency/captured-amount rules are unit-tested; their actual Stripe workflow awaits configured credentials and a sandbox payment. The server readiness display distinguishes configured credential presence from verified connectivity.

No load test, penetration test, infrastructure encryption review, backup creation, backup restore, production deployment or published repository push was performed.

## Security advisor snapshot

The final advisor scan reported:

- 6 pre-existing mutable-search-path findings.
- 30 anonymous-executable definer-function findings, down from 32 before the firm helper grant tightening.
- 141 authenticated-executable definer-function findings, including intentional existing accounting helpers. Each still requires individual review rather than blanket grant changes.
- Leaked-password protection disabled in provider Auth configuration.
- One informational no-policy finding for the private request-rate table, intentionally inaccessible to callers and used only by its checked definer helper.

See `SUPERADMIN-HANDOFF.md` for remediation links, deployment dependencies, the role matrix and explicit implemented/partial/unimplemented feature classifications. These findings mean the delivery should not be described as a completed enterprise security certification.

## Files and delivery

All implementation changes, eight applied migrations, three database suites, the new browser suite and documentation are present in the repository working tree. Dependencies and lockfiles were not changed. No git history was rewritten and no changes were pushed.

The designated external downloads directory `/codex/browser/projectless/0001-files-pasted-by-the-user-uploaded-pasted-text-po/output` is unavailable on this execution machine (ordinary creation returned a read-only-filesystem error; an elevated creation attempt returned OS permission denied). Reports are therefore retained with the repository under `docs/`; no nonexistent downloadable artifact is claimed.
