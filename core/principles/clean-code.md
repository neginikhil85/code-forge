# Clean Code — Naming, Comments, Storytelling

Code must read like an easy story: top-to-bottom, each line obvious enough that the next reader never asks "what does this do?" — only occasionally "why did they choose this?"

## Naming

**Avoid cryptic & arbitrary abbreviations.** Names must be clear and expressive without becoming excessively verbose or repeating surrounding context.

| Bad (Cryptic / Bloated) | Good (Balanced & Clear) | Notes |
|---|---|---|
| `usrSvc` | `userService` | No arbitrary shortening of core nouns |
| `calcTot` | `calculateOrderTotal` | Clear verb + intent |
| `tokenExpirationMilliseconds` | `tokenExpirationMs` / `tokenExpMillis` | Standard units (`ms`, `millis`) are preferred over bloated words |
| `findByCreatedAtDescending` | `findByCreatedAtDesc` | Respect framework keywords/conventions (Spring Data `Desc`/`Asc`) |
| `UserReqToEntityMapper` | `UserRequestMapper` | Keep it concise when package context is already clear |
| `processData()` | `validateAndPersistOrder()` | Descriptive outcome over generic verbs |

Rules:
- **Pragmatic Brevity:** Standard industry acronyms and units are completely fine (`id`, `url`, `ms`, `jwt`, `http`, `api`, `config`). Do not bloat names just to avoid standard shorthands.
- **Framework & Repository Conventions:** Never break framework conventions (e.g. Spring Data Mongo/JPA keywords like `Desc`, `Asc`, `In`, `AllIgnoreCase`).
- **Classes & Methods:** Classes are nouns (`OrderPaymentValidator`), methods are verbs stating outcome where possible (`calculateTax`, `isEligibleForDiscount`).
- **Booleans:** Booleans read as predicates (`isActive`, `hasPendingPayment`).
- **Collections:** Collection variables are plural (`pendingPayments`); single items are singular.
- **Context Awareness:** The class or package carries context, so local names can stay concise (e.g., inside `UserService`, a helper can be `validateEmail()` rather than `validateUserEmailAddress()`).
- **Test Names:** Follow `methodName_scenario` — see the testing conventions of the active stack.

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
- **Package Cohesion & Rule of 5**: Packages should remain small and cohesive (max 5–7 files per directory). When any folder grows beyond 5 files, partition into domain sub-packages. Never accumulate 10–20 unrelated files in a single flat directory.
