# LinkBooks — Master progress tracker

| Field | Value |
|-------|-------|
| **Updated** | 2026-11-17 |
| **Baseline commit** | `b090bfc8` (GitHub `main` after sales copy credit + #246/#249/#250) |
| **Programme** | Complete module coverage & zero-gap execution (originality-first) |
| **Authoritative repo** | https://github.com/linkbusinessadvisory/LinkBooks |

## Originality-first & IP protection

Independent LinkBooks product. Competitors are functional references only. See [IP_AND_DEPENDENCY_COMPLIANCE.md](./IP_AND_DEPENDENCY_COMPLIANCE.md).

## Measured overall status

| Metric | Value | Evidence |
|--------|-------|----------|
| Complete and Verified (staging + production gates) | **0** | No module has authenticated staging + production verification in this tracker |
| Merged to main (code present) | Many core bookkeeping paths | See tables below |
| Deployed / live migrations applied | **Not verified / not authorized** | SQL on disk ≠ applied |
| GitHub Actions job execution | **Blocked (infra)** | Jobs fail in ~1–2s with 0 steps on private repo |

## Status lanes (do not conflate)

| Lane | Meaning |
|------|---------|
| Completed (local/PR) | Implemented and locally tested; may still be draft |
| Merged | On GitHub `main` SHA |
| Tested | Named suite + counts/revision recorded |
| Deployed | Hosted app URL verified |
| Production-ready | Auth staging + production gates passed — **none yet** |

## Merged this programme wave (code on main — not production-certified)

| PR / commit | Topic | Main tip after |
|-------------|-------|----------------|
| #229–#236 | AP as-at, PO receive/match/partial bill, voids, statements | through `a053e7f4` |
| #239–#245 | Hotfixes, tracker, credit-limits, copy-bill, CI restore | through `150b78b3` |
| #246 | Release regression fixtures / payroll registration | `b9f4e863` |
| #247 | Copy supplier credit note | `af14b142` |
| #248 | First-session recon opening from Account Details | `fa57d602` |
| #249 | Ledger-only truncate fail-closed | `afc4cfa1` |
| #250 | Transfer auto-match statement line | `65f719e8` |
| `b090bfc8` | Sales copy credit note | `b090bfc8` |

## Open / in progress

| Item | Status | Notes |
|------|--------|-------|
| [#225](https://github.com/linkbusinessadvisory/LinkBooks/pull/225) Coding Memory | **Draft** | Keep until isolated migration test |
| [#227](https://github.com/linkbusinessadvisory/LinkBooks/pull/227) Large release gates | Draft | Prefer #237 for CI |
| [#238](https://github.com/linkbusinessadvisory/LinkBooks/pull/238) POS draft | Draft | Do not overwrite |
| [#251](https://github.com/linkbusinessadvisory/LinkBooks/pull/251) FI readiness | Draft / conflicting | Do not overwrite |
| [#252](https://github.com/linkbusinessadvisory/LinkBooks/pull/252) Lint mega-repair | Open (~28k lines) | Coordinate separately |
| [#253](https://github.com/linkbusinessadvisory/LinkBooks/pull/253) Shared lookups | Draft | Do not overwrite |
| Actions hosted runners / minutes | **Blocked** | Org admin needed |

## Next executable steps

1. Keep #225 draft until Coding Memory migration isolated-tested.
2. Org admin: restore Actions minutes so quality gates execute.
3. Coordinate #252 lint repair (large surface) without overwriting financial work.
4. Authenticated staging for credit-limit + copy + recon + transfer auto-match.
5. Next P0/P1 gaps without duplicating open drafts.
