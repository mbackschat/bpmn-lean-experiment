# Temporal adapter

`@bpmn-lean/temporal-adapter` durably hosts the pure [TypeScript semantic core](../semantic-core/README.md). Temporal records message delivery and Workflow decisions; the core remains the owner of BPMN-visible state transitions and canonical observations.

`ExternalTemporalRuntime.connect` is the product-facing Worker boundary. It connects one Worker and Workflow client to a caller-managed Temporal address, Namespace, and Task Queue; it never starts an embedded server or binds a server port. `startBpmnProcess` receives that same explicit Task Queue, so the client and Worker cannot drift through hidden defaults. The connection requires explicit effect Activities and registers them with the Worker; the engine runner supplies a deterministic handler registry for effect-bearing profiles.

## Engine runner command

The repository command builds the source/compiler and adapter packages, validates one exact JSON config, compiles the named BPMN file before any network connection, and then runs the production Worker/Query/Update path against an already running Temporal service:

```sh
temporal server start-dev --headless
```

Run the server and engine command in separate terminals. The maintained examples use `localhost:7233`; copy the selected configuration before changing its Temporal address, Namespace, Task Queue, or semantic `process.instanceId`, which must be fresh because Workflow ID reuse is deliberately rejected.

```sh
./scripts/pnpm.sh run mvp:run -- examples/temporal-mvp/user-task-discovery-completion.json
```

The accepted config exposes initial `requestTitle` data at the active `UserTask_Approve`, keeps that exact occurrence active across a 3000-millisecond foreground delay, submits deterministic `decision` and explicit-null `reviewNote` form values, and reports the completed receipt. Paths inside the config resolve relative to the config file. Exit code `0` means completed, `1` means infrastructure failure, `2` means source or host admission rejection, `3` means interaction refusal, and `64` means malformed command configuration.

The rejection demonstration runs source admission but never connects to Temporal:

```sh
./scripts/pnpm.sh run mvp:run -- examples/temporal-mvp/unsupported.json
```

It exits `2` after emitting `sourceAdmissionRejected`. The complete operating contract, supported subset, and exclusions are in the [Temporal engine runner specification](../../docs/RUNNABLE-TEMPORAL-MVP-SPEC.md).

Deployment-time code parses BPMN XML outside Workflow execution, checks semantic execution admission and the separate Temporal host-capability predicate, and passes an accepted Semantic Process program plus one explicit start stimulus with canonical string/null initial Process variables to one generic Workflow. Production start returns typed `started | rejected`; rejected input never calls Temporal. The Workflow lifetime derives from semantic terminal state and accepted-handler draining, never from future scenario stimuli. The `bpmn-open-user-tasks` Query invokes the core's current-state projection rather than scanning diagnostic trace history. The `bpmn-complete-user-task` Update delegates structural validation to the core, queues one completion, and returns the core-owned command outcome. Direct payload-free Message ingress uses the `bpmn-deliver-message` Signal plus a read-only result Query over a durable Workflow-local delivery ledger; malformed caller input and conflicting command identity remain adapter failures, while a wrong or stale well-formed delivery reaches the core and returns its semantic rejection. Handlers never advance semantic state directly; one Workflow loop alone calls the core.

When committed core state exposes one admitted timer occurrence, the Workflow schedules `sleep(deadlineMs - logicalTimeMs)`, then derives the exact content-bound `fireTimer` stimulus from that committed occurrence and deadline. The runner never transports the scenario's timer stimulus to the Workflow. Timer sequence, physical lateness, and Event IDs remain adapter facts; the core alone owns occurrence identity, eligibility, logical-time advancement, and canonical observations. The exact contract is in the [Intermediate Catch Timer spec](../../docs/capsules/INTERMEDIATE-CATCH-TIMER-SPEC.md).

A Workflow-local result ledger returns the first outcome for an exact semantic command retry. Core-owned exact stimulus comparison rejects conflicting reuse of a semantic command ID as `BpmnCommandIdentityConflict`; Update ingress reports that non-retryable application failure without failing the Workflow Task, while Signal ingress records the conflict for Query resolution because a Signal has no result channel. Production Workflow IDs are SHA-256-bound to the semantic Process address, and Update IDs are SHA-256-bound to a canonical typed encoding of every stimulus field. The retained command-ID-only mutation proves why Temporal's payload-blind Update deduplication cannot use the semantic command ID alone. Workflow IDs, Run IDs, Update IDs, Signal Events, Workflow Tasks, and Event History remain hosting facts rather than BPMN facts.

Command ingress returns a typed adapter union: accepted or recovered commands return `semantic`, a distinct command first addressed after a retained completed Workflow returns `processClosed`, and an address with no retained execution or receipt returns `processUnknown`. The latter two never enter the semantic core's command outcomes or canonical trace. See the [Process lifecycle specification](../../docs/TEMPORAL-PROCESS-LIFECYCLE-SPEC.md).

## Pre-release replay policy

Tests start clean in-memory Temporal servers, execute the retained User Task, parallel, timer, Timer/User Task composition, Intermediate Catch Message, effect, mapping, boundary-error, Simple Boolean Exclusive Gateway, ordinary embedded Sub-Process, and Sub-Process Error-propagation witnesses, fetch their live histories, replay those histories through the Workflow bundle, and shut the servers down. No Event History fixture, legacy IR reader, patch branch, or migration path is committed while contracts are still changing freely.

This is deliberate, not an abandonment of replay compatibility. Before the first immutable deployment baseline, speculative history compatibility would preserve prototype accidents and multiply branches. Once a durable history baseline is explicitly approved, retained histories, Worker/version markers, compatibility code, and migration/deprecation rules become mandatory evidence.

## What the focused gate establishes

- exact BPMN XML compiles before Workflow start;
- the product Worker connects to an already running server, polls a caller-selected Task Queue, executes the sequential acceptance Process, and closes its owned connection without owning server ports;
- unsupported semantic input and a token split combined with a Timer/effect return typed pre-start admission rejection;
- clean servers and Workers execute exact, wrong-activation, sequential post-terminal stale, both parallel completion orders, live-sibling stale, exact timer, effect, mapping, boundary-error, and Simple Boolean conditional-routing witnesses;
- ordinary Query projections, Update outcomes, and final results equal the pure core;
- duplicate logical delivery does not cause a second semantic transition;
- every pre-existing path contains zero Signal Events, while the Message witness contains the exact five delivery Signals and a payload-substitution mutation makes that history check fail;
- the balanced parallel Process exposes both User Tasks and both ordered completion sequences expose the exact remaining-task Query projection;
- concurrent client submission realizes one of the two permitted completion orders recorded in history;
- concurrent distinct commands for one occurrence produce exactly one commit and one rejection with identical final state, without pinning the winner;
- live-sibling stale completion reaches the core and preserves B exactly;
- every completion Update finishes before Workflow completion;
- all fetched live histories replay before shutdown;
- duplicate Workflow identities are rejected before start;
- replacing a Worker at the semantic wait preserves start-before-completion ordering and the final result;
- the durable timer is derived only from committed core state, survives Worker absence at its due time, completes after replacement, and replays with one exact timer-started/timer-fired pair;
- the linear Timer/User Task composition passes host capability, durably fires its Timer, exposes the later User Task, completes through Update ingress, and replays;
- the direct Message subscription is passive host ingress, survives Worker absence, returns committed and refused semantic results through the result Query, preserves exact duplicate delivery, classifies malformed/conflicting requests outside semantic outcomes, records receipt recovery, and replays both Message/User Task orders;
- the direct-parent Error-propagation Process uses only passive User Task Updates and core-owned internal closure, survives Worker replacement after committed throw/catch/cancel, recovers the Recover-only state, refuses the stale child, completes and replays with zero host cancellation events, and detects a semantic-core bypass that fabricates the same recovery prefix but incorrectly commits the next stale child command against retained pre-throw state;
- a separately bundled timer-bypass mutation preserves the pure trace but fails the durable-history discriminator;
- the Simple Boolean gateway exposes only the selected User Task, completes and replays without an evaluator Activity, and a separately bundled route-substitution mutation exposes the wrong branch;
- one accepted Update result remains retrievable after Workflow closure, while a distinct late command returns `processClosed` and Workflow-ID reuse is refused;
- an unknown address returns `processUnknown`;
- same-Update-ID payload aliasing is visible, while a conflicting command ID under a distinct Update ID fails explicitly without wedging the Workflow;
- semantic results do not contain the Temporal Workflow ID;
- Query-derived command outcomes reconcile with durable Update results and terminal state reconciles with the completed receipt.

The adapter does not implement retained results beyond Temporal retention, a production canonical-observation API, evaluator Activities for Simple Boolean expressions, timer races or forms beyond the exact Intermediate Catch Timer capsule, Message payloads or key-based/global routing, modeled Message throw, Activities beyond the admitted Service Task success/data/error slices, Error propagation beyond one direct parent, Search Attributes, Continue-As-New, general Worker Versioning, general fault injection, a global task inbox, production authorization/forms, or BPMN beyond the admitted execution surfaces.

Run the focused gate:

```sh
./scripts/pnpm.sh run test:temporal
```

The first run downloads the pinned CLI into ignored `.cache/temporal-cli/`. The broader boundary and research are in [TEMPORAL-PROCESS-LIFECYCLE-SPEC.md](../../docs/TEMPORAL-PROCESS-LIFECYCLE-SPEC.md), [TEMPORAL-EXECUTION-RESEARCH.md](../../docs/research/TEMPORAL-EXECUTION-RESEARCH.md), and [SOURCES.md](../../docs/SOURCES.md).

The optional time-skipping calibration is separate from default verification:

```sh
./scripts/pnpm.sh run test:timer-time-skipping
```
