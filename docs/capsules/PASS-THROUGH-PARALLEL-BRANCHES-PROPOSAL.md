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
- Link Events (`PC-BASIC-02`). CIB records no activity for either Link Event: `BpmnParse#parseIntermediateThrowEvent` creates no activity for a throwing Link and redirects its incoming flows to the catch, and `HistoryParseListener#parseIntermediateCatchEvent` writes no history for the catch, so a Link needs a non-publishing step or place aliasing, a representation change. Its reach is 4 of the 1,947 CIB engine test models.

Selection, 2026-11-02: chosen on closure value and reach. Of the 1,947 BPMN models in the pinned CIB engine test resources, 83 hold a plain or Manual Task and 17 of those also hold a Parallel Gateway, against 6 holding a None Intermediate Throw and 4 holding a Link Event. Of the 17, 12 have a plain or Manual Task on a Parallel branch. In 9 every such branch ends at its fork's paired join, and in each of those 9 some fork has only such branches, the shape CIB's own join tests use (for example `ParallelGatewayTest.testCompletingJoin`); the other 3 end such branches at separate None Ends of a terminal fork in the Process root, which the profile refuses for every branch kind. Close call against the None Throw: it is cheaper in proof work, but it closes no row and needs the kernel contract change above.

## Normative basis and CIB classification

The passages are in the [external reading copy](../reference/bpmn-2.0.2/README.md#reading-workflow).

- **Clauses 13.1 and 13.3.3** govern the pass-through Task as the [pass-through Task specification](PASS-THROUGH-TASK-SPEC.md#normative-basis-and-cib-classification) records them.
- **Clauses 10.6.4 and 13.4.1** govern the Parallel fork and join as the [root Parallel forks specification](ROOT-PARALLEL-FORKS-SPEC.md#normative-basis-and-cib-classification) records them. Clause 13.3.1 makes each Activity on a branch an independent instance enabled by its own token. No clause distinguishes a Task on a branch from a Task on a serial path.

CIB Seven `2.2.0` at the pinned checkout: `TaskActivityBehavior.execute` calls `leave` in whichever concurrent child execution carries the token, and `ParallelGatewayActivityBehavior` forks and joins those executions in every scope. A Task on a branch therefore starts and ends its activity instance inside the command that delivered the branch's token, as on a serial path.

Classification: no new register entry. `CIB-EXT-0022`'s scope for this profile widens from serial and Choice-branched paths to Parallel branches, and `CIB-EXT-0020`'s concurrent clause is unchanged. The calibration extends the existing probe with the witness below.

## Required, optional and excluded scope

Required: every model the profile admits today, unchanged, plus a pass-through Task, in the form [`PTT-ADMIT-01`](PASS-THROUGH-TASK-SPEC.md#stable-rules) admits, as a vertex of a Parallel branch:

- in the Process root body of a forking model, as the [root Parallel forks](ROOT-PARALLEL-FORKS-SPEC.md#required-optional-and-excluded-scope) class admits it;
- in any Sub-Process body of a forking model, at any admitted depth, whether that body forks or is serial;
- anywhere on a branch that ends at its fork's paired join, including a branch that holds only pass-through Tasks and a fork whose every branch does (`PTPB-WORK-01`);
- on a branch of a terminal fork, before or after the wait that branch reaches before its End;
- on the serial path before a fork or after a join.

Optional: several pass-through Tasks on one branch or across branches.

Excluded, each refused at admission:

- every form `PTT-ADMIT-01` refuses;
- a branch of a terminal fork that reaches its separate None End without a wait, pass-through Tasks or not: today's cut stays for terminal branches, because such an End would be co-enabled with a sibling branch's entry (`PTPB-WORK-01`);
- a body whose Call would lead it once its pass-through Tasks are skipped, such as Start → Manual Task → Call (`PTPB-CALL-01`);
- a pass-through Task in a called Process, whose body stays one to three User Tasks;
- every other exclusion of the concurrent structured scope data and root Parallel forks accounts.

Merge regions and merge targets cannot hold a pass-through Task: this profile refuses every Exclusive merge of two or more inputs, so it has no merge region, and the region walker accepts only Task vertices in any profile.

These bound admission only. A later widening admits more forms of the same checked node without reinterpreting an admitted model.

## Profile and public contract

The profile `cibseven-2.2.0-nested-embedded-scope-data-draft` grows in place under the [cumulative profile rule](../../contracts/README.md). Its value domain, Start contract, effect contract and closure limit are unchanged. The [profile artifact](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json) removes the forking-model exclusion of pass-through Tasks, and the [profile README](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/README.md) states the class.

Observation adds no field. A pass-through Task on a branch publishes one occurrence `(processId, elementId, owner)` that starts and ends in one publication, owned by the scope occurrence that carries its branch, exactly as `PTT-PASS-01` states for a serial path. Enabled external interactions change only through its successor.

The embedded completion profile shares the nested scope-control analysis and keeps exactly its admitted class (`PTPB-PROFILE-01`). Its checked alphabet, `checkedNodeKinds` of [`nested-scope-control-admission.ts`](../../packages/semantic-core/src/nested-scope-control-admission.ts) and its Lean twin, which only that profile uses, gains no node kind. At the Program level the shared analysis maps a one-input `mergeExclusive` to a pass vertex and relaxes the branch cut only when the Program's `identity.semanticProfile` is this profile, a test inside the hidden bodies of `NestedScopeControlAdmission` and of the TypeScript twin; under the embedded completion profile a one-input `mergeExclusive` stays a merge that `contractMergeRegions` refuses, as today.

## Representation and runtime ownership

**No new representation.** No opcode, Program field, checked node, runtime collection or transition family is added. The Task lowers to the existing one-input `mergeExclusive`, as `PTT-KIND-01` and `PTT-PASS-01` state, whatever body it sits in.

**Commutation, the one semantic change.** A pass-through Task prepares as the existing `mergeInput` family. Today `PreparedInternalTransition.Independent` in [`InternalPreparedTransition`](../../BpmnSemantics/SemanticProcess/InternalPreparedTransition.lean) makes `mergeInput` dependent on the two frame-inserting families, `declaredEntry` (`CSD-PREPARE-01`) and `mappedInvocation` (`CMCALL-PREPARE-01`), and the TypeScript twin `preparedInternalTransitionsAreIndependent` in [`internal-transition-batch.ts`](../../packages/semantic-core/src/internal-transition-batch.ts) agrees. A fork closure that enables a declaring Sub-Process on one branch and a pass-through Task on another is therefore a dependent batch, which this profile's scheduling refuses. This family makes `mergeInput` independent of both families exactly when their footprints are separated, the premise every other companion of a frame-inserting family already uses (`PTPB-COMMUTE-01`), and proves the two pair laws:

- `mergeInput` with `declaredEntry`: a declared entry is a scope creation plus one frame insertion. The merge commutes with the scope creation by the existing `prepared_merge_scope_creation_pair_commutes`, and it reads and writes no variables, so the frame insertion commutes with it. This mirrors `prepared_declared_entry_local_control_pair`.
- `mergeInput` with `mappedInvocation`: likewise, mirroring `prepared_mapped_invocation_local_control_pair`.

Both pair laws join the case analyses of `prepared_merge_transition_pair` in [`InternalTransitionBatch`](../../BpmnSemantics/SemanticProcess/InternalTransitionBatch.lean) and `prepared_mapped_invocation_transition_pair` in [`InternalPreparedTransitionLaws`](../../BpmnSemantics/SemanticProcess/InternalPreparedTransitionLaws.lean), so the existing batch law, that every order of an independent batch commits one state and one publication, covers them without a new statement. The control read-only premise is already trivial for `mergeInput`, and the publication frame proofs are per step family, so no publication case is added.

**The singleton premise, restated.** The [concurrent scope data specification](CONCURRENT-SCOPE-DATA-SPEC.md) admits a declared entry only beside companions whose commutation is established, and its singleton argument states that regional completion, an End and a merge input are never co-enabled with an entry, resting on every fork branch starting with work. It reopens for wait-free paths, which this family admits. The premise is re-established as follows:

- a merge input beside an entry is now covered by the two pair laws;
- a closure starts from the one token of the command that ended a wait, so two offers coexist only below a fork in that closure;
- an End below such a fork is reached in the same closure only along a wait-free path that avoids the fork's paired join, which only a terminal fork provides, and `PTPB-WORK-01` keeps today's cut there, so the branch reaches a wait before its End;
- every structured body still holds a task, a joined fork's join fires only when its last branch arrives, and a body's End follows every join that encloses it, so a body never completes in the closure that entered it and regional completion stays a singleton.

So an End and regional completion remain singletons and execute unprepared, as today.

- Rejected alternative: proving `ordinaryEnd` and `regional` pair laws beside declared entries, so terminal branches could also be wait-free. No retained CIB model needs that shape, so it stays outside this family.

- Rejected alternative: an admission rule that keeps a pass-through Task from ever sharing a closure with a frame-inserting entry. A fork into a declaring Sub-Process and a pass-through Task is the common shape, so the rule would refuse the class this family exists for.

**Admission vertex.** The structured-body analysis gains a `pass` vertex kind, projected from a one-input `mergeExclusive` on the Program side and a `nonOperationalTask` on the checked side, under this profile only. It has one input and one output, adds no wait and no effect to the frontier capacity, and costs one step in the closure scan that reaches it, which then continues to its successor in the same scan. A branch that reaches its fork's paired join through pass vertices alone satisfies the branch cut; a terminal-fork branch still needs a task before its End.

- Rejected alternative: contracting the vertex before the check and charging every pass vertex of the tree to every closure. It keeps the vertex kinds unchanged, but it charges the office relocation's five pass-through Tasks to its fork closure and refuses the witness at the closure limit.

## Admission

Admission stays [profile-parameterized](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md).

- **Profile restriction.** `programRestrictionsHold` in [`NestedScopeControlAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeControlAdmission.lean) and its TypeScript twin in the [routing module](../../packages/semantic-core/src/structured-scope-data-routing.ts) refuse a `mergeExclusive` with two or more inputs instead of every `mergeExclusive`. `checkedRestrictionsHold` is unchanged: a checked `exclusiveMerge` always has two or more inputs, and a `nonOperationalTask` was refused by the raw-body mapping, which this family widens.
- **Shared analysis.** Under this profile only, the raw body maps a one-input `mergeExclusive` or a `nonOperationalTask` to the pass vertex, and the branch cut `branchesStartWithWork` accepts a joined branch of pass vertices (`PTPB-WORK-01`). Every other vertex keeps its mapping.
- **Calls.** `embeddedCallsPlaced` skips pass vertices when deciding whether a Call leads its body, so Start → Manual Task → Call is refused as Start → Call is, and the reason a leading Call is excluded, that Lean's scope-creation selection prepares only parentless callers, keeps holding (`PTPB-CALL-01`).
- **Burst.** Each closure scan counts one step per pass vertex it reaches, and the closure limit of eight applies to the composed maximum burst unchanged (`PTPB-BURST-01`). That burst stays an admission-time over-approximation; as for serial pass-through Tasks, no Lean law proves every actual closure within it, and the runtime rolls an over-limit closure back atomically.
- **Routing.** `SRE-ROUTE-01` already counts only Merges of two or more inputs, so a forking model with a pass-through Task routes to the concurrent account, and the [Start capacity envelope](../../packages/temporal-adapter/protocol/test/start-capacity-envelope.test.ts) routes as today.

Nearest wrong algorithms, each with a separating witness below:

1. the batch relation unchanged, which rejects the first closure of the office relocation;
2. the pass vertex counted as a wait, which widens the frontier capacity and changes the Temporal start envelope;
3. the pass vertex costing no burst step, which admits the burst-nine edit;
4. today's branch cut kept, which refuses the office relocation's third branch and the body fork;
5. the branch cut dropped for terminal branches too, which admits the terminal-branch edit;
6. a pass vertex counted as work for the Call placement, which admits Start → Manual Task → Call;
7. the embedded completion profile admitting a one-input `mergeExclusive`.

## Stable rules

| Rule | Statement |
|---|---|
| `PTPB-ADMIT-01` | The profile admits a pass-through Task on a Parallel branch or around a fork of the root or a Sub-Process body, in the required scope, and refuses each excluded form. |
| `PTPB-PASS-01` | On a branch, a pass-through Task behaves as `PTT-PASS-01` states: its occurrence starts and ends in the step its token arrives, owned by the scope occurrence carrying the branch, and one token reaches its outgoing flow. |
| `PTPB-COMMUTE-01` | A `mergeInput` and a `declaredEntry` or `mappedInvocation` with separated footprints are independent, and applying them in either order yields one state and one publication. |
| `PTPB-WORK-01` | A branch that ends at its fork's paired join may hold only pass-through Tasks; a branch of a terminal fork reaches a wait before its End. |
| `PTPB-CALL-01` | A Call that a body's pass-through Tasks alone separate from its Start leads that body and is refused. |
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
  - Branch three: plain Task *Notify facilities* alone, a branch of pass-through Tasks only, separating wrong algorithm 4.
  - The closure after *Approve relocation* forks and then runs three independent batches: the declared entry of *Pack workplace* with *Hand over keys* and *Notify facilities*, which separates wrong algorithm 1; then *Label boxes* with the arming of *Book movers*; then the arming of *Pack boxes*. Its burst is seven.
  - Journey one: *Pack boxes*, then the *Book movers* result. *File movers' confirmation* runs in the result's closure, the join fires, and *Close relocation ticket* and the End follow in the same closure.
  - Journey two: the *Book movers* result, then *Pack boxes*. *File movers' confirmation* runs in the first closure, and the join fires in the second.
  - In both journeys every pass-through Task publishes exactly one occurrence, started and ended in one publication.
- **Body fork** (Sub-Process body): a Sub-Process whose body runs User Task *Check invoice* and then forks into plain Tasks *Archive receipt* and *Notify accounting*, joined before its End, in a serial root with a mapped Service Task. The fork has pass-through branches only, CIB's join-test shape; it runs entirely in *Check invoice*'s closure, and the body completes in that closure, after the join.
- **Refused edits:** a pass-through Task with a second outgoing flow on a branch; a body with a terminal fork whose second branch runs only a plain Task to its own End (wrong algorithm 5); a Sub-Process body Start → Manual Task → mapped Call (wrong algorithm 6); a forking chain whose burst is nine, while the same chain at burst eight is admitted (wrong algorithm 3). The [employee onboarding](../../scenarios/root-parallel-forks/employee-onboarding.bpmn), admitted today, stays admitted with its Program unchanged.
- **Profile control:** the body fork model under the embedded completion profile is refused, and so is its lowered Program.

## Rule-to-evidence matrix

| Rule | Positive and negative witness | Lanes | Killing mutation |
|---|---|---|---|
| `PTPB-ADMIT-01` | Both models admitted; each refused edit refused | Source and core at both levels; the Lean conformance module | Refuse a pass vertex on a branch |
| `PTPB-WORK-01` | The relocation's third branch and the body fork admitted; the terminal-branch edit refused | Source, core, conformance module | Keep today's cut; drop it for terminal branches |
| `PTPB-CALL-01` | Start → Manual Task → Call refused | Source, core, conformance module | Count a pass vertex as work for Call placement |
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

Then `PC-HUM-04` closes: its Parallel-branch clause holds for every branch that ends at its fork's paired join, which covers each of the 9 CIB models whose shape the profile otherwise admits. `PC-HUM-05` is evidenced except its implicit split and merge clause.

Nearest unsupported claims:

- pass-through Tasks with several incoming or outgoing flows (`PC-CF-07`);
- a wait-free branch of a terminal fork in a Sub-Process body, which needs `ordinaryEnd` and `regional` pair laws beside declared entries;
- in called Processes or Multi-Instance bodies;
- that every actual closure stays within the admitted burst (not proved in Lean, as for serial pass-through Tasks);
- None Intermediate Throw Events and Link Events.

## Versioning consequences

Apply the [pre-release wire policy](../../contracts/README.md#evolution-policy): no wire shape, schema or value arm changes; admission widens under the profile, the profile artifact grows in place, and no legacy reader or migration is added. No admitted model changes its Program, route or behavior: no forking model this profile admits holds a `mergeExclusive`, and under every other profile declared entries and mapped invocations occur only in Programs whose scheduling rejects observable choices, where no admitted frontier co-enables them with a `mergeInput` today, so making the pair independent changes no committed batch.

### Owners this implementation grows

Build cost is a constraint. No kernel type changes. The hubs this family must touch, and why:

- `StructuredParallelBodyAdmission`: its `Kind` gains `pass`, an interface edit whose cone is 569 modules at `20933b89` (`scripts/lean-fanout.ts`), because the closure scan must count the step exactly; `aritiesValid`, `contractAt`, `contractWeighted` and `reachesWork` gain arms, and the `import all` proof consumers `StructuredParallelBodyExecution`, `ParallelScopeProgramCapacityProofs` and `SerialBusinessTaskProgressProofs` case on `Kind` and must still check;
- `InternalPreparedTransition`: four new arms in the body of `PreparedInternalTransition.Independent`, because the batch relation is the decision this family changes;
- `InternalTransitionBatch` and `InternalPreparedTransitionLaws`: new cases in private proofs, because the batch law must cover the new arms.

The two pair laws go into a new family-owned leaf module. `NestedScopeControlAdmission` and `ParallelScopeProgramCapacity` change only in bodies. All Lean edits land in one commit, so the global fixtures rebuild once.

TypeScript owners: [`internal-transition-batch.ts`](../../packages/semantic-core/src/internal-transition-batch.ts), [`nested-scope-control-admission.ts`](../../packages/semantic-core/src/nested-scope-control-admission.ts), [`merge-region-admission.ts`](../../packages/semantic-core/src/merge-region-admission.ts), the [routing module](../../packages/semantic-core/src/structured-scope-data-routing.ts), and the twins of `Kind`: [`structured-parallel-body-analysis.ts`](../../packages/semantic-core/src/structured-parallel-body-analysis.ts), [`parallel-body-burst-analysis.ts`](../../packages/semantic-core/src/parallel-body-burst-analysis.ts), [`sequential-scope-control-analysis.ts`](../../packages/semantic-core/src/sequential-scope-control-analysis.ts), [`repeated-scope-control-analysis.ts`](../../packages/semantic-core/src/repeated-scope-control-analysis.ts) and [`parallel-scope-program-capacity.ts`](../../packages/semantic-core/src/parallel-scope-program-capacity.ts).

Guards the implementation must change or satisfy: [`lean-fanout`](../../scripts/lean-fanout.test.ts), [`lean-module-cost`](../../scripts/lean-module-cost.test.ts), [`source-hygiene`](../../scripts/source-hygiene.test.ts), the [Start capacity envelope test](../../packages/temporal-adapter/protocol/test/start-capacity-envelope.test.ts), whose routing stays unchanged; the refusals that flip to admitted witnesses in the [pass-through Task source test](../../packages/bpmn-source/test/pass-through-task-source.test.ts) and the [root Parallel forks source test](../../packages/bpmn-source/test/root-parallel-forks-source.test.ts); and the [concurrent scope data runtime test](../../packages/bpmn-source/test/concurrent-scope-data-runtime.test.ts), whose lock of `mergeInput` as dependent on a declared entry flips to independent beside a separated footprint.

Registration: the `CIB-EXT-0022` scope in the [register](../CIB-BPMN-RELATION-REGISTER.md); the profile artifact and README; the [pass-through Task specification](PASS-THROUGH-TASK-SPEC.md#required-optional-and-excluded-scope) and the [root Parallel forks specification](ROOT-PARALLEL-FORKS-SPEC.md#required-optional-and-excluded-scope), whose branch exclusions this family narrows; the owner passages whose premise this family changes: the `CSD-PREPARE-01` batch premise and singleton argument of the [concurrent scope data specification](CONCURRENT-SCOPE-DATA-SPEC.md), `CMCALL-PREPARE-01` of the [concurrent mapped Calls specification](CONCURRENT-MAPPED-CALLS-SPEC.md), and the statement of the [concurrent structured scope data specification](CONCURRENT-STRUCTURED-SCOPE-DATA-SPEC.md#representation-and-runtime-ownership) that a mapped invocation is never co-enabled there; scenarios, pipeline cases, the value-domain matrix, the corpus, About and the CIB probe.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
