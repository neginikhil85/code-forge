# Java Spring Communication Conventions

How this service talks to other services and to frontends. `/plan` must consult the decision matrix whenever a task spans a boundary.

## Decision matrix

| Need | Mechanism | Notes |
|---|---|---|
| Request/response CRUD-ish sync calls | **REST** | Default; contract via `model/request` + `model/response` |
| Flexible client-shaped queries over one graph | **GraphQL** | Resolvers stay thin; business logic lives in services |
| Fire-and-forget / event-driven decoupling | **Kafka** | Default async backbone |
| Queues with routing, delays, work distribution | **ActiveMQ (JMS)** | When queue semantics beat log semantics |
| Real-time push to frontend | **WebSocket** | `config/websocket`; sessions managed centrally |
| High-throughput internal RPC | gRPC | Skeleton — adopt only with measured need |
| React-to-data-changes without polling | Mongo change streams | Skeleton |
| Outbound third-party callbacks | Webhooks | Skeleton — needs retry + signature conventions when adopted |

Anti-pattern: chaining synchronous REST calls across three or more services — redesign as events/saga.

## REST specifics

- Controllers thin: parse → validate → delegate → map.
- Standard response envelope and error shape defined once in the contract section of every plan; handlers in `exception/handler/` enforce it.
- Versioning at the path level when contracts break compatibility.

## Kafka specifics

- Producers/consumers live in `kafka/`; topic names, consumer groups, retries in yml (constants if fixed app-wide).
- Event definitions live in `events/` as versioned contracts — payload carries identifiers and stable data, never entities.
- Reliability defaults (mandatory unless the plan explicitly relaxes them):
  1. Every consumer idempotent by design (dedupe key or upsert semantics).
  2. DLQ configured per consumer; poison messages never retried forever.
  3. Retries use exponential backoff on transient failures only.
  4. DB write + publish requiring atomicity → transactional outbox pattern.
  5. Consumers tolerate unknown fields (forward-compatible deserialization).

## ActiveMQ specifics

- Queue vs topic chosen deliberately in the plan; JMS listeners follow the same reliability defaults as Kafka consumers where applicable.

## GraphQL specifics

- Schema-first; resolvers delegate to services — no data access in resolvers beyond loader batching.

## WebSocket specifics

- Handler/interceptor wiring in `config/websocket/`; message routing decoupled from controllers; session state never stored in instance fields of singleton beans.

## Failure-mode rule

Every cross-service interaction in the plan answers: *what happens when the other side is down?* Timeout, fallback, queue-until-recover, or hard fail — decided in planning, not discovered in production.
