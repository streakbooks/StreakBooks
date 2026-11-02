# 006 — Main merges and hosted migrations

Date: 2 November 2026.

## Context

`53cc3ec` was pushed straight to `main`. Branch protection was off, so the push did not wait for a pull request. The five November migrations were then applied to the hosted project.

## Decision

Merge to `main` only through a pull request after the required CI checks pass and the full test suite is green. Before applying a migration to the hosted project, confirm a restore point, keep the change additive and reversible, write the rollback SQL, apply it, and verify it. Do not apply a destructive change.

## Reason

A direct push left no required check in front of `main`. The hosted history also diverges from the local migration folder, so a blind `supabase db push` is unsafe.

## How to reverse

Turn this decision over in a later decision. Do not mark remote migration history reverted as a shortcut.
