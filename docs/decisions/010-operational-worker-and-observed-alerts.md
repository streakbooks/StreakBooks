# 010 — Database-local operational jobs and measured alerts

Date: 3 November 2026.

Supabase already has pg_cron. Use it for bounded database-local operational tasks,
without Vercel, outbound HTTP, provider credentials, a service-role client or a new
queue service. Extend the existing platform_jobs and platform_alert_rules stores;
platform_audit remains the audit source. These are included staff operations, not
billable customer background work or a second usage/billing system.

Two fixed handlers are implemented: persist expiry of supervised support access,
and measure/evaluate operational alerts. Names never execute SQL or a URL. Legacy
arbitrary job records stay unconfigured and cannot execute. Expiry follows the
existing company-first locking convention, retains approval/access history and
attributes scheduled events to the system. Access checks continue to deny an
expired grant immediately, independently of cleanup timing.

The worker has one transaction advisory lock and processes at most five jobs per
tick. Each job runs in a subtransaction; failure rolls back handler effects, records
a redacted SQLSTATE, applies exponential backoff capped at one hour and preserves
an attempt row. Default budget is five; reviewed retry extends it in bounded steps
to 30 total. A scheduled dead letter blocks creation of fresh jobs for that kind
until retry or explicit closure. Closure is cancellation, never successful execution.
Recurring times align to minute boundaries so subsecond cron jitter cannot skip a
whole scheduled interval. A process/transaction failure rolls back the claim.

Measurements use actual open incident, overdue case, explicitly urgent case,
implemented dead-letter job and unexpired approval-age counts. Case counts exclude
demo companies; missing deadlines are not overdue and untriaged priority is not
classified as urgent. Legacy rules stay unconfigured/paused. Missing observations
remain unknown and cannot fire or falsely recover. An active episode is unique per
rule; repeated measurements update its count and last-seen time. Recovery, operator
acknowledgment, rule changes and pausing preserve history. UTC quiet hours label
in-app observations; external email/chat/SMS delivery is not configured or claimed.

The console shows actual scheduler timestamps, attempts, error codes, retry budgets,
last measured values and stale/unconfigured states. A recent tick does not mean all
handlers succeeded. Rule configuration versions are independent of periodic measured
values. Every operator action needs reason, current permission/MFA/session, field
validation and an idempotency receipt in the existing private receipt store.

Only postgres/cron may invoke worker/measurement helpers. Two public invoker RPCs
call guarded private read/action functions. New attempt and alert tables have RLS
and no direct client grants/policies; their intended access is through the RPCs.
No customer ledger, posting rule, tenant membership or payment integration changed.

Reverse with `docs/superadmin/rollbacks/disable-platform-worker.sql`: serialize with
an active worker, disable/unschedule it and revoke mutation access. It retains jobs,
attempts, alert episodes and audit. The isolated SQL harness tests disable, actual
handler effects, fault injection, retries, dead letters, dedupe and recovery. The
hosted scheduler was separately observed completing real scheduled runs; browser
transport fixtures do not constitute that evidence.

Generated RPC types model nullable default arguments as optional strings. Omit the
argument when no ID/company filter is selected, letting the database default to
NULL. This corrects the generated-type mismatch without casting away its contract.
