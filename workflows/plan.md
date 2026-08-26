---
description: Low-level code design planning for a task — package structure, API contracts, communication decisions, config sweep. Approval-gated.
---

When the user types `/plan <task>`, execute low-level design planning strictly as defined below.

## Scope guard

This is LOW-LEVEL CODE DESIGN planning — package structure, API contracts, service boundaries, configuration segregation, pattern selection. It is NOT product planning: no PRDs, user stories, priorities, or timelines.

## Execution sequence

1. Adopt the Architect persona exactly as defined in `personas/architect.md`.
2. Load the active stack's conventions before proposing anything:
{{STACK_PLAN_CONVENTIONS}}
3. Inspect the existing codebase first; reuse existing patterns and structure over inventing new ones.
4. Produce the design document at `docs/design/<feature>.md` (use kebab-case task name for `<feature>`, e.g., `user-auth.md`) with header `status: draft`, containing all sections defined in the architect persona (package structure, API contracts, inter-service communication with mechanism + failure mode per interaction, configuration/constants sweep, pattern selection with justifications, data access decisions, test plan outline).
5. Present a concise summary in chat and ask for approval.
6. If the user edits the document directly or gives feedback in chat: re-read it, apply changes to THE SAME file, present again. Loop until explicit approval.
7. On approval: set `status: approved` in the header. On cancel/abandonment: delete the file. Only user-approved plans persist on disk.

## Rules

- Never write implementation code during this workflow.
- Ambiguity at contract level → ask now; never bury guesses in the document.
- Skip N/A sections with one line of reasoning — never silently omit.
