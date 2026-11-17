# Rollout and rollback plan

Batch 1 has no migration or financial mutation. Review and CI first; merge and staging/production deployment need separate authorization. Keep the review route outside the sidebar until ready for its assigned gate. Revert the batch commit to remove the route/services if needed; existing masters and accounting remain unchanged.

Future schema changes are additive and versioned with old-client compatibility; validate local migration order against concurrent purchasing work. Roll out configuration then controlled non-stock cash pilots using test organizations. Monitor posting failures, orphaned payments, duplicate-operation conflicts, cash variances, stock sync and settlements. Stop acceptance when required posting or provider reconciliation cannot be established.

For financial rollbacks, disable new acceptance and preserve sale/journal/audit history. Correct posted transactions only through approved reversals. Never drop populated POS financial tables to revert UI. Document backup/restore and outbox recovery rehearsal before transactional release. No automatic deployment, merge or live data correction is authorized by this document.
