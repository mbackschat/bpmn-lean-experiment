# Operate module

`@bpmn-lean/platform-operate` owns Product 2 cross-instance discovery, committed-execution projection, incident operations, and exact-definition flow-node metrics. It keeps private engine locators behind the module boundary and never treats platform persistence or Temporal Event History as semantic authority.

## What you can do

Register confirmed Process instances, search them by public identity, inspect committed execution, retry or cancel published incidents, export complete bounded per-instance operator audit, and aggregate version-bound flow-node frequency and duration when the authoritative projection is complete.

The same four Promise-only repository contracts have local SQLite and shared PostgreSQL adapters. PostgreSQL owns an ordinal-0003 checksum-bound migration for the Process registry, incident actions and source-ordered audit outbox, committed-execution prefix, and flow-node-occurrence prefix. Its adapters use a caller-owned `PostgresqlRuntime`; they never own the pool lifecycle. Ordinary projection writes append only a validated suffix, while the explicit rebuild operations alone may replace a complete prefix.

Shared incident-action recovery is one exact action at a time and two-phase. It prepares Product 1 work outside PostgreSQL, but every action-state or outcome/outbox mutation remains inside the supplied lease-completion session; `reserved` and `indeterminate` actions first advance to `submitting`, and a later lease prepares the content-bound Product 1 result while leaving its outcome audit pending for the separate incident-audit family.

The ordinal-0008 migration adds immutable incident snapshot generations. Candidate discovery materializes a bounded population cut, each recovery step observes at most one Process outside PostgreSQL, and the supplied lease session atomically revalidates and replaces that Process image. Shared incident list and detail reads prove complete, age-bounded coverage in one SQL statement and return the standard projection-freshness headers; local reads retain the same bodies without freshness metadata.

The ordinal-0009 migration adds database-clock completion watermarks to the append-only committed-execution and flow-node-occurrence headers, plus a constrained redundant current Process status. Lease-fenced recovery refreshes those facts even for an exact no-suffix Product 1 observation. Shared per-instance execution reads require one fresh aligned E1 and occurrence head, while shared metrics materialize and validate one exact-definition population cut in one SQL statement. Neither path calls Product 1 from the request, and metrics add no generation table or recovery family.

## Quick start

```sh
./scripts/pnpm.sh --filter @bpmn-lean/platform-operate test
```

The ordinary command is database-free. Run the explicit real-PostgreSQL 18 witness separately:

```sh
./scripts/with-postgresql-18.sh ./scripts/pnpm.sh --filter @bpmn-lean/platform-operate test:postgresql
```

## Learn more

- [Process-instance search specification](../../../docs/BPM-PLATFORM-PROCESS-INSTANCE-SEARCH-SPEC.md) owns discovery and paging.
- [Incident-operations specification](../../../docs/BPM-PLATFORM-INCIDENT-OPERATIONS-SPEC.md) owns authorization, actions, reconciliation, and audit.
- [Committed-execution publication specification](../../../docs/capsules/COMMITTED-EXECUTION-PUBLICATION-SPEC.md) owns history and current-position projection.
- [Flow-node occurrence metrics specification](../../../docs/capsules/FLOW-NODE-OCCURRENCE-METRICS-SPEC.md) owns aggregate availability and calculations.
- [Architecture](../../../docs/ARCHITECTURE.md#modules) and [implementation map](../../../docs/IMPLEMENTATION-MAP.md) own module placement and current coverage.
