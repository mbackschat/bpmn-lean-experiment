# Activity host flow lists proposal

## Status

Lifecycle: draft
Review: pending

## Question and delivery boundary

Can the nested scope-data profile admit a User, Service or Send Task with several incoming Sequence Flows (implicit merge), by lowering exactly those Tasks to one new orthogonal Activity host operation appended beside the frozen legacy constructors, so that no admitted model's Program, state, command or publication changes?

This is the first family of Kernel IL orthogonalization in [PLAN](../PLAN.md#scheduled-delivery-batches) and the first stage of its Activity host. The parked [Activity implicit split and merge proposal](ACTIVITY-IMPLICIT-SPLIT-MERGE-PROPOSAL.md) owns the BPMN account and the CIB classification this family reuses; its representation, widening six existing constructors to lists, reached 264 Lean files and stopped on 67 `lean-fanout` violations (2026-11-05), and this proposal replaces it for merging Tasks. The selected clauses of the [coverage checklist](../PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list):

- `PC-CF-07`, its merge clause: one arriving token activates one occurrence rather than synchronizing the incoming flows, accepted for arrivals the admitted graph orders at User, Service and Send Tasks. The row stays open on its split clause, on Sub-Processes and Call Activities, concurrent arrivals, conditional and default outgoing flows, and called and Multi-Instance bodies.
- `PC-BASIC-02`, multiple sources to one target for arrivals the admitted graph orders, where the Link catch's successor is a Task in scope. The row stays open on concurrent sources and on other successors.

Close calls, 2026-11-06, each with its measured reason:

- **The split waits for the wait-record stage.** A split's completion must produce several tokens, so the User Task and effect wait records would have to carry an output list. Those records' `output` is read 313 times in 66 production Lean files and in about 19 TypeScript files, a reshaping of the same records PLAN's later "kind-keyed waits" stage reshapes; doing it here would do that stage's work early and twice. A merge needs no wait change: the host arrival opens the legacy wait with the single output. The split clause of `PC-CF-07` lands in that stage, which PLAN names.
- **`PC-BASIC-01` and the Sub-Process and Call forms wait for the scope host.** Their operations (`initiate`, `enterScope` with `completeScope`, `invokeProcess` with `returnProcess`) start a Process or come in entry and exit pairs, so their inputs and outputs live on different operations; their host shape is that family's decision, measured there. PLAN names it.

Reach, from the [AISM selection](ACTIVITY-IMPLICIT-SPLIT-MERGE-PROPOSAL.md#question-and-delivery-boundary): of the 1,864 deduplicated parsed CIB Seven test models, 17 files hold an Activity other than an Abstract or Manual Task with two or more incoming flows, 15 of them at a User or Service Task.

## Normative basis and CIB classification

The BPMN clauses (13.3.1 uncontrolled flow, 10.3 separate instances) and the CIB Seven source loci are those of the [AISM normative basis](ACTIVITY-IMPLICIT-SPLIT-MERGE-PROPOSAL.md#normative-basis-and-cib-classification), restricted to the merge at User, Service and Send Tasks. Register change: a new entry `CIB-AGR-0020 — a User, Service or Send Task starts one occurrence per arriving token`, a normative agreement bounded to this profile and these Tasks, naming `CIB-AGR-0019` (the pass-through instance) and `CIB-AGR-0018` (the Link continuation), added with its verifier coverage.

## Required, optional and excluded scope

Required, for the nested scope-data profile only: a User, Service or Send Task with two or more incoming flows and exactly one outgoing flow, in the root graph of the [re-entry account](SCOPE-REENTRY-SPEC.md#admission), wherever a pass-through merge is admitted ([`PTSM-ADMIT-01`](PASS-THROUGH-IMPLICIT-SPLIT-MERGE-SPEC.md#stable-rules)); and two or more Link throws of one name whose catch's successor is such a Task.

Optional: none.

Excluded, each refused at admission as today: several outgoing flows at any Task (the split); concurrent arrivals and a merge under a fork; several flows at a Sub-Process, Call Activity, None Start, Receive, Script or Rule Task, data-input, data-output, bounded or monitored User Task, Multi-Instance Activity or catch Event; several flows in called Processes and Multi-Instance bodies; a Service or Send Task with a BPMN Error route; every form under any other profile.

These bound admission only. The host already carries an `outputs` list, so the split broadens admission once the wait records carry outputs, and an Activity without outgoing flows becomes an empty list there; concurrent arrivals replace the unique-input selection by per-input alternatives. None reinterprets an admitted model.

## Profile and public contract

The profile `cibseven-2.2.0-nested-embedded-scope-data-draft` grows in place under the [cumulative profile rule](../../contracts/README.md). Its [profile artifact](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json) gains `CIB-AGR-0020`; its exclusion `implicit-activity-split-merge-outside-pass-through-tasks` and its Link several-throws exclusion narrow to the excluded forms above.

Observation adds nothing. A host step publishes the operation kind of its work, `awaitUserTask` or `awaitEffect`, so the [publication schema](../../contracts/schemas/semantic-publication.schema.json), the platform's closed `operationKind` decoding and every read model are unchanged: an arrival publishes the Task's ordinary occurrence and step.

## Representation and runtime ownership

**Host operation.** [`SemanticProcessContract`](../../BpmnSemantics/SemanticProcessContract.lean) appends one constructor after every existing one, and its TypeScript twin [`semantic-process-contract.ts`](../../packages/semantic-core/src/semantic-process-contract.ts) one union member:

```lean
inductive ActivityWork where
  | userTask (task : UserTaskDefinition)
  | effect (effect : EffectDefinition) (bpmnErrorRoute : Option BpmnErrorRoute)

structure ActivityHost where
  id : OperationId
  origin : BpmnElementOrigin
  inputs : List ControlPlaceId
  outputs : List ControlPlaceId
  work : ActivityWork

  -- appended last in `SemanticOperation`
  | activity (host : ActivityHost)
```

```ts
| (OperationBase & DeepReadonly<{
    kind: SemanticOperationKind.Activity;
    inputs: string[];
    outputs: string[];
    // `task`, `effect` and `bpmnErrorRoute` keep the exact shapes of the AwaitUserTask and AwaitEffect kinds.
    work:
      | { kind: "userTask"; task: Extract<SemanticOperation, { kind: SemanticOperationKind.AwaitUserTask }>["task"] }
      | { kind: "effect"; effect: Extract<SemanticOperation, { kind: SemanticOperationKind.AwaitEffect }>["effect"]; bpmnErrorRoute: BpmnErrorRoute | null };
  }>)
```

**Forward shape.** The host is one structure payload, not positional constructor arguments, because positional patterns are what made every widening of the legacy constructors expensive (87 of the 155 Lean files naming `awaitUserTask` match it positionally): a later feature is a new `ActivityHost` field with a default or a new `ActivityWork` alternative, and consumers read fields by name. Each planned feature has its place, none needing another constructor: the split is `outputs` beyond one place; an Activity without outgoing flows is an empty `outputs`; conditional and default outgoing flows are a separate field beside `outputs`; data mapping, the optional loop and typed boundary handlers are fields; Receive, Script and Rule Tasks are work alternatives; kind-keyed waits change the wait records, not the host; the scope-bearing kinds need a host exit for their separate completion operation, decided by the scope host family. Exhaustive dispatch over `ActivityWork` stays confined to the owners that implement a work kind's steps.

The TypeScript discriminant `Activity` and the Lean constructor `activity` keep the two operation vocabularies equal for the [consumer census](../../scripts/semantic-operation-consumer-census.test.ts), which requires a [family row](../INTERNAL-COMMUTATION-PROPOSAL.md) for the new kind: the ordinary wait-arming family, as for `awaitUserTask` and `awaitEffect`. The published kind is derived, never the discriminant: Lean `SemanticOperation.kind` ([`TransitionRecord`](../../BpmnSemantics/SemanticProcess/TransitionRecord.lean)) maps the host to its work's kind, and TypeScript derives it through one function of the same meaning used at every publication site.

Every legacy constructor stays byte-identical. Wait records and the durable continuation encoding do not change.

**Host Program rules.** `inputs` is nonempty, strictly sorted by control-place id and of length at least two; `outputs` is exactly one place in this family; every place exists; the work satisfies the rules of the legacy operation of its kind, and an effect's `bpmnErrorRoute` is `none` under this profile. [`ProgramStructuralValidation`](../../BpmnSemantics/SemanticProcess/ProgramStructuralValidation.lean) and its TypeScript twin refuse every other host, so a one-input host never doubles the legacy encoding of a Task.

**Steps.** A host arrival tries the legacy arrival of its work kind from each input and commits only when exactly one input yields a state. The serial re-entry admission of the [re-entry account](SCOPE-REENTRY-SPEC.md#admission) keeps one token in the root graph, so at most one input is ever marked and the not-prepared case is unreachable in admitted Programs; it is a refusal, never a choice. The opened wait is the legacy wait, so completion, footprint and continuation are the legacy ones. `OperationStep` gains one `activity` arm over the same arrival function.

**Lowering.** A User, Service or Send Task lowers to `activity` exactly when it has several incoming flows, through a new family-owned leaf (`ActivityHostLowering.lean` beside [`Lowering`](../../BpmnSemantics/SemanticProcess/Lowering.lean), whose dispatch into it must fit the owner's remaining headroom or move with it; `activity-host-lowering.ts` beside the [source lowering](../../packages/bpmn-source/src/semantic-process-lowering.ts)). Every one-incoming-flow Task keeps its legacy lowering. [`LinkContraction`](../../BpmnSemantics/SemanticProcess/LinkContraction.lean) and [`link-contraction.ts`](../../packages/bpmn-source/src/link-contraction.ts) admit several throws per catch under this profile when the catch's successor is a Task in scope.

**Retirement of the dual representation.** The host stage that gives the host data mapping, loop and boundary handlers (PLAN's "one switch") lowers every User, Service and Send Task onto `activity` and deletes their legacy lowering; until then no feature is added to `awaitUserTask` or `awaitEffect`. The scope-bearing kinds need a host exit for their separate completion operation; whether that is a work alternative with an exit operation or a second host operation is the scope host family's decision, not settled here.

**Measurements (capsule item 19), 2026-11-06.** Why not lower onto existing operations: a merge sharing the Task's origin publishes a step and a token position CIB lacks, as the [AISM alternatives](ACTIVITY-IMPLICIT-SPLIT-MERGE-PROPOSAL.md#representation-and-runtime-ownership) record. Blast radius of the shape above (the spike used positional arguments; a structure payload needs the same one arm per exhaustive site), from a spike on a throwaway clone (stored as git blob `e05c12a57a571d39fc1a84936c530a1866932d8c`):

| Measure | Result |
|---|---|
| Lean arms written by hand, in the closure of the 12 modules that match most operation constructors | 11 files, +64/−4 lines, 222 of 233 jobs built; the two remaining modules are the User Task and effect wait Program-validity proofs, which need an arrival-uniqueness lemma |
| Lean modules matching 20 or more operation constructors (static census) | 18, of which 7 lie outside the measured closure: [`Publication`](../../BpmnSemantics/SemanticProcessJson/Publication.lean), `TransitionRecord`, `FlowNodeOccurrenceLifecycle`, `Scenario`, `FlowNodeOccurrenceUserTaskProgramValidity`, `FlowNodeOccurrenceBoundaryStarts` and the experiment `CheckedSourceCorrespondence` |
| Lean production modules naming `awaitUserTask` or `awaitEffect` (the host-coverage census population) | 128 |
| TypeScript exhaustive operation switches broken | 12 files |
| TypeScript production files comparing to or casing on `AwaitUserTask` or `AwaitEffect` | 39 |
| TypeScript publication sites writing `operationKind` from an operation | 15 |
| `lean-fanout` and `source-hygiene` on the appended-constructor spike | pass |

Widening the legacy constructors instead touches `awaitUserTask` in 155 Lean files and `awaitEffect` in 116, most of them positional patterns.

## Admission

Admission stays [profile-parameterized](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md). The checked arity of User, Service and Send Tasks widens on the incoming side under this profile only, at both levels: Lean [`CheckedProcessAdmission`](../../BpmnSemantics/SemanticProcess/CheckedProcessAdmission.lean) and the TypeScript [checked graph admission](../../packages/bpmn-source/src/checked-process-graph-admission.ts). The merge predicates of [`CheckedPassThroughFlow`](../../BpmnSemantics/SemanticProcess/CheckedPassThroughFlow.lean) and [`checked-pass-through-flow.ts`](../../packages/semantic-core/src/checked-pass-through-flow.ts) widen to these Tasks, so the shape gate, routing, the merge refusal under a fork and the re-entry projection classify a merging Task as a merge. The Program-level analyses of [`NestedScopeDataAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeDataAdmission.lean), [`NestedScopeControlAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeControlAdmission.lean) and their TypeScript twins classify a host as the legacy operation of its work with several inputs, including every Service Task count such as the `CSE-ADMIT-01` bound.

The nearest wrong algorithms, each with a separating witness below: (1) arity widened at one level only; (2) for every profile; (3) a merge that waits for every incoming flow; (4) a lowering that keeps one input and strands the second arrival; (5) an extra step or position for the merge; (6) a merge that reuses the first arrival's occurrence; (7) a Program-level analysis that skips the host (a wildcard arm); (8) a host published under a kind the schema lacks.

## Stable rules

| Rule | Statement |
|---|---|
| `ACTH-ADMIT-01` | Under the nested scope-data profile, a User, Service or Send Task may have several incoming flows and one outgoing flow in the root graph of the re-entry account, at both levels alike; several Link throws of one name are admitted where their catch's successor is such a Task. |
| `ACTH-MERGE-01` | Each token arriving on any incoming flow starts one fresh occurrence in one step consuming that flow's token, with no step and no position for the merge. |
| `ACTH-ONE-01` | A Task with one incoming flow lowers to its legacy operation, so every admitted model's Program, states and publications stay byte-identical. |
| `ACTH-HOST-01` | A host has at least two sorted distinct inputs and one output, publishes its work's legacy kind, and opens exactly the legacy wait of its work from the arriving input; every other host Program is refused. |
| `ACTH-PROFILE-01` | Every other profile refuses each form it refuses today. |

## Newly reachable waits and resumption

None: a host arrival opens the existing User Task or effect wait with its single output, so completion, Continue-As-New and resumption are unchanged.

## Separating witnesses

One whole model with a source overlay and a mapped Service Task, as the [AISM claim review](ACTIVITY-IMPLICIT-SPLIT-MERGE-PROPOSAL.md#separating-witnesses) restricted to Tasks: User Task *Review claim* reached from the default path and from Service Task *Obtain expert opinion*, which a *Reopen?* Choice re-enters, so *Obtain expert opinion* merges too. Journeys: direct, expert, and direct reopened once, so *Review claim* has two occurrences (wrong algorithm 6). Twins: *Review claim* as a Service and a Send Task; a Link twin with two throws of one name.

Refused edits, each at both levels: a merging Task with two outgoing flows; arrivals from two Parallel branches; several incoming flows at a Sub-Process, a Call Activity and a Receive Task (still refused); a merging Service Task with a BPMN Error route; each model under the embedded completion profile.

Kernel witnesses: every existing scenario's Program is unchanged (`ACTH-ONE-01`); the expert journey publishes one internal record per arrival with kind `awaitUserTask` or `awaitEffect` (wrong algorithms 5, 8); a host with one input, with unsorted inputs, with two outputs and with an error route is refused, in both languages; a host with two marked inputs is not prepared, in both languages.

## Oracles this family changes

- The second-throw refusal of the [Link source test](../../packages/bpmn-source/test/link-events-source.test.ts) and the two-throws edit of [`LinkEventsConformance`](../../BpmnSemantics/LinkEventsConformance.lean): admitted when the successor is a Task in scope, the refusal re-attributed to other successors.
- The several-flow pins of the [capability catalog disclosures](../../scripts/capability-catalog-disclosures.test.ts): rewritten for the widened class.
- The family census of [internal commutation](../INTERNAL-COMMUTATION-PROPOSAL.md): one row for `activity`.
- The [pass-through implicit split and merge](PASS-THROUGH-IMPLICIT-SPLIT-MERGE-SPEC.md#required-optional-and-excluded-scope) exclusion of other Activity kinds and the [Link Events](LINK-EVENTS-SPEC.md#required-optional-and-excluded-scope) exclusion of several sources: narrowed, the owner passages amended at closure.

## Rule-to-evidence matrix

| Rule | Positive and negative witness | Lanes | Killing mutation |
|---|---|---|---|
| `ACTH-ADMIT-01` | The model and twins admitted at both levels; the refused edits per level | Source, core, Lean conformance checks, pipeline | Widen at one level only (1) |
| `ACTH-MERGE-01` | The claim journeys and the reopened journey's two occurrences | Core, pipeline across Lean, core and Temporal; CIB probe | A waiting merge (3), a one-input lowering (4) and deduplication (6), each a seeded pipeline mutation |
| `ACTH-ONE-01` | Every existing scenario of every profile, unchanged | Lean library, `BpmnConformance`, pipeline, differential, the frozen compiler baseline | A one-flow Task lowered to the host |
| `ACTH-HOST-01` | The refused host Programs and the published kinds | Lean conformance checks, core tests, the host-coverage census | A wildcard arm skipping the host (7); publishing `activity` (8) |
| `ACTH-PROFILE-01` | The model under the embedded completion profile | Source and Lean conformance checks | Widen for every profile (2) |

## Lean assurance lane

Lane shape: proved

Evidence: every existing theorem quantified over all operations is re-established for the host arm; the spike located the first instances (control places, wait declarations and their declarers, structural validity, cardinalities, step soundness) and the two wait Program-validity proofs, which gain one arrival-uniqueness lemma: a host arrival equals the legacy arrival from its unique yielding input. Host admission and lowering agreement is checked by a new conformance module beside [`PassThroughImplicitSplitMergeConformance`](../../BpmnSemantics/PassThroughImplicitSplitMergeConformance.lean). No new transition family: an arrival remains the step it is.

## Temporal hosting and refinement preflight

No new hosting mechanism. Ingress is the existing Start, effect result and User Task completion Update; waits are the legacy User Task and effect waits; no timer, cancellation or lifecycle transition is added. [Host admission](../../packages/temporal-adapter/protocol/src/host-admission.ts) admits a host exactly as the legacy operation of its work. The durable runtime state, the [Workflow continuation codec](../../packages/temporal-adapter/protocol/src/workflow-continuation.ts) and every Query and read model are unchanged, because the wait is the legacy wait and the published kind the legacy kind. The Program carries the new operation, a pre-release replacement of its producers and consumers under the [pre-release evolution policy](../PROJECT-DESIGN.md#pre-release-evolution-policy); the Start capacity envelope is byte-based and re-measured, not raised. The preserved relation stays equality of hosted committed state and publications with the core's. Smallest refinement witness: the hosted pipeline over every journey, plus one forced Continue-As-New while *Review claim*, reached through its second incoming flow, is pending.

## Evidence and acceptance

Answer-free scenarios with registered pipeline cases, each with a seeded mutation, value-domain matrix rows, corpus rows and the About disclosure. A CIB probe calibrates, per journey, one historic activity instance of the merging Task per arrival and none for the merge or a Link catch. Then `PC-CF-07`'s merge clause is accepted for ordered arrivals at User, Service and Send Tasks, and `PC-BASIC-02` for ordered multiple sources whose catch successor is such a Task.

## Versioning consequences

A Program wire change: the `activity` member in the [semantic process](../../contracts/README.md) schema, every producer, consumer, fixture and test replaced atomically under the [pre-release wire policy](../../contracts/README.md#evolution-policy). Runtime state, publications and the continuation codec are unchanged. No admitted model changes, by `ACTH-ONE-01`; previously refused models of this profile become admitted.

### Owners this implementation grows

Hubs touched, each because the closed-world representation lives there and no leaf can serve: [`SemanticProcessContract`](../../BpmnSemantics/SemanticProcessContract.lean), [`TransitionRecord`](../../BpmnSemantics/SemanticProcess/TransitionRecord.lean), [`OperationControlPlaces`](../../BpmnSemantics/SemanticProcess/OperationControlPlaces.lean), [`ProgramStructuralValidation`](../../BpmnSemantics/SemanticProcess/ProgramStructuralValidation.lean), [`RuntimeStateWellFormed`](../../BpmnSemantics/SemanticProcess/RuntimeStateWellFormed.lean), [`ProfileCardinalities`](../../BpmnSemantics/SemanticProcess/ProfileCardinalities.lean), [`Transition`](../../BpmnSemantics/SemanticProcess/Transition.lean), [`FlowNodeOccurrenceLifecycle`](../../BpmnSemantics/SemanticProcess/FlowNodeOccurrenceLifecycle.lean), [`FlowNodeOccurrenceUserTaskProgramValidity`](../../BpmnSemantics/SemanticProcess/FlowNodeOccurrenceUserTaskProgramValidity.lean), [`FlowNodeOccurrenceEffectProgramValidity`](../../BpmnSemantics/SemanticProcess/FlowNodeOccurrenceEffectProgramValidity.lean), the admission owners under [Admission](#admission), [`Lowering`](../../BpmnSemantics/SemanticProcess/Lowering.lean) for its dispatch; and in TypeScript the [contract](../../packages/semantic-core/src/semantic-process-contract.ts), the [runtime](../../packages/semantic-core/src/semantic-process-runtime.ts), the [profile shape](../../packages/semantic-core/src/semantic-program-profile-shape.ts), the [state](../../packages/semantic-core/src/semantic-process-state.ts), the [nested scope-data](../../packages/semantic-core/src/nested-scope-data-admission.ts) and [nested scope-control](../../packages/semantic-core/src/nested-scope-control-admission.ts) admissions, the publication owners [`internal-occurrence-batch.ts`](../../packages/semantic-core/src/internal-occurrence-batch.ts) and [`internal-operation-occurrence.ts`](../../packages/semantic-core/src/internal-operation-occurrence.ts), [host admission](../../packages/temporal-adapter/protocol/src/host-admission.ts) and its [publication program validation](../../packages/temporal-adapter/protocol/src/flow-node-occurrence-publication-program-validation.ts). Growth that would cross an owner's 800-line review target moves into a family-owned leaf before the edit, as the lowering does from the start; no size exception is requested.

Guards the implementation must satisfy, with bounds unchanged: [`lean-fanout`](../../scripts/lean-fanout.test.ts), [`lean-module-cost`](../../scripts/lean-module-cost.test.ts), [`source-hygiene`](../../scripts/source-hygiene.test.ts), [`semantic-operation-consumer-census`](../../scripts/semantic-operation-consumer-census.test.ts), [`internal-commutation-census`](../../scripts/internal-commutation-census.test.ts), [`call-forest-selection-census`](../../scripts/call-forest-selection-census.test.ts), [`activity-occurrence-writer-census`](../../scripts/activity-occurrence-writer-census.test.ts), [`execution-publication-contract-coverage`](../../scripts/execution-publication-contract-coverage.test.ts), [`runtime-collection-removal-completeness`](../../scripts/runtime-collection-removal-completeness.test.ts), [`lean-source-contracts`](../../scripts/lean-source-contracts.test.ts), [`lean-import-boundaries`](../../scripts/lean-import-boundaries.test.ts), [`pre-release-architecture`](../../scripts/pre-release-architecture.test.ts), [`contract-schema-coverage`](../../scripts/contract-schema-coverage.test.ts), [`effect-operation-artifact-consistency`](../../scripts/effect-operation-artifact-consistency.test.ts), the [frozen compiler baseline](../../packages/bpmn-source/test/cyclic-control-flow-preservation-support.ts) and the [Start capacity envelope test](../../packages/temporal-adapter/protocol/test/start-capacity-envelope.test.ts).

New guard, measured before the representation commit's review: a host-coverage census beside the [consumer census](../../scripts/semantic-operation-consumer-census.test.ts). Every production Lean and TypeScript site that names the `awaitUserTask` or `awaitEffect` constructor or kind also names the host, or appears on an allowlist with a one-line reason; every TypeScript publication site derives `operationKind` through the one function; and the declarations of `awaitUserTask` and `awaitEffect` stay byte-identical until the retirement stage. It closes the wildcard and `default:` absorption that compilation cannot see.

**Cost and split.** Two commits, each under its own [Rule 2](../../CLAUDE.md#rule-2-declare-review-and-check-every-bulk-change) declaration measured on a throwaway clone against every guard before review:

1. the representation: the host constructor and union member, its arms in every exhaustive consumer, the arrival-uniqueness lemma, the derived published kind, the host Program rules and the host-coverage census, with no lowering emitting a host, so every scenario is unchanged; extrapolated from the spike's heaviest units (the two proof modules), 6 to 8 hours including two whole-library rebuilds;
2. the widening: admission, host lowering, Link contraction, the Program-level analyses, witnesses and registration; estimated 4 to 6 hours.

PLAN's budget for the family is 12 hours; at its limit work stops at the first commit's stop point, which is green on its own, and PLAN records the boundary.

Registration: the register entry, the profile artifact and README, scenarios, pipeline cases, value-domain matrix, corpus, About, the CIB probe, and the [requirement ledger](../BPMN-REQUIREMENT-LEDGER.md) cell of `BPMN-MECH-FLOW-01`.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
