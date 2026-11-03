# Standard report options follow-up — 2026-11-02

The standard Profit and Loss page retained its original CSV, print and saved-view controls after the reporting ecosystem merge. The shared report shell did not expose the new reporting workspaces. Reporting Centre tabs were local state, so a link could not open a specific module reliably.

The shared standard-report toolbar now includes **More options** with links to the existing custom builder, saved custom reports, management dashboards/forecasts, report packs, templates and schedule/delivery history. These are navigation actions, not claims that standard reports gained unsupported Excel, direct email or arbitrary filter functionality. Existing destination permissions and entitlements still apply.

The Reports Centre validates its module and period in URL search state. Links carry the current From/To dates. Module navigation survives refresh/back; All reports opens the standard catalogue. Toolbar actions wrap on narrow screens, and the menu fits the viewport with keyboard focus/escape behavior.

Validation: twelve search-state unit cases, twelve reporting component-browser scenarios, TypeScript, production build, changed-source lint, lookup guard and git diff checks pass. New browser coverage exercises actual menu links, retained periods, reload/back, keyboard focus and a 390-pixel viewport. These are component fixtures; live signed-in deployment verification remains separate.

No backend, database, migration, billing or permission change is required for this navigation fix. No Supabase data was modified. Deployment inspection still returns Vercel 403 for the paxaris team; serving this code requires a successful deployment containing the fix. The original acceptance scorecard and unresolved implementation/release gates remain applicable; this is not full production certification.
