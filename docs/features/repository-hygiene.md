# Feature design: repository hygiene and deterministic development setup
**Priority:** P0 foundation · **Owner:** platform engineering · **Schema migration:** none

## Problem
At the baseline revision, the tracked root `.env` contains Supabase project URLs, identifiers and **publishable** credentials, and the root `.gitignore` contains only a Supabase temp rule. No privileged service-role value was found in the inspected tracked environment file. Without tracked-file checks, local runtime secrets and Vercel/Wrangler/generated folders can accidentally enter commits.

## Independent implementation design
- **Data model:** unchanged; no SQL, tables, accounting journals or client records modified.
- **API:** unchanged; no new endpoint.
- **Repository:** remove `.env` from Git tracking; ignore `.env` and variants while preserving `.env.example`. Ignore generated output, dependencies and ephemeral test artifacts.
- **Safety guard:** `scripts/check-repository-hygiene.mjs` inspects Git's tracked-path index and ignore rules; fail fast when forbidden sensitive/build files are tracked or ignore policy is weakened. Test path predicate separately using Node's test runner.
- **CI:** add guard to quality workflow **before** install/tests/build; do not read or print actual environment values.
- **UI:** no visible changes. The existing app uses the current `.env` only locally; deployed environments must supply settings from environment management.

## Acceptance
1. `git ls-files .env` returns no path. `git check-ignore --no-index -q .env` passes.
2. The sample `.env.example` remains tracked.
3. `node scripts/check-repository-hygiene.mjs` and Node test suite pass.
4. Full TypeScript, unit, lint, database checks and production build pass on the feature head.
5. Local setup instructions preserve the developer's private environment values before pulling any deletion; no test credentials, secret values or real client data committed.

## Rollout and known limits
Deleting a **tracked** `.env` from Git can remove the file on an updated local checkout. Before pulling, back up your local `.env` outside the repository; restore it afterward if still needed. Publication of already-known **publishable** project keys is not equivalent to leaking a Supabase secret. This feature does not scrub Git history or detect secret values under misleading filenames; run secret scanning and rotate any true secret discovered in history. No force-push or history rewrite.

