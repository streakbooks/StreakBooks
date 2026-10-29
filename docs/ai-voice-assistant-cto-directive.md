# LINKBOOKS — CTO MASTER DIRECTIVE: NATIVE AI VOICE ACCOUNTING ASSISTANT

Status: implementation specification; NOT evidence of completion.

## Mandate
Act as CTO, principal frontend engineer, backend engineer, accounting systems architect, security engineer, accessibility specialist and QA lead. Inspect the actual LinkBooks repository before changing code. Build a fully operational, original LinkBooks voice assistant integrated into the existing application and accounting engine. Do not copy any competitor UI or workflows. Do not report success from code presence alone. Preserve existing modules and project rules.

## Repository observations (verify again)
- TanStack Start / React 19 / TypeScript, TanStack Router and Query.
- Supabase JWT-backed authenticated server functions; requireSupabaseAuth, assertCompanyMember and assertCompanyPermission.
- AppShell is the global authenticated layout; useActiveCompany supplies organisation context.
- Ledger postings must use existing protected accounting functions, journal controls and RLS. Never write journal tables directly from a voice tool.
- Current package.json does not declare a voice SDK; choose a supported implementation and commit any necessary lockfile changes.

## Required end-to-end capabilities
1. Global assistant launcher in AppShell, keyboard-accessible and mobile-responsive, with docked panel and optional expanded view. Original design, clear listening/thinking/speaking/awaiting-confirmation states, text transcript, cancel/mute, captions, voice settings, and accessible reduced-motion experience.
2. True two-way conversational speech with microphone permission, interruption/barge-in, turn detection, reconnection, graceful failure and text-input fallback. Prefer current OpenAI browser WebRTC realtime architecture, with server-created short-lived credentials. Never expose a persistent API key in client code.
3. Secure, grounded accounting questions: company dashboard, account balances, cash position, unpaid and overdue invoices, bills, expenses, VAT/GST/tax summaries, fixed assets, bank reconciliation status, inventory and reporting, only when supported by existing authoritative functions. Return as-of dates, currencies, filters, source record links, and explain missing data; never invent numbers.
4. Safe action execution: navigation/search and draft-only operations first; create draft invoices/bills/contacts/journals/asset records and other workflows only through existing validated server APIs. Explicit confirmation with human-readable preview is mandatory before any persistent mutation, posting, payment, deletion, tax submission, sending communications or bulk action. Apply stronger step-up for high-impact operations. No voice-only irreversible action.
5. Backend tools use strict schema validation, server-side companyId resolution, explicit permissions, org RLS, transaction idempotency keys, period locks, balanced debits/credits, currency minor units, audit logs and rate limits. The model cannot choose an arbitrary companyId, account, amount or SQL query without independent validation. Prevent prompt injection in invoices, notes and uploaded documents.
6. Multilingual speech including English and Hindi, with reliable accounting terminology, accent tolerance and user-controlled language; do not assume recognition quality without testing. Provide spoken + on-screen replies and transcript corrections.
7. Multi-step workflow planning with bounded, inspectable steps, draft preview, citations/record references, reversible cancellation where possible and clear partial-failure recovery. Maintain conversational context scoped to user+organisation and clear it on organisation switch/logout.
8. Security and privacy: consent before microphone use, visible capture status, default no raw audio retention, retention controls, no secrets in logs, encryption of saved transcripts if enabled, cost/usage budgets, per-user rate limiting, tenant isolation and abuse testing.
9. Observability: structured traces of voice session state, tool decisions and results without secrets, latency and error metrics, feature flag, kill switch and usage-cost alerts. Production and local Vercel runtime support.

## Architecture
- First inventory existing assistant/chat/AI, navigation, API routes, server functions, permission maps, audit events and design primitives; reuse rather than duplicate.
- Create an authenticated server endpoint for voice session initiation with rate limits, organisation membership checks and short-lived credentials. Store the provider API key only on server.
- Define a server-side typed tool registry with allowlisted actions; separate read tools, draft tools and confirmed writes. Keep sensitive tool execution on the server. Do not let client-supplied function names map to unrestricted RPC.
- Build the browser audio/session adapter behind a replaceable interface, with a typed state machine and text-only fallback.
- Provide a visual UI preview before implementation and review responsive/accessibility states.
- Update database schema through versioned migrations only when required; enable and test RLS and privileges. Avoid production destructive migrations.
- Keep accounting-domain operations authoritative in existing services. Never create a parallel ledger or trust model-generated journal lines.

## TDD and verification
- Write failing tests first for command classification, input validation, confirmation boundaries, permissions, org switching, idempotency, journal locks, cancellation and error recovery.
- Add unit, integration and Playwright browser tests; verify real microphone-denied and unsupported-browser flows, simulated realtime events, transcript UX, mobile view, multilingual scenarios and server tool dispatch.
- Run npm.cmd run typecheck, npm.cmd run lint, npm.cmd test, npm.cmd run build, and targeted npm.cmd run test:e2e; fix failures and rerun. Provide actual command outputs and test counts, not unsupported claims.
- Verify read-only answers against database values and all mutations against journal balances, RLS, audit events, duplicate prevention and period locks. Test cross-tenant access and prompt injection.
- Do not seed live production financial data to test; use isolated demo/test fixtures with cleanup.

## Delivery protocol
1. Repository discovery report: existing reusable modules, gaps and risks.
2. Original visual preview.
3. Vertical slice: microphone + transcript + speech response + authorised read-only accounting query with source link, genuinely tested end-to-end.
4. Expand to read tools, drafts, confirmations and approved write tools with audit and accounting controls.
5. Harden privacy, cost, permissions, reliability, accessibility and performance.
6. Requirement-by-requirement audit: PASS / FAIL / NOT IMPLEMENTED with file paths, tests, evidence and limitations.
7. Commit and push working changes on the designated development branch; do not merge or deploy without approval. Keep going through failures where feasible; never call incomplete work production-ready.

## Absolute release gates
No leaked API key; no cross-tenant data; no unconfirmed write; no unauthorised posting; no duplicate ledger action; no silent voice failure; no invented accounting numbers; no misleading 'fully functional' claim.