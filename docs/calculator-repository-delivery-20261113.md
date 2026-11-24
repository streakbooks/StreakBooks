# Calculator delivery and repository correction — 2026-11-13

Authoritative repository: https://github.com/streakbooks/StreakBooks.
User workstation: `D:\MyApp\StreakBooks`; app: `http://localhost:8080`.

The original cloud checkout pointed to `streakbooks/StreakBooks`. Calculator
implementation remained uncommitted in that checkout; no calculator changes
were pushed there. The implementation was ported onto authoritative main
`a2a8a79efbf8ad11b0aa64bd00a7e64095ba0484` and published on
`feat/header-calculator` in PR #223. Until merged, pulling main will not retrieve it.

## Feature

A compact icon beside Signal opens a calculator popover with arithmetic,
parentheses, percentages, sign changes, keyboard entry, copying and an in-session
calculation tape. No financial records or database schema are changed.

## Historical audit

The legacy main tip is `a4e6dfe0`, dated 2026-11-03, outside the requested seven-day
window. The audit of all accessible legacy branches found zero commits in the requested
2026-11-06 through 2026-11-13 window. No recent commits needed transferring.
The user then instructed that all future work must use only the authoritative
repository; the legacy remote was removed from the cloud workspace.
Historical differences outside that window are not evidence of missing features:
the authoritative main has substantially newer and divergent implementation.

## Verification

- Arithmetic unit tests: 16 passed, 0 failed.
- Isolated browser scenario on the authoritative repository: passed keypad,
  keyboard input, accounting percentages, clipboard, history reuse, divide-by-zero,
  Escape, reopening and 375px mobile fit; no browser runtime errors.
- Changed-file ESLint: passed, 0 errors and 0 warnings.
- UI, native navigation and module contract checks: passed.
- Production build: passed after installing this repository's locked dependencies.
- Full TypeScript validation: failed with 107 diagnostics across 37 files, all
  unchanged from authoritative main `a2a8a79e`; zero diagnostics in the four
  calculator implementation files. The check required a 6144 MB Node heap
  after hitting the default memory limit.
- No migrations required. No deployment, authenticated staging or production
  verification performed. Main is unchanged until this PR is merged.

## Manual review

Preserve local changes with `git stash push --include-untracked` before switching
to `feat/header-calculator`. Keep that stash saved while reviewing. Install locked
dependencies with `npm.cmd ci`, start with `npm.cmd run dev`, then open
`http://localhost:8080` and click the calculator icon beside Signal.

Check `200+10%` returns `220`, `(1250+250)*1.2` returns `1800`, copying, history
reuse, divide-by-zero, Escape and reopening. Review desktop, tablet and mobile
(including landscape), keyboard focus, and light/dark themes. The isolated browser
scenario covered mobile portrait and landscape scrolling; authenticated in-app
review and production verification remain unexecuted. No financial mutations
are needed.
