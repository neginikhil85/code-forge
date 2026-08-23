---
description: Full cycle for one idea — plan with approval gate, implement with self-review loop and gates, then fresh-context review.
---

When the user types `/build <idea>`, orchestrate the complete cycle. This command is a convenience alias chaining the three core workflows; it introduces no behavior of its own.

## Execution sequence

1. Execute the `/plan` workflow with `<idea>`:
   - Produce the design document, present the summary.
   - **Wait for explicit approval.** If the user edits the doc or gives feedback, loop until approved. Do not continue past this gate without "approved".
2. Execute the `/implement` workflow against the approved plan:
   - Implementation follows conventions; tests included.
   - Self-review loop ×≤3 with quality gates between iterations.
3. Execute the `/review` workflow on the resulting diff:
   - Fresh-context adversarial audit with verdict.

## Rules

- Each phase adopts its persona fully; carry forward only artifacts (plan document, diff), not persona bias.
- The plan approval gate is absolute — never auto-approve to keep momentum.
- If `/review` returns FIX FIRST, apply the confirmed blocking findings and re-run gates before reporting completion.
- On any phase where the user cancels: stop the entire chain cleanly.
