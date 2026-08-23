# Pattern: Decorator and Proxy

## When to use

A behavior wraps an operation without belonging to it: caching results, retrying flaky calls, logging timing, adding authorization. The business implementation must stay unaware of the wrapper.

## Shape (Decorator)

Same interface, wrapper holds the delegate:

```java
public interface ExchangeRateClient {

    ExchangeRateResponse fetchRate(CurrencyPair currencyPair);
}
```

```java
public class CachingExchangeRateClient implements ExchangeRateClient {

    private final ExchangeRateClient delegate;
    private final CacheManager cacheManager;
    ...
}
```

Decorators compose — retry around caching around the real client — and each layer is tested by mocking the delegate.

## Spring proxies (when the container does it for you)

Cross-cutting concerns implemented once and applied declaratively beat hand-written decorators:

- `@Cacheable`, `@CacheEvict` for caching over your configured cache (`config/cache`)
- `@Transactional` for persistence boundaries
- Custom annotations + AOP aspect when the same wrap-behavior applies across many beans (structured audit logging, metrics)

Rules:
- Aspect logic is generic; it never imports domain models. The moment an aspect needs domain knowledge, it is business logic in disguise — move it into a service or decorator.
- Self-invocation bypasses Spring proxies: calling `this.cachedMethod()` inside the same class skips caching and transactions. Extract the wrapped method into another bean when you see this.

## Choosing between them

| Situation | Choice |
|---|---|
| Wrap one specific client with behavior others must not inherit | Hand-written decorator |
| Same behavior applied across many beans | AOP aspect behind a custom annotation |
| Standard caching/transaction semantics already provided | Framework annotations only |

## Anti-patterns

- Decorators that change the contract (swallowing exceptions differently than documented).
- Inheritance used to add behavior to a concrete class — `SpecialPaymentService extends PaymentService` is decorator territory.
- Aspects accumulating business decisions; an aspect reading a database table has gone too far.

## Review signals

- Business method containing timing logs, manual cache-map handling, or retry loops → propose extraction into decorator or aspect.
- Two decorators always applied together → merge or reorder deliberately and document ordering if it matters.
