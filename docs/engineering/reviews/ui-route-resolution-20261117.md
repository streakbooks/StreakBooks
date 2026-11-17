# Delegated screen audit repair

The UI audit appended `.tsx` to every delegated screen import, so directory imports such as `@/screens/messages` crashed the gate before it could inspect the application. Resolve file and directory-index TypeScript sources, deduplicate imports, skip type-only imports and fail explicitly for missing runtime screens. No rule is disabled.

Validation: six Node regression tests passed; `npm run check:ui` passed (701 TSX files, 187 route definitions, zero violations) on main d2ba900a. This changes a Node audit helper only; no application TypeScript, build, database, browser or deployment changes. Full application tests were not run for this helper batch. Local results do not establish live security or production readiness.

Changed files: `scripts/lib/ui-route-source.mjs`, `scripts/lib/ui-route-source.test.mjs`, this report. This repair avoids the active broad #227 cleanup and #237 CI workflow edits.

Review on Windows: protect local work, `git fetch origin`, then `git switch --detach origin/fix/ui-route-screen-resolution-20261117`; run `node --test scripts/lib/ui-route-source.test.mjs` and `npm.cmd run check:ui`. Expect directory-imported screens to be audited and nonexistent runtime screens to fail. No application manual workflow or live migration is needed. No merge/deployment is authorized or performed.
