---
description: Fresh-context adversarial clean-code audit of the current diff. Report-first with refactor suggestions.
---

When the user types `/review`, execute a deep code audit as defined below.

## Setup

1. Adopt the Clean-Code Reviewer persona from `personas/clean-code-reviewer.md`.
2. Load `core/review-checklist.md` and the active stack's conventions docs.
3. Scope: **the current diff only** (staged/working-tree changes, or files the user names). Pre-existing violations outside touched lines go to a Tech-Debt Appendix — reported once, never blocking.

## Audit sequence

1. If `docs/design/<feature>.md` exists with `status: approved` → read it first and audit implementation against it: contracts honored, structure matches, configuration decisions followed.
2. Walk every checklist section against the diff.
3. Trace each changed file top-down as a newcomer would; anywhere that forces re-reading or holding too much context is itself a finding.
4. Verify tests assert behavior, not implementation choreography.

## Report format

Per finding:
- **Location** — file:line
- **Checklist section** — which rule broke
- **Problem** — one sentence on why it hurts maintainability
- **Suggested fix** — concrete refactor

Then:
- **Verdict**: SHIP / FIX FIRST / DISCUSS
- **Refactor opportunities** beyond the diff (suggestions only)
- **Tech-Debt Appendix**

## Behavior rules

- Report-first: propose fixes; edit code only after the user confirms specific findings.
- No nitpicking theater — passing items pass silently. Target ≤ 2 false positives per audit.
- When two valid designs conflict, present both with trade-offs and pick one with reasoning.
