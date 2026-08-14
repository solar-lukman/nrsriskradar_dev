# ADR-0001: Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-08-06
- **Deciders:** Development team, Risk Management Department (product owner)
- **Area:** Process

## Context

RiskRadar carries a lot of non-obvious design: an authorization model spread across three
layers, two orthogonal state machines on the same table, `SECURITY DEFINER` RPCs used instead
of plain table writes, and an on-premises deployment path that constrains framework choices.
`docs/architecture.md` describes *what* the system does today, but the reasoning behind each
choice lived only in chat history and in reviewers' heads. Two costs followed: new maintainers
re-litigated settled decisions, and compliance reviewers had no written rationale for
access-control choices.

## Decision

We keep lightweight Architecture Decision Records in `docs/adr/`, one Markdown file per
decision, numbered sequentially, indexed in `docs/adr/README.md` and written from
`docs/adr/template.md`. ADRs are append-only: a change of direction is a new ADR that
supersedes the old one, never an edit to accepted history. `docs/architecture.md` remains the
current-state guide and links to the ADR index.

## Alternatives considered

- **Rationale inline in `architecture.md`** — rejected: the document already runs long, and
  inline prose loses the historical record when the current state is updated.
- **A wiki outside the repo** — rejected: drifts from the code, is not reviewed in pull
  requests, and is unavailable in the on-prem release bundle.
- **No formal record** — rejected: this is the status quo that caused the problem.

## Consequences

- Every pull request that changes an architectural constraint must add or supersede an ADR;
  reviewers enforce this via `docs/peer-code-review.md`.
- Small overhead per decision, paid back at onboarding and audit time.
- The ADR set ships with the on-prem release, giving customers documented design rationale.
