# Compensation Event Sub-Process snapshot proposal

## Status

Lifecycle: draft
Review: pending

## Prior review

The context-cold review rejected `c0370350`: its dormant handler could not satisfy the entry/completion graph rule, its outer `earlyCompletion` purge contradicted Clauses 10.7.2, 13.3.7, and 13.5.5, and its live-root invariant failed after root completion. This redesign gives a declared handler an operation-free/control-place-free graph exception, removes Multi-Instance early completion, and makes a promoted root own terminal child records.

The fresh cold review of `10e8fb2d` found that account sound and required closure-facing capacity refusal, the complete owner inventory, and a public raw-graph negative. This correction supplies those bounded obligations; approval remains blocked until the same reviewer audits it.

## Question and bounded outcome

What is the smallest standards-only hidden-state account that preserves the complete completion-time data context of one Process or embedded Sub-Process occurrence for its declared Compensation Event Sub-Process, distinguishes provisional ownership from a usable completed snapshot, purges every unsuccessful parent occurrence, and refuses bounded growth before changing semantic state?

This proposal selects parent-context representation, complete parent-occurrence identity, reservation, successful-completion promotion, unsuccessful disposal, capacity, and containing-scope lifetime. It selects no throw Compensation Event, handler activation, context restoration, handler completion or failure, dependency order, recursive compensation, Transaction, Cancel Event, source profile, CIB behavior, public command, or Temporal effect.

Requirement `BPMN-COMPENSATION-EVENT-SUB-PROCESS-SNAPSHOT-01` remains `unsupported` until source, handler, differential, durable, and public lanes close.

## Normative account and selected interpretation

BPMN 2.0.2 Clause 13.5.5 distinguishes a Compensation Event Sub-Process from an associated boundary Compensation Activity. The Event Sub-Process is contained in a Process or Sub-Process, accesses data that is part of that parent, becomes enabled exactly when the parent Activity reaches `Completed`, and then keeps a completion-time snapshot for later restoration. Only successfully completed Activities are compensable; compensation of a failed Activity is an empty operation.

Clause 13.5.5 requires a separate snapshot for each loop or Multi-Instance parent instance, and Clause 10.7.2 requires per-instance boundary compensation for a Multi-Instance Sub-Process. Records therefore use complete runtime parent occurrence identity, while loop/Multi-Instance parents and handler multiplicity remain excluded. The representation can later broaden without changing identity or context shape.

Clause 13.5.4's ordinary Event Sub-Process uses live parent context; a Compensation Event Sub-Process instead uses frozen successful-completion context. A mutable alias or entry-time copy is therefore wrong.

Clauses 10.4.1 and 10.3.5 tie data lifecycle and visibility to Process/Sub-Process scope. The snapshot is therefore the ordered visible Process/Sub-Process context path, not Task I/O, Activity-local scopes, or the entire variable store.

The current runtime has Process bindings and occurrence-owned Activity-local bindings but no Sub-Process data collection. The root frame therefore contains exact Process bindings and each direct child-parent frame is empty. This is complete only for Programs asserting no Sub-Process-local binding shape; source cannot emit the declaration until it proves that restriction. Later scope-local data can fill the existing ordered frames without reinterpretation.

The machine-readable anchors are `SubProcess.triggeredByEvent`, `StartEvent.isInterrupting`, `CompensateEventDefinition`, `Activity.isForCompensation`, `DataObject`, `DataObjectReference`, and their containment relationships. The machine-readable model contains no `SubProcess.compensable` property despite the prose reference in Clause 13.5.5; the implicit-compensation and cancellation issues recorded by OMG remain excluded rather than resolved here.

## Required, optional, and excluded scope

**Required representation:** one optional Program declaration with canonical explicit parent/handler pairs and count/byte limits; one optional hidden RuntimeState collection; complete parent and containing occurrence identity; an ordered immutable context-frame snapshot; and distinct provisional and promoted record arms.

**Required lifecycle:** reserve one provisional record atomically with each selected parent occurrence; promote only from the exact live provisional record when ordinary scope completion selects that occurrence; capture its complete context from the deciding pre-state; refuse count or byte overflow before completion mutation; purge provisional state on failure, interruption, or cancellation; keep a promoted child snapshot only while its exact containing root occurrence remains live; and retain a promoted root snapshot with its direct-child snapshots in the terminal semantic state for later parent-host integration.

**Required forward-compatible restriction:** a declaring Program has one parentless root. A selected parent is that root or one directly contained embedded Sub-Process definition. Each handler is a distinct immediate child definition scope of its parent, owns zero operations and zero control places, has no `enterScope`, `enterBoundedScope`, or `completeScope` operation, and is selected at most once. The declaration-derived handler set is the only exception to the existing one-entry/one-completion rule; every ordinary non-root definition scope keeps exactly one current entry and one completion. A selected non-root parent is entered by exactly one current `enterScope` or `enterBoundedScope` operation. Repetition of a selected definition, nested selected parents, called Processes, loop and Multi-Instance Sub-Processes, and profile-enabled incident cancellation are not admitted by this checkpoint.

**Optional:** the Program declaration and RuntimeState collection are optional. Programs without the declaration require field absence and preserve existing bytes. A declaration may select only the root, only one or more distinct direct child parents, or both, subject to canonical order and the restriction above.

**Excluded:** Task-I/O-derived or publication-derived snapshots; Activity-local binding capture; source lowering; registered profiles; repeated, loop, or Multi-Instance Sub-Processes; more than one Compensation Event Sub-Process for one parent; arbitrary nesting; Call Activity ownership transfer; ordinary or interrupting Event Sub-Process execution; Compensation throw targeting; handler enablement, restoration, execution, completion, failure, cancellation, recursion, and ordering; boundary Compensation Activity records; implicit/default compensation; Transaction and Cancel semantics; CIB compatibility; public observation; Product 2; and live Temporal hosting.

## Program contract

The Semantic Process Program gains one optional declaration:

```ts
type CompensationEventSubProcessSnapshotTarget = DeepReadonly<{
  parentScopeId: string;
  handlerScopeId: string;
}>;

type CompensationEventSubProcessSnapshotDeclaration = DeepReadonly<{
  targets: CompensationEventSubProcessSnapshotTarget[];
  limits: {
    maxRecords: number;
    maxCanonicalBytes: number;
  };
}>;

type SemanticProcessProgram = DeepReadonly<{
  // existing required fields remain unchanged
  compensationEventSubProcessSnapshots?: CompensationEventSubProcessSnapshotDeclaration;
}>;
```

Targets are non-empty, canonically ordered by `parentScopeId` then `handlerScopeId`, and unique by both parent and handler. Each identity is a non-empty well-formed wire string. `parentScopeId` resolves to the unique root or one immediate child of it. `handlerScopeId` resolves to one distinct immediate child of the selected parent, owns no operation or control place, and has no entry or completion operation. A non-root parent has exactly one ordinary entry operation, restricted to the current `enterScope` or `enterBoundedScope` families. The root is identified by its null parent and `originElementId === processId`, never by array position.

Strict Program admission validates the declaration and derives the dormant-handler set before graph admission checks ancestry, ownership, reachability, entry, and completion. A declared handler is accepted only with no owned operation/control place and no targeted entry/completion; every other scope keeps the ordinary graph rule. The exported raw graph validator retains its current signature and rejects every operation-free child scope. Only a non-exported helper may receive the validated declaration-derived set; tests reject extra, mismatched, non-empty, and caller-supplied exemptions. This semantic declaration does not prove source provenance. A later compiler must prove `triggeredByEvent=true`, a Compensation Start Event, containment, and the parent-data restriction. Handler activation requires a reviewed executable graph replacement.

`maxRecords` is a positive safe integer and counts provisional plus promoted records. `maxCanonicalBytes` is a safe integer from two through 65,536 inclusive and bounds the exact canonical JSON encoding of the complete record collection. A profile may select a smaller maximum to reserve headroom. The existing 65,536-byte complete `RuntimeState` limit remains a separate secondary bound; neither number is inferred from Temporal Event History or the two-mebibyte trace budget.

## Runtime context and lifecycle contract

Runtime state gains one optional collection:

```ts
type CompensationParentContextFrame = DeepReadonly<{
  owner: ScopeOccurrenceId;
  bindings: VariableBinding[];
}>;

type CompensationParentContextSnapshot = DeepReadonly<{
  frames: CompensationParentContextFrame[];
}>;

enum CompensationParentContextRetentionKind {
  Provisional = "provisional",
  Promoted = "promoted",
}

type CompensationParentContextRetention =
  | DeepReadonly<{
      kind: CompensationParentContextRetentionKind.Provisional;
      parent: RuntimeScopeOccurrence;
      handlerScopeId: string;
    }>
  | DeepReadonly<{
      kind: CompensationParentContextRetentionKind.Promoted;
      parent: RuntimeScopeOccurrence;
      handlerScopeId: string;
      snapshot: CompensationParentContextSnapshot;
    }>;

type RuntimeState = DeepReadonly<{
  // existing fields remain unchanged
  compensationParentContextRetentions?: CompensationParentContextRetention[];
}>;
```

`parent.id` is the complete semantic occurrence identity: Process instance, parent definition scope, and activation. `parent.parent` preserves the exact containing occurrence when the completed parent is removed from the live occurrence tree. Definition identity alone, loop index alone, current Workflow or Run ID, host task identity, and collection order cannot substitute for it.

A snapshot's `frames` are the exact live definition-scope ancestry from root occurrence through the selected parent occurrence, ordered outermost to innermost. Every frame carries complete occurrence identity and canonical bindings. The first frame always owns the root occurrence and copies current Process bindings. At this checkpoint every non-root frame is empty because no admitted Program represents Sub-Process-local data. Activity-local scopes are excluded even if an unrelated concurrent Activity remains live elsewhere: they are not Process/Sub-Process context frames and copying them would violate occurrence isolation.

The collection is canonically ordered by complete parent occurrence identity and then handler identity; a record never moves because its arm changes. A declaring running state has exactly one provisional record for every live selected parent occurrence and at most one record for each parent/handler pair. While the Process is running, every promoted child record's `parent.parent` names the exact live root occurrence. After selected-root completion, no live root remains: every retained child instead has exactly one promoted root record in the same collection whose `parent.id` equals that preserved `parent.parent`, and that root record matches the completed Process identity. A promoted root record has `parent.parent === null` and is valid only in the matching completed Process state. A terminal child without that matching promoted root, a child naming a different root, any provisional terminal record, or any promoted root in a running state is invalid.

## Reservation, promotion, purge, and capacity

Parent entry computes the fresh occurrence, matching provisional record, prospective count, and bytes from one pre-state. It commits both atomically or refuses before activation, token, deadline, Activity occurrence, or other mutation. Root start follows the same rule. Reservation stores no data: entry-time copying is stale, while continuous mirroring creates a second authority.

Before `completeScope` removes its exact live quiescent occurrence or produces a parent token, promotion requires one matching provisional record, derives and captures the complete context path from the pre-state, replaces its arm, and checks exact bytes. Count is unchanged. Overflow, a missing/duplicate reservation, broken ancestry, incomplete context, or invalid state refuses completion with exact pre-state preservation.

Successful root completion retains its promoted root snapshot after the live root disappears. No external command reaches this hidden state; a later trigger capsule defines consumption.

Every non-successful exit removes the matching provisional record in the same regional cancellation transition that removes the parent occurrence. Current direct Error propagation and interrupting bounded-scope Timer routes exercise failure and interruption. A mutation that promotes any failed, interrupted, or cancelled occurrence must fail. There is no outer `earlyCompletion` disposition in this checkpoint: when a future loop or Multi-Instance Sub-Process completion condition fires, completed instances promote and unfinished cancelled instances purge under a separately reviewed multiplicity account. Treating the outer completion as one purge decision would lose valid per-instance snapshots.

Root removal purges every provisional descendant and promoted child naming it. Normal close removes child records unless the root is selected; then its promoted root and direct-child records remain together. This selects storage lifetime, not recursion or order.

Canonical bytes are the UTF-8 length of the complete canonical JSON record array, including tags, identities, frames, bindings, punctuation, and escaping. Object keys use Unicode scalar-value order and arrays use the orders above. Cached, caller-, host-, or publication-supplied sizes are invalid.

Capacity refusal is a typed private semantic rejection naming measure, bound, and prospective value. Closure-facing evaluation in both semantic accounts uses a closed `disabled | applied | refused(detail)` result; existing operations lift their current `null`/`Option` behavior into the first two arms, while snapshot reservation and promotion can return `refused`. At each closure iteration and batch re-evaluation, refusal takes precedence over zero-enabled, ambiguity, and batch commit. Any refusal aborts the complete stimulus, returns public `CommandOutcome.Rejected` with the exact state supplied to `applyStimulus`/Lean evaluation before admission, and emits no admitted state, internal step, batch, transition record, lifecycle delta, or publication. If several operations refuse together, canonical operation-ID order selects the private detail; the public outcome exposes no detail. Existing whole-state host capacity remains separate.

## Stable semantic rules and separating witnesses

`CESPS-TARGET-01`: only an explicitly declared parent/Compensation-Event-Sub-Process pair can reserve or promote context; ordinary Event Sub-Processes and handler-free parents do not qualify.

`CESPS-OCCURRENCE-01`: each concurrent or repeated parent instance has a distinct record keyed by complete `ScopeOccurrenceId`; definition identity or array position never aliases two instances.

`CESPS-CONTEXT-01`: promotion captures the exact root-to-parent Process/Sub-Process context from the deciding pre-state, with canonical bindings and no Activity-local, public, platform, or host-derived data.

`CESPS-SUCCESS-01`: only ordinary successful parent completion changes a matching provisional record to promoted; the record remains in the same canonical identity position.

`CESPS-PURGE-01`: failure, interruption, and cancellation remove the exact provisional record and never leave a promoted snapshot for that parent occurrence.

`CESPS-CAPACITY-01`: count or exact canonical-byte refusal preserves the complete pre-state before any parent-entry or parent-completion mutation.

`CESPS-LIFETIME-01`: while a root occurrence is live, every promoted child snapshot names that exact live owner; after selected-root completion, every retained child instead names exactly one matching promoted root record in the same terminal collection. An unselected root removes its children, and a terminal orphan or wrong-root child is invalid.

`CESPS-COMPAT-01`: every Program without the declaration and every state under it omit the optional field, preserving existing canonical bytes and behavior.

The context discriminator completes two direct children around a Process-binding change from `A` to `B` while unrelated Activity-local data remains live. Snapshots retain `A` and `B` without that local data; live aliases, entry capture, or definition-only keys fail.

The lifecycle discriminator covers root reservation, child reservation, ordinary promotion, direct Error failure, and bounded-scope Timer interruption. Adversarial same-definition occurrences prove that purging one cannot remove or promote the other. The root-close cases distinguish unselected-root disposal from selected-root terminal retention and reject a terminal child with no promoted root or the wrong promoted root. Multi-Instance completion-condition behavior is absent rather than modeled by an invalid outer disposition.

Capacity covers empty minimum, exact-fit/one-over reservation and promotion, escaping, non-ASCII, child-entry overflow, and completion overflow after earlier admitted/internal work. Every refusal returns the original pre-stimulus state with empty trace/publication; a disabled-operation or committed-stall mutation must fail.

## Lean assurance lane

Lane shape: **proved** for the representation, validation, reservation, capture, promotion, purge, capacity, and exact first-checkpoint lifecycle integrations.

Lean defines the same declaration, records, encoder, validator, lifecycle functions, three-arm internal attempt, closure refusal, and lifecycle integrations. Laws prove census closure, identity separation, frame ancestry/immutability, success-only promotion, unsuccessful purge, count/byte and whole-stimulus refusal preservation, old-byte omission, and integration frame properties.

Kernel-decided witnesses cover two differently valued parent occurrences, unrelated concurrent Activity-local data, Error failure, Timer interruption, exact capacity boundaries, running-root lifetime, selected-root terminal ownership, terminal orphan refusal, and wrong-root refusal. Lean contains no Multi-Instance early-completion relation or claim in this checkpoint.

If the Lean account cannot express the same canonical frame order and byte measure, or if promotion cannot be composed with scope completion without duplicating quiescence, the proposal returns to review. Implementation may not weaken the claim to a finite fixture or caller-supplied snapshot.

## Internal operation-family classification

Root start is external; child entry/completion is internal. Reservation writes the parent-occurrence retention atom; promotion reads parent/context/bindings/record and writes the record; purge writes every region-owned record. The commutation census and preparations prevent entry, completion, data mutation, or cancellation commuting across shared context/ownership.

Snapshots do not enable operations, affect quiescence, or enter publication. A trigger reopens frontier and footprint accounts.

## CIB Seven relationship boundary

This is a standards-only proposal. No CIB probe, profile rule, or relationship identifier is selected. The existing CIB relationship register contains no Compensation Event Sub-Process relationship that could authorize an implementation choice, and `CIB-AGR-0007` explicitly does not cover child-local data, Event Sub-Processes, or compensation.

## Temporal hosting and refinement preflight

This checkpoint adds no durable ingress, wait, timer, Activity effect, cancellation scope, Signal, Update, Query, public projection, or host scheduler. The production Workflow remains the only committed-state owner and must carry the optional collection byte-for-byte as ordinary private core state. Event History, Workflow Task order, Run identity, Search Attributes, publication rows, and Product 2 state cannot construct, repair, or discard a snapshot.

The refinement relation pairs live host state with the latest byte-identical committed core `RuntimeState`. Workflow Tasks, retries, Worker replacement, replay, Timer bookkeeping, and Continue-As-New stutter on the new hidden collection unless an accepted semantic entry, completion, or cancellation transition changes it. Continue-As-New changes only the host envelope and is never disposal.

Core count/byte overflow is semantic rejection with exact pre-state. A promoted candidate can separately exceed the existing complete committed-state bound, which remains a host capacity refusal and cannot be relabeled as semantic rejection. Continuation validation must bind field presence to the Program declaration and retain both provisional and promoted arms exactly.

The smallest later executable refinement witness starts a selected direct child, forces Continue-As-New while its record is provisional, replaces the Worker, completes it after a Process-data mutation, forces another continuation, and verifies the promoted snapshot remains byte-identical through replay. Separate Error and Timer schedules prove exact purge and no recovery resurrection. A selected-root schedule proves terminal retention without making a closed-process command reachable. Handler triggering and restoration require the next semantic capsule and another host preflight.

## Evidence strategy

| Claim | Lean | TypeScript core | Temporal | Discriminator |
|---|---|---|---|---|
| Target, dormant graph, and occurrence identity | Closed declaration/state predicates, declaration-derived graph exception, and uniqueness laws | Strict declaration-before-graph admission and exact occurrence lookup | Carried only | Undeclared or non-empty dormant scope; two same-definition occurrences |
| Complete context | Root-to-parent frame derivation and capture laws | Canonical frame capture from pre-state | Carried only | A/B completion with unrelated local scope |
| Success-only promotion | Completion composition and preservation | Exact `completeScope` staging | Carried only | Entry-copy and live-alias mutations |
| Unsuccessful purge | Regional-removal laws for failure, interruption, and cancellation | Error, Timer, and cancellation filters | Carried only | Promote-on-failure/interruption; outer early-disposition mutation |
| Atomic capacity | Three-arm attempt and whole-stimulus rollback laws | Entry/completion refusal with empty trace/publication | Complete-state class remains separate | Disabled/stalled or partial-commit mutation |
| Lifetime | Running-owner and terminal promoted-root laws | Selected/unselected root-close plus terminal orphan/wrong-root refusal | Continuation witness later | Continue-As-New disposal or terminal orphan mutation |
| Compatibility | Omitted declaration and strict-decoder fixtures | Exact old Program/state bytes | Existing histories unchanged | Emitted empty field under old Program |

The first green checkpoint contains the optional contracts/readers, exact dormant-handler admission, state/lifecycle validation, three-arm closure refusal and rollback, byte measurement/omission, current start/entry/completion/Error/Timer integration, commutation census/footprints, and Lean laws. It adds no source/profile/scenario/CIB/handler/Multi-Instance/Temporal/public/Product 2 claim.

## Runtime-only inventory and layer ownership

| Construct | Derivation and owner | Public projection | Lifecycle |
|---|---|---|---|
| Snapshot target | Program declaration; source later proves provenance | None | Program |
| Provisional record | Exact parent occurrence | None | Entry to promotion/purge |
| Context frame | Pre-state scope occurrence and bindings | None | Immutable |
| Promoted snapshot | Parent/handler record under live or promoted root | None | Completion to disposal/consumption |
| Capacity detail | Pure refusal | Rejected only | Never retained |

The profile owns provenance/data admission/limits; Lean and TypeScript own independent semantic accounts; Temporal only carries state. Publication and Product 2 own nothing here.

## Versioning consequences

This pre-release change adds optional Program/RuntimeState fields and replaces the closure-facing two-arm internal evaluator with a three-arm private result. No profile emits the declaration, and public wire outcomes remain unchanged.

The complete `what-binds` inventory requires [Program schema](../../contracts/schemas/semantic-process.schema.json), [Semantic Process IL](../SEMANTIC-PROCESS-IL-SPEC.md), [Internal Commutation](../INTERNAL-COMMUTATION-PROPOSAL.md), [contract registry](../../contracts/README.md), [package guide](../../packages/semantic-core/README.md), [source map](../../packages/semantic-core/SOURCE-MAP.md), [schema coverage](../../scripts/contract-schema-coverage.test.ts), [definition artifacts](../../scripts/contract-definition-artifacts.test.ts), [commutation census](../../scripts/internal-commutation-census.test.ts), [collection removal](../../scripts/runtime-collection-removal-completeness.test.ts), [source hygiene](../../scripts/source-hygiene.test.ts), and [reviewability](../../scripts/document-reviewability.test.ts). Trace/replay consumers [TypeScript trace](../../packages/semantic-core/src/semantic-transition-trace.ts), [Lean command admission](../../BpmnSemantics/SemanticProcess/CommandAdmission.lean), [Lean Scenario](../../BpmnSemantics/SemanticProcess/Scenario.lean), and [Lean publication](../../BpmnSemantics/SemanticProcessJson/Publication.lean) must preserve rejected/no-publication behavior even when they need no source change.

### Owners this implementation grows

| Existing owner | Current headroom | Growth condition |
|---|---:|---|
| [TS Program](../../packages/semantic-core/src/semantic-process-contract.ts) | 210 | declaration reference only |
| [TS Program admission](../../packages/semantic-core/src/semantic-process-admission.ts) | 412 | declaration before graph |
| [TS graph admission](../../packages/semantic-core/src/semantic-process-graph-admission.ts) | 206 | private exact exemption |
| [TS command admission](../../packages/semantic-core/src/semantic-command-admission.ts) | 388 | optional-field normalization |
| [TS RuntimeState](../../packages/semantic-core/src/semantic-process-state.ts) | 381 | collection reference only |
| [TS well-formedness](../../packages/semantic-core/src/runtime-state-well-formedness.ts) | 95 | delegate before 800 |
| [TS root start](../../packages/semantic-core/src/semantic-process-triggered-start.ts) | 631 | pre-mutation reservation |
| [TS scope runtime](../../packages/semantic-core/src/semantic-process-scope-runtime.ts) | 556 | unbounded entry/promotion |
| [TS bounded scope](../../packages/semantic-core/src/semantic-process-bounded-scope-runtime.ts) | 446 | bounded entry/promotion |
| [TS cancellation](../../packages/semantic-core/src/semantic-process-scope-cancellation.ts) | 616 | regional filtering |
| [TS Call cleanup](../../packages/semantic-core/src/semantic-process-call-runtime.ts) | 405 | structural filtering only |
| [TS evaluator](../../packages/semantic-core/src/semantic-process-runtime.ts) | 157 | three-arm result; extract first if needed |
| [TS closure](../../packages/semantic-core/src/semantic-process-closure.ts) | 685 | refusal precedence/rollback |
| [TS census](../../packages/semantic-core/src/internal-commutation-census.ts) | 668 | new state field |
| [TS footprint vocabulary](../../packages/semantic-core/src/internal-transition-footprint-vocabulary.ts) | 764 | snapshot atom |
| [TS footprint union](../../packages/semantic-core/src/internal-transition-footprint.ts) | 190 | dispatch/preparation |
| [TS footprint order](../../packages/semantic-core/src/internal-transition-footprint-ordering.ts) | 260 | snapshot atom order |
| [TS scope-entry preparation](../../packages/semantic-core/src/internal-transition-scope-creation-preparation.ts) | 569 | retention read/write |
| [TS bounded-entry preparation](../../packages/semantic-core/src/internal-transition-bounded-scope-preparation.ts) | 613 | retention read/write |
| [TS completion preparation](../../packages/semantic-core/src/internal-transition-scope-completion-preparation.ts) | 665 | context/retention footprint |
| [TS Error preparation](../../packages/semantic-core/src/internal-transition-error-preparation.ts) | 715 | purge footprint |
| [TS termination preparation](../../packages/semantic-core/src/internal-transition-termination-preparation.ts) | 723 | purge footprint |
| [Lean Program](../../BpmnSemantics/SemanticProcessContract.lean) | 106 | declaration reference only |
| [Lean structural admission](../../BpmnSemantics/SemanticProcess/ProgramStructuralValidation.lean) | 146 | declaration hook |
| [Lean graph admission](../../BpmnSemantics/SemanticProcess/GraphValidation.lean) | 41 | extract exception helper before 800 |
| [Lean RuntimeState](../../BpmnSemantics/SemanticProcess/RuntimeState.lean) | 217 | collection reference only |
| [Lean well-formedness](../../BpmnSemantics/SemanticProcess/RuntimeStateWellFormed.lean) | 101 | delegated predicate |
| [Lean completion](../../BpmnSemantics/SemanticProcess/ScopeCompletion.lean) | 694 | promotion/frame |
| [Lean cancellation](../../BpmnSemantics/SemanticProcess/ScopeCancellation.lean) | 646 | regional filtering |
| [Lean transition](../../BpmnSemantics/SemanticProcess/Transition.lean) | 329 | three-arm attempt |
| [Lean trace closure](../../BpmnSemantics/SemanticProcess/TransitionTrace.lean) | 226 | refusal rollback/no trace |
| [Lean census](../../BpmnSemantics/SemanticProcess/InternalCommutationCensus.lean) | 664 | new state field |
| [Lean footprint core](../../BpmnSemantics/SemanticProcess/InternalCommutationCore.lean) | 338 | snapshot atom/footprint |
| [Lean Program decoder](../../BpmnSemantics/SemanticProcessJson/Program.lean) | 116 | focused decoder |
| [Lean commutation preservation](../../BpmnSemantics/SemanticProcess/InternalCommutationRuntimePreservation.lean) | 27 | extract snapshot frame first |
| [Lean correlation preservation](../../BpmnSemantics/SemanticProcess/MessageKeyCorrelationPreservation.lean) | 365 | frame new invariant |
| [Lean payload preservation](../../BpmnSemantics/SemanticProcess/MessagePayloadPreservation.lean) | 468 | frame new invariant |
| [Lean turnover preservation](../../BpmnSemantics/SemanticProcess/ActivityBodyTurnoverPreservation.lean) | 598 | frame new invariant |
| [Lean issuing conformance](../../BpmnSemantics/ActivityIssuingDisciplineConformance.lean) | 578 | synchronize close witness |
| [Lean MI entry preservation](../../BpmnSemantics/SemanticProcess/ParallelMultiInstanceRuntimeStateEntryPreservation.lean) | 3 | extract before any growth |
| [Lean MI closing selection](../../BpmnSemantics/SemanticProcess/ParallelMultiInstanceRuntimeStateClosingSelection.lean) | 204 | frame new invariant |
| [Lean commutation publication](../../BpmnSemantics/SemanticProcess/InternalCommutationPublication.lean) | 485 | carry aggregate fact |
| [Lean MI empty preservation](../../BpmnSemantics/SemanticProcess/ParallelMultiInstanceRuntimeStateEmptyPreservation.lean) | 711 | carry aggregate fact |
| [Lean MI progress preservation](../../BpmnSemantics/SemanticProcess/ParallelMultiInstanceRuntimeStateClosingProgressPreservation.lean) | 252 | frame new invariant |
| [Lean MI terminal preservation](../../BpmnSemantics/SemanticProcess/ParallelMultiInstanceRuntimeStateClosingTerminalPreservation.lean) | 28 | extract frame proof first |

No size exception is requested. Planned bounded owners are `compensation-event-sub-process-snapshot-contract.ts`, `compensation-event-sub-process-snapshot.ts`, `compensation-event-sub-process-snapshot-state-validation.ts`, their focused test, `CompensationEventSubProcessSnapshotDeclaration.lean`, `CompensationEventSubProcessSnapshot.lean`, its JSON decoder, and its conformance target. Root integration owns shared contracts, closure, schema, registries, status, and receipts.

## Epistemic closure and reopen conditions

Selected: exact occurrence/provenance, dormant graph, completion-time frames, reservation/promotion/purge, root lifetime, capacity/omission, and carry-only hosting.

Open: source provenance; Sub-Process data; repetition/multiplicity; nested/called ownership; trigger/restoration/handler lifecycle and order; implicit compensation; Transactions; CIB; live refinement; public capability; closure.

Reopen for a second handler, deeper/repeated/MI parent, early disposition, Call transfer, Sub-Process data, ordinary Event Sub-Process reuse, handler-owned graph content, triggering/restoration, or encoder divergence.

## Stage boundary

The mandatory first green semantic checkpoint is the complete representation and current-route lifecycle slice named in the evidence strategy. It must be independently reviewed before source, trigger, handler, restoration, or Temporal work begins. The next risk band after that checkpoint is deterministic compensation trigger/order/cancellation, not capability packaging.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
