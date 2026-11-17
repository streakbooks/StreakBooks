# Permissions and security evidence

| Operation                                | Required permission / boundary                                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Catalogue preview and register workspace | `pos.view`, authenticated company access                                                                     |
| Create register / assign location access | `pos.settings.manage`; active tenant location/account/member validation                                      |
| Open register session                    | `pos.register.open` plus POS view and assigned location (setup managers have company-wide location access)   |
| Count and close session                  | `pos.register.close` AND `pos.cash.count`; opening cashier or setup supervisor, with current location access |
| Select cashier names/emails              | Setup permission AND existing `members.view`; active company members only                                    |
| POS audit review                         | `pos.audit.view` is registered, but a dedicated review workflow remains unimplemented                        |
| Sales/refunds/payments/stock/adjustments | Unavailable; no controls or financial RPCs exist                                                             |

Role seeds mirror TypeScript and the existing access-adjustment catalogue: owners/admins receive setup and session duties; staff/bookkeepers receive view/open/close/count but still need location grants; accountants receive view/audit; read-only receives view. Existing database role permissions and per-member denials remain authoritative. UI flags never replace command checks.

Local tests verify anonymous/private RPC denial, absent direct-write privileges, tenant and location RLS, malicious IDs/accounts, replay conflicts, exact bigint values, rollback when audits fail and competing open/close operations. Public POS functions are invokers; private elevation pins search_path and checks auth.uid(), membership and current permissions. No user_metadata authorization, service-role browser client, provider secret or card data is introduced.

Read-only hosted security advisor snapshot (2026-11-17): 92 INFO findings for RLS-without-policy, 21 mutable-search-path warnings, 26 anonymous-executable definer warnings, 726 authenticated-executable definer warnings and 1 leaked-password-protection warning. These are existing platform-wide findings, not confirmed exploits; intentional deny-all tables and guarded RPCs need individual review. No live remediation was attempted. New POS objects are not deployed and therefore were not evaluated by that hosted scan. Local Supabase CLI advisors could not connect because a full local Supabase stack is absent; real PostgreSQL catalogue/privilege tests were used locally instead. Production security is not certified.

Remaining gates: hosted advisor triage, full-schema upgrade, authenticated staging tenant/revocation testing, role-change browser journeys, device controls, step-up approvals, offline retention and provider verification. No production-readiness claim.
