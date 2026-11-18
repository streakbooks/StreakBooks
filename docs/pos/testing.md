# Test plan and evidence

Automated batch-1 tests: domain validation, catalogue-price tampering, inactive/missing/foreign items, line-rounded inclusive/exclusive tax, bigint serialization, currency minor units, bounded inputs, permission denial before reads, scoped database filters, restricted selected columns, database failures and missing company currency. Server tests mock authentication and the database: they do not prove live RLS or real-session behavior. Existing Sales posting and accounting tests are regression targets. Exact results are in the tracker and PR.

Remaining release tests:

1. Local database replay plus role/tenant/location negative tests; no live migration without authorization.
2. Browser authenticated preview: search, add/remove, quantity, refreshed price change, permission denial, company switch, failed request, no stale total, keyboard and mobile/tablet layout.
3. Financial phase: cash 110 / revenue100 / tax10; concurrency and retry; changed payload under same ID; period locks; failure rollback; no duplicate revenue.
4. Refund/cash close: item cumulative quantities and amounts, tax reversals, damaged stock policy, cash variance approvals.
5. Inventory: stock race, actual cost basis, movements/valuation/GL equality.
6. Providers: verified webhook signatures, event replay, unknown outcomes, capture/refund/settlement fees.
7. Offline/hardware: disconnect/restart/revoke, queue conflicts, physical supported devices.

Initial performance targets (proposed, not benchmarked): preview and product search p95 under 500ms server duration on 10k-product tenants; scan-to-local-cart under 100ms; cart calculation under 50ms; 10 concurrent registers with no double posting. Benchmark a staging-like DB/network and revise before advertising SLAs. Lookup is capped at 50 results and preview at 100 lines. No production performance claim.

Run the isolated browser fixture with `npx playwright test --config playwright.pos.config.ts`.
It mounts the actual POS screen with deterministic replacement hooks/services, tests desktop/tablet/mobile cart behavior, company switching, denied permission and quote failure. It does not authenticate or connect to Supabase. The fixture is confined to `e2e/pos`; production code never imports fixture data.

Local evidence for batch 1:

- Focused Vitest: 6 files / 81 tests passed (POS plus existing Sales/accounting/tax regression targets).
- Production Vite/Nitro build passed with `NODE_OPTIONS=--max-old-space-size=6144`; existing deprecation/chunk warnings remain. This creates local artifacts only.
- Module and navigation contracts passed. Shared `check:ui` fails because it references absent `src/screens/messages.tsx` on audited main; no checker was disabled or changed.
- ESLint for new POS implementation and browser fixtures passed. Including shared `modules/registry.ts` also reports two pre-existing formatting findings outside the inserted POS entry; no unrelated reformat was made.
- Default-memory TypeScript process exhausted the Node heap; final larger-memory incremental rerun passed after correcting strict test-fixture access and generating the route tree.
- Final isolated Playwright run: 6 passed, 0 failed, covering desktop/tablet/mobile, company-switch cart purge, permission denial, and quote failure/retry recovery. Earlier retry-selector failure was fixed to use the shared component's actual “Try again” label and verified recovery.
