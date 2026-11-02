# Pass-through Tasks on Parallel branches proposal

## Status

Lifecycle: draft
Review: pending

## Question and delivery boundary

Can the nested scope-data profile admit plain Tasks and Manual Tasks on the branches of its Parallel forks, in the Process root body and in Sub-Process bodies, so that each publishes one occurrence that starts and ends in the step its token arrives and moves the token on, while every model, command and observation the profile admits today keeps its meaning?

This is the next family of batch 4 in [PLAN](../PLAN.md#scheduled-delivery-batches). Its shared mechanism is the pass-through Task of the [pass-through Task specification](PASS-THROUGH-TASK-SPEC.md), a one-input `mergeExclusive`, run inside the concurrent account that the [root Parallel forks specification](ROOT-PARALLEL-FORKS-SPEC.md#question-and-delivery-boundary) found blocked by the commutation relation. It takes every open row of the [coverage checklist](../PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) whose remaining clause is that branch exclusion:

- `PC-HUM-04`, primary, its last open clause: Plain Task pass-through on Parallel branches. The row closes when this family lands.
- `PC-HUM-05`, its Parallel-branch clause: Manual Task pass-through on Parallel branches. The row stays open on its implicit split and merge clause, which `PC-CF-07` owns for every Activity kind.

Screened out, each with its reason:

- `PC-BASIC-01`'s None Intermediate Throw clause. It runs the same lowering, but it is a new source element, so it needs a new checked node or notation in `CheckedProcessContract`, whose interface cone is 1,014 modules (`scripts/lean-fanout.ts` at `20933b89`). It is the next candidate.
- Link Events (`PC-BASIC-02`). CIB writes no history for either Link Event (`HistoryParseListener#parseIntermediateCatchEvent`), so a Link needs a non-publishing step or place aliasing, a representation change. Its reach is 4 of the 1,947 CIB engine test models.

Selection, 2026-11-02: chosen on closure value and reach. Of the 1,947 BPMN models in the pinned CIB engine test resources, 83 hold a plain or Manual Task and 17 of those also hold a Parallel Gateway, against 6 holding a None Intermediate Throw and 4 holding a Link Event. Close call against the None Throw: it is cheaper in proof work, but it closes no row and needs the kernel contract change above.

## Normative basis and CIB classification

The passages are in the [external reading copy](../reference/bpmn-2.0.2/README.md#reading-workflow).

- **Clauses 13.1 and 13.3.3** govern the pass-through Task as the [pass-through Task specification](PASS-THROUGH-TASK-SPEC.md#normative-basis-and-cib-classification) records them.
- **Clauses 10.6.4 and 13.4.1** govern the Parallel fork and join as the [root Parallel forks specification](ROOT-PARALLEL-FORKS-SPEC.md#normative-basis-and-cib-classification) records them. Clause 13.3.1 makes each Activity on a branch an independent instance enabled by its own token. No clause distinguishes a Task on a branch from a Task on a serial path.

CIB Seven `2.2.0` at the pinned checkout: `TaskActivityBehavior.execute` calls `leave` in whichever concurrent child execution carries the token, and `ParallelGatewayActivityBehavior` forks and joins those executions in every scope. A Task on a branch therefore starts and ends its activity instance inside the command that delivered the branch's token, as on a serial path.

Classification: no new register entry. `CIB-EXT-0022`'s scope for this profile widens from serial and Choice-branched paths to Parallel branches, and `CIB-EXT-0020`'s concurrent clause is unchanged. The calibration extends the existing probe with the witness below.

## Required, optional and excluded scope

Required: every model the profile admits today, unchanged, plus a pass-through Task, in the form [`PTT-ADMIT-01`](PASS-THROUGH-TASK-SPEC.md#stable-rules) admits, as a vertex of a Parallel branch:

- in the Process root body, as the [root Parallel forks](ROOT-PARALLEL-FORKS-SPEC.md#required-optional-and-excluded-scope) class admits it;
- in a Sub-Process body that forks, at any admitted depth;
- first on a branch, last before the join, or between other branch vertices of a branch that holds a wait;
- on the serial path before a fork or after a join of a forking body.

Optional: several pass-through Tasks on one branch or across branches.

Excluded, each refused at admission:

- every form `PTT-ADMIT-01` refuses;
- a pass-through Task in a merge region of the [concurrent embedded activations](CONCURRENT-EMBEDDED-ACTIVATIONS-SPEC.md) account or in a merge-target body, where one vertex activates once per arrival;
- a branch holding only pass-through Tasks: the structured-body check requires every branch to reach a wait (`branchesStartWithWork`), and this family keeps that cut;
- a pass-through Task in a called Process, whose body stays one to three User Tasks;
- every other exclusion of the concurrent structured scope data and root Parallel forks accounts.

These bound admission only. A later widening admits more forms of the same checked node without reinterpreting an admitted model.

## Profile and public contract

The profile `cibseven-2.2.0-nested-embedded-scope-data-draft` grows in place under the [cumulative profile rule](../../contracts/README.md). Its value domain, Start contract, effect contract and closure limit are unchanged. The [profile artifact](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json) removes the forking-model exclusion of pass-through Tasks, and the [profile README](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/README.md) states the class.

Observation adds no field. A pass-through Task on a branch publishes one occurrence `(processId, elementId, owner)` that starts and ends in one publication, owned by the scope occurrence that carries its branch, exactly as `PTT-PASS-01` states for a serial path. Enabled external interactions change only through its successor.

The embedded completion profile shares the nested scope-control analysis. It keeps exactly its admitted class: it admits no pass-through Task at the source level, and at the Program level it keeps refusing a one-input `mergeExclusive` (`PTPB-PROFILE-01`).

## Representation and runtime ownership

**No new representation.** No opcode, Program field, checked node, runtime collection or transition family is added. The Task lowers to the existing one-input `mergeExclusive`, as `PTT-KIND-01` and `PTT-PASS-01` state, whatever body it sits in.

**Commutation, the one semantic change.** A pass-through Task prepares as the existing `mergeInput` family. Today `PreparedInternalTransition.Independent` in [`InternalPreparedTransition`](../../BpmnSemantics/SemanticProcess/InternalPreparedTransition.lean) makes `mergeInput` dependent on the two frame-inserting families, `declaredEntry` (`CSD-PREPARE-01`) and `mappedInvocation` (`CMCALL-PREPARE-01`), and the TypeScript twin `preparedInternalTransitionsAreIndependent` in [`internal-transition-batch.ts`](../../packages/semantic-core/src/internal-transition-batch.ts) agrees. A fork closure that enables a declaring Sub-Process on one branch and a pass-through Task on another is therefore a dependent batch, which this profile's scheduling refuses. This family makes `mergeInput` independent of both families exactly when their footprints are separated, the premise every other companion of a frame-inserting family already uses (`PTPB-COMMUTE-01`), and proves the two pair laws:

- `mergeInput` with `declaredEntry`: a declared entry is a scope creation plus one frame insertion. The merge commutes with the scope creation by the existing `prepared_merge_scope_creation_pair_commutes`, and it reads and writes no variables, so the frame insertion commutes with it. This mirrors `prepared_declared_entry_local_control_pair`.
- `mergeInput` with `mappedInvocation`: likewise, mirroring `prepared_mapped_invocation_local_control_pair`.

Both pair laws join the case analyses of `prepared_merge_transition_pair` in [`InternalTransitionBatch`](../../BpmnSemantics/SemanticProcess/InternalTransitionBatch.lean) and `prepared_mapped_invocation_transition_pair` in [`InternalPreparedTransitionLaws`](../../BpmnSemantics/SemanticProcess/InternalPreparedTransitionLaws.lean), so the existing batch law, that every order of an independent batch commits one state and one publication, covers them without a new statement.

- Rejected alternative: an admission rule that keeps a pass-through Task from ever sharing a closure with a frame-inserting entry. A fork into a declaring Sub-Process and a pass-through Task is the common shape, so the rule would refuse the class this family exists for.

**Admission vertex.** The structured-body analysis gains a `pass` vertex kind, projected from a one-input `mergeExclusive` on the Program side and a `nonOperationalTask` on the checked side. It has one input and one output, adds no wait and no effect to the frontier capacity, and costs one step in the closure scan that reaches it, which then continues to its successor in the same scan.

- Rejected alternative: contracting the vertex before the check and charging every pass vertex of the tree to every closure. It keeps the vertex kinds unchanged, but it charges the office relocation's five pass-through Tasks to its fork closure and refuses the witness at the closure limit.

## Admission

Admission stays [profile-parameterized](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md).

- **Profile restriction.** `programRestrictionsHold` and `checkedRestrictionsHold` in [`NestedScopeControlAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeControlAdmission.lean), and their TypeScript twins in the [routing module](../../packages/semantic-core/src/structured-scope-data-routing.ts), refuse an Exclusive merge with two or more inputs instead of every `mergeExclusive`.
- **Shared analysis.** The raw body maps a one-input `mergeExclusive` or a `nonOperationalTask` to the pass vertex and refuses it inside a merge region or a merge-target body. Every other vertex keeps its mapping.
- **Burst.** Each closure scan counts one step per pass vertex it reaches, so the composed maximum burst counts exactly the pass-through Tasks a closure runs, and the closure limit of eight applies unchanged (`PTPB-BURST-01`).
- **Routing.** `SRE-ROUTE-01` already counts only Merges of two or more inputs, so a forking model with a pass-through Task routes to the concurrent account, and the [Start capacity envelope](../../packages/temporal-adapter/protocol/test/start-capacity-envelope.test.ts) routes as today.

Nearest wrong algorithms, each with a separating witness below:

1. the batch relation unchanged, which rejects the first closure of the office relocation;
2. the pass vertex counted as a wait, which widens the frontier capacity and changes the Temporal start envelope;
3. the pass vertex costing no burst step, which admits the burst-nine edit;
4. a pass vertex inside a merge region accepted, which admits the merge-region edit;
5. the embedded completion profile admitting a one-input `mergeExclusive`.

## Stable rules

| Rule | Statement |
|---|---|
| `PTPB-ADMIT-01` | The profile admits a pass-through Task on a Parallel branch or around a fork of the root or a Sub-Process body, in the required scope, and refuses each excluded form. |
| `PTPB-PASS-01` | On a branch, a pass-through Task behaves as `PTT-PASS-01` states: its occurrence starts and ends in the step its token arrives, owned by the scope occurrence carrying the branch, and one token reaches its outgoing flow. |
| `PTPB-COMMUTE-01` | A `mergeInput` and a `declaredEntry` or `mappedInvocation` with separated footprints are independent, and applying them in either order yields one state and one publication. |
| `PTPB-BURST-01` | A pass vertex costs one step in the closure that reaches it; a forking Program is admitted only when its composed burst is at most the closure limit. |
| `PTPB-PROFILE-01` | The embedded completion profile admits exactly the Programs it admits today. |

## Newly reachable waits and resumption

None. A pass-through Task never waits, so every wait, command and resumption point of the profile is unchanged; it only adds steps to the closures that deliver its branch's token, which `PTPB-BURST-01` bounds.

## Separating witnesses

Each model carries a source overlay and a mapped Service Task, as the profile requires; the office relocation also carries a declaring Sub-Process, which its first closure needs.

- **Office relocation** (root fork):
  - Start binds `employee`.
  - Path: *Relocation requested* → User Task *Approve relocation* → fork *Start relocation* → three branches → join *Relocation ready* → plain Task *Close relocation ticket* → End.
  - Branch one: Sub-Process *Pack workplace*, which declares a local `boxes` and holds Start → Manual Task *Label boxes* → User Task *Pack boxes* → End, and copies `boxes` out.
  - Branch two: Manual Task *Hand over keys* → Service Task *Book movers*, whose input reads `employee` → plain Task *File movers' confirmation*.
  - Branch three: plain Task *Notify facilities* alone.
  - The closure after *Approve relocation* forks and runs, in one batch, the declared entry of *Pack workplace* with *Label boxes*, *Hand over keys* with the arming of *Book movers*, and *Notify facilities* with its join arrival. It separates wrong algorithm 1.
  - Journey one: *Pack boxes*, then the *Book movers* result. *File movers' confirmation* runs in the result's closure, the join fires, and *Close relocation ticket* and the End follow in the same closure.
  - Journey two: the *Book movers* result, then *Pack boxes*. *File movers' confirmation* runs in the first closure, and the join fires in the second.
  - In both journeys every pass-through Task publishes exactly one occurrence, started and ended in one publication.
- **Body fork** (Sub-Process body): a Sub-Process whose body forks into User Task *Check invoice* and plain Task *Archive receipt*, joined before its End, in a serial root with a mapped Service Task. It witnesses `PTPB-ADMIT-01` inside a body and that the body completes only after *Check invoice*.
- **Refused edits:** a pass-through Task with a second outgoing flow on a branch; a pass-through Task inside a merge region; a forking chain whose burst is nine; the same chain at burst eight is admitted. The office relocation with its pass-through Tasks removed is admitted today and stays admitted.
- **Profile control:** the body fork model under the embedded completion profile is refused, and so is its lowered Program.

## Rule-to-evidence matrix

| Rule | Positive and negative witness | Lanes | Killing mutation |
|---|---|---|---|
| `PTPB-ADMIT-01` | Both models admitted; each refused edit refused | Source and core at both levels; the Lean conformance module | Refuse a pass vertex on a branch; accept one in a merge region |
| `PTPB-PASS-01` | Each pass-through Task publishes one started-and-ended occurrence in the closure that delivers its token | Pipeline, CIB probe | Lower the Task as `awaitUserTask` |
| `PTPB-COMMUTE-01` | The first relocation closure commits as one batch; both journey orders agree | Lean pair laws and batch law; core batch test; pipeline | Keep `mergeInput` dependent on `declaredEntry` |
| `PTPB-BURST-01` | Burst-eight chain admitted, burst-nine refused | Conformance module, core | Cost zero for a pass vertex |
| `PTPB-PROFILE-01` | The body fork model refused under the embedded completion profile | Source, core, conformance module | Accept a one-input `mergeExclusive` in the shared analysis without the profile restriction |

## Lean assurance lane

Lane shape: proved

Evidence: `PTPB-COMMUTE-01` is proved. The two pair laws are theorems over every Program and state with no profile premise, and they join the case analysis under [`prepared_transition_pair`](../../BpmnSemantics/SemanticProcess/InternalTransitionBatch.lean#prepared_transition_pair), so the existing batch law [`prepared_transition_batch_perm`](../../BpmnSemantics/SemanticProcess/InternalTransitionBatch.lean#prepared_transition_batch_perm) composes them. The admission rules are checked: an executable conformance module checks admission of both models at both levels, the refused edits, the burst boundary and the profile control.

## Temporal hosting and refinement preflight

No new hosting mechanism. A pass-through Task is an internal step inside one command closure; ingress, waits, timers, effects, cancellation, lifecycle and the publication projection are unchanged. A batch that was refused before now commits in one closure, which the host already hosts for other independent batches. The preserved relation is equality of hosted committed state and publications with the core's. Delivery, ordering, deduplication, retry and replay risks are unchanged, because the batch is committed atomically and its result does not depend on order. The smallest witness is the hosted pipeline over the relocation journeys at family closure.

## Evidence and acceptance

The models run as answer-free scenarios with registered pipeline cases, each with a seeded mutation, plus a value-domain matrix row, a corpus row and the About disclosure. The CIB lane extends the root fork probe with the relocation journeys.

Then `PC-HUM-04` closes and `PC-HUM-05` is evidenced except its implicit split and merge clause.

Nearest unsupported claims:

- pass-through Tasks with several incoming or outgoing flows (`PC-CF-07`);
- in merge regions, merge targets, called Processes or Multi-Instance bodies;
- None Intermediate Throw Events and Link Events.

## Versioning consequences

Apply the [pre-release wire policy](../../contracts/README.md#evolution-policy): no wire shape, schema or value arm changes; admission widens under the profile, the profile artifact grows in place, and no legacy reader or migration is added. No admitted model changes its Program, route or behavior, because no admitted forking model holds a `mergeExclusive`.

### Owners this implementation grows

Build cost is a constraint. No kernel type changes. The hubs this family must touch, and why:

- `StructuredParallelBodyAdmission`: its `Kind` gains `pass`, an interface edit whose cone the implementation measures with `scripts/lean-fanout.ts` before the edit (569 modules at `20933b89`), because the closure scan must count the step exactly;
- `InternalPreparedTransition`: four new arms in the body of `PreparedInternalTransition.Independent`, because the batch relation is the decision this family changes;
- `InternalTransitionBatch` and `InternalPreparedTransitionLaws`: new cases in private proofs, because the batch law must cover the new arms.

The two pair laws go into a new family-owned leaf module. `NestedScopeControlAdmission` and `ParallelScopeProgramCapacity` change only in bodies. All Lean edits land in one commit, so the global fixtures rebuild once.

TypeScript owners: [`internal-transition-batch.ts`](../../packages/semantic-core/src/internal-transition-batch.ts), [`nested-scope-control-admission.ts`](../../packages/semantic-core/src/nested-scope-control-admission.ts), [`merge-region-admission.ts`](../../packages/semantic-core/src/merge-region-admission.ts) and the [routing module](../../packages/semantic-core/src/structured-scope-data-routing.ts).

Guards the implementation must change or satisfy: [`lean-fanout`](../../scripts/lean-fanout.test.ts), [`lean-module-cost`](../../scripts/lean-module-cost.test.ts), [`source-hygiene`](../../scripts/source-hygiene.test.ts), the [Start capacity envelope test](../../packages/temporal-adapter/protocol/test/start-capacity-envelope.test.ts), whose routing stays unchanged, and the [concurrent structured scope data source test](../../packages/bpmn-source/test/concurrent-structured-scope-data-admission.test.ts), whose pass-through-on-a-branch refusal becomes an admitted witness.

Registration: the `CIB-EXT-0022` scope in the [register](../CIB-BPMN-RELATION-REGISTER.md); the profile artifact and README; the [pass-through Task specification](PASS-THROUGH-TASK-SPEC.md#required-optional-and-excluded-scope) and the [root Parallel forks specification](ROOT-PARALLEL-FORKS-SPEC.md#required-optional-and-excluded-scope), whose branch exclusions this family narrows; scenarios, pipeline cases, the value-domain matrix, the corpus, About and the CIB probe.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
