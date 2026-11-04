# Settings Centre: responsive UX and workflow-defaults improvements

## Delivered scope

- A contextual Settings Centre heading, responsive category selector on small screens and a bounded scrollable desktop sidebar.
- Overview cards for actual server-computed feature counts, direct settings shortcuts, refresh and retry states, configuration warnings and real integration status.
- On-demand fetching for extended organisation settings and audit records, rather than fetching them on every visit to unrelated sections.
- Search and results count for Feature Manager, including a clear empty-result state and internal navigation through TanStack links.
- Workflow defaults editor: explicit whole-number payment terms (0–3650), inline validation, discard changes, loading/error states, and protection against overriding unrelated sales/purchases values when saving this form.
- Tests for payment-term validation and Feature Manager filtering.

## Accounting and security boundaries

No changes to the posting engine, immutable journals, financial-period locks, permission RPCs, tenant RLS or database schema. Existing settings-server functions and permissions remain authoritative. Feature-state badges and integration status reflect existing data; no connector is claimed live without a verified provider.

## Verification plan and limits

GitHub quality gates cover TypeScript, changed-file linting, unit tests, isolated PostgreSQL suites, navigation contracts, browser test discovery and the production build. Real mobile/device and assistive-technology testing still require an authenticated browser environment. This change does not wire external integrations, create missing tax/asset workflows or change subscription providers.

Local review after a verified merge:

```powershell
cd D:\MyApp\LinkBooks
git status --short
git switch main
git pull --ff-only origin main
npm.cmd run dev
```

Then open `http://localhost:8080/settings` at desktop and narrow widths. Test Overview, search, Feature Manager, Sales and Purchases settings, Automation, period locks, audit and refresh. In Automation check payment terms `0`, `30`, empty, negative and decimal values; confirm unrelated Sales/Purchases defaults remain unchanged.

## Still not asserted complete

A fully connected production Vercel deployment of the authoritative `linkbusinessadvisory/LinkBooks` repository, authenticated staging evidence, provider deliveries and all missing functionality across the 26-category Settings registry are independently gated. A pass on code-based CI does not prove those flows are available in production.
