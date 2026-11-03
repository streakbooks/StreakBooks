# Third-party dependency review

## New dependencies added by this modernization milestone
**None.** The repository-hygiene guard uses Node.js built-in APIs and the already-installed Git command; it adds no npm package or dependency lockfile changes. No Odoo or Xero code, icons, CSS, templates or assets were imported.

## Dependency policy for future implementation
1. Allowed for **new** direct/runtime/build dependencies: MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause (subject to transitive, patent and notice review).
2. Record package name, exact version, link, SPDX license, purpose, alternatives and transitive exceptions in this document **before** merge.
3. Preserve copyright notices and license requirements; verify the license of any optional font/image as well.
4. Reject commercial-only, proprietary, GPL/AGPL or uncertain-license additions under the owner's clean-room rule, pending explicit legal decision.
5. Existing dependencies are not certified here. Inventory using `npm ls --all` and `npm audit` and inspect each dependency's SPDX metadata and bundled LICENSE files; audit findings must be triaged before an external release.

## Inventory baseline
The current `package.json` and `package-lock.json` declare React/TanStack/Vite, Supabase JS, Radix, Zod, Vitest/Playwright, ExcelJS, pdf-lib and other tooling. This paragraph is not a legal opinion that all existing transitive packages are permissive. No runtime dependency license was changed in this milestone.

| Added package | Version | SPDX license | Purpose |
|---|---|---|---|
| None | — | — | Uses Node.js built-ins only |

