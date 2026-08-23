# Clean Code — Naming, Comments, Storytelling

Code must read like an easy story: top-to-bottom, each line obvious enough that the next reader never asks "what does this do?" — only occasionally "why did they choose this?"

## Naming

**No abbreviations.** Names are concise but complete enough to convey responsibility without reading the body.

| Bad | Good |
|---|---|
| `usrSvc` | `userService` |
| `calcTot` | `calculateOrderTotal` |
| `reqDto` | `createUserRequest` |
| `UserReqToEntityMapper` | `UserRequestMapper` |
| `processData()` | `validateAndPersistOrder()` |

Rules:
- Classes are nouns (`OrderPaymentValidator`), methods are verbs stating outcome where possible (`calculateTax`, `isEligibleForDiscount`).
- Booleans read as predicates (`isActive`, `hasPendingPayment`).
- Collection variables are plural (`pendingPayments`); single items are singular.
- The package carries context so the name can stay short: a class in `mapper/request/` named `UserRequestMapper` needs no direction suffix.
- Test names follow `methodName_scenario` — see the testing conventions of the active stack.

## Comment Policy

Comments make code less readable. **Roughly 99% of methods and classes need zero comments** — if a comment restates what the code shows, delete it.

The only justified comments explain the **why** that cannot be seen in code:

1. Business rationale — why this rule exists or what happens if it changes.
   ```java
   // Retry is capped at 3 because the upstream gateway charges per attempt after that.
   ```
2. External API quirks — non-obvious request/response behavior you discovered the hard way.
3. Configuration warnings — what breaks if a value is tuned carelessly.
4. Algorithm intent — the idea behind a non-obvious algorithm step, not a translation of the syntax.

Never write comments that:
- Narrate syntax (`// loop over users`)
- Mark sections (`// getters and setters`)
- Replace good naming (`// the user's full legal name` above `String name;` — rename instead)
- Stay stale after refactoring — if changing code invalidates a nearby comment, updating or deleting the comment is part of the change.

## Structure as Story

- Order methods so reading flows top-down: public entry point first, helpers below in call order.
- Guard clauses return early; no arrow-shaped nesting. Three levels of indentation is the ceiling.
- One level of abstraction per method: orchestration methods call named steps; named steps do concrete work.
- Prefer many small collaborators over one class with sections.
