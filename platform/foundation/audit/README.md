# Platform audit foundation

`@bpmn-lean/platform-audit` provides append-only Product 2 audit event construction, storage, and canonical cursor search. It owns infrastructure mechanisms, while authorization and business-event meaning remain with their calling modules.

## What you can do

Persist and page Work or incident-action audit events with exact filters, idempotent source identity, and opaque exclusive cursors. SQLite and PostgreSQL sinks retain each producer-owned source ordinal as a strict contiguous suffix. PostgreSQL reads fail closed unless the independent Work or incident producer stream and its sink are byte-exact and complete at the same captured head. Each repository can also capture one bounded, source-local snapshot for a hosting Process instance without claiming a shared order across the two audit streams.

## Quick start

```sh
./scripts/pnpm.sh --filter @bpmn-lean/platform-audit test
```

The ordinary package loop is database-free. Run the explicit real PostgreSQL 18 witness only when changing the PostgreSQL adapter or its migration:

```sh
./scripts/with-postgresql-18.sh ./scripts/pnpm.sh --filter @bpmn-lean/platform-audit test:postgresql
```

## Learn more

- [Human-work specification](../../../docs/BPM-PLATFORM-HUMAN-WORK-SPEC.md) owns Work audit behavior.
- [Incident-operations specification](../../../docs/BPM-PLATFORM-INCIDENT-OPERATIONS-SPEC.md) owns incident-action audit behavior.
- [Architecture](../../../docs/ARCHITECTURE.md#foundation-packages) owns the package boundary.
