# Java Spring Data Access (MongoDB)

## Decision tree

```
Need persistence or a query?
├── Simple CRUD / fixed-shape queries
│     → MongoRepository interface; @Query only for fixed custom finders
└── Runtime-dynamic filters built from request input
      → programmatic aggregation pipeline against the MongoTemplate bean,
        confined to the repository layer
```

## Rules

- **Repository layer owns all query construction.** Services receive results; they never see cursors, criteria objects, or aggregation builders.
- Dynamic pipelines are assembled from explicit stages; each stage's purpose is obvious from code or a why-comment when the intent is non-obvious (e.g., an unusual `$lookup` ordering chosen for index usage).
- Pagination and sorting come from a standard page-request model in `model/request/`, applied at the repository boundary.
- Index requirements discovered while designing queries belong in the `/plan` output — a new query pattern with no supporting index is a finding.
- Transactions (`@Transactional` / `TransactionalOperator`) span service methods when multi-document atomicity is required; single-document writes need none.

## Shape example

```java
@Repository
@RequiredArgsConstructor
public class OrderSearchRepository {

    private final MongoTemplate mongoTemplate;

    public List<OrderDocument> searchOrders(OrderSearchCriteria criteria) {
        AggregationOperation match = buildMatchStage(criteria);
        AggregationOperation sort = Aggregation.sort(Sort.Direction.DESC, "createdAt");
        return mongoTemplate.aggregate(
                Aggregation.newAggregation(match, sort), OrderDocument.class, OrderDocument.class)
                .getMappedResults();
    }
    ...
}
```

Fixed finders stay on the plain interface:

```java
public interface UserRepository extends MongoRepository<UserEntity, String> {

    Optional<UserEntity> findByEmail(String email);
}
```

## Review signals

- Query/filter logic above the repository layer → move down.
- A dynamic pipeline re-implementing what a derived finder expresses → collapse to the finder.
- Collection/index names as string literals → constants per the configuration sweep rule.
