# ADR-0007: Lookup tables over hand-edited Postgres enums for categories and departments

- **Status:** Accepted
- **Date:** 2026-08-06
- **Deciders:** Development team, RMD
- **Area:** Data model

## Context

Risk categories and departments were originally Postgres enums (`risk_category` and free-text
department strings). Two problems followed. Administrators could not add a category without a
developer writing a migration, which is unacceptable for a taxonomy the RMD owns and revises.
And departments typed freehand produced near-duplicates ("Ops", "Operations", "operations "),
which silently split every departmental dashboard rollup.

A straight drop of the enum was not available either: existing columns, views and edge functions
typed against `risk_category` would have to change in lockstep, including in on-prem databases
already carrying data.

## Decision

`public.risk_categories` and `public.departments` are the single source of truth. Application
code reads them through `useRiskCategories()` and `useDepartments()`; no component hardcodes a
category or department list, and administrators manage both from Settings
(`RiskCategoriesManager.tsx`).

For backwards compatibility the `risk_category` enum still exists, and a trigger on
`risk_categories` automatically adds any new category name as an enum label. The enum is
therefore a derived artefact, never edited by hand.

## Alternatives considered

- **Keep enums, add categories by migration** — rejected: puts a developer in the loop for
  routine taxonomy maintenance.
- **Drop the enum entirely and use text + FK** — the desirable end state, but rejected for now:
  it requires coordinated column-type changes across cloud and on-prem installs. The trigger
  gives us the flexibility today without a risky data migration.
- **Free-text departments with fuzzy matching in reports** — rejected: hides data quality
  problems instead of preventing them.

## Consequences

- Adding a category is a data change; it appears in dropdowns immediately and the enum follows
  automatically.
- Renaming or deleting a category is *not* symmetric — Postgres cannot drop an enum label — so
  the UI treats deactivation, not deletion, as the normal operation.
- One deliberate piece of hidden magic (the sync trigger) that reviewers must know about; it is
  documented here and in `docs/architecture.md`.
- The eventual enum removal should be recorded as a superseding ADR.
