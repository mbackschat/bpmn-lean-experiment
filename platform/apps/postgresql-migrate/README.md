# PostgreSQL migration application

`@bpmn-lean/platform-postgresql-migrate` is the administrative composition root for Product 2's shared PostgreSQL schema. It requires only `PLATFORM_POSTGRESQL_MIGRATION_URL`, resolves the immutable artifact, Definitions, Operate, Work, Audit, and recovery migration catalogs from declared workspace dependencies, and applies the exact checksum-bound ordinal sequence through 0011 and schema epoch 11.

API and recovery-worker processes never import or run migrations. The migration credential is not accepted as a runtime fallback, and failure output never includes it.

The ordinary package loop is database-free:

```sh
./scripts/pnpm.sh --filter @bpmn-lean/platform-postgresql-migrate test
```

The explicit PostgreSQL 18 witness is separate:

```sh
./scripts/with-postgresql-18.sh ./scripts/pnpm.sh --filter @bpmn-lean/platform-postgresql-migrate test:postgresql
```

[The architecture](../../../docs/ARCHITECTURE.md#applications) owns the application boundary, and [the shared persistence proposal](../../../docs/BPM-PLATFORM-SHARED-PERSISTENCE-AND-PROJECTION-PROPOSAL.md#schema-and-migration-contract) owns migration semantics and exclusions.
