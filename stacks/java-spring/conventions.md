# Java Spring Conventions

## Dependency injection

- Constructor injection only: `@RequiredArgsConstructor` + `private final` fields.
- Never `@Autowired` on fields; setter injection requires explicit justification in review.
- One injected dependency per line; group them after constants, before methods.

## Lombok usage

| Concern | Annotation |
|---|---|
| Logging | `@Slf4j` on any class that logs — never declare loggers manually |
| Injection | `@RequiredArgsConstructor` |
| DTOs / value objects | `@Builder` for readable construction; `@Value` or records where immutability fits |
| Entities/documents | Prefer explicit code over annotation magic; `@Data` on entities is banned (equals/hashCode pitfalls) |

## Configuration decision tree (apply before hardcoding anything)

1. **Differs across environments/profiles?** → `application.yml` (per-profile files: `application-dev.yml`, `application-prod.yml`).
2. **Two or more related yml properties consumed together?** → one `@ConfigurationProperties(prefix = "...")` bound model (record or immutable class), injected as a single dependency into consuming classes. Scattered `@Value`s across a class are a violation once the count reaches two.
3. **Single value, environment-stable?** → `@Value` acceptable.
4. **Fixed application-wide constant reused across classes?** → constants class in `constants/`, grouped by domain (`PaymentConstants`, `KafkaConstants`).
5. **Hardcoded literal inside a method body** → violation. URLs, timeouts, thresholds, queue names, index names all follow this tree.

```java
@ConfigurationProperties(prefix = "payment.gateway")
public record PaymentGatewayProperties(String baseUrl, Duration timeout, int maxRetries) {
}
```

## Mapper conventions

- All conversions live in `mapper/` sub-packages — no manual copying anywhere else.
- Naming: `<Domain><SourceType>Mapper`, concise (`UserRequestMapper`, `UserResponseMapper`). Package placement carries direction; names stay short. No `CreateUserRequestToUserEntityMapper`.
- Methods are stateless utilities: `toEntity(CreateUserRequest)`, `toResponse(UserEntity)`.
- One mapper class per domain source type, not per conversion pair; reuse instead of duplicating.
- No reflection-mapping libraries (MapStruct etc.) — explicit conversion code only.

## Exception design

- Domain exceptions extend a common base (`DomainException`) carrying enough context for handlers to map status codes.
- Handlers live in `exception/handler/` as `@RestControllerAdvice`; every external-facing error returns the standard error response shape defined in the API contract.
- Never swallow exceptions silently; never catch-and-rethrow losing the cause.

## Class hygiene

- Public API of a class stays minimal; helpers are private until proven shared.
- `@Transactional` sits on service methods, scoped as narrow as correctness allows; repositories stay transactional-by-default without annotations unless custom semantics are needed.
- Records for pure data carriers wherever mutability is not required.

## Single responsibility reminders specific to Spring

- `@Configuration` classes configure one concern each (`config/mongo/MongoConfiguration`, `config/cache/CacheConfiguration`).
- Scheduling, listeners, and consumers are separate beans — never bolted onto services as extra responsibilities.
