---
description: Implement a task against conventions with an adversarial self-review loop and quality gates. Offers inline planning for non-trivial work.
---

When the user types `/implement [task]`, execute implementation through the routing rules below.

## Routing (decide before writing any code)

1. **Approved plan exists** (`docs/design/<feature>.md` with `status: approved`) → implement against it as binding specification.
2. **Trivial scope detected** (≤ 2 files touched, no new public API/endpoint, no new dependency, no new cross-service interaction) → proceed directly in light-mode following conventions only.
3. **Non-trivial scope, no approved plan** → ask, never refuse:
   > "This looks like a bigger requirement. Start with planning first?"
   > `[Yes — plan then implement]` `[No — proceed without plan]` `[Cancel]`
   - **Yes** → execute the full `/plan` workflow inline first (including its approval gate), then continue here.
   - **No** → proceed in conventions-only mode; the self-review loop still runs afterward.
   - **Cancel** → stop cleanly, change nothing on disk.

## Implementation

1. Adopt the Implementer persona from `personas/implementer.md`.
2. Load the active stack pack: package structure, conventions, libraries, data access, testing.
3. Implement per conventions; write tests alongside logic per `stacks/java-spring/testing.md`.

## Self-review loop (mandatory before reporting done)

Repeat at most 3 iterations:

1. **Hat switch** — adopt the clean-code reviewer's adversarial stance: *"Assume this diff was written by a junior developer who cut corners under deadline pressure. Find everything they did wrong."*
2. **Score** — walk every section of the review checklist against the diff only; list each violation with file:line.
3. **Fix** — repair all findings.
4. **Gate** — run the stack's quality gates (compile → architecture test → checkstyle → tests). A failing gate is a finding like any other.

## Exit contract

- All checklist sections pass within iterations → report: change summary, iterations used, gate status.
- Iterations exhausted with remaining findings → report honestly what passed, what remains violated, why, and your recommendation. Never claim unverified quality. Never exit silently.
- Suggest `/review` before merge for anything non-trivial.
