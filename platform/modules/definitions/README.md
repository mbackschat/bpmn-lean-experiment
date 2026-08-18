# Definitions module

`@bpmn-lean/platform-definitions` owns Product 2 definition deployment, exact-version source and diagram retrieval, direct start, one-shot Timer Start scheduling, Message Start publication, and durable confirmed-start delivery to downstream modules.

## What you can do

Deploy exact BPMN bytes, list and inspect versioned definitions, retrieve source or presentation, start an exact version, manage one-shot schedules, publish an addressed Message Start, and recover confirmed starts without redispatching uncertain host work. For the structured Human Work profile, deployment also projects and atomically retains the exact-source-bound Human Task catalog after engine admission.

The module reaches Product 1 only through the [engine gateway](../../foundation/engine-gateway/README.md) and stores exact bytes only through the [artifact store](../../foundation/artifact-store/README.md).

Local mode uses the existing SQLite repositories. Shared mode uses caller-owned PostgreSQL runtime sessions and the Definitions-owned ordinal-0002 migration after the artifact-store migration. Both modes execute the same environment-neutral repository contract. PostgreSQL stores unrestricted exact Unicode identifiers as UTF-8 `bytea`, so the shared adapter does not narrow SQLite's accepted value domain.

Shared recovery discovers bounded, read-only candidate keys for confirmed delivery, direct start, Schedule, and Message Start. The exported canonical key codec and exact-key service methods let the recovery worker lease work outside this module, while Definitions re-reads durable state before any host call and retains ownership of lifecycle meaning.

## Quick start

```sh
./scripts/pnpm.sh --filter @bpmn-lean/platform-definitions test
```

The ordinary command is database-free. Run the explicit real-PostgreSQL witness separately:

```sh
./scripts/with-postgresql-18.sh ./scripts/pnpm.sh --filter @bpmn-lean/platform-definitions test:postgresql
```

## Learn more

- [Source map](SOURCE-MAP.md) maps services, repositories, routes, and value owners.
- [Platform proposal](../../../docs/BPM-PLATFORM-PROPOSAL.md) owns definition deployment and exact-version start behavior.
- [Diagram presentation decision](../../../docs/BPMN-DIAGRAM-PRESENTATION-DECISION.md) owns source and generated presentation provenance.
- [Structured Human Work specification](../../../docs/BPM-PLATFORM-STRUCTURED-HUMAN-WORK-SPEC.md) owns the catalog identity and Product 2 deployment boundary.
- [Architecture](../../../docs/ARCHITECTURE.md#business-modules) owns module boundaries, persistence, and composition.
- [`implementation-status-owner:BPM-PLATFORM`](../../../docs/BPM-PLATFORM-IMPLEMENTATION-MAP.md) records the exact current Definitions surface.
