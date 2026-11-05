# Data-declaring terminal branches proposal

## Status

Lifecycle: draft
Review: approved

## Question and delivery boundary

Can the nested scope-data profile admit a wait-free terminal branch in a definition whose Sub-Process declares scope-local data, so that a None End reached in the same closure batch as a declared Sub-Process entry commits through a proved commutation law instead of the batch refusing, while every other profile, every admitted model and every command and observation keep their meaning?

This is the next family of batch 4 in [PLAN](../PLAN.md#scheduled-delivery-batches) (task and control breadth). Its mechanism is one missing pair law: an ordinary End beside a declared entry, the only member that [`TFK-DATA-01`](TERMINAL-FORKS-SPEC.md#stable-rules) keeps away from a wait-free terminal branch. It serves the clauses of the [coverage checklist](../PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) that this mechanism holds open:

- `PC-HUM-04`, primary: Plain Task pass-through on a wait-free terminal branch in a definition that declares scope-local data, the row's last open clause.
- `PC-HUM-05`: the same form for the Manual Task. The row stays open on implicit split and merge (`PC-CF-07`).

Screened out, each with its reason:

- Implicit Activity split and merge (`PC-CF-07`, `PC-HUM-05`'s other clause, `PC-BASIC-02`'s multiple sources): larger reach (28 and 15 of 2,333 deduplicated CIB Seven test models hold Activity fan-in and fan-out, measured 2026-11-04 over `../oss/cibseven/cibseven` at `5a45b47`), but it needs the kernel extension the [implicit fan-in proposal](IMPLICIT-FAN-IN-PROPOSAL.md#independent-cold-review-receipt) was rejected on; the next family.
- Script and Business Rule Tasks (`PC-AUTO-05` to `PC-AUTO-08`): both open with a dependency and runtime design decision.
- The Send Task's prescribed failure (`PC-AUTO-04`): it depends on the open rows `PC-AUTO-02` and `PC-AUTO-03`.

Selection, 2026-11-04: close call against implicit split and merge, which has the larger reach; this family closes a row with one pair law and no kernel change, so it goes first.

## Normative basis and CIB classification

Unchanged from the [terminal forks specification](TERMINAL-FORKS-SPEC.md#normative-basis-and-cib-classification): Clause 10.5.3 lets each parallel path end at its own End, Clause 13.5.6 completes a scope only when no token remains, and nothing asks a path to wait. Scope-local data (Clause 10.4.1 data scoping, realized by CIB Seven's `camunda:inputOutput` on a Sub-Process under [`CIB-EXT-0019`](../CIB-BPMN-RELATION-REGISTER.md)) belongs to the Sub-Process instance and is invisible to a sibling path; an End consumes only its own token. Neither text orders an End against a sibling path's Sub-Process entry, so any order is conforming and both orders must produce one state.

CIB Seven `2.2.0` at the pinned checkout runs the two paths as concurrent child executions: the End removes its concurrent execution (`PvmAtomicOperationActivityEnd`), and the entry creates the Sub-Process scope execution and runs its input mappings when it enters the activity instance (`PvmExecutionImpl#enterActivityInstance` → `executeIoMapping` → `IoMapping.executeInputParameters`, `PvmExecutionImpl.java:250-257, 1314`). The last concurrent End's `tryPruneLastConcurrentChild` (`PvmExecutionImpl.java:577-605`) replaces the surviving concurrent execution and re-parents the Sub-Process scope execution, but preserves that scope execution and its local variables, so neither path changes the other's variables or the Sub-Process instance; this invariance is what the probe calibrates. Classification: no new relationship. The boundary of [`CIB-EXT-0022`](../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0022--abstract-and-manual-tasks-as-immediate-pass-through) drops its condition that no Sub-Process of the definition declares scope-local data.

## Required, optional and excluded scope

Required, for the nested scope-data profile only:

- **Wait-free terminal branches beside data.** Every wait-free terminal branch that [`TFK-ADMIT-01`](TERMINAL-FORKS-SPEC.md#stable-rules) admits in a data-free definition is admitted in a definition that declares scope-local data, in the root and in Sub-Process bodies.
- **End beside declared entry.** A closure batch may hold an ordinary End and a declared entry together and commits them in either order to one state.

Optional: none.

Excluded, each refused at admission or by the batch premise:

- every form above under any other profile;
- an End beside a mapped Call invocation: `CMCALL-ADMIT-01` and the root Parallel forks account keep a mapped invocation from being co-enabled, and its pair with an End stays dependent;
- every other exclusion of the [terminal forks](TERMINAL-FORKS-SPEC.md#required-optional-and-excluded-scope) account, including implicit split and merge, Exclusive Choices to separate Ends and Link Events with several sources.

## Profile and public contract

The profile `cibseven-2.2.0-nested-embedded-scope-data-draft` grows in place under the [cumulative profile rule](../../contracts/README.md). The [profile artifact](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json) keeps the feature `terminal-forks` and narrows its exclusion `pass-through-tasks-in-called-processes-or-on-wait-free-terminal-branches-beside-scope-local-data` to `pass-through-tasks-in-called-processes`; the [profile README](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/README.md) states the class. Value domain, Start, effect and closure-limit contracts, observation, wire contracts and the checked-process schema are unchanged.

## Representation and runtime ownership

No kernel type, IL, opcode, Program or runtime-step change. The End and the declared entry keep their preparations and their `apply`; only the batch independence relation grows.

**The pair law.** A declared entry is a scope creation followed by a frame insertion that evaluates the Sub-Process's input mappings from the parent's visible variables ([`PreparedInternalDeclaredEntry`](../../BpmnSemantics/SemanticProcess/InternalScopeCreationPreparation.lean)). An End removes one token from its input place and increments `endOccurrences` (`InternalEndSelection.apply`, footprint write `.endIncrement`); it touches no variable, scope frame, task or child, and the entry neither reads nor writes `endOccurrences`. The theorem `prepared_end_declared_entry_pair`, in the existing leaf [`InternalEndScopeCreationCommutation`](../../BpmnSemantics/SemanticProcess/InternalEndScopeCreationCommutation.lean) (the placement deviation under [Evidence and acceptance](#evidence-and-acceptance)), composes the existing `prepared_end_scope_creation_pair_commutes` (End beside the entry's scope creation) with a variable frame for the End, exactly as `prepared_declared_entry_merge_pair` composes the Merge's law: under independent footprints, each stays prepared after the other and both orders give one state. The premise is the existing regional footprint independence of the End's state footprint and the entry's lifted footprint, the relation `PreparedInternalTransition.Independent` already applies to an End and a scope creation. No regional-footprint subset lemma exists, so the leaf proves a private one (lifting is monotone). The law returns exactly the triple that `prepared_end_transition_pair` consumes, so each dispatch site is one `exact`.

**Publication.** Publication template frames are per step family ([`InternalTransitionPublicationTemplate`](../../BpmnSemantics/SemanticProcess/InternalTransitionPublicationTemplate.lean)), so the batch publication needs no new case: an End and a declared entry each keep their own published step.

**Independence.** `PreparedInternalTransition.Independent` gains the two arms `ordinaryEnd`/`declaredEntry` and `declaredEntry`/`ordinaryEnd`, each the regional footprint independence above, placed before the catch-all that makes every other declared-entry companion dependent. `InternalTransitionBatch`'s two dispatch sites that eliminate this pair as `False` call the new law instead. The core's `preparedInternalTransitionsAreIndependent` adds the ordinary End family to `declaredEntryCompanions` and keeps its footprint test.

**Singleton premise.** The [concurrent scope data specification](CONCURRENT-SCOPE-DATA-SPEC.md#representation-and-runtime-ownership)'s premise for a batch holding a declared entry grows from scope creations, armings, local control and merge inputs to also ordinary Ends, now by a proved law rather than by admission. Its singleton argument keeps regional completion away from an entry unchanged: a scope still becomes quiescent only through the single token of the command that ended its last wait, because a wait-free branch ends inside the closure that forks it and every body still arms a task on entry. A violated premise still fails closed to `ambiguousInternalChoice` and commits nothing. The [pass-through branch specification](PASS-THROUGH-PARALLEL-BRANCHES-SPEC.md#representation-and-runtime-ownership) named `ordinaryEnd` and `regional` laws as what wait-free terminal paths beside data would need; only the End law is needed, because that singleton argument keeps every regional completion out of a batch with an entry.

**Other profiles.** The independence change is profile-agnostic, but no admitted model of another profile changes behavior: every other profile keeps the strict cut, so no wait-free path reaches an End below a fork there, and no frontier of theirs holds an End beside an entry; the embedded completion data-bearing route in particular keeps it.

Rejected alternatives:

- a per-closure analysis that refuses only closures holding both an End and a declared entry: exact, but it adds a flag to the burst composition in both languages and keeps a refusal for a conforming, CIB-supported shape;
- keeping `TFK-DATA-01` and serving the clause with a data-free model: the clause names a data-declaring definition.

## Admission

Admission stays [profile-parameterized](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md). Under this profile only, at the Program and checked levels alike, the branch cut stops consulting scope-local data: the private profile-aware entry points (`checkedModel` and `programModel` in Lean through `terminalForkBoundsKept` and `branchesReachWorkOrEnd` in [`NestedScopeBranchWork`](../../BpmnSemantics/SemanticProcess/NestedScopeBranchWork.lean), the checked and Program model functions of the [TypeScript twin](../../packages/semantic-core/src/nested-scope-control-admission.ts) through [`nested-scope-branch-work.ts`](../../packages/semantic-core/src/nested-scope-branch-work.ts)) re-impose the strict cut only for every other profile. The closure-burst composition and `semanticProcessClosureLimit = 8` are unchanged.

Nearest wrong algorithms, each with a separating witness below:

1. dropping the data test without the pair law, so the batch of an End beside an entry refuses with `ambiguousInternalChoice` at runtime;
2. making the End independent of every frame-inserting member, so an End batches beside a mapped invocation that no law covers;
3. relaxing the cut for data-declaring definitions under every profile;
4. dropping it at one level only.

## Stable rules

| Rule | Statement |
|---|---|
| `DTB-ADMIT-01` | Under the nested scope-data profile, a wait-free terminal branch is admitted whether or not the definition declares scope-local data, at the Program and checked levels alike. |
| `DTB-COMMUTE-01` | An ordinary End and a declared entry with independent footprints commute: each stays prepared after the other, and both orders give one state. |
| `DTB-PREMISE-01` | The declared entry's companion set grows by exactly the ordinary End; an End and a mapped invocation stay dependent. |
| `DTB-PROFILE-01` | Every other profile refuses each form it refuses today. |

`TFK-DATA-01` is retired; the [terminal forks specification](TERMINAL-FORKS-SPEC.md#stable-rules) records its replacement at closure.

## Newly reachable waits and resumption

None of a new kind. The waits are the User Task and effect waits of the admitted accounts; a wait-free branch adds none.

## Separating witnesses

One new whole model, with a source overlay and a mapped Service Task as the profile's serial rule requires:

- **Expense claim** (root terminal fork beside a data-declaring Sub-Process):
  - Start binds `claim`; mapped Service Task *Check claim policy*, input `claim`, output `policyLimit` → Parallel fork *Split claim handling* into three branches.
  - Branch one: plain Task *Assign reviewer* → Sub-Process *Review claim*, declaring `verdict = "pending"` with output `reviewVerdict = ${verdict}`; body Start → User Task *Approve claim* → End → root End *Claim reviewed*.
  - Branch two, wait-free: Manual Task *File paper receipt* → End *Receipt filed*.
  - Branch three, wait-free: plain Task *Notify cost centre* → End *Cost centre notified*.
  - After the policy result, the closure runs the fork, then one batch of the three merges, then one batch of the declared entry of *Review claim* and both Ends (End beside declared entry, End beside End), then the arming of *Approve claim*. One journey: after the policy result the Process waits only at *Approve claim*, with both wait-free Ends consumed and `verdict` visible only in *Review claim*; completing it completes the Sub-Process, writes `reviewVerdict` and completes the Process. Its largest burst is the admitted bound 8 at both levels, measured on its data-free twin at `b99f99a7` (2026-11-05) and by the review on the declaring model with the change applied; a larger burst refuses the model and returns this proposal to design.
- **Inverted refusals.** The `TFK-DATA-01` refusals become admission witnesses at both levels: the declaring office move of the [terminal forks source test](../../packages/bpmn-source/test/terminal-forks-source.test.ts) (burst 7), the invoice settlement's plain-Task terminal branch in the [pass-through branch source test](../../packages/bpmn-source/test/pass-through-parallel-branches-source.test.ts) (burst 5), and the onboarding's None Throw terminal branch in the [None Throw source test](../../packages/bpmn-source/test/none-intermediate-throw-source.test.ts) (burst 8), with their Lean twins in the root Parallel forks, pass-through branch and None Throw conformance modules (wrong algorithm 4).
- **Re-attributed refusal.** The invoice settlement's terminal branch through a nested wait-free fork stays refused: its burst is 9, and its data-free twin is refused too, so `PTPB-BURST-01`, not `TFK-DATA-01`, decides it. Its comment and test name in both twins (the pass-through branch source test and `PassThroughParallelBranchesConformance`) are corrected to the burst rule, and its nested fork with the join going straight to the End (burst 8) is added as an admitted twin.
- **Profile control (minimal pair).** The declaring office move with *Return keys* as a User Task and the parking branch as a direct End, so it has no pass vertex: refused under the embedded completion profile by the concurrent scope-data admission and admitted under this profile, each asserted at the checked and Program levels and at profile admission (wrong algorithms 3 and 4).
- **Batch premise.** A core test relabels the facility inspection's prepared sibling entry as an End beside its declared entry and asserts the pair is independent and batches, and the expense claim's journey commits with no ambiguous choice, killing the code mutation that removes the End from the declared-entry companions (wrong algorithm 1); a second asserts that an End beside a mapped invocation stays dependent (wrong algorithm 2), so the [concurrent scope data runtime test](../../packages/bpmn-source/test/concurrent-scope-data-runtime.test.ts)'s refusal table keeps every family but the End. A runtime test drives the expense claim journey and asserts that no stimulus reports `ambiguousInternalChoice`, because the answer-free pipeline would otherwise accept a rollback both targets share.
- **Runtime control:** the pipeline case's seeded result mutation rewrites the policy result's command outcome to `rolledBack`, the outcome wrong algorithm 1 produces (confirmed by the review's probe with only the admission change applied), as the pass-through branch movers-first case does; it must disagree.

## Rule-to-evidence matrix

| Rule | Positive and negative witness | Lanes | Killing mutation |
|---|---|---|---|
| `DTB-ADMIT-01` | The expense claim and the three inverted refusals admitted at both levels; the nested-fork edit refused by the burst | Source, core, Lean conformance checks, pipeline | Drop the test at one level (4) |
| `DTB-COMMUTE-01` | The expense claim journey through the End and entry batch, with no ambiguous internal choice | Lean theorem, core batch and runtime tests, pipeline across Lean, core and Temporal; CIB probe | Drop the End companion (1), killed by the core batch test; its rolled-back result, by the pipeline mutation |
| `DTB-PREMISE-01` | End beside mapped invocation dependent, at both languages | Core test, Lean `Independent` definition | Make the End independent of every frame-inserting member (2) |
| `DTB-PROFILE-01` | The pass-vertex-free minimal pair, refused under the embedded completion profile and admitted under this one, per level and at profile admission | Core and Lean conformance checks | Relax the cut for data-declaring definitions under every profile (3) |

## Lean assurance lane

Lane shape: proved

Evidence: the family adds one runtime pair law, so under the owner direction of 2026-10-14 in the [assurance-lane rule](../PROJECT-DESIGN.md#lean-assurance-lane) it takes `proved`. `prepared_end_declared_entry_pair` is quantified over every Program, state and prepared pair, and the batch induction of [`InternalTransitionBatch`](../../BpmnSemantics/SemanticProcess/InternalTransitionBatch.lean) consumes it, so every admitted batch that holds both commits through the law. Admission checks join [`rootParallelForksConformanceChecks`](../../BpmnSemantics/RootParallelForksConformance.lean#rootParallelForksConformanceChecks). What stays argued, not proved, is unchanged in kind: that no admitted closure co-enables an End with a mapped invocation, and that every actual closure stays within the computed burst.

## Temporal hosting and refinement preflight

No new hosting mechanism. Ingress is the existing Start, effect result and User Task completion; waits are User Tasks and effects; no timer, cancellation or lifecycle transition is introduced. The new batch commits inside one closure, so the preserved relation stays equality of hosted committed state and publications with the core's, and delivery, ordering, deduplication, retry and replay risks are unchanged. The smallest witness is the hosted pipeline over the expense claim journey at family closure.

## Evidence and acceptance

The model runs as an answer-free scenario with a registered pipeline case and its seeded mutation, a value-domain matrix row, a corpus row and the About disclosure. The CIB lane extends the [pass-through Task probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenPassThroughTaskProbeTest.java) with the journey, calibrating that *File paper receipt* and *Notify cost centre* each end one activity instance, that `verdict` is a local variable of the *Review claim* instance only, and that the Process ends only with *Approve claim*'s completion.

Then `PC-HUM-04` closes, and `PC-HUM-05` is evidenced except implicit split and merge.

Implemented with one placement deviation. The law `prepared_end_declared_entry_pair` and its private subset lemma live in the existing leaf [`InternalEndScopeCreationCommutation`](../../BpmnSemantics/SemanticProcess/InternalEndScopeCreationCommutation.lean), not in a new leaf: under the `leanHiddenEditFanouts` simulation a new leaf importing the batch's prerequisites raised the `CommandAdmission` cone from 434 to 435, while the host, which `InternalTransitionBatch` already imports, keeps it at 434. The host declares the equation lemmas of the three regional-independence definitions its subset lemma unfolds with `privateEquations`, as the [build modularity contract](../LEAN-BUILD-MODULARITY-SPEC.md#module-rules) requires, and `InternalTransitionBatch` stands at 799 of 800 nonblank lines. The [source test](../../packages/bpmn-source/test/data-declaring-terminal-branches-source.test.ts) admits the expense claim at burst 8 at both levels, runs its journey with no ambiguous internal choice and `verdict` only in *Review claim*'s frame, and refuses the minimal pair under the embedded completion identity at both analyses and at profile admission. The [root Parallel forks conformance module](../../BpmnSemantics/RootParallelForksConformance.lean) holds fifteen checks, the pass-through branch module adds the nested wait-free fork straight to its End (burst 8) beside the burst-9 refusal, and the None Throw module inverts its terminal refusal. Re-measured module costs: root Parallel forks 321,392 KiB, pass-through branches 319,248 KiB and None Throw 323,360 KiB after the closure correction asserted their admitted bursts (5 and 8; 8). Called Processes keep refusing pass-through Tasks under the profile exclusion `pass-through-tasks-in-called-processes`, whose breadth no open checklist row owns: at most 24 called-process definitions among 2,341 deduplicated CIB Seven test files at `5a45b47` hold a `task` or `manualTask` (closure review, 2026-11-05, matched by id, so an over-approximation).

Closure gates: green at `cd9cbb4c`, the local `LEAN_FULL_GATE=dtb-closure` Lean library test and `BpmnConformance` builds, and hosted `verify-complete` on PR 57 with the Lean library and executable checks, the runtime stage with the CIB oracle and the pass-through Task probe, both integration pipeline legs, Temporal and Temporal serial.

## Versioning consequences

No wire, schema or Program change, so the [pre-release wire policy](../../contracts/README.md#evolution-policy) has nothing to migrate. No admitted model changes its Program, route or behavior, by the [other-profile argument](#representation-and-runtime-ownership) above; previously refused models of this profile become admitted.

### Owners this implementation grows

Hubs touched, each because the closed-world dispatch lives there and no leaf can serve: `InternalPreparedTransition` (two arms of `PreparedInternalTransition.Independent`, a body edit of an existing definition, stated on `stateFootprint` so `independent_symm` closes both; it has 60 `import all` importers) and `InternalTransitionBatch` (the two `False` sites, lines 210 and 443-444 at `b99f99a7`, each replaced by one `exact`, proof bodies only). If the two sites would take `InternalTransitionBatch` past the review target, a cohesive helper is extracted into a leaf before it grows, never an exception. Both hub edits land in one commit so the fixtures rebuild once. The law lives in the existing leaf `InternalEndScopeCreationCommutation`, its helpers private. No guard bound changes.

- Lean: the host leaf `InternalEndScopeCreationCommutation`, which gains imports of `InternalDeclaredEntryCommutation` and `NestedScopeDataLaws`, and the two hubs above. [`NestedScopeBranchWork`](../../BpmnSemantics/SemanticProcess/NestedScopeBranchWork.lean)'s `terminalForkBoundsKept` drops its `declaresData` parameter, an interface edit of a leaf that only `NestedScopeControlAdmission` imports, privately; [`NestedScopeControlAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeControlAdmission.lean) takes body edits at its two call sites, shortening them. Predicted rebuild set beyond the hubs' importers: the two modules, the six modules that `import all` `NestedScopeControlAdmission` (named in the [terminal forks owners](TERMINAL-FORKS-SPEC.md#owners-this-implementation-grows)), and `RootParallelForksConformance`, `PassThroughParallelBranchesConformance` and `NoneIntermediateThrowConformance`, which invert or re-attribute their witnesses. Their cost rows are re-measured.
- TypeScript: [`internal-transition-batch.ts`](../../packages/semantic-core/src/internal-transition-batch.ts) (the companion set and its comment), the [nested scope-control admission](../../packages/semantic-core/src/nested-scope-control-admission.ts), whose `terminalForks` collapses to one flag and drops its unused `records` parameter, and the [branch-work module](../../packages/semantic-core/src/nested-scope-branch-work.ts).
- Source: none.

Guards the implementation must satisfy, with bounds unchanged: [`lean-fanout`](../../scripts/lean-fanout.test.ts), [`lean-module-cost`](../../scripts/lean-module-cost.test.ts), [`source-hygiene`](../../scripts/source-hygiene.test.ts) and the [Start capacity envelope test](../../packages/temporal-adapter/protocol/test/start-capacity-envelope.test.ts).

Owner passages amended at closure: `TFK-DATA-01` and the co-enabled-member paragraph of the [terminal forks specification](TERMINAL-FORKS-SPEC.md#representation-and-runtime-ownership); the premise and singleton argument of the [concurrent scope data specification](CONCURRENT-SCOPE-DATA-SPEC.md#representation-and-runtime-ownership); the singleton premise of the [Inclusive Gateway regions specification](INCLUSIVE-GATEWAY-REGIONS-SPEC.md#representation-and-runtime-ownership), which rests on `TFK-DATA-01`; the residual forms, singleton restatement, rejected alternative and owner notes of the [pass-through branch specification](PASS-THROUGH-PARALLEL-BRANCHES-SPEC.md#representation-and-runtime-ownership); the data-declaring exclusion of the [None Throw specification](NONE-INTERMEDIATE-THROW-SPEC.md#required-optional-and-excluded-scope); the `CIB-EXT-0022` boundary; the profile README; the evidence cells of `PC-HUM-04` and `PC-HUM-05`, and of `PC-CF-03` and `PC-BASIC-01`, whose wait-free Ends and concurrent None Ends widen to data-declaring definitions; the companion-set comments in `internal-transition-batch.ts` and `PreparedInternalTransition.Independent`; and the comments that state `TFK-DATA-01` in both admission owners, the Lean leaf and the three conformance modules and source tests.

Registration: the profile artifact's exclusion and its README; scenario, pipeline case, value-domain matrix, corpus, About and the CIB probe; the [requirement ledger](../BPMN-REQUIREMENT-LEDGER.md) needs no new row.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `b99f99a7` | `fork-turns-none` | `approve-with-required-edits` | `6e20e05c, b58b8c42` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
