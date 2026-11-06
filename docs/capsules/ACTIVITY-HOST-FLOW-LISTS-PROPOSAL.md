# Activity host flow lists proposal

## Status

Lifecycle: draft
Review: pending

## Question and delivery boundary

Can the nested scope-data profile admit a User, Service or Send Task with several incoming Sequence Flows (implicit merge) by lowering exactly those Tasks to one new orthogonal Activity host operation, appended beside the frozen legacy constructors, so that no admitted model's Program, state, command or publication changes?

This is the first family of Kernel IL orthogonalization in [PLAN](../PLAN.md#scheduled-delivery-batches) and the first stage of its Activity host. The parked [Activity implicit split and merge proposal](ACTIVITY-IMPLICIT-SPLIT-MERGE-PROPOSAL.md) owns the BPMN account and the CIB classification this family reuses. Its representation widened six existing constructors to lists, reached 264 Lean files, and stopped on 67 `lean-fanout` violations (2026-11-05); this proposal replaces it for merging Tasks.

The selected clauses of the [coverage checklist](../PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list):

- `PC-CF-07`, its merge clause: one arriving token activates one occurrence rather than synchronizing the incoming flows. It is accepted for arrivals the admitted graph orders at User, Service and Send Tasks. The row stays open on:
  - its split clause;
  - Sub-Processes and Call Activities;
  - concurrent arrivals;
  - conditional and default outgoing flows;
  - called and Multi-Instance bodies.
- `PC-BASIC-02`, multiple sources to one target, for arrivals the admitted graph orders, where the Link catch's successor is a Task in scope. The row stays open on concurrent sources and on other successors.

Close calls, 2026-11-06, each with its measured reason:

- **The split waits for the wait-record stage.**
  - A split's completion must produce several tokens. The User Task and effect wait records would therefore have to carry an output list.
  - Those records' `output` is read 313 times in 66 production Lean files and in about 19 TypeScript files. PLAN's later "kind-keyed waits" stage reshapes the same records; doing it here would do that stage's work early and twice.
  - The rejected alternative was completion reading the outputs from the Program by operation id. It would put a Program lookup into every completion path that the wait-record stage then removes again.
  - A merge needs no wait change: the host arrival opens the legacy wait with its single output. The split clause of `PC-CF-07` lands in the wait-record stage, which PLAN names.
- **`PC-BASIC-01` and the Sub-Process and Call forms wait for the scope host.** Their operations start a Process or come in entry and exit pairs: `initiate`, `enterScope` with `completeScope`, and `invokeProcess` with `returnProcess`. Their inputs and outputs therefore live on different operations. Their host shape is that family's decision, measured there; PLAN names it.
- **The incremental route over one reshape.** It is the route the owner direction of 2026-11-05 put to a measurement: "one orthogonal Activity constructor added beside frozen legacy constructors". The direction is quoted in PLAN's [scheduled delivery batches](../PLAN.md#scheduled-delivery-batches). That direction is this family's authority for a new constructor where [capsule item 19](README.md#required-capsule-structure) would otherwise add flow multiplicity as a field of the existing constructors. The [retirement rule](#representation-and-runtime-ownership) bounds how long the two representations coexist.

Reach, from the [AISM selection](ACTIVITY-IMPLICIT-SPLIT-MERGE-PROPOSAL.md#question-and-delivery-boundary): of the 1,864 deduplicated parsed CIB Seven test models, 17 files hold an Activity other than an Abstract or Manual Task with two or more incoming flows, 15 of them at a User or Service Task.

## Normative basis and CIB classification

The BPMN clauses and the CIB Seven source loci are those of the [AISM normative basis](ACTIVITY-IMPLICIT-SPLIT-MERGE-PROPOSAL.md#normative-basis-and-cib-classification), restricted to the merge at User, Service and Send Tasks. The clauses are 13.3.1 (uncontrolled flow) and 10.3 (separate instances).

Register change: a new entry `CIB-AGR-0020 — a User, Service or Send Task starts one occurrence per arriving token`. It is a normative agreement, bounded to this profile and these Tasks. It names `CIB-AGR-0019` (the pass-through instance) and `CIB-AGR-0018` (the Link continuation), and is added together with its verifier coverage.

## Required, optional and excluded scope

**Required**, for the nested scope-data profile only:

- A *merging Task*: a User Task, Service Task or Send Task of the kinds the [serial vertex projection](../../BpmnSemantics/SemanticProcess/NestedScopeDataAdmission.lean) admits, with two or more incoming flows and exactly one outgoing flow, in the root graph of the [re-entry account](SCOPE-REENTRY-SPEC.md#admission). A User Task here is one without data-input, data-output, boundary or Multi-Instance variants; a Service or Send Task is one without a BPMN Error route.
- Two or more Link throws of one name whose catch's successor is a merging Task.

**Optional:** none.

**Excluded**, each refused at admission as today:

- several outgoing flows at any Task (the split);
- arrivals from two branches of a fork, and every merging Task in a Program that forks;
- a merging Task in a Sub-Process body, a called Process or a Multi-Instance body;
- several incoming flows at a Sub-Process, Call Activity, None Start, Receive Task, Script Task, Rule Task or catch Event;
- several incoming flows at a data-input, data-output, bounded, monitored or Multi-Instance User Task;
- several Link throws whose catch's successor is anything other than a merging Task;
- every form under any profile that lacks both arity flags named under [Admission](#admission).

These bound admission only:

- The host already carries an `outputs` list, so the split broadens admission once the wait records carry outputs. An Activity without outgoing flows becomes an empty list there.
- Concurrent arrivals replace the unique-input selection by per-input alternatives.

None of these reinterprets an admitted model.

## Profile and public contract

The profile `cibseven-2.2.0-nested-embedded-scope-data-draft` grows in place under the [cumulative profile rule](../../contracts/README.md). Its [profile artifact](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json) gains `CIB-AGR-0020`. Two of its exclusions narrow to the excluded forms above: `implicit-activity-split-merge-outside-pass-through-tasks` and its Link several-throws exclusion.

Publication adds no kind. A host step publishes the operation kind of its work, `awaitUserTask` or `awaitEffect`, so the following stay unchanged:

- the [publication schema](../../contracts/schemas/semantic-publication.schema.json);
- the platform's own closed copy of the kinds (`platform/contracts/src/execution-publications.ts`) and its decoders;
- every read model.

An arrival publishes the Task's ordinary occurrence and step.

## Representation and runtime ownership

### Host operation

[`SemanticProcessContract`](../../BpmnSemantics/SemanticProcessContract.lean) appends one constructor after every existing one, and its TypeScript twin [`semantic-process-contract.ts`](../../packages/semantic-core/src/semantic-process-contract.ts) appends one union member:

```lean
inductive ActivityWork where
  | userTask (task : UserTaskDefinition)
  | effect (effect : EffectDefinition)

structure ActivityOutput where
  place : ControlPlaceId

structure ActivityHost where
  id : OperationId
  origin : BpmnElementOrigin
  inputs : List ControlPlaceId
  outputs : List ActivityOutput
  work : ActivityWork

  -- appended last in `SemanticOperation`
  | activity (host : ActivityHost)
```

```ts
| (OperationBase & DeepReadonly<{
    kind: SemanticOperationKind.Activity;
    inputs: string[];
    outputs: { place: string }[];
    // `task` and `effect` keep the exact shapes of the AwaitUserTask and AwaitEffect kinds.
    work:
      | { kind: "userTask"; task: Extract<SemanticOperation, { kind: SemanticOperationKind.AwaitUserTask }>["task"] }
      | { kind: "effect"; effect: Extract<SemanticOperation, { kind: SemanticOperationKind.AwaitEffect }>["effect"] };
  }>)
```

Each output is a record so that the later per-flow facts, a condition, the default mark and the flow origin, become defaulted fields of one output rather than a list parallel to `outputs` with a length invariant; inputs stay places, since no planned feature attaches a fact to an incoming flow. The host's effect carries no `bpmnErrorRoute`: a boundary handler belongs to the host as a field, added by the stage that types boundary handlers. The effect's `inputMappings` and `outputMappings` are the host's data mapping until the data-mapping stage moves them onto the host, so no feature has two homes at once.

### Per-work accessors

One family-owned leaf owns every per-work fact: `ActivityHostWork.lean`, with its TypeScript twin `activity-host-work.ts`. The facts are:

- the published kind;
- the wait kind it opens;
- whether it is a resumption cut;
- its cardinality class;
- the legacy operation it projects to, for the admission vertex.

These are the first laws of PLAN's accessor stage. Every consumer that needs a host fact reads it through these accessors or through the legacy function of the work's projection. Only the step owner and the accessor leaf match on `ActivityWork` directly.

### Forward shape

The host is one structure payload, not positional constructor arguments, because positional patterns are what made every widening of the legacy constructors expensive: 87 of the 155 Lean files naming `awaitUserTask` match it positionally. A later feature is a new `ActivityHost` field with a default, or a new `ActivityWork` alternative with its accessor rows, and consumers read fields by name.

Each planned feature has its place, and none needs another constructor:

| Planned feature | Its place |
|---|---|
| The split | `outputs` beyond one place |
| An Activity without outgoing flows | An empty `outputs` |
| Conditional and default outgoing flows | Defaulted fields of `ActivityOutput` |
| Data mapping, the optional loop, typed boundary handlers | Host fields |
| Receive, Script and Rule Tasks | Work alternatives with accessor rows |
| Kind-keyed waits | A change to the wait records, not the host |
| Scope-bearing kinds | A host exit for their separate completion operation, decided by the scope host family |

### Kind vocabularies

The TypeScript discriminant `Activity` and the Lean constructor `activity` keep the two operation vocabularies equal for the [consumer census](../../scripts/semantic-operation-consumer-census.test.ts).

The published kind is derived, never the discriminant:

- Lean `SemanticOperation.kind` ([`TransitionRecord`](../../BpmnSemantics/SemanticProcess/TransitionRecord.lean)) maps the host to its work's kind.
- TypeScript adds `PublishedSemanticOperationKind`, the operation kinds without `Activity`. Every publication record type uses it, including [`semantic-transition-trace.ts`](../../packages/semantic-core/src/semantic-transition-trace.ts) and [`internal-transition-footprint.ts`](../../packages/semantic-core/src/internal-transition-footprint.ts).
- The [publication validator](../../packages/temporal-adapter/protocol/src/semantic-publication-validation.ts) checks membership in the published list rather than in `Object.values(SemanticOperationKind)`, so `"activity"` is refused in structural mode too.
- Every comparison of a publication's kind with a Program operation goes through the accessor's published kind. These are `semantic-publication-validation.ts`, [`flow-node-occurrence-publication-completeness.ts`](../../packages/semantic-core/src/flow-node-occurrence-publication-completeness.ts), [`internal-transition-ordinary-arming-preparation.ts`](../../packages/semantic-core/src/internal-transition-ordinary-arming-preparation.ts) and `semantic-transition-trace.ts`.

### Internal commutation

The [family census](../INTERNAL-COMMUTATION-PROPOSAL.md) classifies the host in the composite wait-and-Activity-arming family, not in the ordinary wait-arming family. That family's contract takes one input per operation (`internalArmInput?`, `InternalArmingPatch.input`).

`prepareInternalArm?` gives the host an explicit `none` arm, so `internalTransitionFootprint?` is `none` and the independence test answers `false` (`InternalCommutation.lean`, the `| _, _ => false` arm of the pair test). The host is therefore never batched and no commutation or batch law is claimed for it. This follows the existing precedent: the data-input User Task operations entered that family with no footprint, and the legacy footprint facade keeps the refusal ([internal commutation, first checkpoint](../INTERNAL-COMMUTATION-PROPOSAL.md)).

The admitted Programs make this loss-free:

- the re-entry account refuses every forking Program that holds a host;
- so in an admitted Program no other internal operation is enabled beside a host.

A footprint that reads every input's token atom belongs to the stage that admits concurrent arrivals.

### Host Program rules

`ProgramStructuralValidation` and its TypeScript twin require:

- `inputs` of length at least two, strictly sorted by control-place id;
- `outputs` of exactly one place in this family;
- every named place exists;
- the work satisfies the rules of its legacy projection.

They refuse every other host, so a one-input host never doubles the legacy encoding of a Task.

### Steps

A host arrival tries the legacy arrival of its work's projection from each input. It commits only when exactly one input yields a state. With two inputs marked it is not prepared: a refusal, never a choice.

Admission excludes that case. Every admitted Program holding a host routes to the re-entry account (below), whose root graph is serial and which refuses a forking Program, so at most one input is ever marked. The opened wait is the legacy wait, so completion and continuation are the legacy ones. `OperationStep` gains one `activity` arm over the same arrival function.

### Lowering

A User, Service or Send Task lowers to `activity` exactly when it is a merging Task, through a new family-owned leaf:

- Lean: `ActivityHostLowering.lean` beside [`Lowering`](../../BpmnSemantics/SemanticProcess/Lowering.lean). Its dispatch into the leaf stays within the owner's review target, or a dispatch block moves into the leaf first.
- TypeScript: `activity-host-lowering.ts` beside the [source lowering](../../packages/bpmn-source/src/semantic-process-lowering.ts).

Every Task with one incoming flow keeps its legacy lowering.

[`LinkContraction`](../../BpmnSemantics/SemanticProcess/LinkContraction.lean) and [`link-contraction.ts`](../../packages/bpmn-source/src/link-contraction.ts) keep their existing nested scope-data profile gate and relax two refusals for one case: `names.Nodup` and `throws.length == catches.length` admit several throws of one name exactly when that name's catch's successor is a User, Service or Send Task in the root scope (the Task becomes a merging Task only after contraction). Every other duplicated name, a chain of Links, and several throws into an already admitted merge (a pass-through Task or an Exclusive Merge) stay refused; `PC-BASIC-02` stays open on those successors, which this family leaves to its scope lock.

### Retirement of the dual representation

The next Activity-host family that adds any feature to User, Service or Send Tasks is PLAN's "one switch". It lowers every such Task onto `activity` and deletes their legacy lowering. Until then the host-coverage census holds byte-identical the declarations of every legacy User Task constructor (`awaitUserTask` and its nine variants), of `awaitEffect`, and of the payload types the host shares with them, `UserTaskDefinition` and `EffectDefinition`, so no feature reaches either representation alone. A family adds a feature to User, Service or Send Tasks when it would change one of those declarations or lower a further BPMN variant of those Tasks: the split family and the deferred Timer increments that add boundary Timers on Tasks are such families, the scope host family is not. PLAN records this binding.

The scope-bearing kinds need a host exit for their separate completion operation. Whether that is a work alternative with an exit operation or a second host operation is the scope host family's decision, not settled here.

### Measurements (capsule item 19), 2026-11-06

**Why not lower onto existing operations.** A merge sharing the Task's origin publishes a step and a token position that CIB lacks, as the [AISM alternatives](ACTIVITY-IMPLICIT-SPLIT-MERGE-PROPOSAL.md#representation-and-runtime-ownership) record, and per-arrival copies of the Task's operation share one output place, break the single-producer rule and put several Program vertices on one checked node, as the same section records.

**Blast radius.** The figures below are for the appended constructor, from spikes on a throwaway clone (git blob `e05c12a57a571d39fc1a84936c530a1866932d8c`). The spikes used positional arguments; a structure payload needs the same one arm per exhaustive site.

| Measure | Result |
|---|---|
| Lean arms written by hand, closure of the 12 modules matching most operation constructors | 11 files, +64/−4 lines, 222 of 233 jobs built |
| Second probe: the commutation, occurrence, Program JSON, publication and lifecycle targets, plus an explicit `internalArmInput?` arm | 190 of 259 jobs built in 150 s; `InternalCommutationCore`, `InternalCommutationRegion`, `InternalOperationOccurrenceDiscovery`, `SemanticProcessJson.Program`, `ScopeReentryAdmission` and `ScopeDataBurst` build unchanged |
| Second probe completed, with the two wait Program-validity proofs stubbed (git blob `c3d715b0394e297c8e41e10b3bcf3bad524d44d7`) | All 259 jobs build after host arms in `FlowNodeOccurrenceLifecycle` (owner selection and occurrence delta) and `TransitionRecord` (published kind), and one host case each in `InternalCommutationRuntimePreservation` (compensation effect-wait disjointness, a declarer case, not a footprint, independence or batch law) and `InternalOperationOccurrence` (a refused host, a vacuous case); the two proofs need an arrival-uniqueness lemma |
| Coverage of the probes | 226 of the 991 non-experiment modules that depend on `SemanticProcessContract`; the rest is unmeasured |
| Lean modules matching 20 or more operation constructors (static census) | 19, including [`SemanticProcessJson/Program`](../../BpmnSemantics/SemanticProcessJson/Program.lean) (45 lines of headroom on 2026-11-06), `Publication`, `TransitionRecord`, `FlowNodeOccurrenceLifecycle`, `Scenario` and `FlowNodeOccurrenceBoundaryStarts` |
| Lean production declarations naming `awaitUserTask` or `awaitEffect` | 324 in 129 files; 91 `def`s in 47 files also hold a wildcard arm (selector below) |
| TypeScript exhaustive operation switches broken | 12 files |
| TypeScript production sites naming `AwaitUserTask` or `AwaitEffect` | 195 in 50 files |
| TypeScript publication and comparison sites of `operationKind` | 15 writers and 4 comparisons, listed above |
| `lean-fanout` and `source-hygiene` on the appended-constructor spike | pass |

Widening the legacy constructors instead touches `awaitUserTask` in 155 Lean files and `awaitEffect` in 116, most of them positional patterns.

The static scan does not show the semantic integration cost. Compilation passes wherever a wildcard absorbs the host, and these silent sites are what the [Admission](#admission) changes and the host-coverage census close.

## Admission

Admission stays [profile-parameterized](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md) and adds no profile-ID comparison. The Task arm of `checkedNodeArityValid` in Lean [`CheckedProcessAdmission`](../../BpmnSemantics/SemanticProcess/CheckedProcessAdmission.lean) and its twin in the TypeScript [checked graph admission](../../packages/bpmn-source/src/checked-process-graph-admission.ts) widen on the incoming side. They use the same two flags that admit a pass-through merge (`mixed && variableMerge`, `PTSM-ADMIT-01`). Only the nested scope-data profile holds both flags.

**Re-entry account.** A merging Task is a vertex of the root graph with several predecessors, not a joint. The [AISM rule](ACTIVITY-IMPLICIT-SPLIT-MERGE-PROPOSAL.md#admission) reads "a joint followed by its Activity, the joint costing no step and adding no cut"; dropping a zero-cost joint changes no analysis. So:

- the Task keeps its accesses (`SRE-AVAILABLE-01`) and stays the cut a cycle needs (`SRE-CYCLE-01`);
- its arrival costs one step and stops, as the scheduler takes it (`SRE-BURST-01`);
- [`ScopeDataBurst`](../../BpmnSemantics/SemanticProcess/ScopeDataBurst.lean) needs no change: `rootEntry` already charges a User or Service vertex one step and stops.

The following owners change, at both levels alike:

- **Routing (`SRE-ROUTE-01`).** [`ScopeReentryAdmission`](../../BpmnSemantics/SemanticProcess/ScopeReentryAdmission.lean) and [`scope-reentry-admission.ts`](../../packages/semantic-core/src/scope-reentry-admission.ts) route a Program to the re-entry account when its root holds a merging Task. At the checked level that is `checkedReentry`; at the Program level it is `programReentry`, which matches a host. The joint predicates (`checkedJoint`, `operationJoint`) stay unchanged.
- **Fork refusal.** `programRouted` and `checkedRouted` in [`NestedScopeControlAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeControlAdmission.lean) already test the re-entry route first and refuse a forking Program on it. So routing a host there refuses every host under a fork, before the concurrent account's restrictions are consulted.
- **Body refusal.** Routing counts only root-scope merging Tasks and hosts. A merging Task in a body stays refused by the existing structure: on the serial route by the serial walk's visit-once count, on the concurrent route by the one-input arity of a task vertex (`aritiesValid` in `StructuredParallelBodyAdmission`, `MergeRegion.userTask` in `MergeRegionAdmission`), and on the re-entry route by the serial walk of each body. The host arms of [`NestedScopeControlAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeControlAdmission.lean) refuse explicitly, so its arrival count can never read a host as a waiting merge.
- **Vertex projection.** `operationVertex?` in [`NestedScopeDataAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeDataAdmission.lean) and its twin give a host the vertex of its work's legacy projection, with its one output. `checkedVertex?` already gives a merging Task its Task vertex, since it reads only outgoing flows.
- **Service Task counts.** Every count such as the `CSE-ADMIT-01` bound counts a host with effect work as a Service Task, through the accessor's cardinality class.

**Nearest wrong algorithms**, each with a separating witness below:

1. arity widened at one level only;
2. arity widened for every profile;
3. a merge that waits for every incoming flow;
4. a lowering that keeps one input and strands the second arrival;
5. an extra step or position for the merge;
6. a merge that reuses the first arrival's occurrence;
7. a Program-level analysis that skips the host through a wildcard arm, including routing that misses it and lets a forking Program through;
8. a host published under a kind the schema lacks;
9. a merging Task taken as a joint, losing its accesses or its cut.

## Stable rules

| Rule | Statement |
|---|---|
| `ACTH-ADMIT-01` | Where both arity flags hold, a merging Task is admitted in the root graph of the re-entry account, at both levels alike, and routes its Program there. Several Link throws of one name are admitted where their catch's successor is a merging Task. A merging Task under a fork or in a body is refused. |
| `ACTH-MERGE-01` | Each token arriving on any incoming flow starts one fresh occurrence, in one step consuming that flow's token, with no step and no position for the merge. |
| `ACTH-ONE-01` | A Task with one incoming flow lowers to its legacy operation, so every admitted model's Program, states and publications stay byte-identical. |
| `ACTH-HOST-01` | A host has at least two sorted distinct inputs and one output. It publishes its work's legacy kind, opens exactly the legacy wait of its work from the arriving input, and is never batched. Every other host Program is refused. |
| `ACTH-PROFILE-01` | Every profile without both arity flags refuses each form it refuses today. |

## Newly reachable waits and resumption

None. A host arrival opens the existing User Task or effect wait with its single output, so completion and resumption are unchanged. Continue-As-New carries the Program, whose encoding gains the host member (see [Versioning](#versioning-consequences)); the wait and runtime-state encodings are unchanged.

## Separating witnesses

**The claim model.** One whole model with a source overlay and a mapped Service Task, as in the [AISM claim review](ACTIVITY-IMPLICIT-SPLIT-MERGE-PROPOSAL.md#separating-witnesses), restricted to Tasks:

- User Task *Review claim* is reached from the default path and from Service Task *Obtain expert opinion*.
- A *Reopen?* Choice re-enters *Obtain expert opinion*, so *Obtain expert opinion* merges too.
- The cycle's only cuts are the two merging Tasks.
- Journeys: direct, expert, and direct reopened once, so *Review claim* has two occurrences (wrong algorithm 6).
- Each journey's burst equals the scheduler's step count (wrong algorithms 5 and 9).
- Twins: *Review claim* as a Service Task and as a Send Task; a Link twin with two throws of one name.

**Refused edits**, each at both levels:

- a merging Task with two outgoing flows;
- arrivals from two Parallel branches (wrong algorithm 7);
- a merging Task inside a Sub-Process body, and inside the body of a Sub-Process on one branch of a fork;
- a merging Service Task whose mapped input is written on only one incoming path, with no Start binding for it (`SRE-AVAILABLE-01`, wrong algorithm 9);
- several incoming flows at a Sub-Process, a Call Activity and a Receive Task, which stay refused;
- two Link throws whose catch's successor is an Exclusive Gateway;
- each model under the embedded completion profile.

**Profile matrix.** The Task arity arm is checked over all four combinations of the two flags, in both languages (wrong algorithm 2).

**Kernel witnesses**, in both languages:

- every existing scenario's Program is unchanged (`ACTH-ONE-01`);
- the expert journey publishes one internal record per arrival, with kind `awaitUserTask` or `awaitEffect` (wrong algorithms 5 and 8);
- a host with one input, with unsorted inputs or with two outputs is refused;
- a host with two marked inputs is not prepared, which is the [census](../INTERNAL-COMMUTATION-PROPOSAL.md) singleton rule's executable counterexample: a hand-built forking Program that marks both inputs fails closed in the scheduler, not only at admission;
- a host's footprint is `none`;
- the publication validator refuses `"activity"` in structural mode.

## Oracles this family changes

- **Link source test and conformance.** The second-throw refusal of the [Link source test](../../packages/bpmn-source/test/link-events-source.test.ts) and the two-throws edit of [`LinkEventsConformance`](../../BpmnSemantics/LinkEventsConformance.lean) are admitted when the successor is a merging Task; the refusal is re-attributed to other successors.
- **Capability catalog disclosures.** The several-flow pins of the [capability catalog disclosures](../../scripts/capability-catalog-disclosures.test.ts) are rewritten for the widened class.
- **Execution publication contract coverage.** [`execution-publication-contract-coverage`](../../scripts/execution-publication-contract-coverage.test.ts) partitions every member of the TypeScript `SemanticOperationKind` into fail-closed in completeness or published by the schema and the Lean encoder; the discriminant-only `Activity` is neither. The guard derives its operation set from `PublishedSemanticOperationKind` instead and additionally asserts that `activity` is absent from the publication schema and from Lean publication.
- **Internal commutation census.** The family census of [internal commutation](../INTERNAL-COMMUTATION-PROPOSAL.md) gains one composite-family row for `activity`.
- **Scope exclusions.** These exclusions are narrowed, and their owner passages amended at closure:
  - the [pass-through implicit split and merge](PASS-THROUGH-IMPLICIT-SPLIT-MERGE-SPEC.md#required-optional-and-excluded-scope) exclusion of other Activity kinds;
  - the [Link Events](LINK-EVENTS-SPEC.md#required-optional-and-excluded-scope) exclusion of several sources;
  - the [scope re-entry](SCOPE-REENTRY-SPEC.md#admission) list of root vertices.

## Rule-to-evidence matrix

| Rule | Positive and negative witness | Lanes | Killing mutation |
|---|---|---|---|
| `ACTH-ADMIT-01` | The model and twins admitted at both levels; the refused edits at each level | Source, core, Lean conformance checks, pipeline | Widen at one level only (1); route without the host, so the fork is admitted (7); take the Task as a joint (9) |
| `ACTH-MERGE-01` | The claim journeys and the reopened journey's two occurrences | Core; pipeline across Lean, core and Temporal; CIB probe | A waiting merge (3), a one-input lowering (4) and deduplication (6), each a seeded pipeline mutation |
| `ACTH-ONE-01` | Every existing scenario of every profile, unchanged | Lean library, `BpmnConformance`, pipeline, differential, the frozen compiler baseline | A one-flow Task lowered to the host |
| `ACTH-HOST-01` | The refused host Programs, the published kinds, the `none` footprint, the validator refusal | Lean conformance checks, core and protocol tests, the host-coverage census | A wildcard arm skipping the host (7); publishing `activity` (8) |
| `ACTH-PROFILE-01` | The flag matrix and the model under the embedded completion profile | Source and Lean conformance checks | Widen for every profile (2) |

## Lean assurance lane

Lane shape: proved

Evidence: the host arms of the existing theorems over all operations, the arrival-uniqueness lemma in [`FlowNodeOccurrenceUserTaskProgramValidity`](../../BpmnSemantics/SemanticProcess/FlowNodeOccurrenceUserTaskProgramValidity.lean) and [`FlowNodeOccurrenceEffectProgramValidity`](../../BpmnSemantics/SemanticProcess/FlowNodeOccurrenceEffectProgramValidity.lean), the `none`-footprint theorem beside [`InternalCommutationCore`](../../BpmnSemantics/SemanticProcess/InternalCommutationCore.lean), and the conformance checks below; the obligations in detail:

- Every existing theorem quantified over all operations is re-established for the host arm. The spikes located the first instances: control places, wait declarations and their declarers, structural validity, cardinalities and step soundness.
- The two wait Program-validity proofs gain one arrival-uniqueness lemma: a host arrival equals the legacy arrival from its unique yielding input.
- The host's `internalTransitionFootprint?` is `none`, stated as a theorem. Because no pair test admits it, no commutation or batch law changes.

**Conformance checks.** Admission, routing and lowering agreement for hosts are checked by a new conformance module beside [`PassThroughImplicitSplitMergeConformance`](../../BpmnSemantics/PassThroughImplicitSplitMergeConformance.lean), including the checked and Program re-entry burst of the claim model.

No new transition family: an arrival remains the step it is.

## Temporal hosting and refinement preflight

No new hosting mechanism:

- Ingress is the existing Start, effect result and User Task completion Update.
- Waits are the legacy User Task and effect waits.
- No timer, cancellation or lifecycle transition is added.

[Host admission](../../packages/temporal-adapter/protocol/src/host-admission.ts) admits a host exactly as the legacy projection of its work. The durable runtime state, every Query and every read model are unchanged, because the wait is the legacy wait and the published kind is the legacy kind.

The Program carries the new member. The [Workflow continuation](../../packages/temporal-adapter/protocol/src/workflow-continuation.ts) chains the Program across Continue-As-New, so the continued payload carries it too. This is a pre-release replacement of its producers and consumers under the [pre-release evolution policy](../PROJECT-DESIGN.md#pre-release-evolution-policy). The Start capacity envelope is byte-based and is re-measured, not raised.

The publication validator's published-kind list keeps `"activity"` out of every transport, structural or Program-bound.

The preserved relation stays equality of hosted committed state and publications with the core's. Smallest refinement witness: the hosted pipeline over every journey, plus one forced Continue-As-New while *Review claim* is pending after arriving through its second incoming flow.

## Evidence and acceptance

The evidence:

- answer-free scenarios with registered pipeline cases, each with a seeded mutation;
- value-domain matrix rows;
- corpus rows;
- the About disclosure;
- a CIB probe that calibrates, per journey, one historic activity instance of the merging Task per arrival, and none for the merge or a Link catch.

Then `PC-CF-07`'s merge clause is accepted for ordered arrivals at User, Service and Send Tasks, and `PC-BASIC-02` for ordered multiple sources whose catch successor is a merging Task.

## Versioning consequences

A Program wire change: the `activity` member is added to the [semantic process](../../contracts/README.md) schema. Every producer, consumer, fixture and test is replaced atomically under the [pre-release wire policy](../../contracts/README.md#evolution-policy), including the Program JSON codec [`SemanticProcessJson/Program`](../../BpmnSemantics/SemanticProcessJson/Program.lean) and the Program carried by Continue-As-New. Runtime state, wait records and publications are unchanged.

No admitted model changes, by `ACTH-ONE-01`; previously refused models of this profile become admitted.

### Owners this implementation grows

**Lean hubs**, each touched because the closed-world representation lives there and no leaf can serve:

- [`SemanticProcessContract`](../../BpmnSemantics/SemanticProcessContract.lean)
- [`TransitionRecord`](../../BpmnSemantics/SemanticProcess/TransitionRecord.lean)
- [`OperationControlPlaces`](../../BpmnSemantics/SemanticProcess/OperationControlPlaces.lean)
- [`ProgramStructuralValidation`](../../BpmnSemantics/SemanticProcess/ProgramStructuralValidation.lean)
- [`RuntimeStateWellFormed`](../../BpmnSemantics/SemanticProcess/RuntimeStateWellFormed.lean)
- [`ProfileCardinalities`](../../BpmnSemantics/SemanticProcess/ProfileCardinalities.lean)
- [`Transition`](../../BpmnSemantics/SemanticProcess/Transition.lean)
- [`FlowNodeOccurrenceLifecycle`](../../BpmnSemantics/SemanticProcess/FlowNodeOccurrenceLifecycle.lean)
- [`FlowNodeOccurrenceUserTaskProgramValidity`](../../BpmnSemantics/SemanticProcess/FlowNodeOccurrenceUserTaskProgramValidity.lean)
- [`FlowNodeOccurrenceEffectProgramValidity`](../../BpmnSemantics/SemanticProcess/FlowNodeOccurrenceEffectProgramValidity.lean)
- [`InternalCommutationCensus`](../../BpmnSemantics/SemanticProcess/InternalCommutationCensus.lean)
- [`InternalCommutationCore`](../../BpmnSemantics/SemanticProcess/InternalCommutationCore.lean), with explicit host arms only
- [`SemanticProcessJson/Program`](../../BpmnSemantics/SemanticProcessJson/Program.lean)
- [`Lowering`](../../BpmnSemantics/SemanticProcess/Lowering.lean), for its dispatch only

**Lean admission owners:**

- [`ScopeReentryAdmission`](../../BpmnSemantics/SemanticProcess/ScopeReentryAdmission.lean)
- [`NestedScopeDataAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeDataAdmission.lean)
- [`NestedScopeControlAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeControlAdmission.lean), for its counts and its refusing host arms
- [`CheckedProcessAdmission`](../../BpmnSemantics/SemanticProcess/CheckedProcessAdmission.lean)
- [`LinkContraction`](../../BpmnSemantics/SemanticProcess/LinkContraction.lean)

[`ScopeDataBurst`](../../BpmnSemantics/SemanticProcess/ScopeDataBurst.lean) is read, not changed.

**TypeScript:**

- the [contract](../../packages/semantic-core/src/semantic-process-contract.ts)
- the [runtime](../../packages/semantic-core/src/semantic-process-runtime.ts)
- the [profile shape](../../packages/semantic-core/src/semantic-program-profile-shape.ts)
- the [state](../../packages/semantic-core/src/semantic-process-state.ts)
- the [scope re-entry](../../packages/semantic-core/src/scope-reentry-admission.ts), [nested scope-data](../../packages/semantic-core/src/nested-scope-data-admission.ts) and [nested scope-control](../../packages/semantic-core/src/nested-scope-control-admission.ts) admissions
- the [internal commutation census](../../packages/semantic-core/src/internal-commutation-census.ts)
- the ordinary-arming [preparation](../../packages/semantic-core/src/internal-transition-ordinary-arming-preparation.ts) and [footprint](../../packages/semantic-core/src/internal-transition-footprint.ts), whose edit is the published-kind type alone
- the publication owners [`internal-occurrence-batch.ts`](../../packages/semantic-core/src/internal-occurrence-batch.ts), [`internal-operation-occurrence.ts`](../../packages/semantic-core/src/internal-operation-occurrence.ts), [`semantic-transition-trace.ts`](../../packages/semantic-core/src/semantic-transition-trace.ts) and [`flow-node-occurrence-publication-completeness.ts`](../../packages/semantic-core/src/flow-node-occurrence-publication-completeness.ts)
- the [semantic process schema](../../contracts/schemas/semantic-process.schema.json)
- [host admission](../../packages/temporal-adapter/protocol/src/host-admission.ts), its [publication program validation](../../packages/temporal-adapter/protocol/src/flow-node-occurrence-publication-program-validation.ts) and the [publication validator](../../packages/temporal-adapter/protocol/src/semantic-publication-validation.ts)

Growth that would cross an owner's 800-line review target moves into a family-owned leaf before the edit, as the lowering and the accessors do from the start. No size exception is requested.

**Guards the implementation must satisfy, with bounds unchanged:**

- [`lean-fanout`](../../scripts/lean-fanout.test.ts)
- [`lean-module-cost`](../../scripts/lean-module-cost.test.ts)
- [`source-hygiene`](../../scripts/source-hygiene.test.ts)
- [`semantic-operation-consumer-census`](../../scripts/semantic-operation-consumer-census.test.ts)
- [`internal-commutation-census`](../../scripts/internal-commutation-census.test.ts)
- [`call-forest-selection-census`](../../scripts/call-forest-selection-census.test.ts)
- [`activity-occurrence-writer-census`](../../scripts/activity-occurrence-writer-census.test.ts)
- [`runtime-collection-removal-completeness`](../../scripts/runtime-collection-removal-completeness.test.ts)
- [`lean-source-contracts`](../../scripts/lean-source-contracts.test.ts)
- [`lean-import-boundaries`](../../scripts/lean-import-boundaries.test.ts)
- [`pre-release-architecture`](../../scripts/pre-release-architecture.test.ts)
- [`contract-schema-coverage`](../../scripts/contract-schema-coverage.test.ts)
- [`effect-operation-artifact-consistency`](../../scripts/effect-operation-artifact-consistency.test.ts)
- the [frozen compiler baseline](../../packages/bpmn-source/test/cyclic-control-flow-preservation-support.ts)
- the [Start capacity envelope test](../../packages/temporal-adapter/protocol/test/start-capacity-envelope.test.ts)

### New guard: the host-coverage census

It sits beside the [consumer census](../../scripts/semantic-operation-consumer-census.test.ts) and works per declaration, not per file. It has five parts:

- **Lean population.** Every production Lean `def` (excluding `Experiments`, `*Conformance*` and `*Fixtures*`) whose body names `.awaitUserTask` or `.awaitEffect` and holds a wildcard arm (`| _ =>`, `| _,` or a trailing `| _`) must also name `.activity`. Measured 2026-11-06: 91 declarations in 47 files.
- **Multiplicity-keyed sites.** These are listed by name and must name the host, though they never name `awaitUserTask`: `operationJoint`, `programReentry`, `checkedReentry`, `operationVertex?`, `internalArmInput?`, `prepareInternalArm?` and `semanticOperationInternalFamily`, with their TypeScript twins.
- **TypeScript population.** Every production function naming `SemanticOperationKind.AwaitUserTask` or `AwaitEffect` must also name `SemanticOperationKind.Activity` or call the accessor leaf, found with the TypeScript compiler API. Measured: 195 sites in 50 files.
- **Allowlist.** The allowlist names declarations, never files, each with a one-line reason. It is measured before the representation commit's review and stated in its Rule 2 declaration.
- **Frozen legacy.** Every publication site derives `operationKind` through the accessor, and the declarations named under the [retirement rule](#retirement-of-the-dual-representation) stay byte-identical until retirement, checked against their text at the representation commit.

This closes the wildcard and `default:` absorption that compilation cannot see.

### Cost and split

Two commits, each under its own [Rule 2](../../CLAUDE.md#rule-2-declare-review-and-check-every-bulk-change) declaration. Each declaration is measured on a throwaway clone against every guard before review, and its cost is extrapolated from timed builds of the heaviest units once they build.

1. **The representation**, estimated at 7 to 9 hours including two whole-library rebuilds. It contains:
   - the host constructor and union member, and its explicit arms in every census declaration;
   - the accessor leaf and the arrival-uniqueness lemma;
   - the published-kind type and the validator;
   - the commutation classification;
   - the host Program rules and the host-coverage census.

   No lowering emits a host, so every scenario is unchanged.
2. **The widening**, estimated at 4 to 6 hours. It contains admission, routing, host lowering, Link contraction, the vertex projection, witnesses and registration.

**Stop condition.** Before the representation commit's Rule 2 declaration, the appended-constructor spike is built as the full library on the throwaway clone, under a declared cost limit, with every failing module repaired or stubbed until the build completes. Work stops and PLAN re-decides between the incremental route and one reshape when that build shows failures in more than 24 modules beyond the six already measured, any failure in a footprint, pair-independence or batch law, or any `lean-fanout` violation.

The estimate of 11 to 15 hours of implementation, plus reviews and the hosted check, exceeds PLAN's 12-hour family budget, which PLAN owns together with its at-limit rule. The first commit is green on its own, so the expected overrun has a natural boundary there.

**Registration:**

- the register entry;
- the profile artifact and README;
- scenarios and pipeline cases;
- the value-domain matrix;
- the corpus;
- About;
- the CIB probe;
- the [requirement ledger](../BPMN-REQUIREMENT-LEDGER.md) cell of `BPMN-MECH-FLOW-01`.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
