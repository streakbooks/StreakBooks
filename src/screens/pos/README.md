# Point of Sale review surface

Module `pos`, route `/pos`, shared `ListWorkspace`, registered outside the sidebar.
The scaffold has been replaced with a working read-only catalogue cart preview.
See `docs/pos/README.md` for scope and release gates.

Acceptance contract status:

- Shared chrome, themes/tokens, labels, loading/empty/error/retry states: implemented.
- Real authenticated server reads and company-scoped query/cache keys: implemented.
- Search, Add, quantity, Remove, Clear and Refresh prices: connected.
- Company switch: keyed cart unmount, no persistent browser cart storage.
- Dedicated POS permissions, sale/payment/stock mutation: unavailable, no controls offered.
- Native route/deep link: registered; no reusable screen export in route file.
- Isolated desktop/tablet/mobile and tenant-change browser fixtures: see test evidence.
- Authenticated staging, actual RLS, accessibility and production: pending verification.

This does not meet the complete new-module definition of done; `premiumStatus` remains
`in-progress`. Do not enable sale/payment actions until transactional release gates pass.
