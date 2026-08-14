# Flow-node occurrence metrics proposal

## Status

**Draft proposal; owner approval has not been requested and implementation is not authorized.** This proposal selects one additive Product 1 publication for exact BPMN flow-node occurrence lifecycles and replay-stable commit times, plus the smallest Product 2 frequency and completed-duration surface for one exact definition version. It changes public observation and Temporal refinement, but no BPMN meaning, profile capability, CIB relationship, admitted source, Semantic Process IL operation, RuntimeState field, or command outcome.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `25034641c5566bfd9e0dbc5c99b9ded673c7922b` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

## Question and recommendation

How should the engine make exact flow-node frequency and elapsed duration publicly recoverable without Product 2 counting semantic operations, interpreting Semantic Process IL, reading Temporal Event History, differencing states, or treating ingestion time as execution time?

**Recommendation: publish a separate cursor-paged flow-node occurrence lifecycle aligned to the existing committed semantic transition revisions.** The semantic evaluator emits exact starts and terminal dispositions for BPMN flow-node occurrences at each existing transition boundary. Product 1 assigns public occurrence identities and one replay-stable wall-clock commit instant per complete command batch. Product 2 transactionally projects every confirmed Process instance for one exact definition version, refuses an incomplete population, and renders frequency and completed-duration modes through numeric diagram badges and the same values in an accessible table.

This is the smallest complete M5 frequency and duration increment. The existing committed execution publication remains byte-exact and authoritative for semantic history and current position. The new lifecycle supplies the two facts it deliberately lacks: one execution unit per BPMN flow-node occurrence and one engine-owned elapsed-time boundary.

## Authority and classification

BPMN 2.0.2 defines the flow nodes whose already selected execution meaning this observation describes. BPMN does not require this occurrence identifier, wall-clock timestamp, paging protocol, aggregate, or UI. Existing capsules, the Semantic Process IL, Lean relations, and the semantic core remain authoritative for execution. This proposal adds a project-owned public observation and does not reinterpret any BPMN construct.

The term **flow-node occurrence** includes Events, Gateways, Tasks, Call Activities, and embedded Sub-Processes. It does not mean only the BPMN `Activity` subtype, and it excludes the root `Process`, Sequence Flows, private control places, waits, incidents, commands, and host tasks as metric units.

No CIB Seven relationship or compatibility profile is selected. The source-grounded [UI/UX research](../research/BPM-PLATFORM-UI-UX-INFORMATION-ARCHITECTURE-RESEARCH.md#pattern-11-flow-node-metrics-require-occurrence-facts-not-transition-counts) uses CIB Seven Cockpit and historic activity-instance contracts as interaction and data-account precedent. It does not make CIB history a semantic oracle, wire source, runtime dependency, or differential target.

## Source-grounded product preflight

CIB Seven keeps runtime activity counts and incident counts as separate optional diagram badges, lets an activity badge narrow the instance collection, and preserves one historic activity-instance row per executed flow node with start, terminal, duration, completion, and cancellation facts. Its completed-duration reports use completed samples and publish count, minimum, maximum, and average. Its community Cockpit checkout exposes the report host and link but not the enterprise duration-report implementation.

The pinned CIB source also separates a merely armed Boundary Event subscription from executing the Boundary Event flow node. The Boundary Event reaches ordinary activity-start handling only when it catches. Event-Based Gateway candidates differ because the waiting Catch Events themselves are active flow nodes and later complete or cancel with the race.

Camunda Optimize independently confirms the useful analytical distinction between the object being viewed, the frequency or duration measure, the selected population, and completion status. This proposal adopts those distinctions while excluding the report builder, heatmap, predictive, and storage architecture.

| Reference pattern | Adopt | Deliberately change | Exclude |
|---|---|---|---|
| CIB runtime activity badges | Exact numeric BPMN-element overlays with an exact-value table | Keep current-position, incident, frequency, and duration modes separate; never mark a collapsed container as an execution of itself | Counting tokens, semantic operations, diagram markers, or platform rows as executions |
| CIB historic activity instances | One durable started flow-node occurrence with one terminal disposition | Use project semantic identity, exact runtime ownership, and engine commit time; call the unit a flow-node occurrence | CIB persistence IDs, entities, SQL, PVM transitions, or history configuration |
| CIB completed-duration reports | Completed-only count, minimum, maximum, and average | Bind the first surface to one exact definition version and the complete retained population | Adjustable periods, running pseudo-duration, or an average without sample count |
| Optimize flow-node analysis | Separate Frequency and Duration modes | Use numeric badges and an accessible table before any color scale | Heatmaps, report builders, dashboards, variants, conformance, prediction, and chart-library scope |

## Selected decisions

1. Define frequency as the number of engine-published BPMN flow-node occurrence starts. Never count E1 transition records, Program operations, tokens, waits, diagram markers, or Product 2 rows as flow-node executions.
2. Publish one exact lifecycle for every currently admitted flow-node family: start, then either completed or cancelled. A Boundary Event starts only when it catches, while Event-Based Gateway candidate Catch Events start when the race arms them and later complete or cancel.
3. Identify a public occurrence by Process instance, start transition revision, and zero-based start index. This distinguishes repeated activation and multiple starts at one transition without adding counters to semantic RuntimeState.
4. Add a separate strict occurrence publication aligned record-for-record and batch-for-batch with `bpmn-lean.execution-publication.v1`. Preserve the existing E1 Query, schema, canonical bytes, export, and Product 2 projection exactly.
5. Capture one replay-stable, nondecreasing `committedAtEpochMs` from the deterministic Temporal Workflow clock after stable semantic closure and before atomically appending both publications and resolving the command. Every transition in that command batch shares the instant.
6. Define elapsed duration as terminal batch commit time minus start batch commit time. Include completed occurrences only; keep running and cancelled occurrences in frequency and status counts; allow same-batch duration zero; never substitute semantic logical time, Product 2 ingestion time, audit time, or Event History analysis.
7. Reconcile and store occurrence pages transactionally from revision zero. Aggregate every confirmed Process instance for one exact deployed definition version, with a maximum population of 100 in this first increment. Any over-limit, unknown, unavailable, malformed, identity-drifted, or gapped member makes the whole metric result unavailable rather than partial.
8. Add one definition-version **Flow-node metrics** detail with Frequency and Duration modes, numeric diagram badges, the same exact values in a table, and a visible “all retained evidence” population statement. Functional acceptance covers 1280 and 1600 CSS pixels.
9. Exclude adjustable time periods, heatmaps, color-only encoding, charts, report builders, dashboards, saved views, variants, conformance, prediction, metric export, operator audit, mobile-specific layouts, and pixel-regression baselines from this increment.

## Public contract

The semantic root emits an unnumbered occurrence delta beside each existing unnumbered committed transition. It uses a private semantic anchor only to pair a later terminal boundary with the exact start. Runtime-backed waits and Call Activities use their existing occurrence identity, embedded Sub-Processes use their existing scope occurrence, and an occurrence that starts and ends in one transition uses a transition-local anchor. The anchor never enters the public wire or Product 2.

```ts
enum FlowNodeOccurrenceTerminalKind {
  Completed = "completed",
  Cancelled = "cancelled",
}

type UnnumberedFlowNodeOccurrenceStart = DeepReadonly<{
  anchor: SemanticFlowNodeOccurrenceAnchor;
  processId: string;
  elementId: string;
  owner: ScopeOccurrenceId;
}>;

type UnnumberedFlowNodeOccurrenceEnd = DeepReadonly<{
  anchor: SemanticFlowNodeOccurrenceAnchor;
  terminal: FlowNodeOccurrenceTerminalKind;
}>;

type UnnumberedFlowNodeOccurrenceDelta = DeepReadonly<{
  started: UnnumberedFlowNodeOccurrenceStart[];
  ended: UnnumberedFlowNodeOccurrenceEnd[];
}>;
```

The evaluator derives this delta at the same boundary where it already owns the exact selected external stimulus or internal operation and both RuntimeStates. It does not replay the evaluator and does not infer lifecycle from a later state difference. The public projection fails closed unless every ended anchor resolves to exactly one currently open occurrence, every start anchor is new, every element and owner are exact, and the resulting open set agrees with an independent projection of the committed RuntimeState.

Product 1 assigns the public identity when the start is numbered:

```ts
type FlowNodeOccurrenceId = DeepReadonly<{
  processInstanceId: string;
  startRevision: number;
  startIndex: number;
}>;

type FlowNodeOccurrenceStart = DeepReadonly<{
  id: FlowNodeOccurrenceId;
  processId: string;
  elementId: string;
  owner: ScopeOccurrenceId;
}>;

type FlowNodeOccurrenceEnd = DeepReadonly<{
  id: FlowNodeOccurrenceId;
  terminal: FlowNodeOccurrenceTerminalKind;
}>;

type FlowNodeOccurrenceDelta = DeepReadonly<{
  started: FlowNodeOccurrenceStart[];
  ended: FlowNodeOccurrenceEnd[];
}>;

type FlowNodeOccurrenceTransition = DeepReadonly<{
  revision: number;
  lifecycle: FlowNodeOccurrenceDelta;
}>;

type FlowNodeOccurrenceBatch = DeepReadonly<{
  commandId: string;
  fromRevision: number;
  throughRevision: number;
  committedAtEpochMs: number;
  transitions: [FlowNodeOccurrenceTransition, ...FlowNodeOccurrenceTransition[]];
}>;

type OpenFlowNodeOccurrence = DeepReadonly<{
  id: FlowNodeOccurrenceId;
  processId: string;
  elementId: string;
  owner: ScopeOccurrenceId;
  startedAtEpochMs: number;
}>;

type FlowNodeOccurrencePage = DeepReadonly<{
  definition: SemanticProcessIdentity;
  processId: string;
  processInstanceId: string;
  requestedAfterRevision: number;
  pageThroughRevision: number;
  headRevision: number;
  batches: FlowNodeOccurrenceBatch[];
  currentOpen: OpenFlowNodeOccurrence[] | null;
}>;
```

`startRevision` is the exact existing semantic transition revision whose lifecycle delta starts the occurrence. `startIndex` is the occurrence's zero-based position in that transition's canonically ordered `started` collection. `processId` is the exact BPMN Process owning the flow node, including a distinct called Process when applicable. Started entries are ordered by complete semantic anchor, Process ID, element ID, and owner before the public IDs are assigned. Ended and current-open entries are ordered by complete public occurrence identity. The public decoder rejects duplicate IDs, sparse or reordered start indexes, a terminal before its start, a repeated terminal, inconsistent Process, element, or owner identity, a terminal time before its start, or a current-open set unequal to the complete fold.

The dedicated `bpmn-flow-node-occurrences` Query uses the existing result arms `available`, `notReady`, `notFound`, `unavailable`, and `gap`, plus the same request `{ afterRevision, limit? }`, default 50, maximum 100, complete-batch paging, and batch-boundary cursor rules as E1. Every occurrence batch must have the same command ID, range, transition revisions, and head as the corresponding E1 batch. A transition with no lifecycle change remains present with two empty collections. `currentOpen` is non-null exactly at the head.

`committedAtEpochMs` is a nonnegative safe integer and cannot decrease across batches. It is the one deterministic Workflow clock sample taken after `advanceScenario` returns a publishable committed step and before either accumulator or the command-result ledger advances. It is not BPMN logical time, a claim about CPU completion, or a global order across Process instances. Multiple commands handled in one Workflow Task may share it.

Product 2 publishes one exact aggregate:

```ts
type CompletedFlowNodeDuration = DeepReadonly<{
  sampleCount: number;
  minimumMs: number;
  maximumMs: number;
  averageMs: number;
}>;

type FlowNodeMetric = DeepReadonly<{
  elementId: string;
  frequency: number;
  running: number;
  completed: number;
  cancelled: number;
  completedDuration: CompletedFlowNodeDuration | null;
}>;

type FlowNodeMetricsSnapshot = DeepReadonly<{
  definition: DeployedDefinitionVersion;
  population: {
    processInstances: number;
    label: "allRetainedEvidence";
  };
  flowNodes: FlowNodeMetric[];
}>;
```

The aggregate includes exactly the published occurrences whose `processId` equals the selected deployed definition's `processId`; called-Process interiors never appear on the caller's diagram or in its table. Only elements with `frequency > 0` appear. For every included flow node, `frequency = running + completed + cancelled`. `completedDuration` is null exactly when `completed = 0`; otherwise `sampleCount = completed`, minimum and maximum are exact safe integers, and `averageMs` is the integer floor of the arbitrary-precision total divided by `sampleCount`. Counts and durations must remain safe integers or the snapshot is unavailable. Flow nodes are ordered by canonical element ID. The route is an Operations-authorized exact-definition-version read. The response exposes no locator, Workflow identity, Program operation, semantic anchor, private control place, or CIB identifier.

## Stable rules

### FNOM-OCCURRENCE-01: exact flow-node lifecycle

Emit one start for each BPMN flow-node execution selected by the existing semantic account, then exactly one completed or cancelled terminal. Long-lived occurrences remain open across commands. Instantaneous occurrences start and complete in one transition. No command, Sequence Flow, private wait, incident, Program operation, or root Process becomes an occurrence.

The lifecycle mapping is exhaustive over the currently admitted operation and command families:

| Semantic boundary | Flow-node lifecycle |
|---|---|
| Process start operation | Start Event starts and completes. The root Process is not a flow node. |
| Task, Intermediate Catch Event, or Event-Based Gateway candidate becomes a committed wait | Its exact flow node starts. |
| User Task, Message, Timer, or effect completion | The exact wait-owning occurrence completes. Incident report and retry leave the Service Task occurrence open. |
| Event-Based Gateway arms candidates | The Gateway starts and completes; each candidate Catch Event starts. Winner completes and every withdrawn loser cancels. |
| Embedded Sub-Process entry and normal quiescent completion | One Sub-Process occurrence starts on entry and completes when that exact child scope completes. |
| Call Activity invoke and exact return | One Call Activity occurrence starts on invoke and completes on the matching return. The called root Process is not a flow node. |
| Exclusive, Parallel, or Inclusive Gateway operation | The Gateway starts and completes in that transition. Multiple outgoing tokens do not multiply the Gateway occurrence. |
| ordinary None End, Error End, or Terminate End | The End Event starts and completes; any live occurrences removed by error propagation or termination cancel. |
| Boundary Event catch | The Boundary Event starts and completes when it catches. Arming its subscription starts no Boundary Event occurrence. Interrupting catch cancels the host; non-interrupting catch leaves the host open. |
| root incident cancellation | Every open flow-node occurrence in the removed root region cancels; no synthetic cancellation flow node is created. |

### FNOM-TIME-01: replay-stable commit time

Every complete committed command batch receives exactly one deterministic Workflow clock instant after stable closure and before publication. All starts and terminals in the batch use that instant. Replay recreates the same values. Time never affects semantic admission, scheduling, ordering, or outcomes.

### FNOM-PUBLICATION-01: aligned and foldable pages

Occurrence pages preserve the E1 definition, Process, instance, command, revision, range, head, and batch-boundary equations exactly. Folding from revision zero creates each public start identity, resolves each terminal once, and reconstructs the exact head open set. A page cannot be repaired from an E1 record count, state difference, Event History, or Product 2 row.

### FNOM-AGGREGATE-01: complete exact-version population

Product 2 aggregates only fully reconciled confirmed hosting instances of one exact deployed definition version, then includes only occurrence rows owned by that definition's Process ID. The first increment supports zero through 100 such registrations, so a definition with no instances has an available empty snapshot. Any missing, unavailable, gapped, malformed, over-limit, overflowed, or identity-drifted member suppresses the whole snapshot. Frequency counts starts. Duration uses completed occurrences only.

### FNOM-SURFACE-01: honest metric presentation

The definition-version workspace renders one Flow-node metrics detail. Frequency and Duration are explicit modes. Diagram badges and the table show the same exact values, and color is never the only carrier. A called-Process occurrence is not overlaid on the caller diagram. The surface states that its population is all retained evidence. It does not imply a selected calendar interval, current-only population, estimate, SLA, or CIB equivalence.

## Temporal hosting and refinement preflight

The existing semantic Workflow remains the lifetime owner. No new Signal, Update, Activity, Timer, cancellation mechanism, Task Queue, or Child Workflow is required. The occurrence Query is unconditional and read-only like the E1 Query. It is served from deterministic Workflow state and remains available for running, completed, and cancelled instances during the existing retention boundary.

Durable ingress remains the existing content-bound command queue. A committed command is evaluated once through `advanceScenario`. The Workflow takes one `Date.now()` sample only after the step is publishable, then appends the E1 batch and the aligned occurrence batch before recording the result or resolving an Update. There is no `await` between these state changes. Any exception rolls back the Workflow Task, so no timestamp, occurrence prefix, head, or result becomes visible alone.

Ordering is the existing accepted-stimulus queue order. Duplicate command recovery returns the retained command result and creates no new occurrence or timestamp. Worker replacement and replay reconstruct both accumulators. Queries do not mutate state or add history events. Event History may retain the deterministic clock input as part of ordinary Workflow replay, but neither Product 2 nor a diagnostic reader interprets Event History to manufacture the public fact.

The smallest executable refinement witness starts one Process that reaches a User Task, stops the Worker across the wait, completes the same task after replacement, reaches an End Event, and retrieves the terminal occurrence page. It proves exact Start Event, User Task, and End Event lifecycles, positive elapsed User Task duration, same-batch zero duration for instantaneous nodes, E1 revision alignment, duplicate command recovery, pure repeated Queries, completed-history replay, and no platform or Event History fallback. A second bounded witness covers Event-Based Gateway loser cancellation, Call Activity or embedded Sub-Process pairing, and interrupting Boundary Event host cancellation.

## Separating witnesses and evidence matrix

The smallest semantic witness is a sequential Start Event to User Task to End Event Process. One start command emits Start Event start/completion and one User Task start. One completion command ends that same User Task and starts/completes the End Event. Counting semantic operations instead would count the Start and End mechanics differently and cannot pair the User Task across commands.

A Call Activity witness is mandatory because `invokeProcess` and `returnProcess` share one BPMN origin but constitute one occurrence. An embedded Sub-Process witness provides the independent second instance of the same defect with `enterScope` and `completeScope`. A Boundary Timer witness separates subscription arming from Boundary Event execution. An Event-Based Gateway witness separates candidate starts, one completed winner, and one cancelled loser.

| Rule | Lean | TypeScript core | Temporal/Product 1 | Product 2 | Separating mutation |
|---|---|---|---|---|---|
| `FNOM-OCCURRENCE-01` | exact lifecycle relation and fold | same-root lifecycle projection | assigns public IDs only after stable closure | strict closed decoder only | count Invoke/Return or Enter/Complete as two occurrences |
| `FNOM-TIME-01` | time deliberately absent | time deliberately absent | deterministic one-sample batch clock and replay | consumes published time only | substitute logical time, ingestion time, or one time per record |
| `FNOM-PUBLICATION-01` | unnumbered delta parity | exact anchor and current-open projection | E1-aligned atomic Query | transactional contiguous projection | skip a revision, change command ID, terminal unknown ID, duplicate terminal |
| `FNOM-AGGREGATE-01` | not applicable | not applicable | typed unavailable and gap arms | all-or-error exact-version aggregation | omit one confirmed instance or return partial after one unavailable member |
| `FNOM-SURFACE-01` | not applicable | no Product 2 knowledge | representation-free gateway | two modes, badges, table, population label | badge/table disagreement, color-only value, stale response, private identity |

## Required, optional, and excluded functionality

Required:

- exact flow-node start, completed, and cancelled facts for every currently admitted flow-node family;
- repeated-activation identity, multiple starts in one transition, long-lived pairing, and exact owner identity;
- separate byte-stable occurrence publication aligned to the unchanged E1 revisions and batches;
- deterministic batch commit time with replay, duplicate-command, rollback, and nondecreasing-time evidence;
- strict Query, client, engine API, gateway, Product 2 contract, schema, transactional projection, restart, and revision-zero rebuild;
- all-or-error exact-definition aggregation over at most 100 confirmed instances;
- Frequency and Duration modes with numeric diagram badges, an accessible exact-value table, visible population semantics, currentness, focus, and no horizontal overflow at 1280 and 1600 CSS pixels.

Optional only when it changes no selected claim:

- one additional admitted flow-node family witness;
- a second same-batch zero-duration fixture;
- manual visual inspection at wider desktop widths.

Excluded:

- new BPMN semantics, profile capability, CIB relationship, source admission, IL operation, RuntimeState field, command, or outcome;
- wall-clock time in Lean or the pure semantic core, or wall-clock time affecting a semantic decision;
- E1 v1 wire, Query, schema, canonical export, retained bytes, projection, History, or current Diagram changes;
- Event History, state differences, Product 2 ingestion time, audit time, CIB history, or database time as a published occurrence or duration source;
- partial aggregates, current-only counts, adjustable periods, running pseudo-duration, estimates, SLAs, cross-instance order, or post-retention reconstruction;
- metric export, operator history, audit export, dashboards, saved views, report builders, charts, heatmaps, variants, conformance, discovery, prediction, auto-refresh, or generalized mining;
- mobile-specific layouts and pixel-regression baselines.

## Versioning consequences

This is an additive pre-release public-observation change. Existing profile, checked graph, IL, RuntimeState, command result, scenario observation, E1 publication, CIB evidence, Workflow result, and terminal receipt bytes remain exact. Existing histories must replay. The occurrence wire is strict from its first version; changing its lifecycle unit, time meaning, identity, terminal dispositions, or retention requires a new version and migration account.

### Owners this implementation grows

The implementation must not grow crowded generic owners. The measured existing owners are:

| Existing owner | Current headroom before 600 nonblank lines | Required consequence |
|---|---:|---|
| [`packages/semantic-core/src/semantic-process-runtime.ts`](../../packages/semantic-core/src/semantic-process-runtime.ts) | 38 | Add no lifecycle logic here; use a new cohesive lifecycle projector and retain only existing delegation. |
| [`packages/semantic-core/src/semantic-transition-trace.ts`](../../packages/semantic-core/src/semantic-transition-trace.ts) | 370 | Attach the new unnumbered lifecycle result at the existing record boundary without changing E1 records. |
| [`BpmnSemantics/SemanticProcess/TransitionTrace.lean`](../../BpmnSemantics/SemanticProcess/TransitionTrace.lean) | 165 | Delegate lifecycle meaning and proofs to a new independently buildable Lean module. |
| [`packages/temporal-adapter/protocol/src/semantic-publication-validation.ts`](../../packages/temporal-adapter/protocol/src/semantic-publication-validation.ts) | 27 | Do not grow; place occurrence types and validation in new protocol owners. |
| [`packages/temporal-adapter/workflow/src/workflow-implementation.ts`](../../packages/temporal-adapter/workflow/src/workflow-implementation.ts) | 14 | Extract the command-publication integration before adding the second accumulator; retain only thin orchestration. |
| [`packages/temporal-adapter/workflow/src/execution-publication-state.ts`](../../packages/temporal-adapter/workflow/src/execution-publication-state.ts) | 285 | Keep E1 exact; the occurrence accumulator and Query use separate owners. |
| [`packages/temporal-adapter/client/src/execution-publication-client.ts`](../../packages/temporal-adapter/client/src/execution-publication-client.ts) | 485 | Keep E1 exact; add a separate occurrence client owner and thin export. |
| [`packages/engine-api/src/process-observation.ts`](../../packages/engine-api/src/process-observation.ts) | 550 | Add one representation-free occurrence observation capability without exposing Program or Workflow identity. |
| [`platform/contracts/src/execution-publications.ts`](../../platform/contracts/src/execution-publications.ts) | 231 | Keep E1 mirror exact and introduce separate occurrence and aggregate contracts. |
| [`platform/contracts/src/execution-publication-decoders.ts`](../../platform/contracts/src/execution-publication-decoders.ts) | 193 | Keep E1 decoder exact and introduce separate occurrence and aggregate decoders. |
| [`platform/modules/operate/src/sqlite-execution-publication-repository.ts`](../../platform/modules/operate/src/sqlite-execution-publication-repository.ts) | 117 | Do not combine stores; use a new occurrence repository and schema tables. |
| [`platform/modules/operate/src/execution-publication-reconciliation-service.ts`](../../platform/modules/operate/src/execution-publication-reconciliation-service.ts) | 336 | Preserve E1 behavior and use separate occurrence reconciliation and aggregate owners. |
| [`platform/apps/web/src/definition-workspace.tsx`](../../platform/apps/web/src/definition-workspace.tsx) | 411 | Add only navigation and request delegation to a cohesive Flow-node metrics detail. |
| [`platform/apps/web/src/definition-diagram.tsx`](../../platform/apps/web/src/definition-diagram.tsx) | 377 | Reuse bpmn-js navigation and exact-element overlays through a separate metric-overlay owner; keep current-position semantics unchanged. |
| [`platform/apps/server/src/composition.ts`](../../platform/apps/server/src/composition.ts) | 242 | Compose new owners through thin wiring and close the new repository on shutdown. |

`node scripts/what-binds.ts` reports 25 to 26 guards plus the Temporal or engine registry for Product 1 owners, seven guards for Lean, and 103 to 104 guards plus two or three platform registries for Product 2 owners. New owners inherit those package boundaries and registries. The implementation updates [the shared contract registry](../../contracts/README.md), [the Temporal adapter registry](../../packages/temporal-adapter/README.md), [the engine API registry](../../packages/engine-api/README.md), [the platform contract registry](../../platform/contracts/README.md), [the Operate registry](../../platform/modules/operate/README.md), [the web registry](../../platform/apps/web/README.md), [the architecture](../ARCHITECTURE.md), [the implementation map](../IMPLEMENTATION-MAP.md), [the production lifecycle](../TEMPORAL-PROCESS-LIFECYCLE-SPEC.md), [the testing specification](../TESTING-SPEC.md), [the plan](../PLAN.md), and [the capsule cost ledger](../CAPSULE-COST-LEDGER.md) with the evidence they describe.

### Guards and review boundary

| Guard or oracle | Obligation |
|---|---|
| [semantic-core tests](../../packages/semantic-core/test) and [Lean source contracts](../../scripts/lean-source-contracts.test.ts) | Lock exact lifecycle mapping, E1 erasure, current-open agreement, and Call Activity/Sub-Process/Boundary/Event-Based counterexamples. |
| New occurrence schema/decoder coverage plus [contract schema coverage](../../scripts/contract-schema-coverage.test.ts) | Require every field, terminal kind, result arm, page equation, batch alignment, safe integer, exact optionality, and unknown-field refusal. |
| [Temporal package boundary](../../scripts/temporal-package-boundary.test.ts) and [pre-release architecture](../../scripts/pre-release-architecture.test.ts) | Keep time and accumulation in Product 1, forbid Product 2 Temporal imports, and preserve existing Workflow result/history compatibility. |
| [platform product boundary](../../scripts/platform-product-boundary.test.ts) | Keep Workflow, Program, anchor, and host identities out of Product 2 contracts and stores. |
| [UI-quality boundary](../../scripts/ui-quality-boundary.platform-test.ts) and the local three-level policy in [the testing specification](../TESTING-SPEC.md#three-level-verification-policy) | Require deterministic 1280/1600 functional browser evidence locally before push; no pixel baseline becomes a blocking oracle. |
| [source hygiene](../../scripts/source-hygiene.test.ts) and [what-binds](../../scripts/what-binds.test.ts) | Enforce the named extractions, cohesive owners, registry updates, and measured headroom. |
| [document reviewability](../../scripts/document-reviewability.test.ts), [independent-review policy](../../scripts/independent-review-policy.test.ts), and [semantic review packet](../../scripts/semantic-review-packet.test.ts) | Require immutable proposal, conditional semantic-checkpoint, and closure review receipts. |

This proposal is material because it changes public observation, proof boundaries, and Temporal refinement. It requires context-cold proposal review before owner approval, a semantic checkpoint after the first green lifecycle/wire/Query boundary, and cold closure unless the exact checkpoint reviewer qualifies for hash-bound warm continuity.

## Epistemic closure and cost boundary

The exact claim is that every currently admitted BPMN flow-node execution has one publicly recoverable start and one completed or cancelled terminal, that the publication is aligned to the existing semantic transition revisions, and that completed elapsed duration uses one replay-stable engine commit instant at each boundary. Product 2 can reconstruct the same complete exact-version aggregate from revision zero or report unavailability.

The nearest unsupported claims are BPMN performance semantics, physical CPU time, globally ordered wall time, adjustable time windows, statistical significance, percentile or outlier analysis, Process variants, conformance, prediction, post-retention recovery, and complete M5 closure.

The strongest common-mode risk is mapping Program operations directly to occurrences. Call Activity and embedded Sub-Process witnesses separate that error. The next risk is treating armed Boundary Events as executed; the catch-only source account and a pre-fire witness separate it. The next is pairing terminals by element ID and losing repeated or concurrent activations; revision-plus-index identity and exact private-anchor resolution separate it. The time risks are substituting logical, ingestion, audit, or per-record time and publishing partial Product 2 aggregates. Deterministic replay, same-batch zero duration, unavailable-member suppression, and exact-version identity mutations separate those classes.

Closure records the commit-bounded cost in [the capsule cost ledger](../CAPSULE-COST-LEDGER.md), compared with E1 for the public-observation/Query/projection layers and M4 incident operations for fresh all-or-error aggregation plus a diagram-backed Operations surface.

## Stop and reopen conditions

Stop and return to research, redesign, or owner direction if:

- one currently admitted flow-node family cannot be assigned one exact start and terminal without reinterpreting its approved semantics;
- a long-lived terminal cannot resolve one exact prior start without adding public revision state to Semantic Process RuntimeState;
- the semantic lifecycle cannot independently project the exact open set after cancellation, error propagation, Call Activity return, or Sub-Process completion;
- deterministic Workflow commit time changes semantic behavior, old command/result bytes, or replay compatibility;
- the occurrence Query cannot remain exactly aligned with E1 batch and revision identity;
- Product 2 needs Temporal Event History, state differencing, platform time, private Program data, CIB persistence, or partial aggregation;
- the exact-definition population cannot be bounded and fail closed without silently sampling;
- implementation requires a new BPMN rule, profile, CIB relationship, source/IL shape, semantic command, repair action, generalized mining store, adjustable interval, chart framework, or pixel-regression gate.

Reopen the account for adjustable periods, archival retention, percentiles, service-level targets, cross-definition aggregation, multi-tenant policy, metric export, dashboards, variants, conformance, discovery, prediction, or another duration clock. Complete operator history and audit export as later M5 increments without claiming that this proposal closes them.

## Decisions requested from the owner

Recommendation: approve the nine selected decisions only after the context-cold proposal review closes. They preserve E1 exactly, introduce the minimum Product 1 facts that make frequency and duration honest, reuse CIB Seven's proven activity-instance unit without copying its implementation, and keep the first Product 2 surface bounded to one exact definition version and two desktop acceptance widths.
