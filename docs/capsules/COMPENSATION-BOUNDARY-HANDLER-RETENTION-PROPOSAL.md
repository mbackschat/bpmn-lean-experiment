# Compensation boundary-handler retention proposal

## Status

Lifecycle: owner-approved
Review: approved-with-required-edits

## Prior review

The context-cold review rejected target `033a7552`: it inferred handler-free eligibility from global throw syntax, retained per-inner-instance records without resolving early completion, and substituted Task I/O for a Compensation Event Sub-Process parent snapshot. This target instead uses explicit-handler eligibility, one all-success outer Multi-Instance User Task record, and a separate next snapshot risk band.

## Question and bounded outcome

What is the smallest standards-only hidden register that keeps an explicitly boundary-handler-eligible Activity available for a later targeted or global Compensation throw until its owning scope closes, while distinguishing successful ordinary completion from Multi-Instance early completion or interruption and refusing bounded growth before mutation?

This proposal selects only eligibility, outer Activity identity, completion chronology, capacity, and root-scope lifetime for an associated boundary Compensation Activity. It selects no Compensation Event Sub-Process, snapshot restoration, throw Event, handler execution, dependency order, Transaction, Cancel Event, CIB behavior, public command, source profile, or Temporal effect.

The reviewed requirement is `BPMN-COMPENSATION-ACTIVITY-RETENTION-01`. Its approved representation checkpoint and exact completion producers are implemented, but it and `BPMN-MECH-COMPENSATION-01` remain `unsupported` because no source profile admits the declaration and Event Sub-Process snapshots, triggering, handler execution, ordering, cancellation, and Transactions stay open.

## Normative account and selected interpretation

BPMN 2.0.2 Tables 10.88 and 10.89 say a successfully completed Activity can be compensated only if it has a boundary Compensation Event or contains a Compensation Event Sub-Process. Optional `CompensateEventDefinition.activityRef` selects one visible eligible Activity when present; when absent, the global form selects all visible successfully completed eligible Activities. It does not make a handler-free Activity eligible.

Clause 13.5.5 distinguishes the two handler families. An associated boundary Compensation Activity becomes enabled when its Activity completes and is triggered once for a loop or Multi-Instance Activity. A Compensation Event Sub-Process instead restores its Process/Sub-Process parent's completion-time context and can require one snapshot per loop or Multi-Instance parent instance. This proposal selects only the first family and therefore retains no generic Task-data snapshot.

Clause 13.3.7 requires every Multi-Instance instance to complete successfully. A `completionCondition` is non-retaining only when it cancels a pending instance. The current parallel evaluator gives all-slots-filled priority: one-item `completionPolicy="first"` is all-success, while the same policy over a larger set cancels siblings. An interrupting boundary Timer is also ineligible.

The standard does not exempt normal zero-instance completion. Because the current empty path mints no outer `ActivityOccurrenceId`, producer integration must allocate that identity and high-water mark before atomic completion, then retain it with planned/successful zero. It creates no inner instance or controller. Clause 13.5.5 still triggers the associated handler once for the outer User Task.

Clause 10.7.2 assigns per-instance boundary-handler invocation to a Multi-Instance Sub-Process, while Clause 13.5.5 says a Multi-Instance Activity's associated handler triggers once. This proposal excludes Multi-Instance Sub-Processes instead of choosing between those texts. Their support requires a reviewed multiplicity account and per-instance parent snapshots.

The machine-readable anchors are `CompensateEventDefinition.activityRef`, `BoundaryEvent.attachedToRef`, `Association.sourceRef`/`targetRef`, `Activity.isForCompensation`, and `MultiInstanceLoopCharacteristics`, with their corresponding XSD declarations. The prose-only `SubProcess.compensable` inconsistency in [BPMN21-167](https://issues.omg.org/issues/BPMN21-167), implicit-compensation contradiction in [BPMN21-403](https://issues.omg.org/issues/BPMN21-403), and cancellation terminology in [BPMN21-404](https://issues.omg.org/issues/BPMN21-404) are excluded rather than resolved.

## Required, optional, and excluded scope

**Required representation:** one optional flat-root Program declaration with explicit boundary-handler targets; one live-root-owned register; one immutable record per eligible successful outer occurrence; contiguous chronology, canonical order, normal-close disposal, and count/byte refusal before completion mutation.

**Required completion families:** one exact `awaitUserTask` ordinary User Task operation, one `awaitSequentialMultiInstanceUserTask`, and one `awaitParallelMultiInstanceUserTask`. The first checkpoint represents and classifies only those three. The later producer slice must prove that exact ordinary User Task success retains once; zero-item and positive all-success Multi-Instance completion retain once; one-item `completionPolicy="first"` retains once; a greater-than-one `completionPolicy="first"` completion that cancels siblings retains nothing; and both interrupting Activity Timer paths retain nothing.

**Required forward-compatible boundary:** a declaring Program has one parentless scope and no nested scope, called Process, `terminateScope`, or profile-enabled root cancellation. Each root-owned target names exactly one supported operation whose origin and task identities equal `activityElementId`, closing the validator census and preventing excluded terminal paths from bypassing disposal.

**Optional:** the declaration and RuntimeState collection are optional. Programs without the declaration require absence. Byte-compatible shared `initialState` also omits it; command admission validates that sentinel through a non-mutating program-aware empty view. Accepted start materializes the root register, and every later declaring state carries the collection, empty after normal close.

**Excluded:** every ordinary Activity operation except exact `awaitUserTask`, including data-input/output, bounded, message-bounded, monitored, effect, and Sub-Process families and all their success, business-error, failure, interrupting, and non-interrupting exits; Compensation Event Sub-Processes and parent-scope snapshots; Multi-Instance Sub-Processes and their handler-multiplicity account; handler-free or implicit eligibility; more than one compensation handler per Activity; source admission; registered profiles; throw Events; `activityRef`; `waitForCompletion`; handler execution or failure; dependency ordering; recursive compensation; standard loops; nested or called scopes; root termination/cancellation; Transaction and Cancel semantics; public projection; CIB compatibility; Product 2; and live Temporal hosting.

## Program and runtime contract

The Semantic Process Program gains one optional declaration:

```ts
type BoundaryCompensationTarget = DeepReadonly<{
  activityElementId: string;
  boundaryEventElementId: string;
  compensationActivityElementId: string;
}>;

type CompensationActivityRetentionDeclaration = DeepReadonly<{
  definitionScopeId: string;
  targets: BoundaryCompensationTarget[];
  limits: {
    maxRecords: number;
    maxCanonicalBytes: number;
  };
}>;

type SemanticProcessProgram = DeepReadonly<{
  // existing required fields remain unchanged
  compensationActivityRetention?: CompensationActivityRetentionDeclaration;
}>;
```

`definitionScopeId` resolves to the unique parentless scope whose origin equals `processId`. Targets are non-empty, canonically ordered by complete three-part identity, and unique by `activityElementId`. Each element id is non-empty and distinct within a target. `activityElementId` must identify exactly one operation in the declared scope, restricted to `awaitUserTask`, `awaitSequentialMultiInstanceUserTask`, or `awaitParallelMultiInstanceUserTask`; that operation's `origin.elementId` and `task.elementId` must both equal the target. At this representation checkpoint the declaration is a proposal-defined semantic Program fact; its validator proves internal shape and this closed operation-family consistency, not provenance from arbitrary BPMN XML. Later source admission may emit a target only after resolving the boundary Event attachment and the Association to one `isForCompensation=true` Activity.

`maxRecords` is a positive safe integer. `maxCanonicalBytes` is a safe integer from 2 through 65,536 inclusive because the canonical empty `records` array is exactly two UTF-8 bytes. A profile must select a lower maximum when other maximum state components need headroom. The existing 65,536-byte complete-`RuntimeState` host bound remains an independent secondary check.

Runtime state gains one optional collection:

```ts
type CompletedCompensableActivity = DeepReadonly<{
  id: ActivityOccurrenceId;
  completionOrdinal: number;
}>;

type CompensationActivityRetention = DeepReadonly<{
  owner: ScopeOccurrenceId;
  nextCompletionOrdinal: number;
  records: CompletedCompensableActivity[];
}>;

type RuntimeState = DeepReadonly<{
  // existing fields remain unchanged
  compensationActivityRetentions?: CompensationActivityRetention[];
}>;
```

The existing `ActivityOccurrenceId` distinguishes element, Process instance, and repeated outer activation. It deliberately has no inner index: for an admitted Multi-Instance User Task, Clause 13.5.5 enables and later triggers the associated Compensation Activity once for the completed outer Activity. A zero-item entry still mints that outer identity and advances `activityActivations` before completing atomically; it creates no inner task activation. Equal input values, completion order, task activations, Workflow identity, and host attempts have no retention identity authority. This identity choice makes no claim about the excluded per-instance behavior that Clause 10.7.2 assigns to Multi-Instance Sub-Processes.

`nextCompletionOrdinal` starts at one and advances exactly once per accepted outer record. It is independent of `records.length` so later handler consumption cannot reuse chronology. At this checkpoint, records are ascending with ordinals exactly `1 .. nextCompletionOrdinal - 1`.

## Completion eligibility

A pure closed classifier receives facts derived from one selected Activity completion, never caller assertions:

```ts
type CompensationCompletionFacts =
  | DeepReadonly<{
      kind: "ordinaryUserTask";
      activity: ActivityOccurrenceId;
    }>
  | DeepReadonly<{
      kind: "multiInstanceUserTask";
      activity: ActivityOccurrenceId;
      plannedInstances: number;
      successfullyCompletedInstances: number;
      outcome: "allSuccessfulCompletion" | "earlyCompletion" | "interrupted";
    }>;
```

The selector returns the outer identity only when its element is one declared target and either the facts name the exact ordinary `awaitUserTask` success family, or the Multi-Instance outcome is `allSuccessfulCompletion` with equal non-negative safe planned and successful counts. Equality includes zero. `earlyCompletion` and `interrupted` are valid only with non-negative safe `successfullyCompletedInstances < plannedInstances`; both are non-retaining. A one-item `completionPolicy="first"` producer emits `allSuccessfulCompletion`, while the greater-than-one sibling-canceling path emits `earlyCompletion`. Missing declaration or target, malformed counts/outcome combinations, wrong scope, duplicate identity, and a second record for one outer occurrence are refused with exact pre-state preservation.

The facts are an internal evaluator boundary, not a new wire or stored structure. The exact ordinary `awaitUserTask` command producer emits its arm only after resolving the live wait and before removing it. Positive-cardinality sequential and parallel producers derive counts from the exact controller pre-state; all-slots-filled takes priority over completion policy, and boundary victory distinguishes interruption. The zero-cardinality entry derives planned/successful zero from the admitted collection, allocates its fresh outer identity and high-water mark, and stages retention before applying its normal output. No producer may construct a successful summary after it has discarded the deciding wait, controller, or zero-entry facts.

## Retention transition, capacity, and refusal

Insertion stages the selected outer identity with `completionOrdinal = nextCompletionOrdinal`, appends it to ordinal order, and computes prospective record count and canonical bytes. The byte measure is the UTF-8 length of the exact canonical JSON encoding of the prospective `records` array, including identity, ordinal, keys, punctuation, and JSON escaping. Object keys use Unicode scalar-value order; arrays retain declared order. No stored or caller-supplied size fact is authoritative.

Count or byte overflow returns a typed private refusal naming the measure, configured bound, and observed value. The enclosing completion maps it to semantic rejection before changing tokens, waits, Activity records, controllers, variables, activation counters, execution publication, or flow-node publication. The existing complete-state host check then remains separately able to refuse a candidate because unrelated state also consumes bytes.

## Lifetime, global visibility, and scope close

The first successful start creates one empty register owned by the fresh root `ScopeOccurrenceId`. Records survive unrelated work and Continue-As-New while that root remains open. They do not keep the scope non-quiescent, enable a transition, or enter stable public observation.

Normal root `completeScope` removes the exact register atomically and leaves `compensationActivityRetentions: []`. The flat-root restriction makes all retained records visible to the future global form while the root is open. Later targeted/global triggering may select only records whose Program target exists; visibility and target selection do not alter handler-decided eligibility.

Record order is completion chronology only. Future default compensation must derive BPMN dependency order and may not use this total ordinal as a substitute when Activities were concurrent.

## Stable semantic rules and separating witnesses

`CBRET-ELIGIBLE-01`: only an Activity named by one explicit boundary-handler target can enter the register; global throw syntax does not widen eligibility.

`CBRET-SINGLE-01`: one successful eligible `awaitUserTask` creates one immutable identity record and one ordinal; no other ordinary operation kind can produce completion facts.

`CBRET-MI-01`: one eligible sequential or parallel Multi-Instance User Task creates exactly one outer record after all planned instances complete successfully, including zero items and one-item `completionPolicy="first"`; sibling-canceling early completion and interruption create none.

`CBRET-ORDER-01`: accepted outer records receive positive contiguous never-reused completion ordinals and remain in ascending order; chronology is not dependency order.

`CBRET-CAPACITY-01`: duplicate, count, or exact canonical-byte refusal preserves the complete pre-state before any completion mutation.

`CBRET-LIFETIME-01`: records survive until normal close of their exact root occurrence; quiescence ignores them and close removes all and only that register.

`CBRET-COMPAT-01`: every Program without the declaration and every state under it omit the optional fields, preserving existing canonical bytes.

The eligibility discriminator uses two completed exact `awaitUserTask` operations in one root: one has a declared boundary handler and one does not. A later global throw can see only the retained declared target. A mutation that retains the handler-free task reproduces the first rejected proposal's error. A closed-census validator mutation that accepts one excluded data, bounded, monitored, effect, or scope operation must also fail.

The Multi-Instance discriminator covers zero-item normal completion with a fresh outer identity, one-item `completionPolicy="first"` as all-success, greater-than-one `completionPolicy="first"` as sibling-canceling early completion, sequential positive all-success, parallel positive all-success with adversarial completion order, and both current interrupting Timer paths. The all-success cases create one outer record each; actual early completion and interruption preserve the prior register. A mutation that omits the zero-item outer activation, classifies the one-item case as early, inserts on the first inner success of a larger set, or inserts after sibling cancellation must fail.

Capacity rejects `maxCanonicalBytes = 1`, then uses empty-array minimum, exact-fit and one-over count cases plus escaped/non-ASCII exact-fit and one-byte-over identity fixtures. Disposal holds records through unrelated work and then proves they disappear only with the exact root close. The nearest checked non-law is that every completed outer Multi-Instance User Task is retention-eligible: actual sibling-canceling early completion is `Completed` control behavior but fails Clause 13.3.7's all-instances-success condition.

## Lean assurance lane

Lane shape: **proved** for the representation and eligibility propositions in the first checkpoint.

Lean defines the same declaration, target validation, completion facts, classifier, record/register, exact canonical-byte measure, insertion result, start initialization, root disposal, and exact ordinary and current Multi-Instance producer wrappers. The evaluator has a declarative relation and constructor-selection soundness bridge for the retention transition, while kernel-decided integration witnesses close the producer matrix without claiming source or host behavior.

Required laws prove handler-free, excluded-operation, actual early-completion, interrupted, malformed-count, duplicate, count, and byte refusal preserve exact state; successful insertion adds exactly one unique outer identity at the prior ordinal while preserving earlier records; Multi-Instance User Task completion is eligible exactly under non-negative planned/success equality, including zero and the one-item-first case; zero entry issues one fresh outer identity without an inner identity; program-aware not-started normalization is observationally omitted; start creates the declared root register; and close removes exactly the matching register while preserving unrelated state.

If Lean cannot match the canonical encoder for the admitted identity strings, the proposal returns to review; implementation may not substitute an escape-blind or caller-supplied measure. Trigger selection, handler execution, dependency order, liveness, TypeScript equivalence, and Temporal refinement are not implied.

## Internal operation-family classification

Current independent internal frontiers contain arming and entry operations, not external Activity completion commands. Start and scope close own register creation/disposal outside those frontiers. The sequential and parallel zero-item preparations preflight retention and advertise the exact Activity-activation and owner-keyed register atoms, so entries sharing that owner conflict; Multi-Instance batching remains disabled.

A future internal Activity completion or batch of two external completions in one scope must reopen the footprint account: the shared ordinal/register is a write conflict even when Activity identities differ.

## CIB Seven relationship boundary

This standards-only hidden representation selects no CIB behavior, probe, profile rule, or relationship identifier. No source shape is admitted and no target runner can observe the register.

## Temporal hosting and refinement preflight

The first checkpoint adds no ingress, wait, timer, Activity effect, cancellation action, Query, Signal, Update, public projection, or host scheduler. The production Workflow main loop remains the only committed-state owner. Ordering comes from the semantic ordinal, never Workflow Task order, Event History, Run identity, or Worker timing.

The refinement relation pairs live host state with the byte-identical latest committed core `RuntimeState`. Workflow Tasks, Worker replacement, retries, Timer bookkeeping, recovery, and other hidden steps stutter on it; Continue-As-New changes only the Run-local envelope. Publication, recovery, Event History, Workflow/Run identity, and host-capacity records are erased and cannot derive eligibility.

Retention count/byte overflow is core `CommandOutcome.Rejected` with exact pre-state and no candidate publication. A passing successor may still exceed the complete-state ceiling: existing `WorkflowSemanticCandidatePreflightKind.CapacityExceeded` for `CommittedRuntimeStateBytes` preserves the prior committed state and remains a host result, never semantic rejection.

Continuation validation must bind field presence to the Program declaration and preserve the register byte-for-byte across Continue-As-New. Continue-As-New cannot dispose or compact it. The existing committed-state and aggregate continuation bounds remain independent. Worker replacement and replay recover the register only from committed Workflow state.

The smallest later host witness keeps the Process open after zero-item and positive eligible completions, forces Continue-As-New and Worker replacement, confirms the unchanged test-private register, completes the root, and replays every Run. Exact retry of an already accepted closing command still recovers its semantic result; a distinct command first addressed after close returns the existing adapter `processClosed` result and never reaches the disposed core register. Required mutations omit or change identity/ordinal, retain an actually early-completed or interrupted Multi-Instance User Task, alter state in one hidden host step, convert one capacity class into the other, or dispose before root close. No live host claim is made before source/profile admission and that dedicated refinement witness.

## Evidence strategy

| Claim | Lean | TypeScript core | Temporal | Discriminator |
|---|---|---|---|---|
| Explicit handler eligibility | Target validation and refusal law | Strict declaration and classifier | Carried only | Handler-free Activity mutation |
| Ordinary `awaitUserTask` identity | Insertion, uniqueness, closed-family law, and exact producer witness | Pure insertion, exact-operation validation, and pre-mutation producer | Carried only | Repeated activation, duplicate identity, and excluded-operation mutations |
| Multi-Instance User Task all-success | Exact zero/one/many classifier, identity laws, and producer matrix | Exact sequential/parallel producers and zero-entry footprints | Carried only | Missing zero identity, one-item-first, first-inner, sibling-cancel, and Timer mutations |
| Chronology | Insertion preservation laws | Adversarial completion order | Carried only | Sort by element or reuse `records.length` |
| Atomic capacity | Count/byte refusal laws | Exact fit/overflow and whole-state equality | Complete-state bound remains separate | Any pre-refusal mutation |
| Root lifetime | Start/close frame laws | Quiescence and disposal tests | Continuation and `processClosed` witness later | Premature or missing disposal |
| Old-byte compatibility | Omitted declaration and not-started normalization fixture | Schema and exact artifact bytes | Existing history replay later | Emitted empty field under old Program |

The representation checkpoint covers strict shared and Lean Program wires, closed exact-operation validation, state validation, pure eligibility/insertion, zero/one/many and exact-byte fixtures, program-aware not-started normalization, start/close lifecycle, internal-commutation census, collection-removal completeness, and the complete affected semantic-core package gate. The producer slice additionally covers exact ordinary, sequential, and parallel completion/interruption integration, zero-item issuance, capacity-before-mutation, excluded-operation/omitted-declaration compatibility, and owner-keyed zero-entry footprints. Neither slice claims source, scenario, CIB, differential, Temporal, corpus, Product 2, or public capability evidence.

## Runtime-only inventory and layer ownership

| Construct | Derivation and owner | Public projection | Lifecycle |
|---|---|---|---|
| Boundary-handler target | Program definition; later compiler must resolve attachment and Association | None | Immutable and root-scoped |
| Completion facts | Derived from the exact ordinary wait, positive MI controller, or zero-item entry pre-state and transition | None | Ephemeral evaluator input only |
| Completed outer record | Exact eligible `ActivityOccurrenceId` plus ordinal | None | Immutable until root close or later handler consumption |
| Retention register | Runtime state owned by root scope occurrence | None | Start, carry, quiescence-ignore, normal-close disposal |
| Capacity detail | Pure insertion result | Existing semantic rejection only | Never retained |

The BPMN/profile layer owns handler eligibility and limits. Lean owns the formal hidden-state account; TypeScript independently realizes it. Temporal carries and bounds committed state without deriving compensation facts. Publication and Product 2 own nothing here.

## Versioning consequences

This is a pre-release additive Program/RuntimeState representation. No current profile emits it, so existing source, checked graphs, Programs, states, commands, observations, and scenario bytes remain unchanged. The checkpoint changes strict Program readers and state validators but no BPMN XML compiler.

The `what-binds` inventory requires [contract schema coverage](../../scripts/contract-schema-coverage.test.ts), [contract definition artifacts](../../scripts/contract-definition-artifacts.test.ts), [internal commutation census](../../scripts/internal-commutation-census.test.ts), [runtime collection-removal completeness](../../scripts/runtime-collection-removal-completeness.test.ts), [source hygiene](../../scripts/source-hygiene.test.ts), and [document reviewability](../../scripts/document-reviewability.test.ts).

Source owners are [the TypeScript Program contract](../../packages/semantic-core/src/semantic-process-contract.ts), [TypeScript RuntimeState](../../packages/semantic-core/src/semantic-process-state.ts), [TypeScript well-formedness](../../packages/semantic-core/src/runtime-state-well-formedness.ts), [TypeScript scope runtime](../../packages/semantic-core/src/semantic-process-scope-runtime.ts), [TypeScript command admission](../../packages/semantic-core/src/semantic-command-admission.ts), [TypeScript triggered start](../../packages/semantic-core/src/semantic-process-triggered-start.ts), [the Program schema](../../contracts/schemas/semantic-process.schema.json), [the Lean Program contract](../../BpmnSemantics/SemanticProcessContract.lean), [Lean RuntimeState](../../BpmnSemantics/SemanticProcess/RuntimeState.lean), [Lean well-formedness](../../BpmnSemantics/SemanticProcess/RuntimeStateWellFormed.lean), [Lean scope completion](../../BpmnSemantics/SemanticProcess/ScopeCompletion.lean), and [the strict Lean Program decoder](../../BpmnSemantics/SemanticProcessJson/Program.lean). Producer integration is owned by the focused [TypeScript staging helper](../../packages/semantic-core/src/compensation-activity-retention-producers.ts), the existing ordinary and Multi-Instance runtimes, [the Lean producer layer](../../BpmnSemantics/SemanticProcess/CompensationActivityRetentionProducers.lean), and their independent executable matrices.

### Owners this implementation grows

The 800-nonblank-line soft target is the extraction threshold and 1,200 lines the hard ceiling. Headroom is mechanically rechecked. New contracts, classifier, validation, byte measure, and proofs belong in focused modules registered by [the semantic-core source map](../../packages/semantic-core/SOURCE-MAP.md), [package guide](../../packages/semantic-core/README.md), and Lean module graph.

| Owner | Current headroom | Structural condition |
|---|---:|---|
| [TypeScript Program contract](../../packages/semantic-core/src/semantic-process-contract.ts) | 197 | add only the optional declaration reference; extract before crossing 800 |
| [TypeScript RuntimeState](../../packages/semantic-core/src/semantic-process-state.ts) | 363 | add only the optional collection reference; new types live elsewhere |
| [TypeScript well-formedness](../../packages/semantic-core/src/runtime-state-well-formedness.ts) | 51 | add one delegated validator hook; extract before crossing 800 |
| [TypeScript scope runtime](../../packages/semantic-core/src/semantic-process-scope-runtime.ts) | 556 | route normal root disposal only |
| [TypeScript called-Process runtime](../../packages/semantic-core/src/semantic-process-call-runtime.ts) | 378 | remove owner-keyed records with a called-instance subtree even though declaring Programs exclude Call operations |
| [TypeScript scope cancellation](../../packages/semantic-core/src/semantic-process-scope-cancellation.ts) | 584 | remove owner-keyed records with a cancelled region even though declaring Programs exclude cancellation |
| [TypeScript command admission](../../packages/semantic-core/src/semantic-command-admission.ts) | 380 | no producer integration at the first checkpoint |
| [TypeScript triggered start](../../packages/semantic-core/src/semantic-process-triggered-start.ts) | 583 | initialize root-owned retention state before any start mutation |
| [Lean Program contract](../../BpmnSemantics/SemanticProcessContract.lean) | 54 | add the optional declaration reference; extract before crossing 800 |
| [Lean RuntimeState](../../BpmnSemantics/SemanticProcess/RuntimeState.lean) | 110 | add only the collection reference and its root-owned invariant; new structures live elsewhere |
| [Lean well-formedness](../../BpmnSemantics/SemanticProcess/RuntimeStateWellFormed.lean) | 98 | add one delegated predicate; extract before crossing 800 |
| [Lean scope completion](../../BpmnSemantics/SemanticProcess/ScopeCompletion.lean) | 694 | add exact register disposal and update its frame theorem |
| [Strict Lean Program decoder](../../BpmnSemantics/SemanticProcessJson/Program.lean) | 102 | delegate the optional field to a focused decoder; extract before crossing 800 |
| [Lean internal-commutation runtime preservation](../../BpmnSemantics/SemanticProcess/InternalCommutationRuntimePreservation.lean) | 16 | prove the new aggregate invariant conjunct is framed; any further growth extracts the compensation frame proof |
| [Lean message-key correlation preservation](../../BpmnSemantics/SemanticProcess/MessageKeyCorrelationPreservation.lean) | 360 | reconstruct the strengthened aggregate invariant while framing the compensation register exactly |
| [Lean message-payload preservation](../../BpmnSemantics/SemanticProcess/MessagePayloadPreservation.lean) | 463 | reconstruct the strengthened aggregate invariant while framing the compensation register exactly |
| [Lean Activity-body turnover preservation](../../BpmnSemantics/SemanticProcess/ActivityBodyTurnoverPreservation.lean) | 589 | preserve compensation validity and destructure lifecycle facts by name rather than positional projection |
| [Lean Activity issuing conformance](../../BpmnSemantics/ActivityIssuingDisciplineConformance.lean) | 578 | keep the exact root-completion witness synchronized with owner-keyed register disposal |
| [Lean parallel Multi-Instance entry preservation](../../BpmnSemantics/SemanticProcess/ParallelMultiInstanceRuntimeStateEntryPreservation.lean) | 12 | frame the compensation register through entry after extracting its order fact |
| [Lean parallel Multi-Instance closing selection](../../BpmnSemantics/SemanticProcess/ParallelMultiInstanceRuntimeStateClosingSelection.lean) | 202 | destructure the strengthened aggregate invariant before applying Activity-body uniqueness |
| [Lean internal-commutation publication](../../BpmnSemantics/SemanticProcess/InternalCommutationPublication.lean) | 481 | name both final aggregate facts while projecting the existing publication prerequisites |
| [Lean parallel Multi-Instance empty-state preservation](../../BpmnSemantics/SemanticProcess/ParallelMultiInstanceRuntimeStateEmptyPreservation.lean) | 711 | carry both final aggregate facts through the unchanged empty-state result |
| [Lean parallel Multi-Instance closing progress preservation](../../BpmnSemantics/SemanticProcess/ParallelMultiInstanceRuntimeStateClosingProgressPreservation.lean) | 247 | frame the compensation register through non-terminal closing progress |
| [Lean parallel Multi-Instance closing terminal preservation](../../BpmnSemantics/SemanticProcess/ParallelMultiInstanceRuntimeStateClosingTerminalPreservation.lean) | 23 | frame the compensation register through terminal child closing; any further growth should extract the frame proof |

No size exception is requested. Representation owners are `packages/semantic-core/src/compensation-activity-retention-contract.ts`, `packages/semantic-core/src/compensation-activity-retention.ts`, `packages/semantic-core/src/compensation-activity-retention-state-validation.ts`, `packages/semantic-core/test/compensation-activity-retention-fixtures.ts`, `packages/semantic-core/test/compensation-activity-retention.test.ts`, `BpmnSemantics/SemanticProcess/CompensationActivityRetentionDeclaration.lean`, `BpmnSemantics/SemanticProcess/CompensationActivityRetention.lean`, `BpmnSemantics/SemanticProcessJson/CompensationActivityRetention.lean`, and `BpmnSemantics/CompensationActivityRetentionConformance.lean`. The producer slice adds `packages/semantic-core/src/compensation-activity-retention-producers.ts`, `packages/semantic-core/test/compensation-activity-retention-producers.test.ts`, `BpmnSemantics/SemanticProcess/CompensationActivityRetentionProducers.lean`, and `BpmnSemantics/CompensationActivityRetentionProducerConformance.lean`. Declaration validation stays separate so aggregate Program admission can depend on it without a Program-to-runtime import cycle; the Lean producer layer accepts the ordinary legacy transition as a parameter to avoid reversing that dependency. Reusable fixture construction keeps behavior owners below the ordinary review threshold. Another exhaustive RuntimeState consumer joined the checkpoint without a default arm.

Same-change owners are this capsule, [the requirement ledger](../BPMN-REQUIREMENT-LEDGER.md), [Semantic Process IL](../SEMANTIC-PROCESS-IL-SPEC.md), routed detail maps, package registries, [PLAN](../PLAN.md), and the review receipt. No durable history is emitted at this checkpoint; the later profile/host slice must add its pre-release history boundary before deployment.

## Epistemic closure and reopen conditions

Established: handlers decide eligibility; scope decides visibility/lifetime; the admitted Multi-Instance User Task handler triggers once after all-success, including zero and one-item-first; chronology is not dependency order; retention charges committed-state capacity and survives Continue-As-New.

Established at the approved semantic checkpoint: the representation is implemented in strict shared and Lean Program readers, independently written Lean and TypeScript declaration/state validation and pure retention accounts, root-register lifecycle, exact capacity and adversarial conformance tests, and the internal-commutation census. The context-cold reviewer required aggregate running-root validation and validation-before-nonretention precedence; correction target `2532ebda` supplied both, and the same reviewer approved audit target `246d3a78`. The following producer slice now derives exact ordinary and current sequential/parallel Multi-Instance completion facts, stages capacity refusal before existing mutation, issues zero-item outer identity, excludes actual early/interrupted outcomes, preserves omitted/non-target behavior, and records the zero-entry commutation footprint. Not established: source handler admission, Compensation Event Sub-Process snapshots, throw selection, handler execution, order, cancellation, Transactions, CIB agreement, Temporal refinement, public capability, or closure evidence.

Common-mode risks are global-throw-derived eligibility and treating every `completionPolicy="first"` alike; explicit targets and zero/one/many mutations separate them. The nearest unsupported claim is Multi-Instance Sub-Process compensation: Clause 10.7.2 needs a multiplicity account, while its Compensation Event Sub-Process also needs provisional complete per-instance parent snapshots and exact purge on failed, early, or interrupted completion.

Reopen before another handler per Activity, Event Sub-Process, standard loops, nested scopes, source profile, throw/trigger, record consumption, root cancellation, or a string identity arm without exact canonical-byte coverage.

## Closure cost

No closure cost is claimed at proposal time. Closure must measure one immutable range with [`capsule-cost.ts`](../../scripts/capsule-cost.ts), compare the representation/proof slice with the nearest RuntimeState increment, and report producer, source/profile, handler, Temporal, and evidence slices separately.

## Stage boundary

The first green representation checkpoint contains optional Program/RuntimeState contracts, strict readers, exact three-operation handler-target and completion-fact validation, pure all-success classifier, insertion/capacity, program-aware not-started normalization, start/normal-close lifecycle, old-byte compatibility, exact ordinary and zero/one/many MI/interruption witnesses, and the proved Lean laws. It intentionally contained no existing completion producer, source profile, throw, handler, snapshot, host behavior, public capability, scenario, corpus, or Product 2 claim.

That mandatory semantic checkpoint was approved before implementation continued. The next producer slice now enumerates the exact `awaitUserTask`, sequential, and parallel completion/interruption paths; mints the zero-item outer identity before atomic completion; reproduces excluded-operation and omitted-family mutations; and proves retention is staged before every existing completion mutation. Compensation Event Sub-Process parent-scope snapshots are the immediately following risk band, before handler ordering or capability closure.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `15acd871` | `fork-turns-none` | `approve-with-required-edits` | `9f4e535b` |
| Semantic checkpoint | `df895efc` | `fork-turns-none` | `approve-with-required-edits` | `246d3a78` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
