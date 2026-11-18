# Focused release regression repair

The full POS integration test run found seven failures. This focused main-based batch addresses the five unrelated assertion/catalogue failures and the existing Expenses voice-navigation ambiguity. POS migration privilege declarations are fixed in the separate POS batch.

- Fixed-asset rejection test now contaminates the accumulated-depreciation account actually used by the selected journal, rather than an unused asset account. The foreign-account rejection remains mandatory.
- Budget tests match current safe-range error wording and the existing balanced remainder distribution across final months. No accounting math changes.
- Outside Sales/Purchases document context, exact sidebar labels route to their own module; contextual section navigation remains unchanged. Expenses uses `expenses.view`.
- Register the existing TypeScript payroll feature in the database catalogue. The CLI-created additive migration uses `ON CONFLICT DO NOTHING`, preserving configured defaults/labels and all customer plans/prices/grants. It is pending, not live-applied.

Validation: 142 tests passed in six focused files, including the detailed existing budget arithmetic tests. Isolated PostgreSQL confirmed feature creation, repeat application and preservation of an existing disabled feature/label. Application build/typecheck, authenticated staging and production are not independently certified by this small batch; integrated POS validation is recorded in its tracker. No merge or live migration was performed.

Overlap review: draft #227 also touches these four existing source/test files, mainly formatting and broader cleanup. This branch preserves its source formatting and takes only the targeted assertions/navigation fix; #227 remains untouched. Review both before merge and reconcile their small overlapping hunks. This is not a replacement for #227's broader release work.

Windows review: protect local changes; `git fetch origin`; `git switch --detach origin/fix/release-regression-assertions-20261117`; run the six focused Vitest files listed in the PR. For manual navigation, “open Expenses” outside Sales/Purchases must target employee Expenses, while contextual purchases section navigation remains available. Full CI, staging, deployment and live security checks remain separate gates.
