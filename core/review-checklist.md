# Review Checklist

The single scoring artifact used by the implementer self-review loop and the clean-code reviewer audit. Score **only the current diff**; pre-existing violations outside touched lines go to a separate non-blocking tech-debt appendix, never block.

Verdict per section: pass / violation (with file:line and fix) . A change ships only when every section passes or the user explicitly accepts remaining findings.

## 1. Naming

- [ ] No cryptic or lazy abbreviations; standard domain acronyms, units (e.g., `ms`), and framework keywords (e.g., `Desc`) are used pragmatically without bloat.
- [ ] Class names are nouns stating responsibility; method names are verbs stating outcome.
- [ ] Names concise but self-explanatory without reading the body.
- [ ] Test names follow `methodName_scenario` form.

## 2. Comments

- [ ] Zero comments that restate what code shows.
- [ ] Every existing comment explains why: business rationale, external API quirk, config warning, or algorithm intent.
- [ ] No stale comments left behind by refactoring within this diff.

## 3. Single Responsibility and Segregation

- [ ] Each new/changed class states its purpose in one sentence without "and".
- [ ] No method does orchestration and concrete work at multiple abstraction levels.
- [ ] Validation logic lives in validators, conversion lives in mappers, external calls live in clients — never inline in services or controllers.
- [ ] Method length justified by readability, not history; nesting depth ≤ 3 via guard clauses.
- [ ] Zero duplicate cross-cutting components or handlers: exactly one `@RestControllerAdvice` / global error handler per service; no duplicate configurations or parallel exception roots.

## 4. Coupling and Patterns

- [ ] Constructor injection only (`@RequiredArgsConstructor`, `private final`); no field/setter injection.
- [ ] Custom domain exceptions extend the common base exception (`ApplicationException`), not `RuntimeException` directly; base exception passes message and cause to `super(message, cause)`.
- [ ] New variant-type branching (switch on type codes) → strategy with map registry proposed instead.
- [ ] Post-action side effects decoupled via events where they are not core outcomes.
- [ ] Cross-cutting concerns (caching, retry, timing logs) extracted to decorator/aspect/annotations — not inline.
- [ ] Conditional + cross-field validation composed from small validators, not god-validator blocks.

## 5. Configuration and Constants Sweep

For every literal introduced in the diff:

- [ ] Differs across environments/profiles → `application.yml`.
- [ ] Two or more related properties → bound `@ConfigurationProperties(prefix = ...)` model injected as a dependency, not scattered `@Value`s.
- [ ] Fixed app-level value reused across classes → constants class in `constants/`.
- [ ] No hardcoded URLs, timeouts, thresholds, magic numbers inside method bodies.

## 6. Mapping

- [ ] All conversions (entity↔dto↔request/response) live in mapper classes under `mapper/` with sub-packages.
- [ ] Mapper naming follows `<Domain><SourceType>Mapper` (e.g., `UserRequestMapper`).
- [ ] No manual field-by-field copying outside mappers; reuse of an existing mapper instead of duplication.

## 7. Data Access and Clients

- [ ] Simple persistence/queries via repositories; dynamic runtime filters via aggregation/MongoTemplate logic confined to the repository layer.
- [ ] External HTTP calls go through typed clients in `clients/`; no deprecated HTTP client usage; reactive projects use reactive clients.

## 8. Messaging and Events

- [ ] In-process side effects use Spring events; cross-service use broker events per communication conventions.
- [ ] Consumers idempotent; DLQ configured; retries back off; publish+persist atomicity handled by outbox when required.
- [ ] Event payloads are versioned contracts, not live entities.

## 9. Tests (when diff touches logic)

- [ ] One behavior per test; name states method and scenario.
- [ ] Given/When/Then layout separated by blank lines; no narration comments.
- [ ] Fixtures built through builders/helpers, not bloated inline setup.
- [ ] Exception cases assert type (and message where meaningful).

## 10. Honesty Check (self-review only)

- [ ] Remaining known weaknesses reported explicitly, never silently dropped.
- [ ] Loop exited because quality passed — not because iterations ran out without admitting it.
