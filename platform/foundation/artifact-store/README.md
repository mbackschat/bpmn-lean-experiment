# Artifact store

`@bpmn-lean/platform-artifact-store` provides exact content-addressed byte storage for Product 2. It validates lowercase SHA-256 identities, publishes without replacing existing content, and returns fresh byte arrays on retrieval. `FileArtifactStore` serves local mode; `PostgresqlExactArtifactStore` serves shared mode through a caller-owned bounded PostgreSQL runtime.

## What you can do

Store or retrieve immutable admitted definition source bytes by digest, detect conflicting or corrupt occupied content, and treat repeated publication of identical bytes as idempotent. The adapters own no deletion, garbage collection, size policy, or runtime lifecycle.

## Quick start

```sh
./scripts/pnpm.sh --filter @bpmn-lean/platform-artifact-store test
```

The ordinary package loop is database-free. Run the explicit PostgreSQL 18 contract witness with:

```sh
./scripts/with-postgresql-18.sh ./scripts/pnpm.sh --filter @bpmn-lean/platform-artifact-store test:postgresql
```

## Learn more

- [Architecture](../../../docs/ARCHITECTURE.md#foundation-packages) owns the storage boundary and exclusions.
- [Definitions module](../../modules/definitions/README.md) owns the business workflows that use this mechanism.
