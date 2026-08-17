# PostgreSQL recovery worker

This application is the thin shared-mode composition root for the eleven bounded Product 2 recovery families. It owns one PostgreSQL runtime, one engine-gateway runtime, one lease store, readiness, supervision, and shutdown. Business recovery decisions and candidate identity stay in their owning modules.

The ordinary package loop is database-free:

```sh
./scripts/pnpm.sh --filter @bpmn-lean/platform-recovery-worker test
```

The explicit PostgreSQL 18 witness is separate:

```sh
./scripts/with-postgresql-18.sh ./scripts/pnpm.sh --filter @bpmn-lean/platform-recovery-worker test:postgresql
```

The worker never migrates, performs a startup population scan, or exposes an HTTP reconciliation path. Apply migrations with `postgresql-migrate` before starting it. [The architecture](../../../docs/ARCHITECTURE.md#applications) owns the application boundary, and [the shared persistence proposal](../../../docs/BPM-PLATFORM-SHARED-PERSISTENCE-AND-PROJECTION-PROPOSAL.md) owns its durability and projection contract.
