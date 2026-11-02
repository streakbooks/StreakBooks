# Proposed start-month backfill

Status: proposal only. This SQL has not been applied. No local database was rebuilt, so there is no local dry-run copy.

## Rule

Set `started_at` from `trial_started_at` only when `started_at` is null and `trial_started_at` is not null. Do not copy `updated_at`. A subscription with neither a stored start nor a trial start stays null and stays out of a start month.

## Read-only counts on 2 November 2026

Hosted project `ipxflpzfcqwtenodbxwc`, all subscription rows:

| | Count |
| --- | --- |
| Subscriptions | 3 |
| Demo businesses | 2 |
| Non-demo businesses | 1 |
| `started_at` already set | 0 |
| Missing start | 3 |
| Missing start but `trial_started_at` is set | 1 |
| Non-demo rows that would gain a start | 1 |

If the statement below is later approved, the after counts would be 1 with a start and 2 still unknown. The one row that would change belongs to the non-demo business. The two unknown rows are demo businesses. That is a projection, not an executed update.

## SQL to review

```sql
BEGIN;
UPDATE public.company_subscriptions
SET started_at = trial_started_at
WHERE started_at IS NULL
  AND trial_started_at IS NOT NULL;
-- Inspect the counts, then ROLLBACK unless this proposal is approved.
ROLLBACK;
```

Approval of this file is required before any run, including a rolled-back dry-run on the hosted database.
