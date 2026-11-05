# Route splitting and reusable financial screens

The 20 route modules with reusable screen exports now delegate their components to `src/screens`.
Route IDs, search validation, head metadata and parent routes stay in their original files.
Create-new panels, recurring bill overlays, in-place settings and browser fixtures import the
same screens directly. Screens use the typed `getRouteApi` for existing route context, avoiding
an import back into route registration. Shared accounting/transfer search types remain lightweight.

Accounting calculations, posting/mutation calls, query keys, permission checks, Supabase RPCs,
RLS and database migrations are unchanged. Native links and existing overlay state are retained.

## Measured build footprint

The baseline was built in an isolated worktree at main
`43631b12dccad1e0c1b8bd988b098c6194417e63`, with the same installed dependencies and environment.
The measurement follows the static JavaScript import graph of emitted `client-*` and `index-*`
bootstrap chunks. It excludes deferred screen chunks, CSS, fonts and server code.

| Metric                                                |  Baseline | After extraction |
| ----------------------------------------------------- | --------: | ---------------: |
| Statically imported modules                           |       197 |               30 |
| Minified JavaScript bytes                             | 1,808,069 |          866,276 |
| Sum of individually gzip-compressed bytes             |   587,343 |          255,990 |
| All emitted JavaScript bytes (including lazy screens) | 4,098,594 |        4,017,103 |

The bootstrap graph is about 52% smaller uncompressed and 56% smaller with gzip. These are
build measurements, not measured production latency or a promise about every route's total
transfer size. Lazy screens still load when visited. The individual shared index chunk grows,
while its static dependency graph shrinks substantially; comparing only one file is misleading.

`npm run check:bundle` enforces a reviewed budget of 1,050,000 raw / 320,000 gzip bytes after
`npm run build`. It fails if bootstrap naming changes so the entry points can be reviewed.
CI runs this check after the production build.

## Contracts and tests

- UI contracts reject reusable runtime exports from file routes. Types may still be exported.
- Route/page coverage and native navigation audits follow directly imported screens, so moving
  source does not hide actions, queries, errors or native-link checks from the inventory.
- Deep-link regression tests exercise actual route validators for invoice customers, receipt
  allocations, transfer amounts/direction and accounting journal/period links.
- Existing browser regression suites retain real financial editors and overlay/keyboard cases.
  Every fixture-only directory is excluded from the default authenticated suite; each keeps its
  own server/config so fixture actions cannot accidentally target a configured live account.
- The public UI suite runs the actual application with nonfunctional public Supabase placeholders.
  It checks sign-in, password recovery, reset and portal login in light/dark mode, at desktop,
  tablet and mobile widths, with WCAG A/AA scans and no external requests. It submits no auth
  request, posts no ledger record and uses no live account or database. It forces a fresh Vite
  optimizer cache and waits for actual headings rather than network-idle timing.

## Manual acceptance

Use a dedicated test organisation. Check invoices/quotes, receipts, bills/recurring bills,
orders, credits, expenses, payments, products, contacts, transfers, accounting, branding and
settings through both native routes and create-new/settings overlays. Preserve typed drafts,
selection, focus, native new tabs, URL search context and role restrictions. Review desktop,
tablet, mobile and all themes.

Full authenticated staging, provider callbacks, manual screen-reader review and measured
production performance remain separate live gates. No deployment or live migration is part
of this change. Actual final test counts and merge/CI links are recorded on the pull request.
