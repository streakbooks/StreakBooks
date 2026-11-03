# 004 — Roadmap priority for this run

Date: 2 November 2026.

## Context

The programme covers an audit, a benchmark and batches A–H. One session cannot finish every operational surface without leaving dummy controls.

## Options

1. Sketch every batch in the navigation.
2. Finish the entitlement and price engine, correct the revenue-card ambiguity, and leave later batches unbuilt.

## Decision

Option 2. Batches C–H stay on the existing control-plane screens where those screens already work. New unfinished surfaces are not added. The approvals screen is real and calls server RPCs; it stays hidden until migration `20261102120000` is applied, because the permission is issued by that migration.

## Reason

The headline requirement is safe, immediate feature and price control. The existing `/platform` sections already list businesses, users, firms, subscriptions, support and audit.

## How to reverse

Continue from `docs/HANDOFF.md`. Add a later batch only with a working RPC, an authorisation check and a test.
