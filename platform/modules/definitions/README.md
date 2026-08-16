# Definitions module

`@bpmn-lean/platform-definitions` owns Product 2 definition deployment, exact-version source and diagram retrieval, direct start, one-shot Timer Start scheduling, Message Start publication, and durable confirmed-start delivery to downstream modules.

## What you can do

Deploy exact BPMN bytes, list and inspect versioned definitions, retrieve source or presentation, start an exact version, manage one-shot schedules, publish an addressed Message Start, and recover confirmed starts without redispatching uncertain host work. For the structured Human Work profile, deployment also projects and atomically retains the exact-source-bound Human Task catalog after engine admission.

The module reaches Product 1 only through the [engine gateway](../../foundation/engine-gateway/README.md) and stores exact bytes only through the [artifact store](../../foundation/artifact-store/README.md).

## Quick start

```sh
./scripts/pnpm.sh --filter @bpmn-lean/platform-definitions test
```

## Learn more

- [Source map](SOURCE-MAP.md) maps services, repositories, routes, and value owners.
- [Platform proposal](../../../docs/BPM-PLATFORM-PROPOSAL.md) owns definition deployment and exact-version start behavior.
- [Diagram presentation decision](../../../docs/BPMN-DIAGRAM-PRESENTATION-DECISION.md) owns source and generated presentation provenance.
- [Structured Human Work proposal](../../../docs/BPM-PLATFORM-STRUCTURED-HUMAN-WORK-PROPOSAL.md) owns the catalog identity and Product 2 deployment boundary until closure graduation.
- [Architecture](../../../docs/ARCHITECTURE.md#modules) owns module boundaries, persistence, and composition.
- [Implementation map](../../../docs/IMPLEMENTATION-MAP.md) records the exact current Definitions surface.
