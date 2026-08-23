# Pattern: Observer / Events

## When to use

An action must trigger side effects that are not part of its core outcome: send a welcome email after registration, invalidate caches after product update, audit after sensitive access. The core flow must not know who listens or how many listeners exist.

## Choosing the mechanism

| Side effect | Mechanism |
|---|---|
| In-process, same transaction boundary, may fail silently | Spring application events (`ApplicationEventPublisher`) |
| Must survive process crash, consumed by other services | Kafka (or ActiveMQ) via the stack's messaging conventions |
| Reacting to data changes without touching business code | MongoDB change streams |

Default rule: **in-process side effect → Spring event; cross-service side effect → broker event.** Never couple another service to your database writes directly when an event will do.

## Shape

```java
@RequiredArgsConstructor
@Service
public class UserRegistrationService {

    private final ApplicationEventPublisher eventPublisher;
    private final UserRepository userRepository;

    @Transactional
    public UserResponse registerUser(CreateUserRequest request) {
        UserEntity savedUser = userRepository.save(UserRequestMapper.toEntity(request));
        eventPublisher.publishEvent(new UserRegisteredEvent(savedUser.getId()));
        return UserResponseMapper.toResponse(savedUser);
    }
}
```

Listeners stay small and independent:

```java
@Component
public class WelcomeEmailListener {

    @EventListener
    public void onUserRegistered(UserRegisteredEvent event) {
        ...
    }
}
```

## Rules

- Events are immutable facts in past tense (`UserRegisteredEvent`, not `SendWelcomeEmailEvent`). Commands target a known consumer; events do not care.
- Event payload carries identifiers and stable data, never live entities.
- If persistence + publish must be atomic, use the transactional outbox approach defined in the stack's communication conventions rather than `@TransactionalEventListener` alone.
- A listener failing must never roll back the producer's core operation unless the requirement explicitly says so — make that decision visible in `/plan`, not discovered in production.

## Anti-patterns

- Chains of events publishing more events with no owner of the overall flow — after two hops, draw the flow explicitly.
- Business-critical logic living only inside a listener nobody knows exists. Critical-path steps belong in the service; events carry the extras.

## Review signals

- Service method with three or more unrelated post-persistence actions inline → propose extraction into listeners.
- Listener performing core business validation → move it into the producing service before the fact is published.
