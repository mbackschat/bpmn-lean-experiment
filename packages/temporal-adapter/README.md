# Temporal adapter

`@bpmn-lean/temporal-adapter` durably hosts the pure [TypeScript semantic core](../semantic-core/README.md). Temporal records message delivery and Workflow decisions; the core remains the owner of BPMN-visible state transitions and canonical observations.

Deployment-time code parses BPMN XML outside Workflow execution and passes the admitted Semantic Process program plus one explicit start stimulus to one generic Workflow. The Workflow lifetime derives from semantic terminal state and accepted-handler draining, never from future scenario stimuli. The `bpmn-open-user-tasks` Query invokes the core's current-state projection rather than scanning diagnostic trace history. The `bpmn-complete-user-task` Update delegates structural validation to the core, queues one completion, and returns the core-owned command outcome. Handlers never advance semantic state directly; one Workflow loop alone calls the core.

A Workflow-local result ledger returns the first outcome for an exact semantic command retry. Core-owned exact stimulus comparison rejects conflicting reuse of a semantic command ID as `BpmnCommandIdentityConflict`, a non-retryable application failure that does not fail the Workflow Task. Production Workflow IDs are SHA-256-bound to the semantic Process address, and Update IDs are SHA-256-bound to a canonical typed encoding of every stimulus field. The retained command-ID-only mutation proves why Temporal's payload-blind Update deduplication cannot use the semantic command ID alone. Workflow IDs, Run IDs, Update IDs, Workflow Tasks, and Event History remain hosting facts rather than BPMN facts.

Command ingress returns a typed adapter union: accepted or recovered commands return `semantic`, a distinct command first addressed after a retained completed Workflow returns `processClosed`, and an address with no retained execution or receipt returns `processUnknown`. The latter two never enter the semantic core's command outcomes or canonical trace. See the [Process lifecycle specification](../../docs/TEMPORAL-PROCESS-LIFECYCLE-SPEC.md).

## Pre-release replay policy

Tests start a clean in-memory Temporal server, execute the three retained sequential witnesses plus the parallel completion-order and live-sibling witnesses, fetch their live histories, replay those histories through the current Workflow bundle, and shut the server down. No Event History fixture, legacy IR reader, patch branch, or migration path is committed while contracts are still changing freely.

This is deliberate, not an abandonment of replay compatibility. Before the first immutable deployment baseline, speculative history compatibility would preserve prototype accidents and multiply branches. Once a durable history baseline is explicitly approved, retained histories, Worker/version markers, compatibility code, and migration/deprecation rules become mandatory evidence.

## What the focused gate establishes

- exact BPMN XML compiles before Workflow start;
- one clean server and Worker execute exact, wrong-activation, sequential post-terminal stale, both parallel completion orders, and live-sibling stale witnesses;
- ordinary Query projections, Update outcomes, and final results equal the pure core;
- duplicate logical delivery does not cause a second semantic transition;
- each fetched live history contains the exact completion Update rather than Signal delivery;
- the balanced parallel Process exposes both User Tasks and both ordered completion sequences expose the exact remaining-task Query projection;
- concurrent client submission realizes one of the two permitted completion orders recorded in history;
- concurrent distinct commands for one occurrence produce exactly one commit and one rejection with identical final state, without pinning the winner;
- live-sibling stale completion reaches the core and preserves B exactly;
- every completion Update finishes before Workflow completion;
- all fetched live histories replay before shutdown;
- duplicate Workflow identities are rejected before start;
- replacing a Worker at the semantic wait preserves start-before-completion ordering and the final result;
- one accepted Update result remains retrievable after Workflow closure, while a distinct late command returns `processClosed` and Workflow-ID reuse is refused;
- an unknown address returns `processUnknown`;
- same-Update-ID payload aliasing is visible, while a conflicting command ID under a distinct Update ID fails explicitly without wedging the Workflow;
- semantic results do not contain the Temporal Workflow ID;
- Query-derived command outcomes reconcile with durable Update results and terminal state reconciles with the completed receipt.

The adapter does not implement retained results beyond Temporal retention, a production canonical-observation API, Activities, timers, Search Attributes, Continue-As-New, general Worker Versioning, fault injection, a global task inbox, production authorization/forms, or BPMN beyond the current sequential and balanced two-branch parallel execution surfaces.

Run the focused gate:

```sh
./scripts/pnpm.sh run test:temporal
```

The first run downloads the pinned CLI into ignored `.cache/temporal-cli/`. The broader boundary and research are in [TEMPORAL-PROCESS-LIFECYCLE-SPEC.md](../../docs/TEMPORAL-PROCESS-LIFECYCLE-SPEC.md), [TEMPORAL-EXECUTION-RESEARCH.md](../../docs/TEMPORAL-EXECUTION-RESEARCH.md), and [SOURCES.md](../../docs/SOURCES.md).
