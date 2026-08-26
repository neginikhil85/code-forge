# Java Spring Library Conventions

## Outbound HTTP calls

| Scenario | Use |
|---|---|
| Calling external services (imperative stack) | `RestClient` or OpenFeign typed clients |
| Reactive project | `WebClient` |
| Banned everywhere | `RestTemplate` (maintenance mode) — ArchUnit fails the build on it |

Rules:
- One typed client per external service, living in `clients/` (`PaymentGatewayClient`, `NotificationServiceClient`). No ad-hoc URL strings inside business code.
- Feign clients declare their name/path configuration in yml; base URLs follow the configuration decision tree in `stacks/java-spring/conventions.md`.
- Timeouts and retry policy are explicit per client — defaults from the gateway properties model, never implicit.
- Response mapping happens through mappers; raw provider payloads stay inside the owning client's package.

## Logging

- `@Slf4j` only; no manual `LoggerFactory` declarations.
- Log statements carry context (identifiers), never sensitive payloads.
- Business methods log outcomes at boundaries; step-by-step narration logs are a finding.

## Validation

- Bean validation annotations for structural DTO rules; composed validators (see `core/patterns/combinator-validators.md`) for conditional, cross-field, and stateful rules.

## Boilerplate policy

Lombok carries boilerplate so intent stays visible:

```java
@Slf4j
@Service
@RequiredArgsConstructor
public class PaymentService {
    private final PaymentRepository paymentRepository;
    private final PaymentGatewayClient paymentGatewayClient;
    ...
}
```

Banned combinations: `@Data` on entities/documents (equals/hashCode pitfalls with lazy relations and proxies); `@AllArgsConstructor` on anything injectable (breaks constructor-injection discipline).
