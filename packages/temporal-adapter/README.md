# Temporal adapter

`@bpmn-lean/temporal-adapter` is the durable host for the pure [TypeScript semantic core](../semantic-core/README.md). Temporal records delivery and Workflow decisions; the semantic core remains the owner of BPMN-visible state transitions and canonical observations.

The implementation supports only the content-addressed sequential User Task capsule. Deployment-time code parses BPMN XML outside the Workflow and passes its versioned executable IR plus the neutral scenario into one generic Workflow. The Workflow admits that IR through the semantic core, applies the start stimulus, and returns the same result as the in-process core. Its `bpmn-open-user-tasks` Query exposes the current core-derived task projection for a known Workflow, while its `bpmn-complete-user-task` Update queues one structured completion and returns the core-owned command outcome. Query and Update handlers never advance semantic state directly; one main loop alone calls the core.

The retained `bpmn-stimulus` Signal remains only for the Milestone 0 lifecycle history. New interaction executions use Update IDs equal to semantic command IDs. A Workflow-local result ledger returns the first result when the same semantic command is delivered under another Update ID, and conflicting payload reuse cannot enter the queue. The runner can execute a batch under one server and Worker, requires unique Workflow IDs, waits for every started case before reporting a batch failure, and has a three-case interaction witness.

New histories carry the executable IR and a Temporal patch marker. A narrowly isolated legacy constructor exists only so the committed pre-IR M0 history continues to replay; a new Workflow execution without IR fails.

## What the gate proves

The focused test:

- starts a full local Temporal development server through pinned CLI `v1.8.1`;
- compiles the exact BPMN XML before Workflow start and runs SDK `1.21.0` Workflow code against the calibrated scenario and IR;
- compares the complete Workflow result with the pure core result;
- replays the fetched live Event History;
- independently replays a committed CLI-exported lifecycle history fixture;
- executes exact, wrong-activation, and stale-completion scenarios through one reused server/Worker and compares every Query projection, Update result, and final trace with the pure core;
- replays all three live interaction histories;
- redelivers the first completion under a distinct Update ID and proves the result ledger prevents a second transition.

It does not yet interpret BPMN beyond the single admitted sequential IR or implement Activities, timers, Search Attributes, Continue-As-New, Worker Versioning, fault injection, a global task inbox, or a production authorization/form boundary. The interaction Update history is live-replayed but is not yet retained as an immutable fixture.

## Run

From the repository root:

```sh
./scripts/pnpm.sh run test:temporal
```

The first run downloads the exact CLI into the ignored `.cache/temporal-cli/` directory. The complete project boundary and dependency audit are in [TEMPORAL-EXECUTION-MODEL.md](../../docs/TEMPORAL-EXECUTION-MODEL.md) and [SOURCES.md](../../docs/SOURCES.md).
