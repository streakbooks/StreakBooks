# Offline design (deferred, not implemented)

Batch 1 requires online server access; no service worker, local payment queue or persistent cart is added. Query failure shows retry and no stale quote total.

Later: tenant/device/register scoped minimal encrypted caches with expiry; server-issued offline capability lease and limits; purge on logout/company switch/revocation; FIFO operation queue with unique IDs, signed sequence and payload hashes; resumable sync with idempotent server results; conflicts explicit for price/tax/stocks/period/session/permissions. Never assign server completion from a local enqueue. Require interrupted-sync tests, duplicate replays and revoked-device recovery.

Offline cash requires explicit risk limits and reconciliation. Offline card is disabled unless the named provider/device explicitly supports it. Cached customer data is minimized and prohibited where device protection cannot meet the retention policy.
