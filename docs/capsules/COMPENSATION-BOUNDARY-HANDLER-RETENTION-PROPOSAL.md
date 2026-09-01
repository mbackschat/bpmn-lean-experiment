# Compensation boundary-handler retention proposal

## Status

Lifecycle: draft
Review: pending

## Prior review

The first immutable proposal target `033a7552` received a context-cold `rejected` verdict. It incorrectly made every completed Activity retention-eligible from the global throw form despite Tables 10.88 and 10.89 requiring a compensation handler, retained one record per inner Multi-Instance instance without resolving early completion or interruption, and treated ordinary Task input/output bindings as the parent-scope snapshot restored for a Compensation Event Sub-Process. This target replaces that account: explicit boundary handlers decide eligibility, one all-success outer Multi-Instance User Task completion creates one record, and Compensation Event Sub-Process snapshots move to a separate immediately following risk band.

## Question and bounded outcome

What is the smallest standards-only hidden register that keeps an explicitly boundary-handler-eligible Activity available for a later targeted or global Compensation throw until its owning scope closes, while distinguishing successful ordinary completion from Multi-Instance early completion or interruption and refusing bounded growth before mutation?

This proposal selects only eligibility, outer Activity identity, completion chronology, capacity, and root-scope lifetime for an associated boundary Compensation Activity. It selects no Compensation Event Sub-Process, snapshot restoration, throw Event, handler execution, dependency order, Transaction, Cancel Event, CIB behavior, public command, source profile, or Temporal effect.

The reviewed requirement is `BPMN-COMPENSATION-ACTIVITY-RETENTION-01`. It and `BPMN-MECH-COMPENSATION-01` remain `unsupported` until the approved semantic checkpoint is implemented. Even then, the broad mechanism remains unsupported because triggering, handler execution, Event Sub-Process snapshots, ordering, cancellation, and Transactions stay open.

## Normative account and selected interpretation

BPMN 2.0.2 Tables 10.88 and 10.89 say a successfully completed Activity can be compensated only if it has a boundary Compensation Event or contains a Compensation Event Sub-Process. Optional `CompensateEventDefinition.activityRef` selects one visible eligible Activity when present; when absent, the global form selects all visible successfully completed eligible Activities. It does not make a handler-free Activity eligible.

Clause 13.5.5 distinguishes the two handler families. An associated boundary Compensation Activity becomes enabled when its Activity completes and is triggered once for a loop or Multi-Instance Activity. A Compensation Event Sub-Process instead restores its Process/Sub-Process parent's completion-time context and can require one snapshot per loop or Multi-Instance parent instance. This proposal selects only the first family and therefore retains no generic Task-data snapshot.

Clause 13.3.7 states that a Multi-Instance Activity is compensated only if all its instances complete successfully. A `completionCondition` may complete the outer Activity after canceling remaining instances, and an interrupting boundary Timer may cancel the outer Activity. Neither path is retention-eligible. For the admitted sequential and parallel Multi-Instance User Tasks, natural completion after every planned instance succeeds creates one outer record, because Clause 13.5.5 triggers the associated handler once for that Multi-Instance Activity rather than once per inner instance.

Clause 10.7.2 separately says that a boundary compensation handler on a Multi-Instance Sub-Process is invoked once for each Sub-Process instance, while Clause 13.5.5 says that an associated Compensation Activity for a Multi-Instance Activity is triggered only once. This proposal does not silently choose between those texts for Multi-Instance Sub-Processes: it excludes that host family and admits only the already implemented sequential and parallel Multi-Instance User Tasks. Supporting a Multi-Instance Sub-Process requires a reviewed account for its handler multiplicity together with its per-instance parent-scope snapshots.

The machine-readable anchors are `CompensateEventDefinition.activityRef`, `BoundaryEvent.attachedToRef`, `Association.sourceRef`/`targetRef`, `Activity.isForCompensation`, and `MultiInstanceLoopCharacteristics`, with their corresponding XSD declarations. The prose-only `SubProcess.compensable` inconsistency in [BPMN21-167](https://issues.omg.org/issues/BPMN21-167), implicit-compensation contradiction in [BPMN21-403](https://issues.omg.org/issues/BPMN21-403), and cancellation terminology in [BPMN21-404](https://issues.omg.org/issues/BPMN21-404) are excluded rather than resolved.

## Required, optional, and excluded scope

**Required representation:** one optional Program declaration selecting one flat root definition scope and at least one explicit boundary-handler target; one runtime register owned by that live root occurrence; one immutable record per successfully completed eligible outer Activity occurrence; positive contiguous chronology; canonical order; exact normal scope-close disposal; and count plus canonical-byte refusal before any completion mutation.

**Required completion families:** an ordinary single Activity, a sequential Multi-Instance User Task, and a parallel Multi-Instance User Task. The first checkpoint represents and classifies all three. The later producer slice must prove that natural all-success Multi-Instance User Task completion retains once, `completionPolicy="first"` retains nothing, and interrupting Activity Timer completion paths retain nothing.

**Required forward-compatible boundary:** a declaring Program has exactly one parentless definition scope, no nested definition scope, called Process, `terminateScope` operation, or profile-enabled root cancellation. Every handler target belongs to that root scope and names one supported Activity family. This prevents an excluded terminal path from bypassing normal register disposal.

**Optional:** the Program declaration and RuntimeState collection are optional at the shared wire boundary. Programs without the declaration require absence. Declaring Programs require the state collection, including an empty array before start and after normal root completion.

**Excluded:** Compensation Event Sub-Processes and parent-scope snapshots; Multi-Instance Sub-Processes and their handler-multiplicity account; handler-free or implicit eligibility; more than one compensation handler per Activity; source admission; registered profiles; throw Events; `activityRef`; `waitForCompletion`; handler execution or failure; dependency ordering; recursive compensation; standard loops; nested or called scopes; root termination/cancellation; Transaction and Cancel semantics; public projection; CIB compatibility; Product 2; and live Temporal hosting.

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

`definitionScopeId` resolves to the unique parentless scope whose origin equals `processId`. Targets are non-empty, canonically ordered by complete three-part identity, and unique by `activityElementId`. Each element id is non-empty and distinct within a target. `activityElementId` must be the origin of exactly one supported Activity family in the declared scope: an admitted single Activity or an admitted sequential/parallel Multi-Instance User Task, never a Sub-Process. At this representation checkpoint the declaration is a proposal-defined semantic Program fact; its validator proves internal shape and Activity-family consistency, not provenance from arbitrary BPMN XML. Later source admission may emit a target only after resolving the boundary Event attachment and the Association to one `isForCompensation=true` Activity.

Both limits are positive safe integers. `maxCanonicalBytes` cannot exceed 65,536, but a profile must select a lower value when other maximum state components need headroom. The existing 65,536-byte complete-`RuntimeState` host bound remains an independent secondary check.

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

The existing `ActivityOccurrenceId` distinguishes element, Process instance, and repeated outer activation. It deliberately has no inner index: for an admitted Multi-Instance User Task, Clause 13.5.5 enables and later triggers the associated Compensation Activity once for the completed outer Activity. Equal input values, completion order, task activations, Workflow identity, and host attempts have no retention identity authority. This identity choice makes no claim about the excluded per-instance behavior that Clause 10.7.2 assigns to Multi-Instance Sub-Processes.

`nextCompletionOrdinal` starts at one and advances exactly once per accepted outer record. It is independent of `records.length` so later handler consumption cannot reuse chronology. At this checkpoint, records are ascending with ordinals exactly `1 .. nextCompletionOrdinal - 1`.

## Completion eligibility

A pure closed classifier receives facts derived from one selected Activity completion, never caller assertions:

```ts
type CompensationCompletionFacts =
  | DeepReadonly<{
      kind: "single";
      activity: ActivityOccurrenceId;
      outcome: "completed" | "interrupted";
    }>
  | DeepReadonly<{
      kind: "multiInstance";
      activity: ActivityOccurrenceId;
      plannedInstances: number;
      successfullyCompletedInstances: number;
      outcome: "naturalCompletion" | "earlyCompletion" | "interrupted";
    }>;
```

The selector returns the outer identity only when its element is one declared target and either the single outcome is `completed`, or the Multi-Instance outcome is `naturalCompletion` with equal positive planned and successful counts. Early completion, interruption, missing target, malformed counts, wrong scope, duplicate identity, and a second record for one outer occurrence are refused with exact pre-state preservation.

The facts are an internal evaluator boundary, not a new wire or stored structure. The later producer slice derives them from the exact pre-state and selected transition: current sequential and parallel controllers own planned/success counts, the completion policy distinguishes natural from early completion, and boundary victory distinguishes interruption. No producer may construct a successful summary after it has discarded the deciding controller.

## Retention transition, capacity, and refusal

Insertion stages the selected outer identity with `completionOrdinal = nextCompletionOrdinal`, appends it to ordinal order, and computes prospective record count and canonical bytes. The byte measure is the UTF-8 length of the exact canonical JSON encoding of the prospective `records` array, including identity, ordinal, keys, punctuation, and JSON escaping. Object keys use Unicode scalar-value order; arrays retain declared order. No stored or caller-supplied size fact is authoritative.

Count or byte overflow returns a typed private refusal naming the measure, configured bound, and observed value. The enclosing completion maps it to semantic rejection before changing tokens, waits, Activity records, controllers, variables, activation counters, execution publication, or flow-node publication. The existing complete-state host check then remains separately able to refuse a candidate because unrelated state also consumes bytes.

## Lifetime, global visibility, and scope close

The first successful start creates one empty register owned by the fresh root `ScopeOccurrenceId`. Records survive unrelated work and Continue-As-New while that root remains open. They do not keep the scope non-quiescent, enable a transition, or enter stable public observation.

Normal root `completeScope` removes the exact register atomically and leaves `compensationActivityRetentions: []`. The flat-root restriction makes all retained records visible to the future global form while the root is open. Later targeted/global triggering may select only records whose Program target exists; visibility and target selection do not alter handler-decided eligibility.

Record order is completion chronology only. Future default compensation must derive BPMN dependency order and may not use this total ordinal as a substitute when Activities were concurrent.

## Stable semantic rules and separating witnesses

`CBRET-ELIGIBLE-01`: only an Activity named by one explicit boundary-handler target can enter the register; global throw syntax does not widen eligibility.

`CBRET-SINGLE-01`: one successful eligible ordinary outer Activity creates one immutable identity record and one ordinal; interruption creates none.

`CBRET-MI-01`: one eligible sequential or parallel Multi-Instance User Task creates exactly one outer record only after all planned instances complete successfully; early completion and interruption create none.

`CBRET-ORDER-01`: accepted outer records receive positive contiguous never-reused completion ordinals and remain in ascending order; chronology is not dependency order.

`CBRET-CAPACITY-01`: duplicate, count, or exact canonical-byte refusal preserves the complete pre-state before any completion mutation.

`CBRET-LIFETIME-01`: records survive until normal close of their exact root occurrence; quiescence ignores them and close removes all and only that register.

`CBRET-COMPAT-01`: every Program without the declaration and every state under it omit the optional fields, preserving existing canonical bytes.

The eligibility discriminator uses two completed ordinary Activities in one root: one has a declared boundary handler and one does not. A later global throw can see only the retained declared target. A mutation that retains the handler-free Activity reproduces the first rejected proposal's error.

The Multi-Instance discriminator covers the admitted User Task families: sequential all-success, parallel all-success with adversarial completion order, parallel `completionPolicy="first"`, and both current interrupting Timer paths. The successful cases create one outer record each; early completion and interruption preserve the prior register. A mutation that inserts on the first inner success or on outer early completion must fail.

Capacity uses exact-fit and one-over count cases plus escaped/non-ASCII exact-fit and one-byte-over identity fixtures. Disposal holds records through unrelated work and then proves they disappear only with the exact root close. The nearest checked non-law is that every completed outer Multi-Instance User Task is retention-eligible: early completion is `Completed` control behavior but fails Clause 13.3.7's all-instances-success condition.

## Lean assurance lane

Lane shape: **proved** for the representation and eligibility propositions in the first checkpoint.

Lean defines the same declaration, target validation, completion facts, classifier, record/register, exact canonical-byte measure, insertion result, start initialization, and root disposal. The evaluator has a declarative relation and constructor-selection soundness bridge.

Required laws prove handler-free, early-completion, interrupted, duplicate, count, and byte refusal preserve exact state; successful insertion adds exactly one unique outer identity at the prior ordinal while preserving earlier records; natural Multi-Instance User Task completion is eligible exactly under positive planned/success equality; start creates the declared root register; and close removes exactly the matching register while preserving unrelated state.

If Lean cannot match the canonical encoder for the admitted identity strings, the proposal returns to review; implementation may not substitute an escape-blind or caller-supplied measure. Trigger selection, handler execution, dependency order, liveness, TypeScript equivalence, and Temporal refinement are not implied.

## Internal operation-family classification

Current independent internal frontiers contain arming operations, not Activity completion commands. Start and scope close own register creation/disposal outside those frontiers. The exhaustive RuntimeState census must classify the new field explicitly as absent from current eligible footprints.

A future internal Activity completion or batch of two external completions in one scope must reopen the footprint account: the shared ordinal/register is a write conflict even when Activity identities differ.

## CIB Seven relationship boundary

This standards-only hidden representation selects no CIB behavior, probe, profile rule, or relationship identifier. No source shape is admitted and no target runner can observe the register.

## Temporal hosting and refinement preflight

The first checkpoint adds no ingress, wait, timer, Activity effect, cancellation action, Query, Signal, Update, public projection, or host scheduler. The production Workflow main loop remains the only committed-state owner. Ordering comes from the semantic ordinal, never Workflow Task order, Event History, Run identity, or Worker timing.

Continuation validation must bind field presence to the Program declaration and preserve the register byte-for-byte across Continue-As-New. Continue-As-New cannot dispose or compact it. The existing committed-state and aggregate continuation bounds remain independent. Worker replacement and replay recover the register only from committed Workflow state.

The smallest later host witness keeps the Process open after two eligible completions, forces Continue-As-New and Worker replacement, confirms the unchanged test-private register, completes the root, and replays every Run. Required mutations omit or change identity/ordinal, retain an early-completed or interrupted Multi-Instance User Task, and dispose before root close. No live host claim is made before source/profile and producer integration.

## Evidence strategy

| Claim | Lean | TypeScript core | Temporal | Discriminator |
|---|---|---|---|---|
| Explicit handler eligibility | Target validation and refusal law | Strict declaration and classifier | Carried only | Handler-free Activity mutation |
| Ordinary outer identity | Insertion and uniqueness law | Pure insertion and state validation | Carried only | Repeated activation and duplicate identity |
| Multi-Instance User Task all-success | Exact classifier laws | Sequential/parallel facts and producer census later | Carried only | First-inner, early-completion, and Timer mutations |
| Chronology | Insertion preservation laws | Adversarial completion order | Carried only | Sort by element or reuse `records.length` |
| Atomic capacity | Count/byte refusal laws | Exact fit/overflow and whole-state equality | Complete-state bound remains separate | Any pre-refusal mutation |
| Root lifetime | Start/close frame laws | Quiescence and disposal tests | Continuation witness later | Premature or missing disposal |
| Old-byte compatibility | Omitted declaration fixture | Schema and exact artifact bytes | Existing history replay later | Emitted empty field under old Program |

The representation checkpoint covers strict shared and Lean Program wires, state validation, pure eligibility/insertion, exact byte fixtures, start/close lifecycle, internal-commutation census, collection-removal completeness, and the complete affected semantic-core package gate. It claims no source, scenario, CIB, differential, Temporal, corpus, Product 2, or public capability evidence.

## Runtime-only inventory and layer ownership

| Construct | Derivation and owner | Public projection | Lifecycle |
|---|---|---|---|
| Boundary-handler target | Program definition; later compiler must resolve attachment and Association | None | Immutable and root-scoped |
| Completion facts | Derived from exact selected pre-state and transition | None | Ephemeral evaluator input only |
| Completed outer record | Exact eligible `ActivityOccurrenceId` plus ordinal | None | Immutable until root close or later handler consumption |
| Retention register | Runtime state owned by root scope occurrence | None | Start, carry, quiescence-ignore, normal-close disposal |
| Capacity detail | Pure insertion result | Existing semantic rejection only | Never retained |

The BPMN/profile layer owns handler eligibility and limits. Lean owns the formal hidden-state account; TypeScript independently realizes it. Temporal carries and bounds committed state without deriving compensation facts. Publication and Product 2 own nothing here.

## Versioning consequences

This is a pre-release additive Program/RuntimeState representation. No current profile emits it, so existing source, checked graphs, Programs, states, commands, observations, and scenario bytes remain unchanged. The checkpoint changes strict Program readers and state validators but no BPMN XML compiler.

The `what-binds` inventory requires [contract schema coverage](../../scripts/contract-schema-coverage.test.ts), [contract definition artifacts](../../scripts/contract-definition-artifacts.test.ts), [internal commutation census](../../scripts/internal-commutation-census.test.ts), [runtime collection-removal completeness](../../scripts/runtime-collection-removal-completeness.test.ts), [source hygiene](../../scripts/source-hygiene.test.ts), and [document reviewability](../../scripts/document-reviewability.test.ts).

Source owners are [the TypeScript Program contract](../../packages/semantic-core/src/semantic-process-contract.ts), [TypeScript RuntimeState](../../packages/semantic-core/src/semantic-process-state.ts), [TypeScript well-formedness](../../packages/semantic-core/src/runtime-state-well-formedness.ts), [TypeScript scope runtime](../../packages/semantic-core/src/semantic-process-scope-runtime.ts), [TypeScript command admission](../../packages/semantic-core/src/semantic-command-admission.ts), [TypeScript triggered start](../../packages/semantic-core/src/semantic-process-triggered-start.ts), [the Program schema](../../contracts/schemas/semantic-process.schema.json), [the Lean Program contract](../../BpmnSemantics/SemanticProcessContract.lean), [Lean RuntimeState](../../BpmnSemantics/SemanticProcess/RuntimeState.lean), [Lean well-formedness](../../BpmnSemantics/SemanticProcess/RuntimeStateWellFormed.lean), [Lean scope completion](../../BpmnSemantics/SemanticProcess/ScopeCompletion.lean), and [the strict Lean Program decoder](../../BpmnSemantics/SemanticProcessJson/Program.lean).

### Owners this implementation grows

The 800-nonblank-line soft target is the extraction threshold and 1,200 lines the hard ceiling. Headroom is mechanically rechecked. New contracts, classifier, validation, byte measure, and proofs belong in focused modules registered by [the semantic-core source map](../../packages/semantic-core/SOURCE-MAP.md), [package guide](../../packages/semantic-core/README.md), and Lean module graph.

| Owner | Current headroom | Structural condition |
|---|---:|---|
| [TypeScript Program contract](../../packages/semantic-core/src/semantic-process-contract.ts) | 212 | add only the optional declaration reference; extract before crossing 800 |
| [TypeScript RuntimeState](../../packages/semantic-core/src/semantic-process-state.ts) | 384 | add only the optional collection reference; new types live elsewhere |
| [TypeScript well-formedness](../../packages/semantic-core/src/runtime-state-well-formedness.ts) | 116 | add one delegated validator hook; extract before crossing 800 |
| [TypeScript scope runtime](../../packages/semantic-core/src/semantic-process-scope-runtime.ts) | 564 | route normal root disposal only |
| [TypeScript command admission](../../packages/semantic-core/src/semantic-command-admission.ts) | 394 | no producer integration at the first checkpoint |
| [TypeScript triggered start](../../packages/semantic-core/src/semantic-process-triggered-start.ts) | 632 | initialize one root register only |
| [Lean Program contract](../../BpmnSemantics/SemanticProcessContract.lean) | 120 | add the optional declaration reference; extract before crossing 800 |
| [Lean RuntimeState](../../BpmnSemantics/SemanticProcess/RuntimeState.lean) | 234 | add only the collection reference; new structures live elsewhere |
| [Lean well-formedness](../../BpmnSemantics/SemanticProcess/RuntimeStateWellFormed.lean) | 104 | add one delegated predicate; extract before crossing 800 |
| [Lean scope completion](../../BpmnSemantics/SemanticProcess/ScopeCompletion.lean) | 697 | add exact register disposal and update its frame theorem |
| [Strict Lean Program decoder](../../BpmnSemantics/SemanticProcessJson/Program.lean) | 125 | delegate the optional field to a focused decoder; extract before crossing 800 |

No size exception is requested. New owners are `packages/semantic-core/src/compensation-activity-retention-contract.ts`, `packages/semantic-core/src/compensation-activity-retention.ts`, `packages/semantic-core/src/compensation-activity-retention-state-validation.ts`, `packages/semantic-core/test/compensation-activity-retention.test.ts`, `BpmnSemantics/SemanticProcess/CompensationActivityRetention.lean`, and `BpmnSemantics/CompensationActivityRetentionConformance.lean`. Another exhaustive RuntimeState consumer joins the same checkpoint without a default arm.

Same-change owners are this capsule, [the requirement ledger](../BPMN-REQUIREMENT-LEDGER.md), [Semantic Process IL](../SEMANTIC-PROCESS-IL-SPEC.md), routed detail maps, package registries, [PLAN](../PLAN.md), and the review receipt. No durable history is emitted at this checkpoint; the later profile/host slice must add its pre-release history boundary before deployment.

## Epistemic closure and reopen conditions

Established by the basis: handler existence decides eligibility; scope decides visibility and lifetime; an associated handler is enabled only by successful Activity completion; the admitted Multi-Instance User Task handler triggers once only after all instances succeed; chronology cannot replace dependency order; retention charges committed-state capacity; and Continue-As-New carries it.

Not established: approved representation, implementation, source handler admission, Compensation Event Sub-Process snapshots, throw selection, handler execution, order, cancellation, Transactions, CIB agreement, Temporal refinement, public capability, or closure evidence.

The main common-mode risk is deriving eligibility from global throw syntax; explicit targets and the handler-free mutation prevent it. The second is treating outer `Completed` as all-success under early completion; the outcome/count classifier and existing `completionPolicy="first"` path separate them. The nearest unsupported claim is compensation for a Multi-Instance Sub-Process: Clause 10.7.2 requires a separate handler-multiplicity account, and a Compensation Event Sub-Process additionally needs provisional complete parent-scope snapshots per instance plus exact purge on failed, early, or interrupted outer completion. Neither fits this boundary-handler record.

Reopen before another handler per Activity, Event Sub-Process, standard loops, nested scopes, source profile, throw/trigger, record consumption, root cancellation, or a string identity arm without exact canonical-byte coverage.

## Closure cost

No closure cost is claimed at proposal time. Closure must measure one immutable range with [`capsule-cost.ts`](../../scripts/capsule-cost.ts), compare the representation/proof slice with the nearest RuntimeState increment, and report producer, source/profile, handler, Temporal, and evidence slices separately.

## Stage boundary

The first green representation checkpoint contains optional Program/RuntimeState contracts, strict readers, exact handler-target and completion-fact validation, pure all-success classifier, insertion/capacity, start/normal-close lifecycle, old-byte compatibility, ordinary/natural-MI/early-MI/interruption witnesses, and the proved Lean laws. It includes no existing completion producer, source profile, throw, handler, snapshot, host behavior, public capability, scenario, corpus, or Product 2 claim.

That target is a mandatory semantic checkpoint. After approval, the next high-risk producer slice must enumerate every relevant ordinary, sequential, and parallel completion/interruption path, reproduce an omitted-family mutation, and prove retention is staged before every existing completion mutation. Compensation Event Sub-Process parent-scope snapshots remain the immediately following risk band, before handler ordering or capability closure.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `15acd871` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
