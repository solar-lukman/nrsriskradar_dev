# ISO 31000 Naming Conventions

RiskRadar aligns naming with **ISO 31000:2018 — Risk management guidelines** and **ISO Guide 73** vocabulary. Every field, variable, migration column, UI label, and API parameter must use the canonical term from this glossary.

## Canonical glossary

| Concept                       | Use                                | Do NOT use                        |
| ----------------------------- | ---------------------------------- | --------------------------------- |
| Chance of occurrence          | `likelihood`                       | `probability`, `chance`, `odds`   |
| Consequence of occurrence     | `impact`                           | `severity` (reserved for incidents), `magnitude` |
| Risk before controls          | `inherent_likelihood`, `inherent_impact`, `inherent_score` | `raw_*`, `gross_*`   |
| Risk after controls           | `residual_likelihood`, `residual_impact`, `residual_score` | `net_*`, `post_*`     |
| Amount of risk pursued        | `risk_appetite`                    | `risk_hunger`, `appetite_level`   |
| Deviation allowed from appetite | `tolerance`, `threshold_score`   | `limit` (unqualified)             |
| Response strategy             | `treatment` (Avoid / Mitigate / Transfer / Accept) | `mitigation` as a strategy name — "Mitigate" is *one* treatment |
| Ongoing action items          | `mitigation_tasks`, `treatment_tasks` | `remediations`                 |
| Owner accountable for a risk  | `risk_owner_id`, `owner_id`        | `assignee`, `responsible_party`   |
| Departmental champion         | `risk_champion` (RC role)          | `risk_lead`, `risk_agent`         |
| Effectiveness of a control    | `control_effectiveness`, `effectiveness_rating` | `control_quality`, `control_strength` |
| Approval workflow states      | `Draft`, `Submitted`, `Under Review`, `Returned`, `Approved` | free-form labels |
| Lifecycle status              | `New`, `In Review`, `Mitigated`, `Escalated`, `Closed` | `Open`, `Done`, `WIP` |
| Realised risk / event         | `incident`, `risk_event` (table)   | `issue`, `problem`                |
| BCP impact assessment         | `bia_*` (business impact assessment) | `impact_analysis`               |

## Reserved uses of "severity"

`severity` is reserved for **incidents** (`risk_events.severity`) and log entries (`system_audit_logs.severity`). Do not use it as a synonym for `impact` in risk records.

## Reserved uses of "mitigation"

- ✅ `mitigation_plan`, `mitigation_tasks` — the concrete work items produced by the *Mitigate* treatment.
- ❌ Do not label the treatment enum or dropdown as "Mitigation" — use `treatment` / `treatment_strategy`.

## Casing rules

- Database columns: `snake_case` (`residual_likelihood`).
- TypeScript identifiers: `camelCase` (`residualLikelihood`).
- Enum labels shown to users: `Title Case` matching the workflow states above.

## Enforcement

Run `npm run lint:iso` locally. CI blocks PRs that introduce deprecated synonyms outside allow-listed contexts (e.g. `severity` inside `src/**/incidents/**` or `risk_events`-related migrations).

If you must use a term the linter flags — for example when integrating with an external system that uses `probability` — add a targeted `// iso-lint-ignore: reason` comment on the same line, and record the exception in this file.

## Current exceptions

- Third-party libraries (`recharts`, `react-hook-form`) may expose props like `severity`; wrap them at the boundary and expose the canonical name internally.
- Historical UAT/test fixtures under `e2e/fixtures/**` are exempt to keep golden data stable.
