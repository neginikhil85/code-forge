# Java Spring Package Structure

One microservice = one single-module Maven project. Service boundaries live at process boundaries, enforced by contracts and messaging — never by shared modules. Multi-module builds are out of scope.

## Canonical layout

Base package: `com.<organization>.<service-name>` — layered with domain/feature sub-packages:

```
com.example.orderservice/
├── config/                    # framework wiring, one class per concern
│   ├── mongo/                 # Mongo client/template/index configuration
│   ├── kafka/                 # producer/consumer factories, topic beans
│   └── security/              # security filter chains, CORS, OAuth2
├── constants/                 # fixed application-wide values, grouped by domain
├── controller/                # REST/GraphQL entry points; thin — delegate, never compute
│   ├── auth/                  # AuthenticationController, AppLifecycleController
│   ├── order/                 # OrderController, OrderFulfillmentController
│   └── payment/               # PaymentController
├── service/                   # business orchestration interfaces + implementations
│   ├── auth/                  # AuthenticationService, UserService
│   ├── order/                 # OrderService, OrderValidationService
│   └── payment/               # PaymentService, RefundService
├── repository/                # persistence interfaces + dynamic query/aggregation logic
│   ├── auth/                  # AppUserRepository
│   ├── order/                 # OrderRepository, OrderAuditRepository
│   └── payment/               # PaymentTransactionRepository
├── mapper/                    # ALL conversions between models, grouped by domain
│   ├── auth/                  # UserRequestMapper, UserResponseMapper
│   ├── order/                 # OrderRequestMapper, OrderResponseMapper
│   └── payment/               # PaymentRequestMapper, PaymentResponseMapper
├── validator/                 # composed request validators by domain
│   ├── order/                 # CreateOrderRequestValidator
│   └── payment/               # PaymentMethodValidator
├── model/                     # entities, contracts, and transfer objects by domain
│   ├── auth/                  # AppUser entity, AuthRequest, AuthResponse
│   ├── order/                 # Order entity, CreateOrderRequest, OrderViewResponse
│   ├── payment/               # Payment entity, ChargeRequest, PaymentResponse
│   └── dto/                   # cross-cutting or shared transfer objects
├── exception/                 # domain exception classes
│   ├── handler/               # @RestControllerAdvice global error handlers
│   └── auth/                  # InvalidCredentialsException, UnauthorizedException
└── util/                      # stateless helpers with no business knowledge
```

Test sources mirror this structure exactly under `src/test/java`.

## Package Sizing & The Rule of 5

1. **The 5-File Ceiling (Hard Limit)**:
   - A single flat package should not hold more than 5–7 files.
   - Once any layer (`controller/`, `service/`, `repository/`, `model/`, `mapper/`) reaches 5 files, partition it into domain-specific sub-packages (e.g. `order/`, `payment/`, `auth/`).
2. **Proactive Domain Grouping**:
   - If the project has distinct business domains from the start, organize files into domain sub-packages immediately instead of accumulating a flat list.
3. **Avoid Over-Fragmentation**:
   - Isolated single-file cross-cutting utilities (e.g., `HealthController`) may remain at the layer root or in `system/` / `common/` without creating 1-file sub-directories.

## Placement rules

- A class lives in exactly one layer and one domain sub-package.
- Controllers: parse → validate → delegate → map to response. Zero business logic, zero repository access.
- Services: own transactions, orchestration, and business decisions. They never touch transport details (headers, `org.springframework.web.*` types).
- Repositories: all persistence and query construction. Dynamic aggregation logic never leaks above this layer.
- Mappers: all field-by-field copying. Services assemble nothing by hand.
- `util/` is a last resort; anything knowing about domain concepts belongs in a named domain class instead.

## Dependency direction

`controller → service → repository`, with `mapper`, `validator`, `model`, `constants` as supporting packages reachable per layer rules. Enforced mechanically by ArchUnit (using `..controller..`, `..service..`, `..repository..` matchers that encompass all domain sub-packages).
