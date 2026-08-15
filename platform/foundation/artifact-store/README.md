# Artifact store

`@bpmn-lean/platform-artifact-store` provides exact content-addressed local byte storage for Product 2. It validates lowercase SHA-256 identities, publishes without replacing existing content, and returns fresh byte arrays on retrieval.

## What you can do

Store or retrieve immutable definition and derived-artifact bytes by digest, detect conflicting content at an occupied path, and treat repeated publication of identical bytes as idempotent.

## Quick start

```sh
./scripts/pnpm.sh --filter @bpmn-lean/platform-artifact-store test
```

## Learn more

- [Architecture](../../../docs/ARCHITECTURE.md#foundation-packages) owns the storage boundary and exclusions.
- [Definitions module](../../modules/definitions/README.md) owns the business workflows that use this mechanism.
