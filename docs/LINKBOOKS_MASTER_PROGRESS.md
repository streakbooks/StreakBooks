# LinkBooks — Master progress tracker

| Field | Value |
|-------|-------|
| **Updated** | 2026-11-17 |
| **Baseline commit** | `9fa6ac2b` (GitHub `main` after #242 + CI #237) |
| **Programme** | Complete module coverage & zero-gap execution (originality-first) |
| **Authoritative repo** | https://github.com/linkbusinessadvisory/LinkBooks |

## Originality-first & IP protection

Independent LinkBooks product. Competitors are functional references only. See [IP_AND_DEPENDENCY_COMPLIANCE.md](./IP_AND_DEPENDENCY_COMPLIANCE.md).

## Measured overall status

| Metric | Value | Evidence |
|--------|-------|----------|
| Complete and Verified (staging + production gates) | **0** | No module has authenticated staging + production verification in this tracker |
| Merged to main (code present) | Many core bookkeeping paths | See integration / B9 tables |
| Deployed / live migrations applied | **Not verified / not authorized** | SQL on disk ≠ applied |
| GitHub Actions job execution | **Blocked (infra)** | Jobs fail in ~1–2s with 0 steps on private repo |

## Merged this programme wave (code on main — not production-certified)

| PR | Topic | Main tip after |
|----|-------|----------------|
| #229–#236 | AP as-at, PO receive/match/partial bill, voids, statements | through `a053e7f4` |
| #239 | Typecheck + migration identity hotfix | `d2ba900a` |
| #240 | Tracker docs | `7172e6d5` |
| #241 | UI route-screen audit fix | `5d2fc838` |
| #242 | Sales credit-limit authorise gate | `40ce7965` |
| #237 | Restore executable `quality.yml` | `9fa6ac2b` |

## Open / in progress

| Item | Status | Notes |
|------|--------|-------|
| [#225](https://github.com/linkbusinessadvisory/LinkBooks/pull/225) Coding Memory | **Draft, rebased** onto `9fa6ac2b` | Local unit 27/27; keep draft; staging/migration apply open |
| [#227](https://github.com/linkbusinessadvisory/LinkBooks/pull/227) Large release gates | Draft / conflict risk | Prefer #237 for CI; rebase remainder later |
| [#238](https://github.com/linkbusinessadvisory/LinkBooks/pull/238) POS draft | Unrelated draft | Do not overwrite |
| Copy bill (purchases) | **Implementing** | Parity with sales `copyInvoice` |
| Actions hosted runners / minutes | **Blocked** | Org Actions policy/billing needs admin:org; repo Actions enabled |

## CI investigation (evidence)

- Repo `actions` permissions: enabled, `allowed_actions=all`.
- Org Actions permissions API: **403** (needs org admin / `admin:org` scope).
- Check runs on valid workflow (#237): jobs labeled `ubuntu-latest`, conclusion failure, **steps=0**, duration ~1–2s.
- Interpretation: workflow YAML now valid on main after #237; **runner allocation / billing / minutes** still prevent job start. Not a content failure of typecheck/lint.

## Next executable steps

1. Finish copy-bill PR; local verify; merge when reviewable.
2. Keep #225 draft until Coding Memory migration isolated-tested; do not claim production-ready.
3. Org admin: restore Actions minutes/spending so quality gates execute.
4. Apply purchase/coding-memory migrations only with explicit authorization.
5. Continue next P0/P1 financial gaps (supplier credit-limit mirror, banking recon depth) without duplicating #225/#238.
