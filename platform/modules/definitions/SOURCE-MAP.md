# Definitions module source map

This contributor map groups source responsibilities inside `@bpmn-lean/platform-definitions`. Human orientation starts in the [README](README.md); transport and lifecycle behavior remain in the linked specifications.

| Source owners | Responsibility |
|---|---|
| [`definition-deployment-service.ts`](src/definition-deployment-service.ts), [`definition-start-service.ts`](src/definition-start-service.ts), and [`definition-presentation-service.ts`](src/definition-presentation-service.ts) | Definition admission, exact-version start, and presentation orchestration |
| [`definition-schedule-service.ts`](src/definition-schedule-service.ts) and `definition-schedule-*.ts` | One-shot Timer Start lifecycle, HTTP boundary, contracts, and values |
| [`message-start-publication-service.ts`](src/message-start-publication-service.ts) and `message-start-publication-*.ts` | Addressed Message Start lifecycle, HTTP boundary, contracts, and values |
| [`confirmed-process-instance-publication-service.ts`](src/confirmed-process-instance-publication-service.ts), [`confirmed-process-instance-operate-bootstrap.ts`](src/confirmed-process-instance-operate-bootstrap.ts), and `confirmed-process-instance-*.ts` | Durable confirmed-start publication and downstream recovery |
| `sqlite-*.ts`, `postgresql-*.ts`, and `in-memory-*.ts` under [`src/`](src/) | Local, shared, and test repository implementations; [`postgresql-definition-values.ts`](src/postgresql-definition-values.ts) owns exact PostgreSQL value decoding without becoming a generic repository layer |
| [`migrations/`](migrations/) | Checksum-bound Definitions tables applied after the artifact-store schema floor |
| [`http-routes.ts`](src/http-routes.ts), [`http-request.ts`](src/http-request.ts), and [`definition-http-responses.ts`](src/definition-http-responses.ts) | Definition HTTP contribution and transport adaptation |
| [`contracts.ts`](src/contracts.ts), `*-contracts.ts`, and `*-values.ts` under [`src/`](src/) | Module-private ports and immutable value constructors |
| [`database-schema-epoch.ts`](src/database-schema-epoch.ts) | Shared Definitions schema-epoch admission |
| [`index.ts`](src/index.ts) | Public package exports |

Tests under [`test/`](test/) mirror these owners by service, repository, route, or recovery contract. [`definitions-repository-contract.ts`](test/support/definitions-repository-contract.ts) runs the common persistence contract against SQLite in the ordinary database-free loop and PostgreSQL in the explicit nested [`test/postgresql/`](test/postgresql/) lane.
