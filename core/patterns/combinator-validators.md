# Pattern: Combinator Validators

## When to use

Request validation grows beyond bean annotations: conditional rules ("discount code required only for campaign orders"), cross-field rules, or rules needing repository lookups. A god-validator class with fifteen checks is the smell; scattered `if` blocks in services are equally wrong.

## Shape

Validation logic is composed from small single-purpose validators, each returning a result object instead of throwing, so composition stays explicit and testable.

```java
@FunctionalInterface
public interface RequestValidator<T> {

    ValidationResult validate(T request);
}
```

```java
public record ValidationResult(List<String> errors) {

    public static ValidationResult valid() {
        return new ValidationResult(List.of());
    }

    public static ValidationResult invalid(String error) {
        return new ValidationResult(List.of(error));
    }

    public ValidationResult and(ValidationResult other) {
        List<String> combinedErrors = Stream.concat(errors.stream(), other.errors().stream()).toList();
        return new ValidationResult(combinedErrors);
    }
}
```

Composing for one request type:

```java
@Component
public class CreateOrderRequestValidator {

    private final RequestValidator<CreateOrderRequest> mandatoryFields = this::validateMandatoryFields;
    private final RequestValidator<CreateOrderRequest> discountEligibility;

    private final DiscountRepository discountRepository;

    public CreateOrderRequestValidator(DiscountRepository discountRepository) {
        this.discountRepository = discountRepository;
        this.discountEligibility = this::validateDiscountEligibility;
    }

    public ValidationResult validate(CreateOrderRequest request) {
        return mandatoryFields.validate(request)
                .and(discountEligibility.validate(request));
    }
    ...
}
```

## Rules

- Each validator: one rule, one method, independently unit-testable.
- Composition happens at the request-type level — a service sees one validator facade, never a list of validators to orchestrate itself.
- Validation failures surface as the stack's standard validation exception with all errors collected in one pass, not fail-first.
- Pure structural rules (not-null, size, format) stay on the DTO via bean validation annotations; combinators handle conditional, cross-field, and stateful rules only.

## Anti-patterns

- Validators calling repositories deep inside chains when the rule could be checked at composition time.
- One validator class per field — that is annotation territory, not combinator territory.
- Returning boolean instead of a result carrying error detail; callers then invent their own messages.

## Review signals

- Service method beginning with more than three sequential validation blocks → propose extraction into a composed validator.
- Validator with branching per request subtype → strategy pattern inside the validator, not nested conditionals.
