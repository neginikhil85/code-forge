# Java Spring Package Structure

One microservice = one single-module Maven project. Service boundaries live at process boundaries, enforced by contracts and messaging — never by shared modules. Multi-module builds are out of scope.

## Canonical layout

Base package: `com.<organization>.<service-name>` — then:

```
com.example.orderservice/
├── config/                    # framework wiring, one class per concern
│   ├── mongo/                 # Mongo client/template/index configuration
│   ├── websocket/             # socket handlers, broker relay configuration
│   ├── cache/                 # cache manager, TTLs, serializer setup
│   └── kafka/                 # producer/consumer factories, topic beans
├── constants/                 # fixed application-wide values, grouped by domain
├── clients/                   # typed outbound HTTP clients (one per external service)
├── controller/                # REST/GraphQL entry points; thin — delegate, never compute
│   ├── advice/                # (or exceptions/handler) global exception handling
├── service/                   # business orchestration interfaces where multiple impls exist
│   └── impl/                  # concrete services
├── mapper/                    # ALL conversions between models
│   ├── entity/                # entity ↔ response / dto conversions
│   ├── request/               # request ↔ entity conversions
│   └── response/              # dto/response cross-conversions
├── repository/                # persistence interfaces + dynamic query/aggregation logic
├── validator/                 # composed request validators
├── kafka/                     # producers and consumers (wiring lives in config/kafka)
├── events/                    # published event definitions and listeners' payloads
├── model/
│   ├── entity/                # persistence documents/entities
│   ├── request/               # inbound API contracts
│   ├── response/              # outbound API contracts
│   └── dto/                   # internal transfer objects between layers/services
├── exception/                 # domain exception classes
│   └── handler/               # @ControllerAdvice handlers mapping exceptions to responses
└── util/                      # stateless helpers with no business knowledge
```

Test sources mirror this structure exactly under `src/test/java`.

## Placement rules

- A class lives in exactly one layer; if you debate between two, the design is wrong — split it.
- Controllers: parse → validate → delegate → map to response. Zero business logic, zero repository access.
- Services: own transactions, orchestration, and business decisions. They never touch transport details (headers, serialization).
- Repositories: all persistence and query construction. Dynamic aggregation logic never leaks above this layer.
- Mappers: all field-by-field copying. Services assemble nothing by hand.
- `util/` is a last resort; anything knowing about domain concepts belongs in a named domain class instead.

## Dependency direction

`controller → service → repository`, with `mapper`, `validator`, `clients`, `kafka`, `events`, `model`, `constants` as supporting packages reachable per the rules above. Enforced mechanically by ArchUnit (see `stacks/java-spring/quality-gates/`).
