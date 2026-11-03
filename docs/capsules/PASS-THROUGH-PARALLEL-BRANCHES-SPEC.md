# Pass-through Tasks on Parallel branches specification

## Status

Lifecycle: implemented
Review: approved

## Question and delivery boundary

Can the nested scope-data profile admit plain Tasks and Manual Tasks on the branches of its Parallel forks, in the Process root body and in Sub-Process bodies, so that each publishes one occurrence that starts and ends in the step its token arrives and moves the token on, while every model, command and observation the profile admits today keeps its meaning?

This is the next family of batch 4 in [PLAN](../PLAN.md#scheduled-delivery-batches). Its shared mechanism is the pass-through Task of the [pass-through Task specification](PASS-THROUGH-TASK-SPEC.md), a one-input `mergeExclusive`, run inside the concurrent account that the [root Parallel forks specification](ROOT-PARALLEL-FORKS-SPEC.md#question-and-delivery-boundary) found blocked by the commutation relation. It takes every open row of the [coverage checklist](../PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) whose remaining clause is that branch exclusion:

- `PC-HUM-04`, primary, its last open clause: Plain Task pass-through on Parallel branches, for every branch that ends at its fork's paired join and every terminal branch that reaches a wait. The row stays open on two residual forms, a wait-free terminal branch in a Sub-Process body and a branch of a forking model without an embedded Sub-Process (`PC-CF-03`), recorded under [Evidence and acceptance](#evidence-and-acceptance).
- `PC-HUM-05`, its Parallel-branch clause: Manual Task pass-through on Parallel branches. The row stays open on the same two residual forms and on its implicit split and merge clause, which `PC-CF-07` owns for every Activity kind.

Screened out, each with its reason:

- `PC-BASIC-01`'s None Intermediate Throw clause. It runs the same lowering, but it is a new source element, so it needs a new checked node or notation in `CheckedProcessContract`, whose interface cone is 1,014 modules (`scripts/lean-fanout.ts` at `20933b89`). It is the next candidate.
- Link Events (`PC-BASIC-02`). CIB records no activity for either Link Event: `BpmnParse#parseIntermediateThrowEvent` creates no activity for a throwing Link and redirects its incoming flows to the catch, and `HistoryParseListener#parseIntermediateCatchEvent` writes no history for the catch, so a Link needs a non-publishing step or place aliasing, a representation change. Its reach is 4 of the 1,947 CIB engine test models.

Selection, 2026-11-02: chosen on clause value and semantic risk; the reach below admits none of the CIB fixtures. Of the 1,947 BPMN models in the pinned CIB engine test resources, 83 hold a plain or Manual Task and 17 of those also hold a Parallel Gateway, against 6 holding a None Intermediate Throw and 4 holding a Link Event. Of the 17, 12 have a plain or Manual Task on a Parallel branch. Classified against this profile's class, they are CIB engine fixtures rather than whole models: 3 end such branches at a terminal root fork, which the profile refuses for every branch kind (`ParallelTest.testParallel` at separate None Ends, and `HistoricActivityInstanceStateTest.testTwoEndActivities` and `testSingleEndEventAndSingleEndActivity` at Tasks with no outgoing flow); 5 end at a join with no outgoing flow, which the join arity refuses (`HistoricActivityInstanceTest` and `HistoricActivityInstanceStateTest.testEndParallelJoin`, `ParallelGatewayTest.testCompletingJoin`, `testCompletingJoinInSubProcess` and `testAsyncParallelGateway`); 2 are unstructured (`ParallelGatewayTest.testUnstructuredConcurrencyTwoForks` and `TwoJoins`); 1 holds no wait at all; and `threeTasksProcess`, the only one whose branches the profile otherwise admits, holds no embedded Sub-Process, which every forking model of this profile needs ([root Parallel forks](ROOT-PARALLEL-FORKS-SPEC.md#required-optional-and-excluded-scope)), so none of the 12 is admitted (closure review, 2026-11-03). In 10 of the 12 some fork has only pass-through branches, the shape CIB's join tests use, so the branch rule, not the reach, is what this family must get right. Close call against the None Throw: it is cheaper in proof work, but it accepts no clause beyond `PC-BASIC-01`'s and needs the kernel contract change above, while this family removes the concurrency restriction that blocks every pass-through Task on a branch.

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
- a branch of a terminal fork whose closure scan, from its first vertex, can reach its separate None End without arming a task, whether through pass-through Tasks or through a nested fork whose every branch is wait-free: such an End would be co-enabled with a sibling branch's entry (`PTPB-WORK-01`);
- an empty branch, a flow straight from a fork to its join, which today's cut refuses and this family keeps refusing in both profiles;
- a body whose Call would lead it once its pass-through Tasks are skipped, such as Start → Manual Task → Call (`PTPB-CALL-01`);
- a pass-through Task in a called Process, whose body stays one to three User Tasks;
- every other exclusion of the concurrent structured scope data and root Parallel forks accounts.

Merge regions and merge targets cannot hold a pass-through Task: this profile refuses every Exclusive merge of two or more inputs, so it has no merge region, and the region walker accepts only Task vertices in any profile.

These bound admission only. A later widening admits more forms of the same checked node without reinterpreting an admitted model.

## Profile and public contract

The profile `cibseven-2.2.0-nested-embedded-scope-data-draft` grows in place under the [cumulative profile rule](../../contracts/README.md). Its value domain, Start contract, effect contract and closure limit are unchanged. The [profile artifact](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json) narrows its exclusion `pass-through-tasks-on-parallel-branches-or-in-called-processes` to called Processes and wait-free terminal branches, and the [profile README](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/README.md) states the class.

Observation adds no field. A pass-through Task on a branch publishes one occurrence `(processId, elementId, owner)` that starts and ends in one publication, owned by the scope occurrence that carries its branch, exactly as `PTT-PASS-01` states for a serial path. Enabled external interactions change only through its successor.

The embedded completion profile shares the nested scope-control analysis and keeps exactly its admitted class (`PTPB-PROFILE-01`). The gate is structural:

- **Raw mappings test the profile.** Only the raw-body mappings, Lean's `checkedVertex?` and `operationVertex?` over `source.identity` and `program.identity`, and their TypeScript twins through the profile-specific caller, produce a pass vertex, and only for this profile. Under the embedded completion profile a one-input `mergeExclusive` stays a merge that `contractMergeRegions` refuses, and a `nonOperationalTask` stays outside its checked alphabet `checkedNodeKinds` in [`nested-scope-control-admission.ts`](../../packages/semantic-core/src/nested-scope-control-admission.ts), as today.
- **The branch-cut relaxation is inert without a pass vertex.** It applies only to a branch that holds at least one pass vertex, so a Program without one is cut exactly as today, in both profiles.
- **This profile's forking checked shape admits the Task.** This profile's forking checked graphs pass through `structuredScopeDataCheckedShape` in the [routing module](../../packages/semantic-core/src/structured-scope-data-routing.ts), which delegates to that shared alphabet; it admits `nonOperationalTask` there for this profile alone, leaving the alphabet itself unchanged. Lean has no separate alphabet: it refuses through `checkedVertex?`.

## Representation and runtime ownership

**No new representation.** No opcode, Program field, checked node, runtime collection or transition family is added. The Task lowers to the existing one-input `mergeExclusive`, as `PTT-KIND-01` and `PTT-PASS-01` state, whatever body it sits in.

**Commutation, the one semantic change.** A pass-through Task prepares as the existing `mergeInput` family. Today `PreparedInternalTransition.Independent` in [`InternalPreparedTransition`](../../BpmnSemantics/SemanticProcess/InternalPreparedTransition.lean) makes `mergeInput` dependent on the two frame-inserting families, `declaredEntry` (`CSD-PREPARE-01`) and `mappedInvocation` (`CMCALL-PREPARE-01`), and the TypeScript twin `preparedInternalTransitionsAreIndependent` in [`internal-transition-batch.ts`](../../packages/semantic-core/src/internal-transition-batch.ts) agrees. A fork closure that enables a declaring Sub-Process on one branch and a pass-through Task on another is therefore a dependent batch, which this profile's scheduling refuses. This family makes `mergeInput` independent of `declaredEntry` exactly when their footprints are separated, the premise every other companion of a frame-inserting family already uses (`PTPB-COMMUTE-01`), and proves the pair law: a declared entry is a scope creation plus one frame insertion; the merge commutes with the scope creation by the existing `prepared_merge_scope_creation_pair_commutes`, and it reads and writes no variables, so the frame insertion commutes with it. This mirrors `prepared_declared_entry_local_control_pair`.

`mergeInput` stays dependent on `mappedInvocation`. No admitted shape co-enables them: a Call sits only in a serial Sub-Process body, never leading it (`PTPB-CALL-01` skips pass vertices), and never in a forking root, so its invocation follows a wait from a single token. The [concurrent structured scope data](CONCURRENT-STRUCTURED-SCOPE-DATA-SPEC.md#representation-and-runtime-ownership) statement that a mapped invocation is never co-enabled there stays true, and the TypeScript twin adds `MergeInput` as a companion of the declared entry only.

The pair law joins the case analysis of `prepared_merge_transition_pair` in [`InternalTransitionBatch`](../../BpmnSemantics/SemanticProcess/InternalTransitionBatch.lean), so the existing batch law, that every order of an independent batch commits one state and one publication, covers them without a new statement. The control read-only premise is already trivial for `mergeInput`, and the publication frame proofs are per step family, so no publication case is added.

**The singleton premise, restated.** The [concurrent scope data specification](CONCURRENT-SCOPE-DATA-SPEC.md) admits a declared entry only beside companions whose commutation is established, and its singleton argument states that regional completion, an End and a merge input are never co-enabled with an entry, resting on every fork branch starting with work. It reopens for wait-free paths, which this family admits. The premise is re-established as follows:

- a merge input beside a declared entry is now covered by the pair law, and a merge input is never co-enabled with a mapped invocation, as stated above;
- a closure starts from the one token of the command that ended a wait, so two offers coexist only below a fork in that closure;
- an End below such a fork is reached in the same closure only along a wait-free path that avoids the fork's paired join, which only a terminal fork provides, and `PTPB-WORK-01` requires every terminal branch's closure scan to arm a task before its End, so no such path exists, nested wait-free forks included;
- every structured body still holds a task, a joined fork's join fires only when its last branch arrives, and a body's End follows every join that encloses it, so a body never completes in the closure that entered it and regional completion stays a singleton.

So an End and regional completion remain singletons and execute unprepared, as today.

- Rejected alternative: proving `ordinaryEnd` and `regional` pair laws beside declared entries, so terminal branches could also be wait-free. No CIB model whose shape the profile otherwise admits needs that shape, so it stays outside this family as `PC-HUM-04`'s residual.

- Rejected alternative: an admission rule that keeps a pass-through Task from ever sharing a closure with a frame-inserting entry. A fork into a declaring Sub-Process and a pass-through Task is the common shape, so the rule would refuse the class this family exists for.

**Admission vertex.** The structured-body analysis gains a `pass` vertex kind, projected from a one-input `mergeExclusive` on the Program side and a `nonOperationalTask` on the checked side, under this profile only. It has one input and one output, adds no wait and no effect to the frontier capacity, and costs one step in the closure scan that reaches it, which then continues to its successor in the same scan. A joined branch that holds at least one pass vertex and reaches its fork's paired join satisfies the branch cut; a terminal-fork branch satisfies it only when its closure scan arms a task before its End, so `reachesWork` continues past a nested fork's paired join when every branch of that fork is wait-free, instead of stopping there.

- Rejected alternative: contracting the vertex before the check and charging every pass vertex of the tree to every closure. It keeps the vertex kinds unchanged, but it charges the office relocation's five pass-through Tasks to its fork closure and refuses the witness at the closure limit.

## Admission

Admission stays [profile-parameterized](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md).

- **Profile restriction.** `programRestrictionsHold` in [`NestedScopeControlAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeControlAdmission.lean) and its TypeScript twin in the [routing module](../../packages/semantic-core/src/structured-scope-data-routing.ts) refuse a `mergeExclusive` with two or more inputs instead of every `mergeExclusive`. `checkedRestrictionsHold` is unchanged: a checked `exclusiveMerge` always has two or more inputs, and a `nonOperationalTask` was refused by the raw-body mapping, which this family widens.
- **Shared analysis.** Under this profile only, the raw body maps a one-input `mergeExclusive` or a `nonOperationalTask` to the pass vertex, and the branch cut `branchesStartWithWork` accepts a joined branch that holds a pass vertex while applying the terminal-branch scan property (`PTPB-WORK-01`). Every other vertex keeps its mapping. `MergeRegionAdmission.contract` and `ConcurrentScopeDataAvailability.exit` pass a pass vertex through their generic arms unchanged, and `close`'s wildcard arm already counts its step.
- **Calls.** `embeddedCallsPlaced` skips pass vertices when deciding whether a Call leads its body, so Start → Manual Task → Call is refused as Start → Call is, and the reason a leading Call is excluded, that Lean's scope-creation selection prepares only parentless callers, keeps holding (`PTPB-CALL-01`).
- **Burst.** Each closure scan counts one step per pass vertex it reaches, and the closure limit of eight applies to the composed maximum burst unchanged (`PTPB-BURST-01`). That burst stays an admission-time over-approximation; as for serial pass-through Tasks, no Lean law proves every actual closure within it, and the runtime rolls an over-limit closure back atomically.
- **Routing.** `SRE-ROUTE-01` already counts only Merges of two or more inputs, so a forking model with a pass-through Task routes to the concurrent account, and the [Start capacity envelope](../../packages/temporal-adapter/protocol/test/start-capacity-envelope.test.ts) routes as today.

Nearest wrong algorithms, each with a separating witness below:

1. the batch relation unchanged, which rejects the first closure of the office relocation;
2. the pass vertex costing no burst step, which admits the burst-nine edit;
3. today's branch cut kept, which refuses the office relocation's third branch and the body fork;
4. the branch cut dropped for terminal branches, or a nested join counted as work, which admits the terminal-branch edits;
5. a pass vertex counted as work for the Call placement, which admits Start → Manual Task → Call;
6. the shared analysis producing a pass vertex under the embedded completion profile.

A pass vertex adds nothing to the frontier capacity, which only the parallel Multi-Instance profile consumes; `contractWeighted` needs its arm because the TypeScript topology check `isStructuredParallelBody` runs through that capacity reduction.

## Stable rules

| Rule | Statement |
|---|---|
| `PTPB-ADMIT-01` | The profile admits a pass-through Task on a Parallel branch or around a fork of the root or a Sub-Process body, in the required scope, and refuses each excluded form. |
| `PTPB-PASS-01` | On a branch, a pass-through Task behaves as `PTT-PASS-01` states: its occurrence starts and ends in the step its token arrives, owned by the scope occurrence carrying the branch, and one token reaches its outgoing flow. |
| `PTPB-COMMUTE-01` | A `mergeInput` and a `declaredEntry` with separated footprints are independent, and applying them in either order yields one state and one publication. |
| `PTPB-WORK-01` | A branch that ends at its fork's paired join and holds a pass-through Task may hold no wait; a terminal fork's branch arms a task in its closure scan before its End; an empty branch is refused. |
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
- **Refused edits:** a pass-through Task with a second outgoing flow on a branch; a body with a terminal fork whose second branch runs only a plain Task to its own End (wrong algorithm 4); a body with a terminal fork whose first branch is a nested fork of two plain Tasks joined before its End, beside a branch of three plain Tasks and a declaring Sub-Process, the shape whose End and entry would share a closure (wrong algorithm 4, nested join counted as work); an empty branch from a fork straight to its join; a Sub-Process body Start → Manual Task → mapped Call (wrong algorithm 5); a forking chain whose burst is nine, while the same chain at burst eight is admitted (wrong algorithm 2). The [employee onboarding](../../scenarios/root-parallel-forks/employee-onboarding.bpmn), admitted today, stays admitted with its Program unchanged.
- **Profile control:** under the embedded completion profile, a Program whose serial Sub-Process body holds a one-input `mergeExclusive` before its User Task is refused, and the same Program without it is admitted (wrong algorithm 6).

## Rule-to-evidence matrix

| Rule | Positive and negative witness | Lanes | Killing mutation |
|---|---|---|---|
| `PTPB-ADMIT-01` | Both models admitted; each refused edit refused | Source and core at both levels; the Lean conformance module | Refuse a pass vertex on a branch |
| `PTPB-WORK-01` | The relocation's third branch and the body fork admitted; both terminal-branch edits and the empty branch refused | Source, core, conformance module | Keep today's cut; drop it for terminal branches; count a nested join as work |
| `PTPB-CALL-01` | Start → Manual Task → Call refused | Source, core, conformance module | Count a pass vertex as work for Call placement |
| `PTPB-PASS-01` | Each pass-through Task publishes one started-and-ended occurrence in the closure that delivers its token | Pipeline, CIB probe | Lower the Task as `awaitUserTask` |
| `PTPB-COMMUTE-01` | The first relocation closure commits as one batch without an ambiguous choice, so its `mergeInput` and `declaredEntry` footprints are separated; the core batch test locks the independence on a separated sibling footprint; both journey orders agree | Lean pair law and batch law; core batch test; pipeline | Keep `mergeInput` dependent on `declaredEntry` |
| `PTPB-BURST-01` | Burst-eight chain admitted, burst-nine refused | Conformance module, core | Cost zero for a pass vertex |
| `PTPB-PROFILE-01` | The embedded completion control refused, its twin without the merge admitted | Core, conformance module | Produce a pass vertex without the profile test |

## Lean assurance lane

Lane shape: proved

Evidence: `PTPB-COMMUTE-01` is proved. The pair law is a theorem over every Program and state with no profile premise, and it joins the case analysis under [`prepared_transition_pair`](../../BpmnSemantics/SemanticProcess/InternalTransitionBatch.lean#prepared_transition_pair), so the existing batch law [`prepared_transition_batch_perm`](../../BpmnSemantics/SemanticProcess/InternalTransitionBatch.lean#prepared_transition_batch_perm) composes it. The admission rules are checked: an executable conformance module checks admission of both models at both levels, the refused edits, the burst boundary and the profile control.

## Temporal hosting and refinement preflight

No new hosting mechanism. A pass-through Task is an internal step inside one command closure; ingress, waits, timers, effects, cancellation, lifecycle and the publication projection are unchanged. A batch that was refused before now commits in one closure, which the host already hosts for other independent batches. The preserved relation is equality of hosted committed state and publications with the core's. Delivery, ordering, deduplication, retry and replay risks are unchanged, because the batch is committed atomically and its result does not depend on order. The smallest witness is the hosted pipeline over the relocation journeys at family closure.

## Evidence and acceptance

The models run as answer-free scenarios with registered pipeline cases, each with a seeded mutation, plus a value-domain matrix row, a corpus row and the About disclosure. The CIB lane extends the root fork probe with the relocation journeys. Because the singleton premise is argued rather than proved, a core test commits every scenario stimulus of both witnesses and asserts that no closure reaches `ambiguousInternalChoice`.

Closure gates:

- **Green at `d13862c5`:** the complete `verify.sh`: the Lean library and `BpmnConformance`, 916 jobs, whose driver holds all 1,287 checks, the five of the [conformance module](../../BpmnSemantics/PassThroughParallelBranchesConformance.lean) among them; the runtime stage with the CIB oracle and the [pass-through Task probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenPassThroughTaskProbeTest.java), six tests; the complete Temporal gate; and the pipeline over all 166 registered cases, warm in 132.1 s at a start load of 0.52 per core. Then the research doctor and `test:model-corpus`, 30 tests.
- **Correction:** the first `verify.sh` run at `c92a48b7` failed two checks of the serial pass-through and root fork conformance modules that still asserted the refusals this family lifts; `d13862c5` flips them to admitted, as their TypeScript twins already were.

Then `PC-HUM-04` is evidenced except two residual forms, a wait-free branch of a terminal fork in a Sub-Process body and a branch of a forking model without an embedded Sub-Process, which the [root Parallel forks](ROOT-PARALLEL-FORKS-SPEC.md#required-optional-and-excluded-scope) exclusion refuses for every branch kind and `PC-CF-03` owns, and stays open on them; `PC-HUM-05` is evidenced except those forms and its implicit split and merge clause. The [single-scope models account](SINGLE-SCOPE-MODELS-SPEC.md#evidence-and-acceptance) has since admitted the second form for both rows.

Nearest unsupported claims:

- pass-through Tasks with several incoming or outgoing flows (`PC-CF-07`);
- a wait-free branch of a terminal fork in a Sub-Process body, which needs `ordinaryEnd` and `regional` pair laws beside declared entries;
- a forking model without an embedded Sub-Process, such as CIB's `threeTasksProcess`, until the [single-scope models account](SINGLE-SCOPE-MODELS-SPEC.md) admitted it;
- forks whose pass-through Tasks exceed the closure limit of eight: a body fork of four pass-only branches is refused, and the office relocation's fork closure has one step of margin;
- in called Processes or Multi-Instance bodies;
- that no admitted closure co-enables an End or regional completion with a frame-inserting entry, which is argued above and checked on the registered scenarios, not proved;
- that every actual closure stays within the admitted burst (not proved in Lean, as for serial pass-through Tasks);
- None Intermediate Throw Events and Link Events.

## Versioning consequences

Apply the [pre-release wire policy](../../contracts/README.md#evolution-policy): no wire shape, schema or value arm changes; admission widens under the profile, the profile artifact grows in place, and no legacy reader or migration is added. No admitted model changes its Program, route or behavior: no forking model this profile admits holds a `mergeExclusive`, and under every other profile declared entries and mapped invocations occur only in Programs whose scheduling rejects observable choices, where no admitted frontier co-enables them with a `mergeInput` today, so making the pair independent changes no committed batch.

### Owners this implementation grows

Build cost is a constraint. No kernel type changes. The hubs this family must touch, and why:

- `StructuredParallelBodyAdmission`: its `Kind` gains `pass`, an interface edit whose cone is 569 modules at `20933b89` (`scripts/lean-fanout.ts`), because the closure scan must count the step exactly; `aritiesValid`, `contractAt` and `contractWeighted` gain arms, and the `import all` proof consumers `StructuredParallelBodyExecution`, `ParallelScopeProgramCapacityProofs` and `SerialBusinessTaskProgressProofs` case on `Kind` and must still check;
- `InternalPreparedTransition`: two new arms in the body of `PreparedInternalTransition.Independent`, because the batch relation is the decision this family changes (hidden-edit cone 75);
- `InternalTransitionBatch`: new cases in the private `prepared_merge_transition_pair` and the declared-entry dispatcher, because the batch law must cover the new arms;
- `NestedScopeControlAdmission`: `reachesWork`, `branchesStartWithWork`, `checkedVertex?` and `operationVertex?` are public definitions whose bodies change; should the profile test need a parameter they do not receive, that is an interface edit with a cone of 479 modules, and new private recursive or `match`-bearing definitions there may also change its public `.olean` ([current boundary](../LEAN-BUILD-MODULARITY-SPEC.md#current-boundary)), so the implementation measures the edit before landing it.

The pair law was planned for a new family-owned leaf module; it landed in [`InternalMergeScopeCreationCommutation`](../../BpmnSemantics/SemanticProcess/InternalMergeScopeCreationCommutation.lean) instead, because a new leaf imported by `InternalTransitionBatch` raised `CommandAdmission`'s hidden-edit cone to 435 against its `lean-fanout` bound of 434, and the bound stays unchanged. The branch scan moved out of `NestedScopeControlAdmission` into the leaf [`NestedScopeBranchWork`](../../BpmnSemantics/SemanticProcess/NestedScopeBranchWork.lean), which keeps that file under the 800-line target. `ParallelScopeProgramCapacity` changes only in bodies. `reachesWork` lives in `NestedScopeControlAdmission`; `StructuredParallelBodyAdmission` owns `Kind`, `aritiesValid`, `contractAt` and `contractWeighted`. All Lean edits land in one commit, so the global fixtures rebuild once.

TypeScript owners: [`internal-transition-batch.ts`](../../packages/semantic-core/src/internal-transition-batch.ts), [`nested-scope-control-admission.ts`](../../packages/semantic-core/src/nested-scope-control-admission.ts), [`merge-region-admission.ts`](../../packages/semantic-core/src/merge-region-admission.ts), the [routing module](../../packages/semantic-core/src/structured-scope-data-routing.ts), and the twins of `Kind`: [`structured-parallel-body-analysis.ts`](../../packages/semantic-core/src/structured-parallel-body-analysis.ts), [`parallel-body-burst-analysis.ts`](../../packages/semantic-core/src/parallel-body-burst-analysis.ts), [`sequential-scope-control-analysis.ts`](../../packages/semantic-core/src/sequential-scope-control-analysis.ts), [`repeated-scope-control-analysis.ts`](../../packages/semantic-core/src/repeated-scope-control-analysis.ts) and [`parallel-scope-program-capacity.ts`](../../packages/semantic-core/src/parallel-scope-program-capacity.ts).

Guards the implementation must change or satisfy: [`lean-fanout`](../../scripts/lean-fanout.test.ts), [`lean-module-cost`](../../scripts/lean-module-cost.test.ts), [`source-hygiene`](../../scripts/source-hygiene.test.ts), the [Start capacity envelope test](../../packages/temporal-adapter/protocol/test/start-capacity-envelope.test.ts), whose routing stays unchanged; the refusals that flip to admitted witnesses in the [pass-through Task source test](../../packages/bpmn-source/test/pass-through-task-source.test.ts) and the [root Parallel forks source test](../../packages/bpmn-source/test/root-parallel-forks-source.test.ts); and the [concurrent scope data runtime test](../../packages/bpmn-source/test/concurrent-scope-data-runtime.test.ts), whose lock of `mergeInput` as dependent on a declared entry flips to independent beside a separated footprint.

Registration: the `CIB-EXT-0022` scope in the [register](../CIB-BPMN-RELATION-REGISTER.md); the profile artifact and README; the [pass-through Task specification](PASS-THROUGH-TASK-SPEC.md#required-optional-and-excluded-scope) and the [root Parallel forks specification](ROOT-PARALLEL-FORKS-SPEC.md#required-optional-and-excluded-scope), whose branch exclusions this family narrows; the owner passages whose premise this family changes: the `CSD-PREPARE-01` batch premise and singleton argument of the [concurrent scope data specification](CONCURRENT-SCOPE-DATA-SPEC.md), and the profile exclusion `pass-through-tasks-on-parallel-branches-or-in-called-processes` of the profile artifact, narrowed to called Processes and wait-free terminal branches rather than removed; scenarios, pipeline cases, the value-domain matrix, the corpus, About and the CIB probe.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `4d79c06e` | `fork-turns-none` | `approve-with-required-edits` | `754dcef8` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `49274572` | `fork-turns-none` | `approve-with-required-edits` | `c1ecfd72, a4cbd5a4` |
