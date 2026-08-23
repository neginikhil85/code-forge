# Pattern: Strategy with Map Registry

## When to use

You have multiple variants of one behavior selected by a discriminator: payment provider per payment type, notification channel per preference, discount rule per campaign, exporter per file format. Any `switch` on a type code or chained `if (type.equals(...))` is the smell this pattern replaces.

## Shape

1. One strategy interface expressing the variant behavior.
2. One implementation per variant, each a Spring component with single responsibility.
3. A registry that collects all implementations into a map keyed by the discriminator, injected into the orchestrating service.

## Example

```java
public interface PaymentProcessor {

    PaymentType supportedType();

    PaymentResult process(PaymentRequest paymentRequest);
}
```

```java
@Component
public class CardPaymentProcessor implements PaymentProcessor {
    ...
}

@Component
public class UpiPaymentProcessor implements PaymentProcessor {
    ...
}
```

```java
@Component
public class PaymentProcessorRegistry {

    private final Map<PaymentType, PaymentProcessor> processorsByType;

    public PaymentProcessorRegistry(List<PaymentProcessor> processors) {
        this.processorsByType = processors.stream()
                .collect(Collectors.toUnmodifiableMap(
                        PaymentProcessor::supportedType, Function.identity()));
    }

    public PaymentProcessor forType(PaymentType paymentType) {
        PaymentProcessor processor = processorsByType.get(paymentType);
        if (processor == null) {
            throw new UnsupportedPaymentTypeException(paymentType);
        }
        return processor;
    }
}
```

Adding a provider touches zero existing classes — open/closed by construction.

## Anti-patterns

- Registry with hard-coded `put()` calls in its constructor — you rebuilt the switch. Always collect via constructor injection of the list.
- Strategies that know about each other or share mutable state.
- A registry exposed to controllers — only the owning service consumes it.
- Using this pattern for exactly two variants where a plain conditional reads better; the pattern pays off from three variants onward.

## Review signals

- New branch added to an existing dispatch chain → propose extraction.
- Strategy interface with methods most implementations leave empty → interface segregation violation; split it.
