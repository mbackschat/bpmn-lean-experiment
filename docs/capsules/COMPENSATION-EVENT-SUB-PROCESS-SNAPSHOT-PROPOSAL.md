# Compensation Event Sub-Process snapshot proposal

## Status

Lifecycle: owner-approved
Review: approved-with-required-edits

## Prior review

Cold review rejected `c0370350`: its dormant handler violated the entry/completion graph rule, its outer `earlyCompletion` purge contradicted Clauses 10.7.2, 13.3.7, and 13.5.5, and its live-root invariant failed after root completion. The redesign adds an operation-free/control-place-free declared-handler exception, removes Multi-Instance early completion, and gives terminal child records a promoted-root owner.

Review of `10e8fb2d` accepted that account but required closure-facing refusal, a complete owner inventory, and a raw-graph negative. Its first correction audit at `25e3e5d7` closed the semantic findings but found omitted consumers, non-executable extraction conditions, and no paired Program/raw-graph assertion. The same reviewer approved final correction `dee98809` with every original finding closed.

## Question and bounded outcome

What is the smallest standards-only hidden-state account that preserves each parent occurrence's complete completion-time context for its declared Compensation Event Sub-Process, separates provisional from usable snapshots, purges unsuccessful parents, and refuses overflow before mutation?

This proposal selects context representation, occurrence identity, reservation, success promotion, unsuccessful disposal, capacity, and containing-scope lifetime. It excludes throw, handler activation/restoration/outcome/order, recursive compensation, Transactions, Cancel Events, source profiles, CIB behavior, public commands, and Temporal effects.

Requirement `BPMN-COMPENSATION-EVENT-SUB-PROCESS-SNAPSHOT-01` remains `unsupported` until source, handler, differential, durable, and public lanes close.

## Normative account and selected interpretation

BPMN 2.0.2 Clause 13.5.5 distinguishes a Compensation Event Sub-Process from boundary Compensation. It is contained in a Process or Sub-Process, accesses that parent's data, becomes enabled when the parent reaches `Completed`, and retains a completion-time snapshot. Only successfully completed Activities are compensable; failed-Activity compensation is empty.

Clause 13.5.5 requires a separate snapshot for each loop or Multi-Instance parent instance, and Clause 10.7.2 requires per-instance boundary compensation for a Multi-Instance Sub-Process. Records therefore use complete runtime parent occurrence identity, while loop/Multi-Instance parents and handler multiplicity remain excluded. The representation can later broaden without changing identity or context shape.

Clause 13.5.4's ordinary Event Sub-Process uses live parent context; a Compensation Event Sub-Process instead uses frozen successful-completion context. A mutable alias or entry-time copy is therefore wrong.

Clauses 10.4.1 and 10.3.5 tie data lifecycle and visibility to Process/Sub-Process scope. The snapshot is therefore the ordered visible Process/Sub-Process context path, not Task I/O, Activity-local scopes, or the entire variable store.

The current runtime has Process bindings and occurrence-owned Activity-local bindings but no Sub-Process data collection. The root frame therefore contains exact Process bindings and each direct child-parent frame is empty. This is complete only for Programs asserting no Sub-Process-local binding shape; source cannot emit the declaration until it proves that restriction. Later scope-local data can fill the existing ordered frames without reinterpretation.

Machine-readable anchors are `SubProcess.triggeredByEvent`, `StartEvent.isInterrupting`, `CompensateEventDefinition`, `Activity.isForCompensation`, `DataObject`, `DataObjectReference`, and containment. No `SubProcess.compensable` property exists despite Clause 13.5.5's prose; OMG's implicit-compensation and cancellation issues remain excluded.

## Required, optional, and excluded scope

**Required representation:** an optional Program declaration of canonical parent/handler pairs and count/byte limits; an optional hidden RuntimeState collection; complete parent/containing occurrence identity; ordered immutable context frames; and provisional/promoted record arms.

**Required lifecycle:** reserve one provisional record atomically with each selected parent occurrence; promote only from the exact live provisional record when ordinary scope completion selects that occurrence; capture its complete context from the deciding pre-state; refuse count or byte overflow before completion mutation; purge provisional state on failure, interruption, or cancellation; keep a promoted child snapshot only while its exact containing root occurrence remains live; and retain a promoted root snapshot with its direct-child snapshots in the terminal semantic state for later parent-host integration.

**Required forward-compatible restriction:** a declaring Program has one parentless root. A selected parent is that root or one directly contained embedded Sub-Process definition. Each handler is a distinct immediate child definition scope of its parent, owns zero operations and zero control places, has no `enterScope`, `enterBoundedScope`, or `completeScope` operation, and is selected at most once. The declaration-derived handler set is the only exception to the existing one-entry/one-completion rule; every ordinary non-root definition scope keeps exactly one current entry and one completion. A selected non-root parent is entered by exactly one current `enterScope` or `enterBoundedScope` operation. Repetition of a selected definition, nested selected parents, called Processes, loop and Multi-Instance Sub-Processes, and profile-enabled incident cancellation are not admitted by this checkpoint.

**Optional:** Programs without the declaration require field absence and preserve existing bytes. A declaration may select the root, distinct direct-child parents, or both, subject to canonical order and the restriction above.

**Excluded:** Task-I/O/publication snapshots; Activity-local bindings; source/profile work; repeated, loop, or Multi-Instance Sub-Processes; multiple handlers per parent; arbitrary nesting; Call transfer; ordinary Event Sub-Process execution; Compensation throw/handler lifecycle/order; boundary handlers; implicit compensation; Transaction/Cancel semantics; CIB; public observation; Product 2; and live Temporal hosting.

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

Strict Program admission validates the declaration and derives the dormant-handler set before graph admission checks ancestry, ownership, reachability, entry, and completion. A declared handler is accepted only with no owned operation/control place and no targeted entry/completion; every other scope keeps the ordinary graph rule. The exported raw graph validator retains its current signature and rejects every operation-free child scope. Only a non-exported helper may receive the validated declaration-derived set. The focused `packages/semantic-core/test/compensation-event-sub-process-snapshot.test.ts` must pair one exact graph: strict Program admission accepts its exact declaration-derived dormant handler while a direct call to the exported raw validator rejects the identical graph; the same test rejects extra, mismatched, non-empty, and caller-supplied exemptions. This semantic declaration does not prove source provenance. A later compiler must prove `triggeredByEvent=true`, a Compensation Start Event, containment, and the parent-data restriction. Handler activation requires a reviewed executable graph replacement.

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

The lifecycle discriminator covers root reservation, child reservation, ordinary promotion, direct Error failure, and bounded-scope Timer interruption. The direct Timer-admission witness proves purge and state validity before closure can repair either, while the regional-removal laws quantify exact survivor membership. Adversarial same-definition occurrences prove that purging one cannot remove or promote the other, and removing a root proves that its promoted child record cannot survive merely because the completed child occurrence is already absent. The root-close cases distinguish unselected-root disposal from selected-root terminal retention and reject a terminal child with no promoted root or the wrong promoted root. Multi-Instance completion-condition behavior is absent rather than modeled by an invalid outer disposition.

Capacity covers empty minimum, exact-fit/one-over reservation and promotion, escaping, non-ASCII, child-entry overflow, and completion overflow after earlier admitted/internal work. Every refusal returns the original pre-stimulus state with empty trace/publication; a disabled-operation or committed-stall mutation must fail.

## Lean assurance lane

Lane shape: **proved** for the representation, validation, reservation, capture, promotion, purge, capacity, and exact first-checkpoint lifecycle integrations.

Lean defines the same declaration, records, encoder, validator, lifecycle functions, three-arm internal attempt, closure refusal, and lifecycle integrations. Laws prove census closure, identity separation, frame ancestry/immutability, selected-root start reservation, ordinary and bounded child-entry composition, deciding-pre-state promotion, exact regional and Timer-interruption survivor membership, committed admission validity, success-only promotion, unsuccessful purge, count/byte and whole-stimulus refusal preservation, old-byte omission, and integration frame properties.

The proved lane is not inferred from the concrete fixtures. Reusable quantified laws are `compensationEventSubProcessSnapshotStateValid_implies_declarationValid` and `compensationEventSubProcessSnapshotStateValid_implies_bounds_and_lifecycle` for representation/validation; `capacityRefusal_records`, `capacityRefusal_canonicalBytes`, and `capacityRefusal_none_iff` for exact capacity; `reserveCompensationParentContext_refusal_preserves_state`, `reserveCompensationParentContext_disabled_shape`, `reserveCompensationParentContext_applied_shape`, `reserveRootCompensationParentContextBeforeStart_refusal_preserves_before`, `reserveRootCompensationParentContextBeforeStart_applied_shape`, `prepareStartedSnapshotState_selected_applied_shape`, and `prepareStartedSnapshotState_refusal_shape` for reservation and selected-root start composition; `attemptInternalOperation_enterScope_applied_shape`, `attemptInternalOperation_enterScope_applied_stateValid`, `attemptInternalOperation_enterBoundedScope_applied_shape`, and `attemptInternalOperation_enterBoundedScope_applied_stateValid` for selected child-entry composition and aggregate validity; `captureCompensationParentContext_root_shape` and `captureCompensationParentContext_child_shape` for context shape; `promoteCompensationParentContext_refusal_preserves_state`, `promoteCompensationParentContext_disabled_shape`, `promoteCompensationParentContext_applied_shape`, `attemptInternalOperation_completeScope_applied_shape`, and `attemptInternalOperation_completeScope_applied_stateValid` for deciding-pre-state promotion, completion composition, and aggregate validity; `mem_purgeCompensationParentContextForParent_iff`, `mem_purgeCompensationParentContextForRoot_iff`, `mem_cancelScopeSubtree_compensationParentContextRetentions_iff`, and `interruptBoundedScope_compensationParentContextRetentions_iff` for purge and regional cancellation; and `admitStimulusWithCompensationSnapshots_committed_stateValid`, `applyStimulusWithCompensationSnapshots_closure_refusal_rejects_atomically`, `applyStimulusTracedWithCompensationSnapshots_emitted_trace_replays`, `dispatchStimulus_withSnapshotDeclaration_rejects`, `admitStimulus_withSnapshotDeclaration_rejects`, `fire_withSnapshotDeclaration_is_disabled`, `applyStimulus_withSnapshotDeclaration_rejects`, `applyStimulusTraced_withSnapshotDeclaration_rejects`, and `replayCommittedTransitions_withSnapshotDeclaration_is_disabled` for lifecycle validity, rollback, replay, and mechanical legacy-surface exclusion. Each theorem quantifies over its Program, RuntimeState, occurrence, declaration, capacity, or transition inputs and exposes the hypotheses needed by later composition.

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
| Success-only promotion | Completion composition plus quantified aggregate-valid applied successor | Exact `completeScope` staging | Carried only | Entry-copy, live-alias mutation, or an applied invalid successor |
| Unsuccessful purge | Exact regional and bounded-Timer survivor laws plus committed-admission validity | Error, Timer, and cancellation filters | Carried only | Promote-on-failure/interruption; promoted-child orphan after root removal; outer early-disposition mutation |
| Atomic capacity | Three-arm attempt and whole-stimulus rollback laws | Entry/completion refusal with empty trace/publication | Complete-state class remains separate | Disabled/stalled or partial-commit mutation |
| Lifetime | Running-owner and terminal promoted-root laws | Selected/unselected root-close plus terminal orphan/wrong-root refusal | Continuation witness later | Continue-As-New disposal or terminal orphan mutation |
| Compatibility | Omitted declaration and strict-decoder fixtures | Exact old Program/state bytes | Existing histories unchanged | Emitted empty field under old Program |

The first green checkpoint contains the optional contracts/readers, exact dormant-handler admission, state/lifecycle validation, quantified aggregate-valid child-entry, bounded-child-entry, and completion successors, three-arm closure refusal and rollback, byte measurement/omission, current start/entry/completion/Error/Timer integration, commutation census/footprints, and Lean laws. Its cgroup acceptance rejects nonzero exits, the exact bound, and any controlled pressure/OOM event. It adds no source/profile/scenario/CIB/handler/Multi-Instance/Temporal/public/Product 2 claim.

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

The complete `what-binds` inventory requires [`implementation-status-owner:ENGINE-RUNTIME-PROOF`](../ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), [Program schema](../../contracts/schemas/semantic-process.schema.json), [Semantic Process IL](../SEMANTIC-PROCESS-IL-SPEC.md), [Internal Commutation](../INTERNAL-COMMUTATION-PROPOSAL.md), [contract registry](../../contracts/README.md), [package guide](../../packages/semantic-core/README.md), [source map](../../packages/semantic-core/SOURCE-MAP.md), [schema coverage](../../scripts/contract-schema-coverage.test.ts), [definition artifacts](../../scripts/contract-definition-artifacts.test.ts), [commutation census](../../scripts/internal-commutation-census.test.ts), [collection removal](../../scripts/runtime-collection-removal-completeness.test.ts), [source hygiene](../../scripts/source-hygiene.test.ts), and [reviewability](../../scripts/document-reviewability.test.ts). Trace/replay consumers [TypeScript trace](../../packages/semantic-core/src/semantic-transition-trace.ts), [Lean Scenario](../../BpmnSemantics/SemanticProcess/Scenario.lean), and [Lean publication](../../BpmnSemantics/SemanticProcessJson/Publication.lean) preserve rejected/no-publication behavior even when unchanged.

### Owners this implementation grows

| Existing owner | Current headroom | Growth condition |
|---|---:|---|
| [TS Program](../../packages/semantic-core/src/semantic-process-contract.ts) | 197 | declaration reference only |
| [TS Program admission](../../packages/semantic-core/src/semantic-process-admission.ts) | 371 | declaration before graph |
| [TS graph admission](../../packages/semantic-core/src/semantic-process-graph-admission.ts) | 169 | private exact exemption |
| [TS command admission](../../packages/semantic-core/src/semantic-command-admission.ts) | 380 | optional-field normalization |
| [TS RuntimeState](../../packages/semantic-core/src/semantic-process-state.ts) | 363 | collection reference only |
| [TS runtime-state defect](../../packages/semantic-core/src/runtime-state-defect.ts) | 760 | preserve the closed malformed-state classification or record a proved no-change mapping |
| [TS well-formedness](../../packages/semantic-core/src/runtime-state-well-formedness.ts) | 51 | delegate before 800 |
| [TS preservation oracle](../../packages/semantic-core/test/runtime-state-preservation.test.ts) | 604 | exact new-field preservation and malformed-state refusal |
| [TS root start](../../packages/semantic-core/src/semantic-process-triggered-start.ts) | 583 | pre-mutation reservation |
| [TS scope runtime](../../packages/semantic-core/src/semantic-process-scope-runtime.ts) | 556 | unbounded entry/promotion |
| [TS bounded scope](../../packages/semantic-core/src/semantic-process-bounded-scope-runtime.ts) | 446 | bounded entry/promotion |
| [TS cancellation](../../packages/semantic-core/src/semantic-process-scope-cancellation.ts) | 584 | regional filtering |
| [TS Call cleanup](../../packages/semantic-core/src/semantic-process-call-runtime.ts) | 378 | structural filtering only |
| [TS evaluator](../../packages/semantic-core/src/semantic-process-runtime.ts) | 54 | three-arm dispatch only; snapshot staging is extracted |
| [TS closure](../../packages/semantic-core/src/semantic-process-closure.ts) | 616 | refusal precedence/rollback |
| [TS snapshot staging](../../packages/semantic-core/src/internal-transition-attempt.ts) | 668 | pre-mutation reservation/promotion selection |
| [TS census](../../packages/semantic-core/src/internal-commutation-census.ts) | 659 | new state field |
| [TS footprint vocabulary](../../packages/semantic-core/src/internal-transition-footprint-vocabulary.ts) | 762 | snapshot atoms |
| [TS footprint union](../../packages/semantic-core/src/internal-transition-footprint.ts) | 120 | retention/capacity/context helpers |
| [TS footprint order](../../packages/semantic-core/src/internal-transition-footprint-ordering.ts) | 245 | snapshot atom order and region overlap |
| [TS scope-entry preparation](../../packages/semantic-core/src/internal-transition-scope-creation-preparation.ts) | 564 | retention read/write |
| [TS bounded-entry preparation](../../packages/semantic-core/src/internal-transition-bounded-scope-preparation.ts) | 606 | retention read/write |
| [TS completion preparation](../../packages/semantic-core/src/internal-transition-scope-completion-preparation.ts) | 657 | context/retention footprint |
| [TS Error preparation](../../packages/semantic-core/src/internal-transition-error-preparation.ts) | 711 | purge footprint |
| [TS termination preparation](../../packages/semantic-core/src/internal-transition-termination-preparation.ts) | 719 | purge footprint |
| [Lean Program](../../BpmnSemantics/SemanticProcessContract.lean) | 54 | declaration reference only |
| [Lean structural admission](../../BpmnSemantics/SemanticProcess/ProgramStructuralValidation.lean) | 139 | declaration hook |
| [Lean graph admission](../../BpmnSemantics/SemanticProcess/GraphValidation.lean) | 94 | lifecycle helper extracted; preserve the recovered headroom |
| [Lean RuntimeState](../../BpmnSemantics/SemanticProcess/RuntimeState.lean) | 110 | collection reference only |
| [Lean well-formedness](../../BpmnSemantics/SemanticProcess/RuntimeStateWellFormed.lean) | 98 | delegated predicate |
| [Lean initialization preservation](../../BpmnSemantics/SemanticProcess/RuntimeStateWellFormedInitialization.lean) | 709 | preserve the new invariant from the exact initialized state |
| [Lean completion](../../BpmnSemantics/SemanticProcess/ScopeCompletion.lean) | 694 | promotion/frame |
| [Lean cancellation](../../BpmnSemantics/SemanticProcess/ScopeCancellation.lean) | 612 | regional filtering |
| [Lean transition](../../BpmnSemantics/SemanticProcess/Transition.lean) | 20 | dispatch only; the applied-result contract is extracted |
| [Lean internal-operation attempt](../../BpmnSemantics/SemanticProcess/InternalOperationAttempt.lean) | 757 | validate every applied snapshot-aware successor before exposure |
| [Lean trace closure](../../BpmnSemantics/SemanticProcess/TransitionTrace.lean) | 174 | refusal rollback/no trace |
| [Lean command admission](../../BpmnSemantics/SemanticProcess/CommandAdmission.lean) | 264 | map root-capacity refusal to `Rejected`, never `semanticFailure`, and reject an invalid committed post-state |
| [Lean census](../../BpmnSemantics/SemanticProcess/InternalCommutationCensus.lean) | 653 | new state field |
| [Lean footprint core](../../BpmnSemantics/SemanticProcess/InternalCommutationCore.lean) | 338 | snapshot atom/footprint |
| [Lean Program decoder](../../BpmnSemantics/SemanticProcessJson/Program.lean) | 102 | focused decoder |
| [Lean commutation preservation](../../BpmnSemantics/SemanticProcess/InternalCommutationRuntimePreservation.lean) | 16 | extract the snapshot frame before further growth |
| [Lean correlation preservation](../../BpmnSemantics/SemanticProcess/MessageKeyCorrelationPreservation.lean) | 360 | frame new invariant |
| [Lean payload preservation](../../BpmnSemantics/SemanticProcess/MessagePayloadPreservation.lean) | 463 | frame new invariant |
| [Lean turnover preservation](../../BpmnSemantics/SemanticProcess/ActivityBodyTurnoverPreservation.lean) | 589 | frame new invariant |
| [Lean issuing conformance](../../BpmnSemantics/ActivityIssuingDisciplineConformance.lean) | 578 | synchronize close witness |
| [Lean MI entry preservation](../../BpmnSemantics/SemanticProcess/ParallelMultiInstanceRuntimeStateEntryPreservation.lean) | 12 | order fact extracted; frame new invariant |
| [Lean MI closing selection](../../BpmnSemantics/SemanticProcess/ParallelMultiInstanceRuntimeStateClosingSelection.lean) | 202 | frame new invariant |
| [Lean commutation publication](../../BpmnSemantics/SemanticProcess/InternalCommutationPublication.lean) | 481 | carry aggregate fact |
| [Lean MI empty preservation](../../BpmnSemantics/SemanticProcess/ParallelMultiInstanceRuntimeStateEmptyPreservation.lean) | 711 | carry aggregate fact |
| [Lean MI progress preservation](../../BpmnSemantics/SemanticProcess/ParallelMultiInstanceRuntimeStateClosingProgressPreservation.lean) | 247 | frame new invariant |
| [Lean MI terminal preservation](../../BpmnSemantics/SemanticProcess/ParallelMultiInstanceRuntimeStateClosingTerminalPreservation.lean) | 23 | extract the frame proof before further growth |

Every headroom figure is the measured number of nonblank lines remaining below the 800-line review target. An owner must extract before this checkpoint's planned growth consumes that figure; a row with insufficient headroom may not grow first. No size exception is requested. Planned bounded owners are `packages/semantic-core/src/compensation-event-sub-process-snapshot-contract.ts`, `packages/semantic-core/src/compensation-event-sub-process-snapshot.ts`, `packages/semantic-core/src/compensation-event-sub-process-snapshot-state-validation.ts`, `packages/semantic-core/test/compensation-event-sub-process-snapshot.test.ts`, `packages/semantic-core/test/compensation-event-sub-process-snapshot-integration.test.ts`, [Lean snapshot runtime](../../BpmnSemantics/SemanticProcess/CompensationEventSubProcessSnapshot.lean) with 99 lines of headroom, [Lean lifecycle laws](../../BpmnSemantics/SemanticProcess/CompensationEventSubProcessSnapshotLifecycleLaws.lean) with 446 lines, [Lean lifecycle integration](../../BpmnSemantics/CompensationEventSubProcessSnapshotLifecycleIntegrationConformance.lean) with 674 lines, `BpmnSemantics/SemanticProcess/CompensationEventSubProcessSnapshotDeclaration.lean`, its JSON decoder, and its remaining conformance targets. Root integration owns shared contracts, closure, schema, registries, status, and receipts.

## Epistemic closure and reopen conditions

Selected: exact occurrence/provenance, dormant graph, completion-time frames, reservation/promotion/purge, root lifetime, capacity/omission, and carry-only hosting.

Open: source provenance; Sub-Process data; repetition/multiplicity; nested/called ownership; trigger/restoration/handler lifecycle and order; implicit compensation; Transactions; CIB; live refinement; public capability; closure.

Reopen for a second handler, deeper/repeated/MI parent, early disposition, Call transfer, Sub-Process data, ordinary Event Sub-Process reuse, handler-owned graph content, triggering/restoration, or encoder divergence.

## Stage boundary

The mandatory first green semantic checkpoint is the complete representation and current-route lifecycle slice named in the evidence strategy. It must be independently reviewed before source, trigger, handler, restoration, or Temporal work begins. The next risk band after that checkpoint is deterministic compensation trigger/order/cancellation, not capability packaging.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `10e8fb2d` | `fork-turns-none` | `approve-with-required-edits` | `dee98809` |
| Semantic checkpoint | `58fe635c` | `fork-turns-none` | `approve-with-required-edits` | `b281291c, 82d6ec04, 587cafdf, 99dd5744, 993a8b95, owner-authorized` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
