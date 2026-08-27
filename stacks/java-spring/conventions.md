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

- **Single base exception hierarchy**: All custom domain exceptions extend a single common base `ApplicationException` (which extends `RuntimeException`). Never create custom exceptions that directly extend `RuntimeException`.
- **Preserve message and cause**: `ApplicationException` must pass `message` and `cause` to `super(message, cause)` to ensure `getMessage()`, logs, and stack traces function properly.
- **Decoupled error codes**: `ApplicationException` carries an `ErrorCode` enum (or `HttpStatus` context) that maps domain errors to HTTP statuses at the web boundary.
- **Single `@RestControllerAdvice`**: Exactly one `@RestControllerAdvice` (e.g. `GlobalExceptionHandler` / `GlobalRestControllerAdvice`) per service in `exception/handler/`. Never create duplicate advice classes.
- **Uniform handling**:
  - One `@ExceptionHandler(ApplicationException.class)` handles all custom domain exceptions uniformly, mapping `ex.getErrorCode().getHttpStatus()` to the standard response envelope.
  - Separate handler for `@Valid` validation errors (`MethodArgumentNotValidException`) extracting structured field errors.
  - Fallback handler for `Exception.class` (HTTP 500) without leaking stack traces.
- **No silent swallowing**: Never swallow exceptions silently; never catch-and-rethrow losing the root cause.

```java
public abstract class ApplicationException extends RuntimeException {
    private final ErrorCode errorCode;

    protected ApplicationException(String message, ErrorCode errorCode) {
        super(message);
        this.errorCode = errorCode;
    }

    protected ApplicationException(String message, Throwable cause, ErrorCode errorCode) {
        super(message, cause);
        this.errorCode = errorCode;
    }

    public ErrorCode getErrorCode() {
        return errorCode;
    }
}
```

## Class & package hygiene

- Public API of a class stays minimal; helpers are private until proven shared.
- Package sizing follows the **Rule of 5**: No flat layer package holds >5 files; group by domain sub-packages (`service/auth/`, `controller/kafka/`, etc.).
- Package-private visibility (`default`) is preferred for internal helpers, mappers, and domain-internal services instead of making everything `public`.
- `@Transactional` sits on service methods, scoped as narrow as correctness allows; repositories stay transactional-by-default without annotations unless custom semantics are needed.
- Records for pure data carriers wherever mutability is not required.

## Single responsibility reminders specific to Spring

- `@Configuration` classes configure one concern each (`config/mongo/MongoConfiguration`, `config/security/SecurityConfiguration`).
- Scheduling, listeners, and consumers are separate beans — never bolted onto services as extra responsibilities.
