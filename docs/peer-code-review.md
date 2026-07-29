# Peer Code Review Policy

RiskRadar changes ship through mandatory peer review. This policy defines when reviews are required, who must approve, and what reviewers check.

## Scope

Every change to `main` (or `master`) must go through a Pull Request (GitHub) or Merge Request (GitLab). Direct pushes to protected branches are prohibited.

## Approvers

| Change type                                                   | Minimum approvers                                       |
| ------------------------------------------------------------- | ------------------------------------------------------- |
| Docs-only (`docs/**`, `README.md`)                            | 1 reviewer                                              |
| Frontend UI / presentation                                    | 1 frontend reviewer                                     |
| Risk-domain logic (workflow, appetite, scoring, approvals)    | 1 frontend + 1 risk-domain reviewer                     |
| Database migrations (`supabase/migrations/**`)                | 1 backend + 1 DBA reviewer                              |
| Edge functions (`supabase/functions/**`)                      | 1 backend reviewer                                      |
| Security / RLS / auth                                         | 1 backend + 1 maintainer                                |

CODEOWNERS (`.github/CODEOWNERS`) auto-requests the right reviewers.

## SLA

- First response within 1 business day.
- Full review within 2 business days.
- Emergency hotfixes may ship with 1 approver + post-merge review; open a follow-up MR/PR within 24 h.

## Merge rules

- Squash merge into `main` for a clean linear history.
- Rebase before merge if the base branch has moved.
- All required status checks must be green:
  - `lint:iso` — ISO 31000 naming lint
  - `lint:db-safety` — DB / Supabase safety lint
  - `eslint` — React & TypeScript lint
  - `typecheck` — TypeScript compile
  - `test` — Vitest suite

Configure branch protection on the remote to require these checks and at least one approving review. This must be done in the repo settings by an admin; it cannot be enforced by the codebase alone.

## Reviewer checklist

The PR / MR template embeds the full checklist. It covers three focus areas — see the dedicated guides:

1. [ISO 31000 naming conventions](./iso31000-naming.md)
2. [Secure database & Supabase handling](./secure-db-guidelines.md)
3. [React hooks & state management](./react-review-checklist.md)

## Automation

Local commands developers should run before requesting review:

```bash
npm run lint:iso        # ISO 31000 glossary check
npm run lint:db-safety  # SQL / Supabase safety scan
npm run lint            # ESLint (hooks + TS)
npm run test            # Vitest
```

CI runs the same commands on every PR.

## Escalation

If a reviewer and author cannot agree, escalate to the maintainer listed for the affected area in `CODEOWNERS`. For risk-domain disagreements, the Risk Management Department (RMD) representative has the final say on naming and workflow semantics.
