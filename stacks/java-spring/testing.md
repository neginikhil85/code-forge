# Java Spring Testing Conventions

## Naming — Option A

Test methods follow `methodName_scenario`:

```java
createUser_validRequest()
createUser_duplicateEmail()
getUserById_unknownId()
updateUser_partialPayload()
```

The method plus scenario is the whole name; the expectation lives in the assertion. Concise over exhaustive.

## Structure

- One test class per concrete class, mirroring packages: `service/impl/UserServiceImpl` → `service/impl/UserServiceImplTest`.
- JUnit 5 + Mockito; `@ExtendWith(MockitoExtension.class)` with `@Mock` fields and `@InjectMocks` on the subject.
- Given / When / Then layout separated by blank lines — never narration comments.

```java
@Test
void createUser_duplicateEmail() {
    CreateUserRequest request = buildDuplicateEmailRequest();
    when(userRepository.existsByEmail(request.getEmail())).thenReturn(true);

    assertThatThrownBy(() -> userService.createUser(request))
            .isInstanceOf(DuplicateResourceException.class);
}
```

## Rules

- One behavior per test. If the name contains "and", split it.
- Exception tests assert type (and message where meaningful).
- Fixtures come from test-data builders/helpers (`buildValidRequest()`, `buildEntity()`) kept per test class or in a shared `testdata/` support package — no bloated inline setup, no shared mutable fixtures.
- Tests verify observable behavior, not implementation details: mock at repository/client/publisher boundaries only; asserting internal call choreography nobody cares about is a finding.
- New logic without a corresponding test scenario in its plan outline ships as an honest gap in the implementer's exit report.

## What the reviewer checks

- [ ] Names follow `methodName_scenario`
- [ ] Given/When/Then visible from blank-line structure
- [ ] Builders used; setup noise minimal
- [ ] Assertions on behavior; exception cases typed
