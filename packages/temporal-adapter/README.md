# Temporal adapter

`@bpmn-lean/temporal-adapter` durably hosts the pure [TypeScript semantic core](../semantic-core/README.md). Temporal records message delivery and Workflow decisions; the core remains the owner of BPMN-visible state transitions and canonical observations.

Deployment-time code parses BPMN XML outside Workflow execution and passes admitted executable IR plus the neutral scenario to one generic Workflow. The Workflow applies the start stimulus and completion commands through the core. The `bpmn-open-user-tasks` Query exposes the current core-derived projection. The `bpmn-complete-user-task` Update queues one structured completion and returns the core-owned command outcome. Handlers never advance semantic state directly; one Workflow loop alone calls the core.

A Workflow-local result ledger returns the first outcome when the same semantic command is delivered again under another Temporal Update ID. Conflicting reuse of a semantic command ID cannot enter the queue. Workflow IDs, Run IDs, Update IDs, Workflow Tasks, and Event History remain hosting facts rather than BPMN facts.

## Pre-release replay policy

Tests start a clean in-memory Temporal server, execute the three current witnesses, fetch their live histories, replay those histories through the current Workflow bundle, and shut the server down. No Event History fixture, legacy IR reader, patch branch, or migration path is committed while contracts are still changing freely.

This is deliberate, not an abandonment of replay compatibility. Before the first immutable deployment baseline, speculative history compatibility would preserve prototype accidents and multiply branches. Once a durable history baseline is explicitly approved, retained histories, Worker/version markers, compatibility code, and migration/deprecation rules become mandatory evidence.

## What the focused gate establishes

- exact BPMN XML compiles before Workflow start;
- one clean server and Worker execute exact, wrong-activation, and stale-completion witnesses;
- Query projections, Update outcomes, and final results equal the pure core;
- duplicate logical delivery does not cause a second semantic transition;
- each fetched live history contains the exact completion Update rather than Signal delivery;
- all fetched live histories replay before shutdown;
- duplicate Workflow identities are rejected before start.

The adapter does not yet implement Activities, timers, Search Attributes, Continue-As-New, Worker Versioning, fault injection, a global task inbox, production authorization/forms, or BPMN beyond the single admitted sequential IR.

Run the focused gate:

```sh
./scripts/pnpm.sh run test:temporal
```

The first run downloads the pinned CLI into ignored `.cache/temporal-cli/`. The broader boundary and research are in [TEMPORAL-EXECUTION-MODEL.md](../../docs/TEMPORAL-EXECUTION-MODEL.md) and [SOURCES.md](../../docs/SOURCES.md).
