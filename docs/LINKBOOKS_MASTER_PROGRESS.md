# StreakBooks — Master progress tracker

| Field                  | Value                                                             |
| ---------------------- | ----------------------------------------------------------------- |
| **Updated**            | 2026-11-17                                                        |
| **Baseline commit**    | `1056a3f2` (GitHub `main` after banking match permission #261)    |
| **Programme**          | Complete module coverage & zero-gap execution (originality-first) |
| **Authoritative repo** | https://github.com/streakbooks/StreakBooks                 |

## Honest completion status (addendum)

| Gate                                                 | Measured result     |
| ---------------------------------------------------- | ------------------- |
| Complete and Verified modules (staging + production) | **0**               |
| Full 43-module deep audit + competitor matrix        | **Not complete**    |
| Gap register exhaustive per §4 fields                | **Partial**         |
| Production-ready product claim                       | **Not allowed yet** |

## Status lanes (do not conflate)

| Lane             | Meaning                                    |
| ---------------- | ------------------------------------------ |
| Merged           | On GitHub `main`                           |
| Tested           | Named local/isolated suite recorded        |
| Deployed         | Hosted URL verified                        |
| Production-ready | Auth staging + production gates — **none** |

## Merged this wave (code on main — not production-certified)

| Item                                                               | Topic                                              | Tip                |
| ------------------------------------------------------------------ | -------------------------------------------------- | ------------------ |
| #246–#256, `b090bfc8`                                              | Banking honesty, copy paths, AP totals, copy quote | through `98d93735` |
| [#225](https://github.com/streakbooks/StreakBooks/pull/225) | Coding Memory events/suggestions                   | `2ba48da1`         |
| [#257](https://github.com/streakbooks/StreakBooks/pull/257) | AR authorise totals + journal reverse gate         | `e816268e`         |
| [#258](https://github.com/streakbooks/StreakBooks/pull/258) | AP/AR save-and-authorise posted-unlinked honesty   | `c24ac11a`         |
| [#259](https://github.com/streakbooks/StreakBooks/pull/259) | Tracker refresh (#257/#258 + Actions blocker)      | `2ce28a7e`         |
| [#260](https://github.com/streakbooks/StreakBooks/pull/260) | Copy purchase order                                | `6ddbd729`         |
| [#261](https://github.com/streakbooks/StreakBooks/pull/261) | Banking match permission fail-closed               | `1056a3f2`         |

## Critical blockers (production-ready cannot clear these alone)

| Blocker                                        | Evidence                                                                                                                                      | Owner                 |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| GitHub Actions jobs fail ~1–2s                 | Runs e.g. [44124992677](https://github.com/streakbooks/StreakBooks/actions/runs/44124992677); runners `total_count=0`; jobs `steps=[]` | Org admin             |
| Coding Memory / purchase SQL on disk ≠ applied | Migration `20261117104621_bank_coding_memory_events.sql` committed; **live apply not done**                                                   | Explicit migrate auth |
| Authenticated staging / production lifecycle   | Not executed in this tracker                                                                                                                  | Ops + auth            |
| Full module audit / competitor gap depth       | Still Partial for most of M-01…M-42                                                                                                           | Continued programme   |

## Open PRs (coordinate — do not blindly overwrite)

| PR                 | Notes                                                   |
| ------------------ | ------------------------------------------------------- |
| #252               | Lint mega (~597 files) — merge carefully / after rebase |
| #253               | Lookups draft                                           |
| #251 / #238 / #227 | Drafts                                                  |

## Next executable steps

1. Ship void posted purchase expense; then AP credit update-on-retry if still needed.
2. Org admin: restore Actions minutes / hosted runners.
3. Isolated DB: apply Coding Memory migration; run fixture suite — then staging with auth.
4. Do **not** mark modules Complete and Verified without staging/production evidence.
