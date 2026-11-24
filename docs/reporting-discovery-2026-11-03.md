# Reporting discovery batch — 3 November 2026

## Completed

The Reports Centre now persists its report search and category in validated URL state. Reloading or returning through native reporting-module links retains those filters, independently of the reporting period. Search matches every entered word across report titles, descriptions, tags and IDs, so `profit loss` finds Profit and Loss without requiring the exact title. Search is case-insensitive and wildcard characters remain literal.

Extracted the existing browse UI into `ReportCatalogue`, shared by the real route and component-browser harness. Category choices remain stable while searching: the previous implementation removed the chosen option when a query had no matches in that category. Added an accessible result count and Clear filters action that removes discovery filters without removing dates. Queries are bounded to 120 characters and categories are checked against the existing catalogue. Only report categories containing catalogue entries are offered, and only matching nonempty sections are rendered.

## Already existing and preserved

The report catalogue, category directory, popular report links, period propagation, report runners, saved custom reports, favourites, recent activity, standard statement controls, exports, permission checks and reporting-feature gates remain in use. No second report catalogue, database table, API or calculation engine was added. This batch does not change accounting calculations, production data, database schema, the Dashboard or Bookkeeping Attention Centre.

## Audit findings and limitations

Verified the discovery defects against the route's local state and query-derived category options, and reviewed the current catalogue/search parser, directory, reporting overview and browser harness. The earlier inclusive-range fix remains on this branch. This is a scoped functional audit and implementation batch, not the comprehensive audit or full redesign requested in the master brief. The broad report-library expansion, financial-reconciliation acceptance and independent accounting review remain pending. Existing catalogue `ready` statuses were preserved; this review does not certify every runner against live data.

## Testing

- Final full unit suite: **1,606 passed in 227 files**.
- Focused catalogue/centre-search suite: **24 passed**.
- Reporting browser fixtures: **19 passed** in the full run, including 16 preceding scenarios and 3 initial discovery scenarios. Final targeted discovery run: **4 passed**, covering the added multiword search scenario as well. These are component fixtures, not authenticated server/database acceptance.
- TypeScript: passed.
- Production build: passed, with existing framework/configuration warnings.
- Changed-source ESLint: passed with no output.
- Whole-repository ESLint: **failed with 20 formatting errors and 20 warnings**. Errors are in `DocumentPostingJournals.tsx`, `posting-journal-sources.ts`, and `posting-journals.functions.ts`. `git diff --exit-code origin/main -- <those files>` passes: these files are unchanged from the authoritative main branch. They remain outside the reporting scope.
- Navigation source audit: passed, 23 files and 11 reporting tabs.
- Lookup architecture audit: passed, 132 declarations and zero violations.
- Diff whitespace check: passed.
- One initial full unit run overlapped the final multiword search edit and failed that new assertion against its earlier loaded implementation. The subsequent complete run on current source passed all 1,606 tests.
- Authenticated browser → server → database and live export reconciliation were not executed; authorized staging account/session setup remains unavailable.

## User testing at localhost

1. Run `npm run dev`, visit http://localhost:8080, sign in with an authorized account, select a company, and open Reports → All reports.
2. Set the reporting dates. Search `profit loss`: Profit and Loss should appear. Open it and verify those dates remain selected.
3. Return to All reports, search `aged`, select Sales & Receivables, then reload. Both discovery filters should remain, showing one matching report.
4. Select Financial Statements while retaining `aged`. The selected category should remain visible and the catalogue should show zero results with a clear empty state.
5. Choose Clear filters. All reports should return and reporting dates should stay unchanged.
6. Set discovery filters, switch to Overview and back to All reports through the module links. Verify the query/category remain. Use browser Back/Forward to verify module history; editing search uses URL replacement to avoid an entry per keystroke.
7. At a narrow/mobile viewport, verify controls wrap without horizontal page overflow. Use Tab to reach Clear filters and Enter to activate it.

## GitHub and next development

Authoritative repository: https://github.com/streakbooks/StreakBooks . Branch: `feature/reporting-inclusive-ranges`, based on its current main. No main merge, deployment or production migration is performed. GitHub PR creation through the configured API previously returned Forbidden; branch publication and PR status must be reported separately.

Next priorities: complete the runner-by-runner reporting audit on this authoritative base, establish authenticated ledger/export acceptance, and continue the highest-value verified report defects and customization gaps. Repository-wide document-posting formatting errors and GitHub API access are separate release blockers.
