# Activity host flow lists proposal

## Status

Lifecycle: draft
Review: pending

## Question and delivery boundary

Can the nested scope-data profile admit a User, Service or Send Task with several incoming Sequence Flows (implicit merge) or several unconditioned outgoing Sequence Flows (implicit split), by lowering exactly those Tasks to one new orthogonal Activity host operation appended beside the frozen legacy constructors, so that no admitted model's Program, command or observation changes?

This is the first family of Kernel IL orthogonalization in [PLAN](../PLAN.md#scheduled-delivery-batches). The parked [Activity implicit split and merge proposal](ACTIVITY-IMPLICIT-SPLIT-MERGE-PROPOSAL.md) owns the BPMN account and the CIB classification this family reuses; its representation, widening six existing constructors to lists, reached 264 Lean files and stopped on 67 `lean-fanout` violations (2026-11-05), and this proposal replaces that representation for the Tasks in scope. The selected rows of the [coverage checklist](../PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list):

- `PC-CF-07`, primary: one arriving token activates one occurrence and completion takes every unconditioned outgoing flow, accepted for ordered arrivals and unconditioned outgoing flows at User, Service and Send Tasks. The row stays open on Sub-Processes, Call Activities, concurrent arrivals, conditional and default outgoing flows, and called and Multi-Instance bodies.
- `PC-BASIC-02`, multiple sources to one target for arrivals the admitted graph orders, where the Link catch's successor is a Task in scope. The row stays open on concurrent sources and on other successors.

Close call, 2026-11-06: `PC-BASIC-01` (several None Start flows) and the Sub-Process and Call forms of `PC-CF-07` share the BPMN account but not the mechanism. Their operations (`initiate`, `enterScope`, `completeScope`, `invokeProcess`) start, enter, leave or call a scope rather than wait, so they migrate in the next host family, with their own measurements. The wait-task host comes first because the reach counts of the [AISM selection](ACTIVITY-IMPLICIT-SPLIT-MERGE-PROPOSAL.md#question-and-delivery-boundary) put 15 of the 17 merging and 9 of the 11 splitting Activities at User or Service Tasks.

## Normative basis and CIB classification

The BPMN clauses (13.3.1 uncontrolled flow and parallel split, 10.3 separate instances) and the CIB Seven source loci are those of the [AISM normative basis](ACTIVITY-IMPLICIT-SPLIT-MERGE-PROPOSAL.md#normative-basis-and-cib-classification), restricted to User, Service and Send Tasks. Register change: a new entry `CIB-AGR-0020 — a User, Service or Send Task starts one occurrence per arriving token and its completion takes every unconditioned outgoing flow`, a normative agreement bounded to this profile and these Tasks, naming `CIB-AGR-0019` (the pass-through instance) and `CIB-AGR-0018` (the Link continuation), added with its verifier coverage.

## Required, optional and excluded scope

Required, for the nested scope-data profile only:

- **Implicit merge:** a User, Service or Send Task with two or more incoming flows, in the root graph of the [re-entry account](SCOPE-REENTRY-SPEC.md#admission), wherever a pass-through merge is admitted ([`PTSM-ADMIT-01`](PASS-THROUGH-IMPLICIT-SPLIT-MERGE-SPEC.md#stable-rules)); and two or more Link throws of one name whose catch's successor is such a Task.
- **Implicit split:** a User, Service or Send Task with two or more unconditioned, non-default outgoing flows, at the placements where `PTSM-ADMIT-01` admits a splitting pass-through node.

Optional: none.

Excluded, each refused at admission as today: a Task that both merges and splits; a conditioned or default outgoing flow of a Task; concurrent arrivals and a merge under a fork; several flows at a Sub-Process, Call Activity, None Start, Receive, Script or Rule Task, data-input, data-output, bounded or monitored User Task, Multi-Instance Activity or catch Event; several flows in called Processes and Multi-Instance bodies; every form under any other profile.

These bound admission only. The host's `inputs` and `outputs` lists are the representation the excluded Activity kinds migrate onto; a conditional or default outgoing flow becomes a separate field beside `outputs`; concurrent arrivals replace the unique-input selection by per-input alternatives. None reinterprets an admitted model.

## Profile and public contract

The profile `cibseven-2.2.0-nested-embedded-scope-data-draft` grows in place under the [cumulative profile rule](../../contracts/README.md). Its [profile artifact](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json) gains `CIB-AGR-0020`, and its exclusion `implicit-activity-split-merge-outside-pass-through-tasks` narrows to the excluded forms above. Observation adds nothing: an arrival publishes the Task's ordinary occurrence, a completion its ordinary step with one token per outgoing flow.

## Representation and runtime ownership

**Host operation.** [`SemanticProcessContract`](../../BpmnSemantics/SemanticProcessContract.lean) appends one constructor after every existing one, and its TypeScript twin [`semantic-process-contract.ts`](../../packages/semantic-core/src/semantic-process-contract.ts) one kind:

```lean
inductive ActivityWork where
  | userTask (task : UserTaskDefinition)
  | effect (effect : EffectDefinition) (bpmnErrorRoute : Option BpmnErrorRoute)

  -- appended last in `SemanticOperation`
  | activity (id : OperationId) (origin : BpmnElementOrigin)
      (inputs outputs : List ControlPlaceId) (work : ActivityWork)
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

Every legacy constructor stays byte-identical. The work payload carries exactly the fields of `awaitUserTask` and `awaitEffect` other than their places, so each later Activity feature (data mapping, loop, boundary handlers, the scope-bearing kinds) is a field or a work alternative of this one constructor, never another feature-combination constructor.

**Wait records.** [`RuntimeState`](../../BpmnSemantics/SemanticProcess/RuntimeState.lean) gives `UserTaskWait` and `EffectWait` one defaulted field, `extraOutputs : List ControlPlaceId := []`, and an accessor `outputs := output :: extraOutputs`; the TypeScript runtime twin and the runtime-state schema follow. A host arrival writes `output := outputs.head` and `extraOutputs := outputs.tail`; every legacy arrival leaves the default. Every read of a wait's output that produces a token, computes a footprint or checks Program validity moves to `outputs`, so a host completion cannot silently drop an output.

**Steps.** A host operation is prepared from its unique marked input: with exactly one input marked the arrival consumes that token and opens the wait exactly as the legacy arrival of its work kind does; with several marked it is not prepared, a state the profile's admission excludes (`rejectObservableChoice`). Completion puts a token on every element of `wait.outputs` in the one committed step it already is. `OperationStep` gains one `activity` arm per work kind, reusing the legacy arrival state functions over the selected input.

**Lowering.** A User, Service or Send Task lowers to `activity` exactly when it has several incoming or several outgoing flows, through a new family-owned leaf (`ActivityHostLowering.lean` beside [`Lowering`](../../BpmnSemantics/SemanticProcess/Lowering.lean), and `activity-host-lowering.ts` beside the [source lowering](../../packages/bpmn-source/src/semantic-process-lowering.ts)); every one-flow Task keeps its legacy lowering. [`LinkContraction`](../../BpmnSemantics/SemanticProcess/LinkContraction.lean) and [`link-contraction.ts`](../../packages/bpmn-source/src/link-contraction.ts) admit several throws per catch under this profile when the catch's successor is a Task in scope.

**Measurements (capsule item 19), 2026-11-06.** Why not lower onto existing operations: a merge or duplicate sharing the Task's origin publishes a step and a token position CIB lacks, as the [AISM alternatives](ACTIVITY-IMPLICIT-SPLIT-MERGE-PROPOSAL.md#representation-and-runtime-ownership) record. Blast radius:

| Change | Files naming it | Exhaustive consumers |
|---|---|---|
| `SemanticOperation.activity`, appended | none yet | Lean: a spike of the constructor alone, built through the closure of the 11 consumers that match every constructor, needed arms in 14 files (+40 lines, 4 of them proofs, 222 of 233 jobs reached); TypeScript: 12 exhaustive switch files |
| `extraOutputs` on both wait records | Lean 232, TypeScript 82 | none: a spike built the 310-job closure of eight wait consumers with no edit |
| Widening the legacy constructors instead (rejected) | `awaitUserTask` 155 Lean files, 87 of them positional; `awaitEffect` 116, 79 positional | every positional pattern |

Both spikes passed every `lean-fanout` test and `source-hygiene`. About 55 TypeScript switches over the operation kind end in `default:`; each that a host operation can reach is listed in the Rule 2 declaration and given an explicit arm, so no default silently absorbs it.

## Admission

Admission stays [profile-parameterized](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md). The checked arity of User, Service and Send Tasks widens under this profile only, never both directions at one Task, at both levels: Lean [`CheckedProcessAdmission`](../../BpmnSemantics/SemanticProcess/CheckedProcessAdmission.lean) and the TypeScript [checked graph admission](../../packages/bpmn-source/src/checked-process-graph-admission.ts). The pass-through predicates of [`CheckedPassThroughFlow`](../../BpmnSemantics/SemanticProcess/CheckedPassThroughFlow.lean) and [`checked-pass-through-flow.ts`](../../packages/semantic-core/src/checked-pass-through-flow.ts) widen to these Tasks, so the shape gate, routing, the merge refusal under a fork and the concurrent, Inclusive region and re-entry projections classify a splitting Task as a fork and a merging Task as a merge, as the Program-level analyses classify its host operation.

The nearest wrong algorithms, each with a separating witness below: (1) arity widened at one level only; (2) for every profile; (3) a merge that waits for every incoming flow; (4) a split that takes one outgoing flow; (5) a lowering that keeps one place and strands the second arrival or drops the second output; (6) an extra step or position for the merge or split; (7) a completion reading `wait.output` and dropping `extraOutputs`; (8) a merge that reuses the first arrival's occurrence.

## Stable rules

| Rule | Statement |
|---|---|
| `ACTH-ADMIT-01` | Under the nested scope-data profile, a User, Service or Send Task may have several incoming flows in the root graph of the re-entry account, or several unconditioned outgoing flows at the placements of a splitting pass-through node, never both, at both levels alike; several Link throws of one name are admitted where their catch's successor is such a Task. |
| `ACTH-MERGE-01` | Each token arriving on any incoming flow starts one fresh occurrence in one step consuming that flow's token, with no step and no position for the merge. |
| `ACTH-SPLIT-01` | The completion puts one token on every outgoing flow in the one step it already is, with no step and no position for the split. |
| `ACTH-ONE-01` | A Task with one incoming and one outgoing flow lowers to its legacy operation, so every admitted model's Program, states and publications stay byte-identical. |
| `ACTH-WAIT-01` | A wait's `extraOutputs` is empty unless its operation is a host operation, and a completion produces exactly the wait's `outputs`. |
| `ACTH-PROFILE-01` | Every other profile refuses each form it refuses today. |

## Newly reachable waits and resumption

None of a new kind: the User Task and effect waits are the existing ones, and a host wait carries its output list, so a completion resumes onto every outgoing flow.

## Separating witnesses

Two whole models with source overlays, each with a mapped Service Task, as in the [AISM witnesses](ACTIVITY-IMPLICIT-SPLIT-MERGE-PROPOSAL.md#separating-witnesses) restricted to Tasks:

- **Claim review** (merge, re-entry route): User Task *Review claim* reached from the default path and from Service Task *Obtain expert opinion*, which a *Reopen?* Choice re-enters. Journeys: direct, expert, and direct reopened once, so *Review claim* has two occurrences (wrong algorithm 8). Twins: *Review claim* as a Service and a Send Task; a Link twin with two throws of one name.
- **Employee onboarding** (split, concurrent route): mapped Service Task *Register hire* with two outgoing flows to User Tasks *Prepare workstation* and *Issue badge* → Parallel join → End. Journeys: both completion orders, each opening both User Tasks in the one completion (wrong algorithms 4, 5, 7). Twins: the splitting Task as a User and a Send Task, and on one branch of an Inclusive region.

Refused edits, each at both levels: merge and split at one Task; a conditioned and a default outgoing flow; arrivals from two Parallel branches; several flows at a Sub-Process, a Call Activity and a None Start (still refused); each model under the embedded completion profile.

Kernel witnesses: every existing scenario's Program is unchanged (`ACTH-ONE-01`); the expert journey publishes one internal record per arrival and the *Register hire* completion one revision producing both flows (wrong algorithm 6); a host operation with two marked inputs is not prepared, in both languages; a legacy wait with a nonempty `extraOutputs` fails state well-formedness (`ACTH-WAIT-01`).

## Oracles this family changes

- The second-throw refusal of the [Link source test](../../packages/bpmn-source/test/link-events-source.test.ts) and the two-throws edit of [`LinkEventsConformance`](../../BpmnSemantics/LinkEventsConformance.lean): admitted when the successor is a Task in scope, the refusal re-attributed to other successors.
- The several-flow pins of the [capability catalog disclosures](../../scripts/capability-catalog-disclosures.test.ts): rewritten for the widened class.
- The [pass-through implicit split and merge](PASS-THROUGH-IMPLICIT-SPLIT-MERGE-SPEC.md#required-optional-and-excluded-scope) exclusion of other Activity kinds and the [Link Events](LINK-EVENTS-SPEC.md#required-optional-and-excluded-scope) exclusion of several sources: narrowed, the owner passages amended at closure.

## Rule-to-evidence matrix

| Rule | Positive and negative witness | Lanes | Killing mutation |
|---|---|---|---|
| `ACTH-ADMIT-01` | Both models and twins admitted at both levels; the refused edits per level | Source, core, Lean conformance checks, pipeline | Widen at one level only (1) |
| `ACTH-MERGE-01` | The claim journeys and the reopened journey's two occurrences | Core, pipeline across Lean, core and Temporal; CIB probe | A waiting merge (3) and deduplication (8), each a seeded pipeline mutation |
| `ACTH-SPLIT-01` | Both onboarding orders and the one-revision completion | Core, pipeline across Lean, core and Temporal; CIB probe | One branch only (4); a completion reading `wait.output` (7) |
| `ACTH-ONE-01` | Every existing scenario of every profile, unchanged | Lean library, `BpmnConformance`, pipeline, differential, the frozen compiler baseline | A one-flow Task lowered to the host |
| `ACTH-WAIT-01` | The well-formedness witness and every completion | Lean laws, core tests | A completion over `output` alone |
| `ACTH-PROFILE-01` | Both models under the embedded completion profile | Source and Lean conformance checks | Widen for every profile (2) |

## Lean assurance lane

Lane shape: proved

Evidence: every existing theorem quantified over all operations or all waits is re-established for the host arm and for `outputs`; the laws the spike broke (control places, wait declarations, structural validity, User Task Program validity, internal occurrence, step soundness) are the first instances. Host-specific admission and lowering agreement is checked by a new conformance module beside [`PassThroughImplicitSplitMergeConformance`](../../BpmnSemantics/PassThroughImplicitSplitMergeConformance.lean). No new transition family: an arrival and a completion remain the steps they are.

## Temporal hosting and refinement preflight

No new hosting mechanism. Ingress is the existing Start, effect result and User Task completion Update; waits are User Tasks and effects; no timer, cancellation or lifecycle transition is added. [Host admission](../../packages/temporal-adapter/protocol/src/host-admission.ts) admits a host operation exactly as it admits the legacy operation of its work kind. The durable runtime state gains `extraOutputs`, a pre-release replacement of every producer and consumer under the [pre-release evolution policy](../PROJECT-DESIGN.md#pre-release-evolution-policy) with no Event History fixture to migrate; the Start capacity envelope is byte-based and re-measured, not raised. Every arrival and completion commits inside one closure, so the preserved relation stays equality of hosted committed state and publications with the core's; delivery, ordering, deduplication, retry and replay risks are those of the existing steps. Smallest refinement witness: the hosted pipeline over every journey of both models.

## Evidence and acceptance

Answer-free scenarios with registered pipeline cases, each with a seeded mutation, value-domain matrix rows, corpus rows and the About disclosure. A CIB probe calibrates, per journey, one historic activity instance of the merging Task per arrival and none for the merge or a Link catch, and both successors active after the splitting Task's completion in the same command. Then `PC-CF-07` is accepted for ordered arrivals and unconditioned outgoing flows at User, Service and Send Tasks, and `PC-BASIC-02` for ordered multiple sources whose catch successor is such a Task.

## Versioning consequences

A Program and runtime-state wire change: the `activity` kind in the [semantic process](../../contracts/README.md) schema and `extraOutputs` in the runtime-state schema, every producer, consumer, fixture and test replaced atomically under the [pre-release wire policy](../../contracts/README.md#evolution-policy). No admitted model changes, by `ACTH-ONE-01`; previously refused models of this profile become admitted.

### Owners this implementation grows

Hubs touched, each because the closed-world representation lives there and no leaf can serve: [`SemanticProcessContract`](../../BpmnSemantics/SemanticProcessContract.lean) (the constructor), [`RuntimeState`](../../BpmnSemantics/SemanticProcess/RuntimeState.lean) (the field and accessor), [`OperationControlPlaces`](../../BpmnSemantics/SemanticProcess/OperationControlPlaces.lean), [`ProgramStructuralValidation`](../../BpmnSemantics/SemanticProcess/ProgramStructuralValidation.lean), [`Transition`](../../BpmnSemantics/SemanticProcess/Transition.lean), [`WaitCompletion`](../../BpmnSemantics/SemanticProcess/WaitCompletion.lean) and [`FlowNodeOccurrenceLifecycle`](../../BpmnSemantics/SemanticProcess/FlowNodeOccurrenceLifecycle.lean); the admission owners under [Admission](#admission); and in TypeScript the [contract](../../packages/semantic-core/src/semantic-process-contract.ts), the [runtime](../../packages/semantic-core/src/semantic-process-runtime.ts) and [host admission](../../packages/temporal-adapter/protocol/src/host-admission.ts). Growth that would cross an owner's 800-line review target moves into a family-owned leaf, as the lowering does from the start; no size exception is requested.

Guards the implementation must satisfy, with bounds unchanged: [`lean-fanout`](../../scripts/lean-fanout.test.ts), [`lean-module-cost`](../../scripts/lean-module-cost.test.ts), [`source-hygiene`](../../scripts/source-hygiene.test.ts), [`semantic-operation-consumer-census`](../../scripts/semantic-operation-consumer-census.test.ts), [`internal-commutation-census`](../../scripts/internal-commutation-census.test.ts), [`call-forest-selection-census`](../../scripts/call-forest-selection-census.test.ts), [`runtime-collection-removal-completeness`](../../scripts/runtime-collection-removal-completeness.test.ts), [`lean-source-contracts`](../../scripts/lean-source-contracts.test.ts), [`lean-import-boundaries`](../../scripts/lean-import-boundaries.test.ts), [`pre-release-architecture`](../../scripts/pre-release-architecture.test.ts), [`contract-schema-coverage`](../../scripts/contract-schema-coverage.test.ts), [`effect-operation-artifact-consistency`](../../scripts/effect-operation-artifact-consistency.test.ts), the [frozen compiler baseline](../../packages/bpmn-source/test/cyclic-control-flow-preservation-support.ts) and the [Start capacity envelope test](../../packages/temporal-adapter/protocol/test/start-capacity-envelope.test.ts).

**Cost and split.** Two commits, each under its own [Rule 2](../../CLAUDE.md#rule-2-declare-review-and-check-every-bulk-change) declaration measured on a throwaway clone against every guard before review:

1. the representation: the host constructor, the wait field and accessor, every exhaustive arm and the moved output reads, with no lowering emitting a host operation, so every scenario is unchanged; estimated 5 to 7 hours, dominated by the re-established laws and two whole-library rebuilds;
2. the widening: admission, host lowering, Link contraction, projections, witnesses and registration; estimated 5 to 7 hours.

PLAN's budget for the family is 12 hours; at its limit work stops at the first commit's stop point, which is green on its own, and PLAN records the boundary.

Registration: the register entry, the profile artifact and README, scenarios, pipeline cases, value-domain matrix, corpus, About, the CIB probe, and the [requirement ledger](../BPMN-REQUIREMENT-LEDGER.md) cell of `BPMN-MECH-FLOW-01`.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
