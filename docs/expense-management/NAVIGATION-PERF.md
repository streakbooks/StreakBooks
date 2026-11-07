# Expense Management navigation performance

## Causes found (2026-11-07)

1. **Eager screen imports** — `section.tsx` statically imported every tab screen, so opening any `/expense-management/$section` downloaded/parsed the whole module graph (claims, cards, travel, settings, …).
2. **Overview KPI fan-out** — when foundation migrations are not applied, overview issued four parallel `expense_claims` counts that each failed as missing-relation.

## Fixes

- Lazy-load each tab screen with `React.lazy` + `Suspense` in `section.tsx`.
- Probe `expense_claims` once; only run the remaining EM KPI counts when the table exists.
- Subnav / overview links use typed `/expense-management/$section` params.

## Still expected until migrations apply

Tab pages that call missing RPCs still show the migration alert after a server round-trip. That is not the same as the previous multi-screen JS parse cost.
