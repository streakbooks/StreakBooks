# LinkBooks — Master progress tracker

| Field                  | Value                                                             |
| ---------------------- | ----------------------------------------------------------------- |
| **Updated**            | 2026-11-17                                                        |
| **Baseline commit** | `fa57d602` (GitHub `main` after #248 first-session recon opening) |
| **Programme**          | Complete module coverage & zero-gap execution (originality-first) |
| **Authoritative repo** | https://github.com/linkbusinessadvisory/LinkBooks                 |

## Originality-first & IP protection

Independent LinkBooks product. Competitors are functional references only. See [IP_AND_DEPENDENCY_COMPLIANCE.md](./IP_AND_DEPENDENCY_COMPLIANCE.md).

## Measured overall status

| Metric                                             | Value                             | Evidence                                                                      |
| -------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------- |
| Complete and Verified (staging + production gates) | **0**                             | No module has authenticated staging + production verification in this tracker |
| Merged to main (code present)                      | Many core bookkeeping paths       | See integration / B9 tables                                                   |
| Deployed / live migrations applied                 | **Not verified / not authorized** | SQL on disk ≠ applied                                                         |
| GitHub Actions job execution                       | **Blocked (infra)**               | Jobs fail in ~1–2s with 0 steps on private repo                               |

## Status lanes (do not conflate)

| Lane                 | Meaning                                               |
| -------------------- | ----------------------------------------------------- |
| Completed (local/PR) | Implemented and locally tested; may still be draft    |
| Merged               | On GitHub `main` SHA                                  |
| Tested               | Named suite + counts/revision recorded                |
| Deployed             | Hosted app URL verified                               |
| Production-ready     | Auth staging + production gates passed — **none yet** |

## Merged this programme wave (code on main — not production-certified)

| PR        | Topic                                                      | Main tip after     |
| --------- | ---------------------------------------------------------- | ------------------ |
| #229–#236 | AP as-at, PO receive/match/partial bill, voids, statements | through `a053e7f4` |
| #239      | Typecheck + migration identity hotfix                      | `d2ba900a`         |
| #240      | Tracker docs                                               | `7172e6d5`         |
| #241      | UI route-screen audit fix                                  | `5d2fc838`         |
| #242      | Sales credit-limit authorise gate                          | `40ce7965`         |
| #237      | Restore executable `quality.yml`                           | `9fa6ac2b`         |
| #243      | Copy bill (purchases)                                      | `69736680`         |
| #244      | Supplier credit-limit authorise gate                       | `526724d1`         |

## Open / in progress

| Item                                                                                   | Status                          | Notes                                                           |
| -------------------------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------- |
| [#225](https://github.com/linkbusinessadvisory/LinkBooks/pull/225) Coding Memory       | **Draft, rebased** (`1f695a50`) | Local unit 27/27; keep draft; migration not applied             |
| [#227](https://github.com/linkbusinessadvisory/LinkBooks/pull/227) Large release gates | Draft / conflict risk           | Prefer #237 for CI; rebase/close remainder later                |
| [#238](https://github.com/linkbusinessadvisory/LinkBooks/pull/238) POS draft           | Unrelated draft                 | Do not overwrite                                                |
| Copy supplier credit note                                                              | **Merged** (#247)               | On `af14b142` — not production-certified                        |
| First-session recon opening from Account Details | **Merged** (#248) | On `fa57d602` — not production-certified |
| Ledger-only truncate fail-closed | **In PR** | UI + server block when outstanding GL list exceeds review cap |
| Actions hosted runners / minutes                                                       | **Blocked**                     | Org billing API 404/403; 0 self-hosted runners; jobs `steps=[]` |

## CI investigation (evidence)

- Repo `actions` permissions: enabled, `allowed_actions=all`.
- Org Actions permissions API: **403**; billing Actions API: **404** (needs org admin).
- Self-hosted runners: `total_count=0`.
- Post-#237/#243 runs still fail with jobs `ubuntu-latest`, conclusion failure, **steps=0**, ~1–2s (e.g. https://github.com/linkbusinessadvisory/LinkBooks/actions/runs/44108827702).
- Interpretation: workflow YAML is valid; **runner allocation / minutes / org policy** still prevent job start. Not a content failure of typecheck/lint.

## Local verification (this wave, on `69736680` + supplier-credit-limit branch)

| Check                                  | Result               |
| -------------------------------------- | -------------------- |
| `npm run typecheck`                    | Passed               |
| Unit: copy-bill + sales credit-limit   | 8 passed             |
| Unit: supplier-credit-limit            | 7 passed             |
| Full lint / E2E / production build     | Not re-run this wave |
| Staging / production / live migrations | Not authorized       |

## Next executable steps

1. Keep #225 draft until Coding Memory migration isolated-tested; do not claim production-ready.
2. Org admin: restore Actions minutes/spending so quality gates execute.
3. Apply purchase/coding-memory migrations only with explicit authorization.
4. Next P0/P1: banking recon depth (without duplicating #225/#238).
5. Authenticated staging lifecycle for sales/purchases credit-limit + copy-bill (not yet run).
