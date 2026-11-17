# LinkBooks — Master progress tracker

| Field | Value |
|-------|-------|
| **Updated** | 2026-11-17 |
| **Baseline commit** | `d2ba900a` (GitHub `main` after #229–#236 + hotfix #239) |
| **Programme** | Complete module coverage & zero-gap execution (with originality-first IP policy) |
| **Authoritative repo** | https://github.com/linkbusinessadvisory/LinkBooks |

## Originality-first & IP protection (mandatory)

LinkBooks is built as an **independent original product**. Competitors are functional/workflow references only. See [IP_AND_DEPENDENCY_COMPLIANCE.md](./IP_AND_DEPENDENCY_COMPLIANCE.md).

## Integration wave (2026-11-17)

| PR | Result | Notes |
|----|--------|-------|
| #229 Aged Payables as-at | **Merged** | Included before `edeeb092` stack |
| #230 PO goods receipt | **Merged** | `edeeb092` |
| #231 Three-way match | **Merged** | `863f0af6` |
| #232 Partial bill-from-received | **Merged** | `18cf5454`; migration later renamed in #239 |
| #233 Bill void_date | **Merged** | `7f740400` |
| #234 Credit void_date | **Merged** | `9026743f` |
| #235 Supplier statement opening | **Merged** | `46cf8f69` |
| #236 Payment void_date | **Merged** | `a053e7f4`; migration later renamed in #239 |
| #239 Hotfix typecheck + migration ids | **Merged** | `d2ba900a` |
| #237 CI restore | **Open** | Workflow restored; Actions jobs fail empty-step (~1–2s) — infra |
| #227 Large release gates | **Open draft** | Conflicting; prefer #237 |
| #225 Coding Memory | **Open draft** | Coordinated; rebase onto `d2ba900a` |
| #238 POS draft | **Open draft** | Unrelated; left alone |

## Measured completion

| Metric | Value |
|--------|-------|
| Complete and Verified requirements | **0** |
| Staging/production migrations applied | **Not authorized / not applied** |
| Local typecheck on `d2ba900a` | **Passed** |
| Focused purchases unit tests | **35 passed** |

## Next executable step

1. Fix GitHub Actions hosted runner/billing so #237 jobs execute (not empty-step failures).
2. Rebase #225 onto `d2ba900a`; keep draft until review.
3. Rebase remaining useful bits of #227 after #237, or close as superseded for CI.
4. Apply purchase migrations only with explicit DB authorization.
5. Resume new feature work after CI recovery.
