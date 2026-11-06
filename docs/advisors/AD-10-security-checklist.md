# AD-10 — Advisors security checklist

## Auth surfaces

| Class | Rule | Examples |
| --- | --- | --- |
| Public | Capability/token or rate-limited SECURITY DEFINER; no platform keys | catalogue, chat, booking, proposal/agreement tokens |
| Platform | `requireSupabaseAuth` + `private.require_platform('billing.view'\|'billing.manage')` | `platform_advisors_*` |
| Portal | `requireSupabaseAuth` + `linked_user_id = auth.uid()` | `advisors_portal_*` |
| Worker | Platform manage or `service_role` | reminder claim / mark / reclaim |

Sensitive Advisors tables remain RPC-only (direct `authenticated` DML revoked). Published catalogue tables allow public `SELECT` only.

**Grant trap:** on the linked project, `CREATE FUNCTION` / replace can leave **explicit `anon=X`** ACLs even after `REVOKE … FROM PUBLIC`. Privileged Advisors RPCs must also `REVOKE … FROM anon` (see `20261106211000_advisors_revoke_anon_privileged.sql`).

## Accounting / billing integrity

- Proposal accept and agreement accept **must not** start paid subscriptions (`subscriptionStarted: false`).
- Paid billing starts only via explicit prepare → existing `createCheckoutFor` → attach with a **non-null** checkout id that belongs to the Advisors billing company.
- `is_demo` must never gate posting, validation or reporting in Advisors code.

## Rate limits

`private.advisors_chat_rate_ok` covers chat, book, proposal/agreement, slot listing, and manage-token get/cancel/reschedule.

## Reminders

- Book schedules 24h and 2h email reminder rows.
- Claim uses `FOR UPDATE … SKIP LOCKED`, reclaims stale `claimed` (>15 minutes), and increments attempts once on claim (failed retries can increment again).
- Cancel/reschedule cancels outstanding reminder rows.

## Secrets

- Resend and provider secrets stay server-side.
- Public Advisors server functions use publishable Supabase credentials only.

## Calendar OAuth

Google/Microsoft calendar OAuth remains optional/`not_configured`. Native booking is the source of truth.
