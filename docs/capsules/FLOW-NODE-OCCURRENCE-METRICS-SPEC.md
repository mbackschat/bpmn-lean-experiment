# Flow-node occurrence metrics specification

## Status

**Implemented, closure-reviewed, and evidence-closed.** The maintained contract includes the exhaustive TypeScript and proved Lean lifecycle relation, strict occurrence publication, one replay-stable commit-time sample per complete command batch, Product 1 client/API and live replay evidence, exact-version Product 2 projection and aggregation, HTTP, and the Frequency/Duration UI.

The implemented [Product 2 shared-persistence addendum](../BPM-PLATFORM-SHARED-PERSISTENCE-AND-PROJECTION-PROPOSAL.md) adds a PostgreSQL suffix-only occurrence adapter, one bounded lease-fenced recovery page, and one metrics statement that materializes the visible exact-definition population cut and validates aligned fresh execution and occurrence heads. It adds no metrics generation table or recovery family. Existing occurrence identity, commit time, aggregation, authorization, and semantic claims remain unchanged; SQLite aggregation passages below describe local mode only.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `25034641c5566bfd9e0dbc5c99b9ded673c7922b` | `fork-turns-none` | `approve-with-required-edits` | `5a75af9e18937f3199ddb02b8ef3c33afd43bba9` |
| Semantic checkpoint | `33ffa624144d66aa561da59ca42663f3d5af3de9` | `fork-turns-none` | `approve-with-required-edits` | `4aa081bcd76b1d54cabc8778928ffae8287e21fa` |
| Closure | `985001c65aa8082989de9f9d4950ca2d79920e6e` | `fork-turns-none` | `approve-with-required-edits` | `8323c6f2505dda0e394d56472edc7a37d45a7ce9` |

The semantic checkpoint required one same-reviewer correction audit. Closure required two same-reviewer correction-audit rounds; the first target was `20e3781` and the final target recorded in the table is `8323c6f`. Neither stage changed the selected account or public contract.

## Lean assurance selection

The Lean lane is **proved**. Under the existing valid-Program and valid-RuntimeState hypotheses, it must prove that applying one accepted lifecycle delta creates each fresh anchor once, consumes each terminal anchor once, and yields exactly the independently projected open-anchor set. Separate quantified laws cover exact owned-subtree cancellation for interruption, error propagation, termination, and incident-root cancellation, plus preservation of occurrences outside the removed subtree. The proof effort is bounded to every operation and stimulus family admitted when this capsule is approved; a future admitted family must extend the exhaustive relation before it can publish occurrences. If exact fold soundness or owned-subtree cancellation cannot be proved without assuming the desired open set, implementation stops and records that precise boundary rather than weakening the lane to checked fixtures.

## Purpose

This contract makes exact flow-node frequency and elapsed duration publicly recoverable without Product 2 counting semantic operations, interpreting Semantic Process IL, reading Temporal Event History, differencing states, or treating ingestion time as execution time.

The engine publishes a separate cursor-paged flow-node occurrence lifecycle aligned to the existing committed semantic transition revisions. The semantic evaluator emits exact starts and terminal dispositions for BPMN flow-node occurrences at each existing transition boundary. Product 1 assigns public occurrence identities and one replay-stable wall-clock commit instant per complete command batch. Product 2 transactionally projects every confirmed Process instance for one exact definition version, refuses an incomplete population, and renders frequency and completed-duration modes through numeric diagram badges and the same values in an accessible table.

This is the bounded M5 frequency and duration contract. The existing committed execution publication remains byte-exact and authoritative for semantic history and current position. The occurrence lifecycle supplies the two facts it deliberately lacks: one execution unit per BPMN flow-node occurrence and one engine-owned elapsed-time boundary.

## Authority and classification

BPMN 2.0.2 defines the flow nodes whose already selected execution meaning this observation describes. BPMN does not require this occurrence identifier, wall-clock timestamp, paging protocol, aggregate, or UI. Existing capsules, the Semantic Process IL, Lean relations, and the semantic core remain authoritative for execution. This specification adds a project-owned public observation and does not reinterpret any BPMN construct.

The term **flow-node occurrence** includes Events, Gateways, Tasks, Call Activities, and embedded Sub-Processes. It does not mean only the BPMN `Activity` subtype, and it excludes the root `Process`, Sequence Flows, private control places, waits, incidents, commands, and host tasks as metric units.

No CIB Seven relationship or compatibility profile is selected. The source-grounded [UI/UX research](../research/BPM-PLATFORM-UI-UX-INFORMATION-ARCHITECTURE-RESEARCH.md#pattern-11-flow-node-metrics-require-occurrence-facts-not-transition-counts) uses CIB Seven Cockpit and historic activity-instance contracts as interaction and data-account precedent. It does not make CIB history a semantic oracle, wire source, runtime dependency, or differential target.

## Source-grounded product basis

CIB Seven keeps runtime activity counts and incident counts as separate optional diagram badges, lets an activity badge narrow the instance collection, and preserves one historic activity-instance row per executed flow node with start, terminal, duration, completion, and cancellation facts. Its completed-duration reports use completed samples and publish count, minimum, maximum, and average. Its community Cockpit checkout exposes the report host and link but not the enterprise duration-report implementation.

The pinned CIB source also separates a merely armed Boundary Event subscription from executing the Boundary Event flow node. The Boundary Event reaches ordinary activity-start handling only when it catches. Event-Based Gateway candidates differ because the waiting Catch Events themselves are active flow nodes and later complete or cancel with the race.

Camunda Optimize independently confirms the useful analytical distinction between the object being viewed, the frequency or duration measure, the selected population, and completion status. This specification adopts those distinctions while excluding the report builder, heatmap, predictive, and storage architecture.

| Reference pattern | Adopt | Deliberately change | Exclude |
|---|---|---|---|
| CIB runtime activity badges | Exact numeric BPMN-element overlays with an exact-value table | Keep current-position, incident, frequency, and duration modes separate; never mark a collapsed container as an execution of itself | Counting tokens, semantic operations, diagram markers, or platform rows as executions |
| CIB historic activity instances | One durable started flow-node occurrence with one terminal disposition | Use project semantic identity, exact runtime ownership, and engine commit time; call the unit a flow-node occurrence | CIB persistence IDs, entities, SQL, PVM transitions, or history configuration |
| CIB completed-duration reports | Completed-only count, minimum, maximum, and average | Bind the first surface to one exact definition version and the complete retained population | Adjustable periods, running pseudo-duration, or an average without sample count |
| Optimize flow-node analysis | Separate Frequency and Duration modes | Use numeric badges and an accessible table before any color scale | Heatmaps, report builders, dashboards, variants, conformance, prediction, and chart-library scope |

## Contract decisions

1. Define frequency as the number of engine-published BPMN flow-node occurrence starts. Never count E1 transition records, Program operations, tokens, waits, diagram markers, or Product 2 rows as flow-node executions.
2. Publish one exact lifecycle for every currently admitted flow-node family: start, then either completed or cancelled. A Boundary Event starts only when it catches, while Event-Based Gateway candidate Catch Events start when the race arms them and later complete or cancel.
3. Identify a public occurrence by Process instance, start transition revision, and zero-based start index. This distinguishes repeated activation and multiple starts at one transition without adding counters to semantic RuntimeState.
4. Add a separate strict occurrence publication aligned record-for-record and batch-for-batch with `bpmn-lean.execution-publication.v1`. Preserve the existing E1 Query, schema, canonical bytes, export, and Product 2 projection exactly.
5. Capture one replay-stable, nondecreasing `committedAtEpochMs` from the deterministic Temporal Workflow clock after stable semantic closure and before atomically appending both publications and resolving the command. Every transition in that command batch shares the instant.
6. Define elapsed duration as terminal batch commit time minus start batch commit time. Include completed occurrences only; keep running and cancelled occurrences in frequency and status counts; allow same-batch duration zero; never substitute semantic logical time, Product 2 ingestion time, audit time, or Event History analysis.
7. Reconcile and store occurrence pages transactionally from revision zero. Linearize one request-start population of every confirmed hosting instance for one exact deployed definition version, with a maximum of 100 in this first increment. Any over-limit, unknown, unavailable, malformed, identity-drifted, gapped, or overflowed member makes the whole metric result unavailable rather than partial.
8. Add one definition-version **Flow-node metrics** detail with Frequency and Duration modes. Frequency badges show exact occurrence count, Duration badges show exact floored completed average in milliseconds, and the table carries every status and completed-duration value. The surface states its request-start “all retained evidence” population and has explicit zero-sample and unavailable states. Functional acceptance covers 1280 and 1600 CSS pixels.
9. Exclude adjustable time periods, heatmaps, color-only encoding, charts, report builders, dashboards, saved views, variants, conformance, prediction, metric export, operator audit, layouts below 1280 CSS pixels, and pixel-regression baselines from this increment.

## Public contract

The semantic root emits an unnumbered occurrence delta beside each existing unnumbered committed transition. It uses a private semantic anchor only to pair a later terminal boundary with the exact start. Runtime-backed waits use their existing occurrence identity, Call Activities use their existing called-Process occurrence identity, embedded Sub-Processes use their existing scope occurrence, and an occurrence that starts and ends in one transition uses a transition-local anchor. The anchor never enters the public wire or Product 2.

```ts
enum FlowNodeOccurrenceTerminalKind {
  Completed = "completed",
  Cancelled = "cancelled",
}

enum SemanticFlowNodeOccurrenceAnchorKind {
  Wait = "wait",
  Scope = "scope",
  CallActivity = "callActivity",
  Transition = "transition",
}

type SemanticFlowNodeOccurrenceAnchor =
  | DeepReadonly<{
      kind: SemanticFlowNodeOccurrenceAnchorKind.Wait;
      id: OccurrenceId;
    }>
  | DeepReadonly<{
      kind: SemanticFlowNodeOccurrenceAnchorKind.Scope;
      id: ScopeOccurrenceId;
    }>
  | DeepReadonly<{
      kind: SemanticFlowNodeOccurrenceAnchorKind.CallActivity;
      id: OccurrenceId;
    }>
  | DeepReadonly<{
      kind: SemanticFlowNodeOccurrenceAnchorKind.Transition;
      commandId: string;
      transitionIndex: number;
      localIndex: number;
    }>;

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

The four tags are disjoint collision namespaces. Their total order is `wait`, `scope`, `callActivity`, then `transition`; within a tag, comparison is lexicographic over every scalar field of the complete nested identity in declaration order. `transitionIndex` is the zero-based position in the command's unnumbered semantic trace. `localIndex` is assigned after instantaneous starts in that transition are ordered by Process ID, element ID, and complete owner identity. A transition anchor is legal only for one start and one terminal in the same delta and is never retained. Duplicate complete anchors, a reused open anchor, two terminals for one anchor, or a transition anchor that crosses a delta make publication fail closed.

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

`startRevision` is the exact existing semantic transition revision whose lifecycle delta starts the occurrence. `startIndex` is the occurrence's zero-based position in that transition's canonically ordered `started` collection. `FlowNodeOccurrenceId.processInstanceId` is always the hosting Process instance named by the page, including when a flow node belongs to a called Process inside that host. `processId` and `owner` retain the exact called semantic Process and scope identity. Started entries are ordered by complete semantic anchor, Process ID, element ID, and owner before the public IDs are assigned. Ended and current-open entries are ordered by complete public occurrence identity.

The representation-free transport decoder validates strict shape, public identity, visible range and batch equations, canonical order, duplicate IDs in the visible suffix, safe times, and same-transition starts before ends. From revision zero, the producer, Product 1 client, and Product 2 reconciler additionally fold from the empty open map and can reject a terminal before its start, a repeated terminal, identity drift, time reversal, or a head `currentOpen` unequal to the complete fold. At a positive cursor, the transport decoder does not invent or validate the unseen prefix. The Workflow producer starts from its authoritative stored open map, and Product 2 starts from the exact open map retained at `requestedAfterRevision`; each requires the retained revision to equal the request cursor, applies every transition's starts before its ends, and advances only when the folded suffix is valid. When the page reaches `headRevision`, the fold must equal `currentOpen`; before the head, `currentOpen` is null and the reconciler retains its derived intermediate open map for the next exact cursor.

The dedicated `bpmn-flow-node-occurrences` Query uses the existing result arms `available`, `notReady`, `notFound`, `unavailable`, and `gap`, plus the same request `{ afterRevision, limit? }`, default 50, maximum 100, complete-batch paging, and batch-boundary cursor rules as E1. Every occurrence batch must have the same command ID, range, transition revisions, and head as the corresponding E1 batch. A transition with no lifecycle change remains present with two empty collections. `currentOpen` is non-null exactly at the head.

`committedAtEpochMs` is a nonnegative safe integer and cannot decrease across batches. It is the one deterministic Workflow clock sample taken after `advanceScenario` returns a publishable committed step and both successor publications validate from the retained time/open anchors, but before either accumulator or the command-result ledger advances. It is not BPMN logical time, a claim about CPU completion, or a global order across Process instances. Multiple commands handled in one Workflow Task may share it.

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

enum FlowNodeMetricsResultKind {
  Available = "available",
  Unavailable = "unavailable",
}

type FlowNodeMetricsResult =
  | DeepReadonly<{
      kind: FlowNodeMetricsResultKind.Available;
      snapshot: FlowNodeMetricsSnapshot;
    }>
  | DeepReadonly<{
      kind: FlowNodeMetricsResultKind.Unavailable;
      reason: "flowNodeMetricsUnavailable";
    }>;
```

The aggregate includes exactly the published occurrences whose `processId` equals the selected deployed definition's `processId`; called-Process interiors published inside a caller's hosting page never appear on the caller's diagram or in its table. They remain excluded from metrics until Product 2 owns a separately confirmed population for that exact called definition version. Only elements with `frequency > 0` appear. For every included flow node, `frequency = running + completed + cancelled`. `completedDuration` is null exactly when `completed = 0`; otherwise `sampleCount = completed`, minimum and maximum are exact safe integers, and `averageMs` is the integer floor of the arbitrary-precision total divided by `sampleCount`. Counts and durations must remain safe integers or the result is unavailable. Flow nodes are ordered by canonical element ID. The route is an Operations-authorized exact-definition-version read. The unavailable arm contains no partial snapshot, member identity, locator, or diagnostic detail. Neither arm exposes Workflow identity, Program operation, semantic anchor, private control place, or CIB identifier.

## Stable rules

### FNOM-OCCURRENCE-01: exact flow-node lifecycle

Emit one start for each BPMN flow-node execution selected by the existing semantic account, then exactly one completed or cancelled terminal. Long-lived occurrences remain open across commands. Instantaneous occurrences start and complete in one transition. No command, Sequence Flow, private wait, incident, Program operation, or root Process becomes an occurrence.

The lifecycle mapping is exhaustive over the currently admitted operation and command families:

| Semantic boundary | Flow-node lifecycle |
|---|---|
| Process start operation | Start Event starts and completes. The root Process is not a flow node. |
| User Task, Receive Task, standalone Message or Timer Catch Event, Service Task, or Configured Task becomes a committed wait outside Event-Based Gateway arming | Its exact wait-owning flow node starts. Incident report and retry leave the Service Task occurrence open. |
| User Task completion, Receive Task or standalone Catch Event Message delivery, standalone Timer firing, or successful Service Task or Configured Task effect completion selecting the normal output | The exact wait-owning occurrence completes. These branches do not handle Event-Based candidates, Boundary Timers, or a `bpmnError` result. |
| Event-Based Gateway arms candidates | The Gateway starts and completes; each candidate Catch Event starts exactly once during arming. A later winning Message delivery or Timer firing completes the winner and cancels every withdrawn loser without starting another Gateway or candidate occurrence. |
| Interrupting Boundary Timer firing | The Boundary Event starts and completes in the firing transition, and the exact attached host occurrence plus every open child occurrence in the removed region cancels. Arming the private Timer subscription starts no Boundary Event occurrence. |
| Non-interrupting Boundary Timer firing | The Boundary Event starts and completes in the firing transition while the exact attached host occurrence remains open. Arming the private Timer subscription starts no Boundary Event occurrence. |
| Matching interrupting `bpmnError` effect result | The Service Task occurrence cancels, normal Service Task completion is abandoned, and the matching Boundary Error Event starts and completes atomically in the same transition. |
| Embedded Sub-Process entry and normal quiescent completion | One Sub-Process occurrence starts on entry and completes when that exact child scope completes. |
| Call Activity invoke and exact return | One Call Activity occurrence starts on invoke and completes on the matching return. The called root Process is not a flow node. |
| Exclusive, Parallel, or Inclusive Gateway operation | The Gateway starts and completes in that transition. Multiple outgoing tokens do not multiply the Gateway occurrence. |
| ordinary None End | The End Event starts and completes without cancelling unrelated live occurrences. |
| admitted embedded Sub-Process `throwError` propagation | The Error End Event and its exact matching parent Boundary Error Event each start and complete atomically; the embedded Sub-Process occurrence and every open child occurrence removed with that scope cancel. |
| Terminate End | The End Event starts and completes; every other open occurrence in the removed terminating region cancels. |
| root incident cancellation | Every open flow-node occurrence in the removed root region cancels; no synthetic cancellation flow node is created. |

Within one delta, all canonically ordered starts are applied before any terminal. This makes an instantaneous occurrence a valid same-transition start followed by its one terminal. A rejected, rolled-back, semantic-failure, unsupported, closure-bound, or ambiguous command publishes no lifecycle delta or commit time.

### FNOM-TIME-01: replay-stable commit time

Every complete committed command batch receives exactly one deterministic Workflow clock instant after stable closure and before publication. All starts and terminals in the batch use that instant. Replay recreates the same values. Time never affects semantic admission, scheduling, ordering, or outcomes.

### FNOM-PUBLICATION-01: aligned and foldable pages

Occurrence pages preserve the E1 definition, Process, instance, command, revision, range, head, and batch-boundary equations exactly. Folding from revision zero creates each public start identity, resolves each terminal once, and reconstructs the exact head open set. A page cannot be repaired from an E1 record count, state difference, Event History, or Product 2 row.

### FNOM-AGGREGATE-01: complete exact-version population

Product 2 linearizes membership at request start with one private repository read ordered by durable registration ordinal. That read accepts the complete selected `DeployedDefinitionVersion`, fetches at most 101 confirmed candidates for its indexed identity, strictly decodes each row, and requires every full retained definition version to equal the request. Zero through 100 exact members form the immutable cut for this request; row 101 makes the result unavailable. A registration confirmed after the cut belongs to the next request and cannot change the in-flight result.

Each cut member is reconciled from its exact retained cursor to the head returned by its final successful Query, then the aggregate includes only occurrence rows owned by the selected definition's Process ID. The result does not claim a globally simultaneous cross-instance head or cross-instance time order. Any missing, unavailable, gapped, malformed, overflowed, or identity-drifted member suppresses the whole snapshot and yields the one privacy-preserving unavailable arm. A definition with no members has an available empty snapshot. Frequency counts starts. Duration uses completed occurrences only.

### FNOM-SURFACE-01: honest metric presentation

The definition-version workspace renders one Flow-node metrics detail. Frequency and Duration are explicit modes. Frequency badges show the exact integer `frequency`. Duration badges show the exact floored `averageMs` followed by `ms`. The table always shows frequency, running, completed, and cancelled counts; its duration columns show sample count, minimum, maximum, and floored average in milliseconds. When `completed = 0`, Duration mode shows no badge for that element and the table shows the exact marker `No completed samples`. An unavailable result suppresses every badge and metric table value and renders one non-actionable alert, `Flow-node metrics are unavailable.`, plus Retry. A called-Process occurrence is not overlaid on the caller diagram. An available surface states `All retained evidence` with the exact Process-instance count and means the request-start membership cut at each member's reconciled head, not a globally simultaneous snapshot. It does not imply a selected calendar interval, current-only population, estimate, SLA, or CIB equivalence.

## Temporal hosting and refinement contract

The existing semantic Workflow remains the lifetime owner. No new Signal, Update, Activity, Timer, cancellation mechanism, Task Queue, or Child Workflow is required. The occurrence Query is unconditional and read-only like the E1 Query. It is served from deterministic Workflow state and remains available for running, completed, and cancelled instances during the existing retention boundary.

Durable ingress remains the existing content-bound command queue. A committed command is evaluated once through `advanceScenario`. The Workflow preflights and validates the E1 and occurrence successors using the retained time anchor, takes one `Date.now()` sample only after that complete preflight succeeds, then materializes both immutable successors before recording the result or resolving an Update. There is no `await` between these state changes. Any exception rolls back the Workflow Task, so no timestamp, occurrence prefix, head, or result becomes visible alone.

Ordering is the existing accepted-stimulus queue order. Duplicate command recovery returns the retained command result and creates no new occurrence or timestamp. Worker replacement and replay reconstruct both accumulators. Queries do not mutate state or add history events. Event History may retain the deterministic clock input as part of ordinary Workflow replay, but neither Product 2 nor a diagnostic reader interprets Event History to manufacture the public fact.

The smallest executable refinement witness starts one Process that reaches a User Task, stops the Worker across the wait, completes the same task after replacement, reaches an End Event, and retrieves the terminal occurrence page. It proves exact Start Event, User Task, and End Event lifecycles, positive elapsed User Task duration, same-batch zero duration for instantaneous nodes, E1 revision alignment, duplicate command recovery, pure repeated Queries, completed-history replay, and no platform or Event History fallback. A second bounded witness covers Event-Based Gateway loser cancellation, Call Activity or embedded Sub-Process pairing, and interrupting Boundary Event host cancellation.

## Separating witnesses and evidence matrix

The smallest semantic witness is a sequential Start Event to User Task to End Event Process. One start command emits Start Event start/completion and one User Task start. One completion command ends that same User Task and starts/completes the End Event. Counting semantic operations instead would count the Start and End mechanics differently and cannot pair the User Task across commands.

A Call Activity witness is mandatory because `invokeProcess` and `returnProcess` share one BPMN origin but constitute one occurrence. An embedded Sub-Process witness provides the independent second instance of the same defect with `enterScope` and `completeScope`. Receive Task and Configured Task fixtures prove that reused `awaitMessage` and `awaitEffect` operations retain their distinct BPMN flow-node kinds. A Boundary Timer witness separates subscription arming from Boundary Event execution. A matching Boundary Error witness separates successful effect completion from Service Task cancellation plus atomic Boundary Event start/completion. A propagated Error End witness requires both the Error End and matching Boundary Error occurrences while cancelling the embedded Sub-Process subtree. An Event-Based Gateway witness separates candidate starts, one completed winner, and one cancelled loser.

| Rule | Lean | TypeScript core | Temporal/Product 1 | Product 2 | Separating mutation |
|---|---|---|---|---|---|
| `FNOM-OCCURRENCE-01` | proved lifecycle relation, exact fold, and owned-subtree cancellation | independent same-root open-set projection | assigns public IDs only after stable closure | strict closed decoder only | count Invoke/Return or Enter/Complete twice; drop Receive or Configured Task lifecycle; complete a matching-error Service Task; start an armed Boundary Timer; drop the propagated Boundary Error occurrence |
| `FNOM-TIME-01` | time deliberately absent | time deliberately absent | deterministic one-sample batch clock and replay | consumes published time only | substitute logical time, ingestion time, or one time per record |
| `FNOM-PUBLICATION-01` | unnumbered delta parity | exact anchor and current-open projection | E1-aligned atomic Query with authoritative positive-cursor open map | transactional contiguous projection from retained open map | skip a revision, change command ID, terminal unknown ID, duplicate terminal, invent an empty positive-cursor anchor |
| `FNOM-AGGREGATE-01` | not applicable | not applicable | typed unavailable and gap arms | request-start membership cut and all-or-error exact-version aggregation | zero, 100, and 101 members; concurrent registration; malformed member; overflow; called-interior inclusion; partial unavailable result |
| `FNOM-SURFACE-01` | not applicable | no Product 2 knowledge | representation-free gateway | exact Frequency and average-ms badges, full table, population label, unavailable alert | badge/table disagreement, zero-completion badge, color-only value, stale response, private identity |

## Required, optional, and excluded functionality

Required:

- exact flow-node start, completed, and cancelled facts for every currently admitted flow-node family;
- repeated-activation identity, multiple starts in one transition, long-lived pairing, and exact owner identity;
- separate byte-stable occurrence publication aligned to the unchanged E1 revisions and batches;
- deterministic batch commit time with replay, duplicate-command, rollback, and nondecreasing-time evidence;
- strict Query, client, engine API, gateway, Product 2 contract, schema, transactional projection, restart, and revision-zero rebuild;
- all-or-error exact-definition aggregation over at most 100 confirmed instances;
- request-start membership linearization with zero, 100, 101, concurrent-registration, malformed-member, overflow, and called-interior exclusion evidence;
- Frequency and Duration modes with exact frequency and average-millisecond diagram badges, the complete accessible metric table, zero-sample and unavailable states, visible population semantics, currentness, focus, and no horizontal overflow at 1280 and 1600 CSS pixels.

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
- layouts below 1280 CSS pixels and pixel-regression baselines.

## Versioning consequences

This is an additive pre-release public-observation change. Existing profile, checked graph, IL, RuntimeState, command result, scenario observation, E1 publication, CIB evidence, Workflow result, and terminal receipt bytes remain exact. Histories generated by the reviewed target replay under that target. Cross-version history compatibility remains unclaimed until the project retains an immutable deployment and history baseline. The occurrence wire is strict from its first version; changing its lifecycle unit, time meaning, identity, terminal dispositions, or retention requires a new version and migration account.

### Verification boundary

| Guard or oracle | Obligation |
|---|---|
| [semantic-core tests](../../packages/semantic-core/test) and [Lean source contracts](../../scripts/lean-source-contracts.test.ts) | Lock exact lifecycle mapping, E1 erasure, current-open agreement, and Call Activity/Sub-Process/Boundary/Event-Based counterexamples. |
| New occurrence schema/decoder coverage plus [contract schema coverage](../../scripts/contract-schema-coverage.test.ts) | Require every field, terminal kind, result arm, page equation, batch alignment, safe integer, exact optionality, and unknown-field refusal. |
| [Temporal package boundary](../../scripts/temporal-package-boundary.test.ts) and [pre-release architecture](../../scripts/pre-release-architecture.test.ts) | Keep time and accumulation in Product 1, forbid Product 2 Temporal imports, and preserve existing Workflow result/history compatibility. |
| [platform product boundary](../../scripts/platform-product-boundary.test.ts) | Keep Workflow, Program, anchor, and host identities out of Product 2 contracts and stores. |
| [UI-quality boundary](../../scripts/ui-quality-boundary.platform-test.ts) and the local three-level policy in [the testing specification](../TESTING-SPEC.md#three-level-verification-policy) | Require deterministic 1280/1600 functional browser evidence locally before push; no pixel baseline becomes a blocking oracle. |
| [source hygiene](../../scripts/source-hygiene.test.ts) and [what-binds](../../scripts/what-binds.test.ts) | Enforce the named extractions, cohesive owners, registry updates, and measured headroom. |
| [document reviewability](../../scripts/document-reviewability.test.ts), [independent-review policy](../../scripts/independent-review-policy.test.ts), and [semantic review packet](../../scripts/semantic-review-packet.test.ts) | Bind the specification receipt to the immutable proposal, checkpoint, closure, and correction-audit targets. |

## Epistemic closure and cost boundary

The exact claim is that every currently admitted BPMN flow-node execution has one publicly recoverable start and one completed or cancelled terminal, that the proved Lean relation and independent TypeScript projection agree on the open set, that the publication is aligned to the existing semantic transition revisions, and that completed elapsed duration uses one replay-stable engine commit instant at each boundary. Product 2 can reconstruct the complete request-start exact-version population from revision zero or report unavailability.

The nearest unsupported claims are BPMN performance semantics, physical CPU time, globally ordered wall time, adjustable time windows, statistical significance, percentile or outlier analysis, Process variants, conformance, prediction, post-retention recovery, and complete M5 closure.

The strongest common-mode risk is mapping Program operations directly to occurrences. Call Activity and embedded Sub-Process witnesses separate that error. Lifecycle candidates are constructed from the exact selected Program boundary and successor runtime record without invoking the independently implemented open-set projector; valid-but-wrong owner and Process-identity mutations must fail before the fold oracle can agree. The next risk is treating armed Boundary Events as executed; the catch-only source account and a pre-fire witness separate it. The next is pairing terminals by element ID and losing repeated or concurrent activations; revision-plus-index identity and exact private-anchor resolution separate it. The time risks are substituting logical, ingestion, audit, or per-record time and publishing partial Product 2 aggregates. Deterministic replay, same-batch zero duration, unavailable-member suppression, and exact-version identity mutations separate those classes.

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

Reopen the account for adjustable periods, archival retention, percentiles, service-level targets, cross-definition aggregation, multi-tenant policy, metric export, dashboards, variants, conformance, discovery, prediction, or another duration clock. Complete operator history and audit export as later M5 increments without claiming that this specification closes them.
