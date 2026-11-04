# Security verification note — 4 November 2026

**Evidence level:** read-only Postgres and Supabase advisor sampling. **Not** an exhaustive authorization audit, vulnerability proof, simulated compromise or regulator certification.

## Database tests performed
With a non-mutating, rolled-back PostgreSQL transaction:
- `SET LOCAL ROLE anon` had **zero visible rows** in `journals`, `accounts`, `sales_invoices`, `bank_transactions` and `company_members`.
- `SET LOCAL ROLE authenticated` with a **synthetic non-member JWT identity**, including a simulated AAL2 claim, also returned **zero visible rows** in those five tables.
- Selected accounting ledger checks found **zero unbalanced posted journals, cross-company/orphan lines, posted journals missing lines and journals dated outside their accounting period** across 38 posted journals at the time of checking. This does not establish future posting behavior or all cross-tenant isolation.
- Core sampled financial tables had RLS enabled. Zero visibility for a synthetic outsider is **not** proof of correct access for every real member role. JWT simulation alone does not verify authenticated web sessions, MFA, token rotation, company invitation or server boundaries.

No real customer rows, auth secrets, private emails, tokens or privileged client keys were extracted for this report. No data was written and no grants or policies were changed.

## Supabase security-advisor signals
| Advisor | Findings at inspection | Interpretation and next action |
|---|---:|---|
| RLS enabled, no policy | 6 | Mostly private worker tables; often intentionally deny-all. Confirm role/grants and worker access before any policy change. |
| Anon can execute SECURITY DEFINER | 3 | Public invoice share token and two public pricing functions were identified as intentional candidates; verify token entropy, input constraints and data returned rather than revoking blindly. |
| Authenticated can execute SECURITY DEFINER | 246 | Authorization review required, but a callable routine is not automatically exploitable. Inventory tenant predicates, auth.uid checks and least-privilege grants, test cross-company negative paths. |
| Leaked-password protection | 1 | Auth configuration warning: eligible project administrator should enable and test it in Supabase Auth password settings as supported. No code changes made. |

Relevant remediation references:
- https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Next required negative tests
1. Create two isolated synthetic organizations with different owners and a read-only user (no real client names or bank data). Test server functions and RLS for journals, journal_lines, accounts, invoices, supplier payments, bank transactions, reports, tax returns and attachments.
2. Test same-user membership changes, expired sessions, MFA AAL levels and organization-owner privilege boundaries.
3. Test `ledger_health_check`, `post_journal` and posting/lock override RPCs for denied cross-company access. Record SQL-state evidence and tie report control totals back to posted entries.
4. Review the full SECURITY DEFINER function inventory by actual exposure and permission, add negative tests before any role/grant migration.
5. Validate against distinct signed-in staging users and independent accounting/security reviewers before commercial release.

**Operational limit:** no new RLS policies, privilege grants, schema migrations or tax integrations were applied by this audit.
