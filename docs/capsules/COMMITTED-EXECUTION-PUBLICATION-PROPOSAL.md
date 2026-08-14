# Committed execution publication proposal

## Status

**Draft; owner approval and implementation remain paused pending context-cold proposal review.** This proposal selects one additive Product 1 publication for replay-complete committed semantic transitions and current committed control positions, plus the smallest Product 2 projection, history, diagram-overlay, and exact-JSON export adoption needed to close M5. It changes no BPMN meaning, profile capability, CIB relationship, command outcome, runtime transition, or admitted source.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

## Question and recommendation

How should the engine make a Process instance's committed semantic history and current diagram position publicly recoverable without inferring either from Temporal Event History, state differences, or Product 2 state?

**Recommendation: publish one cursor-paged execution envelope with two separately specified facts.** The first fact is the exact committed external stimulus followed by every internal Semantic Process operation selected before the next stable state. The second is the current committed state plus exact public control-token and definition/runtime-scope positions at the envelope head. A Product 1 publication accumulator assigns contiguous per-instance revisions only after the complete semantic command and internal closure succeed. Product 2 transactionally projects the publication, rejects gaps, and uses it for one instance history, one current diagram overlay, and one exact JSON export.

This is the smallest complete M5 design because it makes the history replay-checkable, makes current positions explicit rather than inferred, and establishes restart/rebuild behavior without introducing event sourcing as the runtime model or using Temporal host facts as BPMN facts.

## Authority and classification

BPMN 2.0.2 defines the modeled execution constructs whose already-selected meaning the records describe. It does not require this engine API, revision scheme, projection store, history UI, or export. The existing approved capsules, Semantic Process IL, Lean relations, and semantic-core transitions remain the authority for each recorded transition. This proposal adds a project-owned public observation over that account and does not reinterpret a BPMN construct.

No new CIB Seven relationship or compatibility profile is selected. CIB public history and database entities do not expose the project's exact admission transition plus every Semantic Process internal operation, and mapping those host records into the canonical sequence would create a second semantic account. Existing CIB scenarios and evidence remain byte-identical and keep proving only their already selected behavior. The M5 publication evidence therefore compares Lean, the TypeScript core, and the production Temporal host; CIB is deliberately absent from this new observation lane.

The publication is additive for every already admitted profile. It does not add an observation request to existing scenario documents, change canonical scenario traces, or create a successor semantic profile. Product 2 consumes it only through the representation-free engine gateway and never receives a Workflow ID, Run ID, Task Queue, Event History event, Activity attempt, CIB identifier, raw control-place ID, or private RuntimeState.

## Selected decisions

1. Keep transition history and current control positions as distinct requirements, served by one envelope and proved by separate rules.
2. Instrument the existing `applyStimulus` evaluation root so one trace contains the committed external admission and every actually selected internal operation. Do not replay the evaluator merely to manufacture records.
3. Keep the primary RuntimeState unchanged. The evaluator returns an unnumbered trace; Product 1 assigns revisions after successful stable closure.
4. Make the trace replay-complete: an external record retains the exact closed `Stimulus`, and an internal record retains the selected operation identity plus its public operation metadata and exact owning scope occurrence.
5. Publish the exact control-position delta of each transition plus one current snapshot at the page head. Do not duplicate full before/after runtime or position snapshots in every record.
6. Number transitions from one with contiguous positive safe-integer revisions. Preserve command atomicity with complete transition batches and allow cursors only at batch boundaries.
7. Retain the complete publication in deterministic Workflow state for the existing Temporal retention lifetime. Partial retention and Continue-As-New are excluded; loss of the authoritative publication is typed unavailable, never repaired from Event History.
8. Project pages transactionally with exact duplicate acceptance, changed-content rejection, explicit gap state, restart continuation, and byte-identical rebuild from revision zero.
9. Add a read-only Process-instance History surface, current Diagram overlay, and exact JSON export. Keep operator audit separate and make Product 2 browser tests path-scoped outside semantic verification.

## Public contract

The semantic-core trace is unnumbered because revision is publication sequencing, not BPMN runtime state:

```ts
enum SemanticTransitionKind {
  ExternalStimulus = "externalStimulus",
  InternalOperation = "internalOperation",
}

type UnnumberedCommittedTransition = DeepReadonly<
  | {
      kind: SemanticTransitionKind.ExternalStimulus;
      stimulus: Stimulus;
    }
  | {
      kind: SemanticTransitionKind.InternalOperation;
      operationId: string;
      operationKind: SemanticOperationKind;
      origin: BpmnElementOrigin;
      owner: ScopeOccurrenceId;
    }
>;

type TracedCommandResult = DeepReadonly<{
  result: CommandResult;
  committedTransitions: UnnumberedCommittedTransition[];
}>;
```

`committedTransitions` is nonempty exactly when the result is committed, bounded closure succeeded, and a stable state is publishable. Its first member is the exact admitted external stimulus. Every remaining member is the internal operation actually selected by closure, in execution order. A rejected command, unsupported future outcome, closure-bound failure, or ambiguous-choice failure publishes no transition batch. Existing `applyStimulus` remains the result-only projection of the traced evaluator so old callers and result bytes do not fork.

The public position projection removes IL-private place identities while preserving multiplicity and runtime ownership:

```ts
type PublicControlTokenPosition = DeepReadonly<{
  sequenceFlowId: string;
  owner: ScopeOccurrenceId;
  multiplicity: number;
}>;

type PublicScopePosition = DeepReadonly<{
  id: ScopeOccurrenceId;
  parent: ScopeOccurrenceId | null;
  bpmnElementId: string;
}>;

type CurrentCommittedExecution = DeepReadonly<{
  revision: number;
  state: StateObservation;
  controlTokens: PublicControlTokenPosition[];
  scopes: PublicScopePosition[];
}>;

type PublicControlPositionDelta = DeepReadonly<{
  consumedTokens: PublicControlTokenPosition[];
  producedTokens: PublicControlTokenPosition[];
  enteredScopes: PublicScopePosition[];
  exitedScopes: PublicScopePosition[];
}>;
```

`sequenceFlowId` is the unique BPMN Sequence Flow origin of the token's admitted control place. `bpmnElementId` is the unique BPMN Process or Sub-Process origin of the definition scope. Collections are canonically ordered by their complete public identity. Projection fails closed on a missing or duplicate origin, non-positive multiplicity, duplicate position, unknown definition scope, invalid parent, or Process-instance mismatch.

Product 1 assigns revisions and exposes complete command batches:

```ts
type CommittedTransitionRecord = DeepReadonly<{
  revision: number;
  logicalTimeMs: number;
  transition: UnnumberedCommittedTransition;
  positionDelta: PublicControlPositionDelta;
}>;

type CommittedTransitionBatch = DeepReadonly<{
  commandId: string;
  fromRevision: number;
  throughRevision: number;
  transitions: [CommittedTransitionRecord, ...CommittedTransitionRecord[]];
}>;

type ExecutionPublicationPage = DeepReadonly<{
  definition: SemanticProcessIdentity;
  processId: string;
  processInstanceId: string;
  requestedAfterRevision: number;
  pageThroughRevision: number;
  headRevision: number;
  batches: CommittedTransitionBatch[];
  current: CurrentCommittedExecution | null;
}>;
```

The first transition revision is one; revision zero is the only empty-store cursor. Every transition increments by one. `fromRevision` is exclusive and `throughRevision` inclusive. The batch command ID equals the first external stimulus's command ID. Batch ranges are adjacent, records are adjacent, and a page never cuts a batch. `current` is present exactly when `pageThroughRevision = headRevision`; its revision equals `headRevision` and its state and positions are the stable result after the last record. If a caller is already at the head, the page has no batches and includes `current`.

The production Query accepts `{ afterRevision, limit? }`, where `afterRevision` is a nonnegative safe integer and `limit` is a positive safe integer with default 50 and maximum 100 complete batches. An unknown instance is `notFound`. A history outside Temporal retention or otherwise not authoritatively queryable is `unavailable`. A cursor ahead of the head, inside a batch, or behind a publication that cannot return the next contiguous revision is `gap`. None of these arms returns a partial current snapshot.

## Stable rules

### EPUB-HISTORY-01: exact committed sequence

For one stable committed command, emit exactly one external transition for its admitted `Stimulus`, followed by exactly one internal transition for every operation selected by the existing closure evaluator, in the same order. Do not emit records for enabled-but-unselected operations, speculative admission, rejected commands, host retries, Workflow Tasks, Activities, Queries, platform actions, or state differences.

### EPUB-REPLAY-01: trace completeness

Given the exact admitted Semantic Process Program, the command's input RuntimeState, and its unnumbered transition list, replaying the external record through existing command admission and each internal record through the existing operation evaluator reconstructs the exact result RuntimeState. Erasing the trace from the traced evaluator returns the existing `applyStimulus` result. Dropping, duplicating, swapping, or substituting a record, changing a state-affecting stimulus field, or changing an operation ID must fail replay or produce a state unequal to the committed result.

This is reconstruction of semantic RuntimeState under the exact Program, not a new event-sourced runtime architecture. Product 2 does not run the semantic core and does not claim that its read model is runtime state.

### EPUB-POSITION-01: exact current position

For every transition, project the exact consumed and produced token multiplicity and entered and exited runtime scopes between that transition's input and result states. This per-transition delta is computed at the evaluator boundary where both states and the selected semantic input are known; it is not platform state differencing. An unchanged position is absent from the delta. Applying the canonically ordered deltas from the empty revision-zero position reconstructs the head control positions.

At publication head, independently project every committed control-token multiplicity to its exact BPMN Sequence Flow and scope occurrence, every live runtime scope to its exact definition-scope BPMN origin and parent, and the complete existing stable `StateObservation`. The delta fold must equal this independently projected head. This separately establishes current control position even when the semantic RuntimeState trace has not been replayed by the consumer.

Repeated execution of one BPMN element is distinguished by transition revision and by the activation-bearing `ScopeOccurrenceId`; element ID alone is never an occurrence key. Active User Task, Message, Timer, effect, and incident positions come from the exact existing state observation. A token waiting at an incomplete join comes from `controlTokens`. A position on another called Process is retained with its semantic Process-instance identity even when the currently rendered diagram cannot display it.

### EPUB-COMMIT-01: atomic publication

Accumulate and number a command's complete trace only after command admission and bounded internal closure produce one valid stable state. Assign the publication state, current snapshot, and semantic command result within the same deterministic Workflow state change before resolving the command. Temporal Workflow Task rollback therefore exposes neither a record prefix nor a head snapshot without its complete batch.

An exact Workflow Task replay reconstructs the same publication without creating a new revision. Queries are read-only. Sinks, Activities, Search Attributes, platform callbacks, and Event History readers are not publication mechanisms.

### EPUB-CURSOR-01: contiguous pages

Every observed page begins at the caller's exact committed batch-boundary cursor and contains only complete adjacent batches. The decoder validates all cross-field range equations, command identity, definition identity, Process identity, canonical order, revision continuity, logical-time safety, and current/head equality. A skipped revision, batch split, changed duplicate, definition drift, or head regression is an integrity failure, not an empty page.

### EPUB-PROJECTION-01: transactional projection and rebuild

Product 2 stores the opaque confirmed execution locator beside the public instance identity and fetches pages only through its engine gateway. When its stored revision equals `requestedAfterRevision`, it transactionally applies the complete page. When a retried page overlaps already stored revisions, every overlapping record and batch must be byte-identical and only the contiguous new suffix may advance the cursor in the same transaction. A fully duplicated page is a no-op. Reusing a revision or command batch with different content is an integrity failure. A response lost after commit is safe to retry even if the producer head advanced before the retry.

Rebuilding an empty store from revision zero must produce the same canonical transition rows, current state, positions, and head revision as the uninterrupted projection. Platform restart resumes from the last committed revision. Projection ordering is per semantic Process instance; no global cross-instance semantic order is selected.

### EPUB-GAP-01: fail-closed incompleteness

When Product 2 expects revision `n` and receives any first record other than `n`, cannot retrieve the authoritative page, or cannot verify a page's identity/content, it records an explicit unavailable/gap projection state and applies none of that page. History export and current diagram overlay are then unavailable. The platform never fills a gap from current-state differencing, Event History, audit, ingestion timestamps, CIB history, or another instance.

### EPUB-SURFACE-01: bounded M5 adoption

The Operations Process-instance collection opens one exact confirmed instance detail with Overview, History, and Diagram tabs. History lists committed records in revision order and labels external stimuli separately from internal operations. Diagram combines the exact current state with token and scope positions on the definition presentation whose source digest matches the publication. Transition deltas give History and optional frequency views the exact Sequence Flow path through pass-through gateways without requiring Product 2 to interpret IL. Off-diagram called-Process positions and missing rendered elements are reported honestly rather than guessed.

`Download execution history` returns the strict JSON publication for that one instance with definition, Process, instance, revision, transition, logical-time, and current-position facts. It contains no opaque locator, Temporal/CIB identity, Event History, Activity attempt, platform audit actor, or private runtime fields. The existing operator Audit remains a separate platform-fact surface and is not merged into semantic history.

The first M5 surface adds no command, repair, migration, pause, retry, or cancellation behavior. Frequency views may count exact operation origins from records if they do not widen this contract. Wall-clock duration, conformance checking, variant mining, and cross-instance global ordering remain excluded.

### Product 2 HTTP and authorization boundary

The strict public routes are `GET /api/v1/process-instances/{processInstanceId}/execution?afterRevision={revision}&limit={limit}` and `GET /api/v1/process-instances/{processInstanceId}/execution/export`. They accept no request body, resolve the retained opaque locator internally, reconcile only from the authoritative Product 1 page, and return no locator. The execution route returns the closed projected page. The export route returns `application/json; charset=utf-8` with a sanitized attachment filename and one closed full-instance export assembled only after contiguous reconciliation reaches the head.

Both routes use the existing Operations actor resolver and exact configured-group policy before locator access, reconciliation, or repository reads. The selected status set is 200, 400 invalid request, 403 forbidden, 404 unknown confirmed instance, 405 method not allowed, 503 publication unavailable/gapped, and 500 internal failure. One new public error code, `executionPublicationUnavailable`, has the canonical message `The committed execution publication is unavailable.` The 503 response exposes no expected or observed revision, host error, retention fact, or partial prefix. Strict Product 2 JSON parsing and closed recursive decoders apply to every response.

## Runtime-only and synthetic constructs

| Construct | Derivation and owner | Public projection | Lifecycle invariant |
|---|---|---|---|
| Unnumbered transition trace | Existing external admission plus actually selected internal closure operations | Exact stimulus or operation metadata and owner | Exists only for one evaluator result; no speculative trace is published |
| Control-position delta | Exact token/scope difference across one evaluator-produced transition | Consumed/produced Sequence Flow positions and entered/exited scope positions | Canonical, disjoint per collection, and foldable from revision zero to the head position |
| Publication revision | Product 1 accumulator, outside RuntimeState | Positive contiguous number | Starts at one, advances only by a complete committed batch, never rewinds |
| Batch boundary | One semantic command and all its internal closure operations | Exclusive/inclusive revision range and command ID | Pages never split it; exact duplicates are idempotent |
| Token position | Runtime token plus admitted control-place Sequence Flow origin | Sequence Flow, scope occurrence, multiplicity | No raw control-place ID; complete multiplicity preserved |
| Scope position | Runtime occurrence plus admitted definition-scope origin | Exact occurrence, parent, BPMN Process/Sub-Process element | Activation and Process identity remain part of identity |
| Projection cursor | Product 2 last transactionally applied batch boundary | Stored revision only | Advances with the complete page transaction or not at all |
| Projection gap | Product 2 integrity state | Explicit unavailable status | Clears only through authoritative contiguous reconciliation or full rebuild |

## Lean assurance lane

The M5 Lean question is **proved**: the published transition list is sufficient to reconstruct the exact RuntimeState reached by the existing evaluator under the exact Program.

A new cohesive publication module will define the traced evaluator, trace replay, control-position projection, and a declarative committed-step relation that reuses existing external admission and `ProgramStep`. Its public theorems will establish:

- erasing the trace gives the existing `applyStimulus` result;
- every emitted external record is the exact committed admission transition;
- every emitted internal record satisfies `ProgramStep` and records the selected operation identity;
- replay of every successfully published trace yields the exact result state;
- the emitted list contains no omitted or extra selected internal step;
- rejection, closure-bound exhaustion, and ambiguous choice yield no publishable trace;
- token and scope projection is total and exact for an admitted Program and valid RuntimeState;
- folding every emitted control-position delta from the empty initial position equals the independently projected result position;
- dropping, swapping, duplicating, or substituting the separating witness's operation record is not a replay of the committed result.

The proof does not claim determinism for unadmitted ambiguous schedules, global ordering across instances, reconstructibility without the exact Program, or Product 2 store correctness. Revision and SQLite projection properties are executable TypeScript/Temporal obligations, not BPMN theorems.

## Temporal hosting and refinement preflight

### Durable boundary

The production Workflow owns an immutable publication accumulator beside its current semantic state. Start, Update, Signal, Timer, and Activity-result stimuli continue to enter through the existing single semantic input loop. That loop invokes the traced evaluator once. A successful stable result appends one complete numbered batch and replaces the head snapshot before resolving the existing command path. No new semantic ingress, wait, effect, cancellation mechanism, or command outcome is introduced.

One unconditional Query, `bpmn-execution-publication`, serves strict cursor requests for running, completed, and cancelled Workflows during their existing Temporal retention lifetime. The Temporal client converts absent/unqueryable executions into typed public results and never exposes the host execution address through Product 2.

### Ordering, deduplication, and replay

The Workflow's existing queue order remains the only external scheduling choice. The traced evaluator records that chosen order and the exact internal operation order. Content-bound Update IDs, Signal deduplication, Activity reconciliation, and retained results keep their existing contracts. Workflow Task retries re-execute deterministic code and do not allocate another durable revision. Query execution emits no Event History event and changes no state.

Worker replacement before and after a multi-transition command must preserve the same page, head, and current snapshot. Replay of existing histories must stay green and reconstruct the new in-memory publication without scheduling a different Temporal command or changing completed/cancelled receipt bytes. A Query may transport the authoritative Workflow-owned publication, but Query execution itself is not durability authority.

### Retention and stop boundary

The first contract retains the complete publication in Workflow state and relies on the already configured Temporal retention period for post-completion rebuild. It does not compact, truncate, Continue-As-New, archive, or reconstruct from Event History. If the complete publication is no longer queryable, Product 1 returns `unavailable` and Product 2 preserves the gap. Long-lived instances that exceed practical Workflow-state/history bounds are a stop condition requiring a separate continuation/archive design before widening this contract.

### Separating host mutations

The focused refinement witness must reject a Sink-based publisher that duplicates on Workflow Task retry, a Search Attribute or Event History-derived record, a Query that mutates the cursor, a publication append before stable closure, a Workflow replacement that allocates new revisions, a closed execution that returns a state without its history, and a page whose current snapshot is not bound to its head.

## Smallest complete witness

Use the existing parallel fork/join Process as the semantic witness and its existing exact source/program identity.

1. Start the Process. The batch records the exact start stimulus, initiation, fork, and both task-await operations.
2. Complete one of the two User Tasks. The batch records that exact occurrence completion, its produced Sequence Flow position, and a head with one control token waiting at the join plus the other exact open task.
3. Replace the Worker and query after the prior revision. The same current snapshot exposes both the join token and remaining task with exact scope occurrence identity.
4. Complete the second task. The batch records completion, synchronization, end consumption, and scope completion, and the head is terminal.
5. Rebuild an empty Product 2 projection from revision zero after platform restart. Its history, terminal current snapshot, and export bytes equal the uninterrupted projection.
6. Seed a provider page that skips one internal transition revision. Projection applies nothing, reports a gap, and suppresses history export and diagram overlay.

A second focused cyclic-control-flow fixture repeats one BPMN User Task element under a later activation and proves that element identity cannot substitute for revision plus occurrence identity. It is a negative identity oracle, not another M5 feature.

## Evidence matrix

| Rule | Lean | TypeScript core | Temporal/Product 1 | Product 2 | Separating evidence |
|---|---|---|---|---|---|
| `EPUB-HISTORY-01` | exact trace list and step membership | traced root captures admission and selected operations | numbered only after stable closure | strict record decoder | pass-through gateway operations cannot be recovered by state differencing |
| `EPUB-REPLAY-01` | replay completeness theorem | fold equals result RuntimeState | history replay recreates publication | no semantic replay authority | dropped/swapped/duplicated/substituted operation |
| `EPUB-POSITION-01` | exact deltas, delta-fold equality, and head projection | unique origin and complete multiplicity | deltas and head bound atomically | exact current overlay and gateway path | repeated element activation and token waiting at join |
| `EPUB-COMMIT-01` | no trace on nonpublishable result | no partial batch | Workflow Task retry/replacement | page transaction | failure after append-before-result mutation |
| `EPUB-CURSOR-01` | not applicable | strict range helpers | strict Query/client page validation | strict gateway/HTTP validation | skipped, split, ahead, regressed, or changed record |
| `EPUB-PROJECTION-01` | not applicable | canonical values | exact retryable pages | duplicate-safe SQLite projection and rebuild | response loss, restart, changed duplicate |
| `EPUB-GAP-01` | not applicable | not applicable | unavailable rather than inferred fallback | explicit gap suppresses surfaces | Event History and state-difference planted counterexamples |
| `EPUB-SURFACE-01` | not applicable | no Product 2 knowledge | representation-free gateway only | History, Diagram, exact JSON download | source-digest mismatch, off-diagram occurrence, private-fact scan |

The full semantic gate compares the exact unnumbered transition trace and current position projection between Lean and the TypeScript core. The live production gate compares the same trace and positions through Temporal across Worker replacement and replay. Product 2 acceptance consumes only the public gateway result and separately tests projection restart/rebuild and UI behavior. There is no CIB target in this observation comparison.

## Required, optional, and excluded functionality

Required:

- exact external-plus-internal committed transition trace from the evaluator root;
- proved replay completeness under the exact Program;
- exact per-transition control-position deltas plus current committed state, control-token positions, and runtime/definition-scope positions;
- per-instance contiguous revisions, atomic complete batches, strict cursor pages, and typed unavailability/gaps;
- deterministic Temporal Query publication, Worker replacement, existing-history replay, and terminal retrieval during retention;
- Product 2 transactional projection, exact duplicate handling, changed-content integrity failure, restart, full rebuild, and gap suppression;
- per-instance History, current Diagram overlay, and exact JSON history download;
- path-scoped Product 2 browser/visual evidence that is not reachable from semantic-only verification.

Optional only when it changes no selected claim:

- exact operation-frequency counts over the same projected records;
- another Worker replacement point or page-size boundary;
- a second renderer-unavailable position fixture.

Excluded:

- new BPMN semantics, profile capability, CIB relationship, admission rule, runtime transition, command, repair, migration, or lifecycle action;
- Event History, Workflow Task, Activity attempt, Search Attribute, CIB history, state difference, platform audit, or ingestion time as a semantic fact source;
- wall-clock duration claims, global cross-instance ordering, conformance checking, variant mining, process discovery, predictive analytics, or combined audit/semantic export;
- event-sourcing RuntimeState, Product 2 replay of the semantic core, state reconstruction without the exact Program, arbitrary history mutation, or platform-authored records;
- partial retention, compaction, Continue-As-New, archival storage, post-retention reconstruction, multi-tenant policy, or a general export framework;
- Playwright, Chromium installation, web production builds, screenshots, or Product 2 showcase execution in the semantic Verify path.

## Versioning consequences

This is an additive pre-release public-observation change. Existing profile, BPMN source, checked graph, IL, RuntimeState, command result, scenario observation, canonical result, CIB evidence, Workflow result, and terminal receipt bytes remain exact. Existing Workflow histories must replay unchanged. The new publication wire is strict from its first version; any later removal, renumbering, retention change, or change in record meaning requires a new version and migration account.

The planned owners are already bound by the executable [Lean source contract guard](../../scripts/lean-source-contracts.test.ts), [contract schema coverage](../../scripts/contract-schema-coverage.test.ts), [Temporal package boundary](../../scripts/temporal-package-boundary.test.ts), [platform product boundary](../../scripts/platform-product-boundary.test.ts), [source hygiene](../../scripts/source-hygiene.test.ts), and [what-binds](../../scripts/what-binds.test.ts). The implementation adds focused trace, position, publication, projection, and rebuild oracles beside their owning packages rather than weakening these guards.

### Owners this implementation grows

The semantic root grows only by thin delegation. The current mechanically measured owners are:

| Existing owner | Headroom before 600 nonblank lines | Required consequence |
|---|---:|---|
| [`packages/semantic-core/src/semantic-process-runtime.ts`](../../packages/semantic-core/src/semantic-process-runtime.ts) | 219 | Delegate the current apply root to a new traced evaluator and preserve result-only equivalence. |
| [`packages/semantic-core/src/contract.ts`](../../packages/semantic-core/src/contract.ts) | 292 | Re-export the additive trace/position contract without changing existing observation shapes. |
| [`packages/semantic-core/src/scenario.ts`](../../packages/semantic-core/src/scenario.ts) | 123 | Keep existing scenario bytes; add only focused trace-evidence delegation if required. |
| [`BpmnSemantics/SemanticProcess/Execution.lean`](../../BpmnSemantics/SemanticProcess/Execution.lean) | 131 | Delegate to a new traced closure owner; do not add the proof family here. |
| [`BpmnSemantics/SemanticProcess/Transition.lean`](../../BpmnSemantics/SemanticProcess/Transition.lean) | 267 | Reuse `ProgramStep`; no duplicated transition account. |
| [`BpmnSemantics/SemanticProcess/Scenario.lean`](../../BpmnSemantics/SemanticProcess/Scenario.lean) | 228 | Keep canonical scenario trace exact and delegate only the new evidence entry. |
| [`BpmnSemantics/SemanticProcess/RuntimeState.lean`](../../BpmnSemantics/SemanticProcess/RuntimeState.lean) | 147 | Reuse state and identities; add no revision field. |
| [`BpmnSemantics/SemanticProcessJsonMain.lean`](../../BpmnSemantics/SemanticProcessJsonMain.lean) | 170 | Delegate the new evidence request; keep existing scenario JSON exact. |
| [`packages/temporal-adapter/workflow/src/workflow-implementation.ts`](../../packages/temporal-adapter/workflow/src/workflow-implementation.ts) | 33 | Extract publication accumulation/query integration before feature growth; this owner may retain only thin orchestration. |
| [`packages/temporal-adapter/workflow/src/workflows.ts`](../../packages/temporal-adapter/workflow/src/workflows.ts) | 575 | Add only the public Workflow/Query type surface. |
| [`packages/temporal-adapter/protocol/src/contracts.ts`](../../packages/temporal-adapter/protocol/src/contracts.ts) | 406 | Delegate the strict publication contract to a cohesive new protocol owner. |
| [`packages/temporal-adapter/client/src/process-client.ts`](../../packages/temporal-adapter/client/src/process-client.ts) | 166 | Delegate publication observation to a cohesive new client owner. |

New cohesive owners are required for TypeScript transition tracing and replay, position projection, Lean publication/refinement proofs and JSON, Temporal protocol/query/accumulator/client/live evidence, Product 1 engine API, the representation-free platform gateway, Product 2 projection repository/service/HTTP, and the History/Diagram/export web surface. New owners inherit their package's existing boundary, registry, source-hygiene, and review-packet guards. Existing crowded generic scenario, Workflow, differential, Operate, and web owners receive only import/delegation; if any would cross 600 nonblank lines, extraction is mandatory before feature growth.

The implementation must update the relevant package registries, [shared wire contract registry](../../contracts/README.md), [Temporal adapter registry](../../packages/temporal-adapter/README.md), engine API registry, platform registries, [architecture](../ARCHITECTURE.md), [implementation map](../IMPLEMENTATION-MAP.md), [production lifecycle specification](../TEMPORAL-PROCESS-LIFECYCLE-SPEC.md), [testing specification](../TESTING-SPEC.md), [plan](../PLAN.md), and the [capsule cost ledger](../CAPSULE-COST-LEDGER.md) atomically with the evidence they describe.

## Guards and review boundary

| Guard or oracle | Obligation |
|---|---|
| [semantic-core tests](../../packages/semantic-core/test) and [Lean source contracts](../../scripts/lean-source-contracts.test.ts) | Lock exact trace capture, replay completeness, position fidelity, result erasure, and no trace for nonpublishable results. |
| [Temporal package boundary](../../scripts/temporal-package-boundary.test.ts) and [pre-release architecture](../../scripts/pre-release-architecture.test.ts) | Keep publication inside Product 1, retain deterministic Workflow code, and forbid Product 2 Temporal imports. |
| [platform product boundary](../../scripts/platform-product-boundary.test.ts) | Keep opaque locators/private host facts out of public contracts and platform stores. |
| [source hygiene](../../scripts/source-hygiene.test.ts) and [what-binds](../../scripts/what-binds.test.ts) | Enforce the named extractions, cohesive owners, registries, and reviewed headroom. |
| [document reviewability](../../scripts/document-reviewability.test.ts), [independent-review policy](../../scripts/independent-review-policy.test.ts), and [semantic review packet](../../scripts/semantic-review-packet.test.ts) | Require proposal, semantic-checkpoint, and closure receipts over immutable targets. |
| Product 2 UI-quality isolation guard and path-scoped workflow | Prove four-width/focus/overflow/visual behavior without adding Playwright or web builds to semantic Verify. |

The implementation is material because it changes public observation, proof boundaries, and Temporal refinement, even though it changes no BPMN transition. It requires context-cold proposal review before owner approval, a semantic checkpoint after the first green trace/position/wire/Query boundary, and cold closure unless the exact checkpoint reviewer qualifies for hash-bound warm continuity.

## Epistemic closure and cost boundary

The exact claim is that every stable committed command publishes a complete replayable sequence of the external semantic input and selected internal operations, and that the same head publishes the exact current public state, token positions, and runtime/definition-scope positions. Product 2 can rebuild the same history and current overlay from revision zero or report a gap. The claim does not extend to host history, wall-clock time, post-retention availability, cross-instance order, CIB microsteps, or reconstructing RuntimeState without the exact Program.

The strongest common-mode risk is that Lean, TypeScript, and Temporal all emit a plausible narration while silently omitting a pass-through internal operation. Replay completeness plus the fork/join gateway witness makes omission change or invalidate the reconstructed state. The second risk is that a complete operation list still hides which Sequence Flow a gateway selected; the exact position delta exposes that path without Product 2 IL interpretation. The third is that transition completeness is mistaken for current diagram position; the independently checked head snapshot and join-token witness separate those requirements. The fourth is that an eventually consistent Product 2 store silently skips data; the seeded gap and changed-duplicate mutations must suppress the surface.

Meaningful mutations are: state-difference-generated history, Event History-generated history, one dropped gateway operation, swapped closure operations, a duplicated revision, a changed exact duplicate, a cursor inside a batch, a head snapshot from another revision or definition, a token mapped to a control-place ID rather than its Sequence Flow origin, an element-only repeated activation key, and a platform rebuild that starts from its own rows instead of revision zero.

Closure will record the commit-bounded implementation cost in the [capsule cost ledger](../CAPSULE-COST-LEDGER.md), compared with the cyclic-control-flow capsule for repeated transition execution and the M4 incident-operations increment for Product 1 Query plus Product 2 projection/UI adoption.

## Stop and reopen conditions

Stop and return to research, redesign, or owner direction if:

- the traced evaluator cannot record the exact external step and every actually selected internal operation without duplicating or changing the existing semantic decision;
- a replay-complete record requires private host identity or an unbounded/non-public value not already admitted as a semantic stimulus;
- one internal operation cannot be bound to a unique runtime scope occurrence under an admitted state;
- Lean cannot prove result erasure and replay completeness within the declared lane without restating the transition semantics;
- deterministic publication changes existing Workflow commands, result bytes, or replay histories;
- completed/cancelled publication cannot be queried during the selected retention boundary;
- Product 2 cannot detect and preserve a gap without using Event History, state differencing, or platform-authored repair;
- publishing full committed semantic stimuli under the existing Operations authorization is not acceptable for the selected data-classification boundary;
- current diagram positions require a new runtime model rather than a total projection of current RuntimeState plus admitted Program origins;
- implementation requires a new BPMN rule, profile, CIB relationship, command, repair action, Continue-As-New, archive, global order, wall-clock semantic timestamp, or general mining framework;
- Product 2 browser evidence becomes reachable from semantic-only verification.

Re-open the graduated specification when partial retention, Continue-As-New, archive migration, wall-clock duration, cross-instance ordering, generalized mining/export, public IL distribution, or another semantic record family is selected.

## Decisions requested from the owner

Recommendation: approve the complete selected account after context-cold review. It closes the exact M5 information gap at Product 1, proves rather than assumes trace completeness, keeps position identity separate and exact, and gives Product 2 a fail-closed rebuild contract without importing Temporal semantics.

Approval would select the nine decisions listed above: one two-fact publication envelope; traced evaluator root; revision outside RuntimeState; replay-complete exact stimuli and internal choices; one head position snapshot; contiguous atomic batches; retention-bounded Temporal Query; transactional gap-detecting Product 2 projection; and read-only History, Diagram, and exact JSON export with browser work isolated from semantic verification.
