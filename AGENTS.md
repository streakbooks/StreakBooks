<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

- Auth: all app pages live under `src/routes/_authenticated/` (client-only session gate, redirects to `/auth?redirect=`); public auth pages are `/auth`, `/forgot-password`, `/reset-password`. Why: the gate is UX only — data access is enforced by `requireSupabaseAuth` server functions plus row-level security.
- Future sign-in providers are registered in `src/lib/auth-helpers.ts` `authProviders`; only enabled ones render. Why: no fake provider buttons until configured.
- Stale-asset recovery (auto-reload after a replaced build, plus the status shown across it) lives in `src/lib/recovery.tsx`; the root error component and the `vite:preloadError` listener must both route through it. Why: one owner keeps the reload once-only and stops the status being left on screen.

- `is_demo` may only gate reset, destructive-action guards, billing, external integrations, demo indicators and onboarding — never posting, validation or reporting logic. Why: the Demo Company must run on the same accounting engine as real companies.

## Mandatory final status and verification report

At the end of every LinkBooks development, fix, review, PR, merge, deployment or command-execution task,
follow [the mandatory final report standard](docs/engineering/FINAL-REPORT-STANDARD.md).
Include the result statement, complete verification table, actual PR/commit/CI links, safe Windows
PowerShell review commands, a task-specific manual checklist, and remaining limitations/next steps.
Distinguish local changes, GitHub main, deployment, isolated fixtures, authenticated staging and
production verification. Never fabricate test counts or successful migrations/deployments.
The user workstation is `D:\MyApp\LinkBooks`; the development URL is `http://localhost:8080`.
A separate cloud checkout does not modify the user's Windows project.

- Reusable route screens live in `src/screens/`. TSX file routes export only the `Route` runtime value (types are allowed); overlays import screens directly. Keep URL validators and metadata in route registration. Why: reusable route exports defeat component splitting and inflate bootstrap imports. `check:ui` and `check:bundle` enforce this boundary.

- **All newly added routes/modules are subject to the LinkBooks premium design and functional acceptance contract.** Use `ListWorkspace` / `RecordWorkspace` / `PageHeader` / shared tokens; register the module in `src/lib/modules/registry.ts`; scaffold with `npm run scaffold:module -- --id <kebab> --label <Label>`; complete `docs/engineering/NEW-MODULE-DEFINITION-OF-DONE.md`; keep actions fail-closed until authorised backends exist. Local enforcement: `npm run check:modules`, `npm run check:ui`, `npm run check:navigation`. Design system: `docs/premium-ui/LINKBOOKS_DESIGN_SYSTEM.md`.

## Authoritative GitHub repository

The user confirmed on 2026-11-13 that the authoritative repository is
https://github.com/linkbusinessadvisory/LinkBooks. Use this repository for all
future branches, pull requests and deliveries. Do not access or publish to `rohitmehra86/LinkBooks`; the user explicitly
retired it from this workflow. Work only in the authoritative repository.
The user's Windows checkout is `D:\MyApp\LinkBooks` and is separate from cloud
workspaces. Pushing a feature branch does not update `main` or the local checkout.
