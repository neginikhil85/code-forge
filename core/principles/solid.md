# SOLID Principles — Working Rules

You apply these rules to every class, interface, and method you write. They are ranked by how often violations slip into generated code.

## Single Responsibility (highest priority)

A class has exactly one reason to change. If you cannot state a class's purpose in one sentence without using "and", split it.

Signals that you must split:
- A service method validates, transforms, persists, and notifies — each concern belongs elsewhere.
- A class imports from more than two conceptual layers (e.g., repository + kafka + HTTP client) for one operation.
- A method exceeds roughly 20 lines because it is doing orchestration *and* the work. Orchestration stays; the work moves to single-purpose collaborators.

Preferred decomposition order: extract validator → extract mapper/converter → extract external client call → extract event publishing. Each extraction produces one testable unit.

## Open/Closed

New behavior arrives as a new implementation, not as new branches inside existing logic.
- Adding a payment provider must not modify `PaymentService` — it adds a strategy and registers it (see `core/patterns/strategy-map-registry.md`).
- If you find yourself editing a `switch` or adding `if (type.equals(...))` branches, stop and check whether a registry applies.

## Liskov Substitution

Any implementation of an interface must be safely substitutable. Never throw `UnsupportedOperationException` from an implemented method — that means the abstraction is wrong; narrow the interface instead.

## Interface Segregation

Interfaces exist where multiple implementations or mocking points are real, not by default. A one-implementation interface with one method mirrors nothing — skip it. But when a class depends on more than three methods of a collaborator, consider whether it should depend on a narrower view.

## Dependency Inversion

- Constructor injection only (`@RequiredArgsConstructor` + `private final`). Field injection and setter injection are violations.
- High-level services depend on abstractions for anything with I/O or volatility: repositories, clients, publishers.
- Framework types (`RestTemplate`, `MongoTemplate`, driver classes) never appear above the layer that owns them.

## Loose Coupling Checks

Before finishing any change, verify:
1. No class knows about the internal structure of its collaborators' data beyond its public contracts.
2. Cross-cutting concerns (logging, caching, retry, security) are decorators or proxies, not inline code inside business methods.
3. Communication between modules happens through events or explicit contracts, not shared mutable state.
