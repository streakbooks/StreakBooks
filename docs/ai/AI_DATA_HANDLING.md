# AI Accounting Assistant — data-handling design

**Status:** Implementation policy for LinkBooks AI.  
**Provider decision:** Optional OpenAI-compatible HTTP API. Keys live in **server env only** (`AI_API_KEY`, never `VITE_*`). If unset, the product shows an honest “not configured” state — no simulated answers.

---

## 1. What may leave the organisation boundary

When a provider is configured **and** the user has `ai.use` for the active company, the server may send a **minimised context packet** to the provider:

| Allowed | Not allowed |
|---------|-------------|
| Account codes/names (not bank account numbers) | Full bank account / sort codes / IBANs |
| Aggregated report figures the user can already see | Other companies’ data |
| Journal memos / txn descriptions (treated as untrusted text) | Auth tokens, API keys, passwords |
| Contact **display names** (not email/phone unless needed for the ask) | Tax registration / national IDs by default |
| Document numbers, dates, amounts in minor units | Raw uploaded file bytes (MVP: text excerpts only, capped) |

Context is always loaded **after** server permission checks and **scoped to one `company_id`**.

## 2. Trust boundaries

1. Browser never receives provider keys or raw provider error bodies that might echo secrets.
2. User messages, descriptions, and retrieved text are wrapped as **untrusted input**. System instructions forbid obeying user attempts to escalate privileges, change company scope, or skip validation.
3. Model output is **never** executed as SQL, never sets `linkbooks.trusted`, and never calls PostingEngine without a separate permissioned apply path.
4. Calculated facts (TB totals, duplicate heuristics, reconcile mismatches) are produced by application code and labelled separately from model prose.

## 3. Suggestions & posting

1. Suggestions persist in `ai_suggestions` (not journals).
2. Apply requires `ai.apply_suggestion`, `confirm: true`, deterministic validation (balance, amounts, account membership), then PostingEngine when the suggestion type is a journal draft.
3. Payments / period unlock / tax filing are **out of scope** for AI apply in this phase.
4. Banner and API responses distinguish `fact` vs `explanation` vs `suggestion`.

## 4. Retention, logging, cost

1. Usage rows: company, user, intent, token estimates, latency, status — **no** full prompt/response bodies in default logs.
2. Rate limit per user+company (configurable; default 30 requests/hour).
3. Max context characters and max output tokens enforced server-side.
4. Provider failures return a clear error; no fabricated ledger facts.

## 5. Demo Company

Same AI code path as live orgs. `is_demo` does not weaken permissions or skip validation.

## 6. Financial insights (read-only reporting)

The AI Assistant's **Financial insights** panel reads LinkBooks' existing
`getManagementMetrics` reporting API. It does not ask a model to invent or
calculate ledger values. The server API independently enforces
`reports.view`, while the panel also requires `ai.use`.

- Revenue, gross profit, net profit, cash, working capital and ratios come from
  the same reporting-facts capture and financial calculations used in the Reports Centre.
- A chosen accounting basis is honoured. Without an override, the company's
  reporting-basis setting is used. Source links preserve the period and basis.
- Prior-period comparisons use the preceding **equal number of calendar days**,
  and are suppressed when the accounting bases or ranges do not match.
- Changes are absolute movements only, **not** a percentage growth or root-cause
  claim. Cash refers to bank **general-ledger** balances, not a verified bank feed.
- Margin and current-ratio values are shown as unavailable when the reporting
  calculation has no valid denominator. Exact integer minor units are formatted
  without floating-point arithmetic.
- The review observations are deterministic prompts, not accounting adjustments,
  an audit opinion, or evidence of an error. Opening the cited report is the
  next review step. They are not forwarded to the AI provider by this panel.
- This phase does not introduce a new database table, migration, posting action,
  scheduled automation or source-document attachment.


## 7. Accounting evidence explorer (human review)

The AI Assistant also includes a read-only **Accounting evidence explorer**. It
reuses the Reports Centre's authorised \`getJournalReport\` and
\`getAccountTransactions\` server functions; the browser does not query a new
unprotected ledger API or ask the language model to reconstruct journal entries.

- Requires both \`ai.use\` and \`reports.view\` UI permissions. The reporting
  API enforces \`reports.view\` again on the server; company scoping and database
  RLS remain authoritative.
- Posted journal filters include date range, source type and paginated journal
  rows. Every journal links to its original Accounting record, and supported
  source documents link back to Sales, Purchases or Expenses.
- Account investigations expose one chart-of-accounts selection at a time.
  Opening/closing balances are reported by the existing account transactions
  API, and line-level movement pages link to the journal and its source.
- The only journal integrity signals compare posted debit and credit totals,
  without asserting correctness of tax, classification, documentary support,
  reconciliation, or period cut-off. This is not an audit opinion.
- Any browser value outside safe-integer precision is labelled unavailable
  instead of being formatted with false numeric certainty. Mixed-currency
  journal pages do not display an aggregate monetary total.
- Journal page totals cover **only the displayed page**. Account opening and
  closing balances cover the selected date range under the API's reporting
  basis. They must not be confused with one another.
- The explorer has no posting, reversal, journal-editing, auto-reconciliation,
  provider call, background automation, or newly granted permission. Any
  investigative accounting action stays in the source module's protected
  workflow with existing human approvals.


## 8. Specific-journal explanations (Phase 5)

The **Explain journal** action on the evidence explorer opens a strictly
read-only account-direction interpretation of an *existing posted journal*.

- A new authenticated GET server handler first enforces **both** \`ai.use\`
  and \`reports.view\`. The journal header and all journal lines are fetched
  for one validated journal UUID and the active \`company_id\`; only
  \`status = posted\` is eligible. The 200-line cap prevents claiming a
  partial journal is a complete explanation.
- Line-level account codes, names, types, and current active flags come from
  the actual company ledger relationship, not an LLM. Debit/credit effects
  describe the standard increase/decrease convention of asset, liability,
  equity, income and expense accounts. They **do not prove** the purpose
  of the underlying transaction.
- Database minor units are handled using exact integer strings and BigInt,
  including amounts larger than JavaScript's safe integer range. Unsafe
  numeric conversions fail instead of inventing amounts.
- The source journal and supported originating document are linked for human
  inspection. Single-line account links open the existing Account
  Transactions report using the journal date and accrual basis.
- Deterministic review suggestions highlight imbalance, unusual debit/credit
  columns, inactive accounts, unavailable account type, absent memo, and
  missing source references. Every review also asks a human to verify source
  support, cut-off, tax and existing approvals.
- Checklist ticks are **ephemeral browser state** and do not assert a formal
  sign-off, update the ledger, create an approval, or write a review record.
  Copying notes uses the browser clipboard only and is initiated by the user.
- This feature never calls an AI provider or sends individual journal details
  externally. It makes no journal posting, reversal, payment, reconciliation,
  role change, background action or database migration.


## 9. Persistent AI journal review queue (Phase 6)

Cases, comments and review event history are retained per company in
\`ai_journal_review_cases\` and \`ai_journal_review_events\`. This queue is
**not** an accounting journal, an accountant-exception approval, or an
authorization to post, reverse, reconcile or release a payment.

- A user with \`ai.use\` and \`reports.view\` can open a case against an
  existing **posted journal** or comment on a case that their company can access.
  Cases are unique per company and journal. Duplicate creation is rejected;
  re-open an existing case instead.
- Assigning a reviewer requires \`ai.apply_suggestion\` and \`members.view\`.
  The chosen colleague must already be an active company member with effective
  reviewer permission. Assignment does **not** grant company membership or
  account permissions. The case creator cannot be assigned to review it.
- A signed-off **AI evidence review** requires a minimum-ten-character
  rationale and the authenticated, assigned reviewer with
  \`ai.apply_suggestion\`. It can never be self-signed by the creator. A
  manager can reopen a review with a recorded reason, which invalidates the
  previous active sign-off while preserving its audit event.
- Every transition uses one transaction-level SQL RPC with a row lock and
  positive optimistic \`version\`; stale clients must refresh instead of
  overwriting another person's notes, assignment or status. Events are
  append-only: open, assign, comment, sign_off and reopen, including actor,
  before/after status, note, assignee and timestamp.
- Both tables use organisation-member + \`ai.use\` + \`reports.view\` SELECT
  RLS and the existing MFA policy. There are **no authenticated direct
  INSERT, UPDATE or DELETE grants**. The deliberately exposed, restricted
  SECURITY DEFINER RPC checks \`auth.uid()\`, MFA, membership, company
  permissions, posted-journal identity and transition rules in the database;
  \`EXECUTE\` is revoked from public and anonymous callers.
- The client displays a server-paginated 25-case list with status and
  assigned-to-me filters and up to 100 recent immutable events for a case.
  The current UI does not constitute a full formal audit-workpaper export.
- The review queue never sends journal evidence or notes to an external
  model. Stored comments may contain sensitive accounting details; only
  authorised organisation members can read them. Retention/deletion policy
  for completed review history requires separate governance approval.
- Supabase migration version: \`20261106075054_ai_journal_review_queue.sql\`,
  applied to project \`ipxflpzfcqwtenodbxwc\`. Existing journal posting,
  journal approval, accountant exception and period-lock workflows are
  unchanged. A completed AI review has **no direct effect** on them.
