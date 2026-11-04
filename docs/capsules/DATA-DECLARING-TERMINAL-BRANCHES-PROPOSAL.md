# Data-declaring terminal branches proposal

## Status

Lifecycle: draft
Review: pending

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

CIB Seven `2.2.0` at the pinned checkout runs the two paths as concurrent child executions: the End removes its execution (`PvmAtomicOperationActivityEnd`), and the entry creates the Sub-Process scope execution and runs its input mappings (`AbstractBpmnActivityBehavior`, `IoMapping.executeInputParameters`); neither touches the other's execution or variables. Classification: no new relationship. The boundary of [`CIB-EXT-0022`](../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0022--abstract-and-manual-tasks-as-immediate-pass-through) drops its condition that no Sub-Process of the definition declares scope-local data.

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

**The pair law.** A declared entry is a scope creation followed by a frame insertion that evaluates the Sub-Process's input mappings from the parent's visible variables ([`PreparedInternalDeclaredEntry`](../../BpmnSemantics/SemanticProcess/InternalPreparedTransition.lean)). An End removes one token from its input place and touches no variable, scope frame, task, child or counter. New theorem `prepared_declared_entry_end_pair`, in a new leaf `InternalEndDeclaredEntryCommutation`, composes the existing `prepared_end_scope_creation_pair_commutes` (End beside the entry's scope creation) with a variable frame for the End, exactly as `prepared_declared_entry_merge_pair` composes the Merge's law: under independent footprints, each stays prepared after the other and both orders give one state. The premise is the existing regional footprint independence of the End's state footprint and the entry's lifted footprint, the relation `PreparedInternalTransition.Independent` already applies to an End and a scope creation.

**Independence.** `PreparedInternalTransition.Independent` gains the two arms `ordinaryEnd`/`declaredEntry` and `declaredEntry`/`ordinaryEnd`, each the regional footprint independence above, placed before the catch-all that makes every other declared-entry companion dependent. `InternalTransitionBatch`'s two dispatch sites that eliminate this pair as `False` call the new law instead. The core's `preparedInternalTransitionsAreIndependent` adds the ordinary End family to `declaredEntryCompanions` and keeps its footprint test.

**Singleton premise.** The [concurrent scope data specification](CONCURRENT-SCOPE-DATA-SPEC.md#representation-and-runtime-ownership)'s premise for a batch holding a declared entry grows from scope creations, armings, local control and merge inputs to also ordinary Ends, now by a proved law rather than by admission. Its singleton argument keeps regional completion away from an entry unchanged: a scope still becomes quiescent only through the single token of the command that ended its last wait, because a wait-free branch ends inside the closure that forks it and every body still arms a task on entry. A violated premise still fails closed to `ambiguousInternalChoice` and commits nothing.

Rejected alternatives:

- a per-closure analysis that refuses only closures holding both an End and a declared entry: exact, but it adds a flag to the burst composition in both languages and keeps a refusal for a conforming, CIB-supported shape;
- keeping `TFK-DATA-01` and serving the clause with a data-free model: the clause names a data-declaring definition.

## Admission

Admission stays [profile-parameterized](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md). Under this profile only, at the Program and checked levels alike, the branch cut stops consulting scope-local data: the private profile-aware entry points (`checkedModel` and `programModel` in Lean through `terminalForkBoundsKept` and `branchesReachWorkOrEnd` in [`NestedScopeBranchWork`](../../BpmnSemantics/SemanticProcess/NestedScopeBranchWork.lean), the checked and Program model functions of the [TypeScript twin](../../packages/semantic-core/src/nested-scope-control-admission.ts) through [`nested-scope-branch-work.ts`](../../packages/semantic-core/src/nested-scope-branch-work.ts)) re-impose the strict cut only for every other profile. The closure-burst composition and `semanticProcessClosureLimit = 8` are unchanged.

Nearest wrong algorithms, each with a separating witness below:

1. dropping the data test without the pair law, so the batch of an End beside an entry refuses with `ambiguousInternalChoice` at runtime;
2. making the End independent of every frame-inserting member, so an End batches beside a mapped invocation that no law covers;
3. dropping the data test for every profile;
4. dropping it at one level only.

## Stable rules

| Rule | Statement |
|---|---|
| `DTB-ADMIT-01` | Under the nested scope-data profile, a wait-free terminal branch is admitted whether or not the definition declares scope-local data, at the Program and checked levels alike. |
| `DTB-COMMUTE-01` | An ordinary End and a declared entry with independent footprints commute: each stays prepared after the other, and both orders give one state. |
| `DTB-PREMISE-01` | A batch holding a declared entry holds only declared entries, scope creations, armings, local control, merge inputs and ordinary Ends; an End and a mapped invocation stay dependent. |
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
  - After the policy result, the closure runs the fork, then one batch of the three merges, then one batch of the declared entry of *Review claim* and both Ends (End beside declared entry, End beside End), then the arming of *Approve claim*. One journey: after the policy result the Process waits only at *Approve claim*, with both wait-free Ends consumed and `verdict` visible only in *Review claim*; completing it completes the Sub-Process, writes `reviewVerdict` and completes the Process. The predicted largest burst is the admitted bound 8, which both analyses confirm at implementation; a larger burst refuses the model and returns this proposal to design.
- **Inverted refusals.** The three `TFK-DATA-01` refusals become admission witnesses at both levels: the declaring office move of the [terminal forks source test](../../packages/bpmn-source/test/terminal-forks-source.test.ts), the invoice settlement's wait-free terminal branches in the [pass-through branch source test](../../packages/bpmn-source/test/pass-through-parallel-branches-source.test.ts), and the onboarding's None Throw terminal branch in the [None Throw source test](../../packages/bpmn-source/test/none-intermediate-throw-source.test.ts), with their Lean twins in the root Parallel forks, pass-through branch and None Throw conformance modules. Each stays refused under the embedded completion profile where that profile reads the model (wrong algorithms 3 and 4).
- **Batch premise.** A core test prepares the expense claim's End and declared entry and asserts the batch commits; a second asserts that an End beside a mapped invocation stays dependent (wrong algorithm 2), so the [concurrent scope data runtime test](../../packages/bpmn-source/test/concurrent-scope-data-runtime.test.ts)'s refusal table keeps every family but the End.
- **Runtime control:** a seeded pipeline mutation that removes the End from the core's declared-entry companions must disagree on the expense claim journey, which then rolls back with `ambiguousInternalChoice` (wrong algorithm 1).

## Rule-to-evidence matrix

| Rule | Positive and negative witness | Lanes | Killing mutation |
|---|---|---|---|
| `DTB-ADMIT-01` | The expense claim and the three inverted refusals admitted at both levels | Source, core, Lean conformance checks, pipeline | Drop the test at one level (4) |
| `DTB-COMMUTE-01` | The expense claim journey through the End and entry batch | Lean theorem, core, pipeline across Lean, core and Temporal; CIB probe | Drop the End companion (1) |
| `DTB-PREMISE-01` | End beside mapped invocation dependent, at both languages | Core test, Lean `Independent` definition | Make the End independent of every frame-inserting member (2) |
| `DTB-PROFILE-01` | The inverted refusals under the embedded completion profile | Core and Lean conformance checks | Drop the test for every profile (3) |

## Lean assurance lane

Lane shape: proved

Evidence: the family adds one runtime pair law, so under the owner direction of 2026-10-14 in the [assurance-lane rule](../PROJECT-DESIGN.md#lean-assurance-lane) it takes `proved`. `prepared_declared_entry_end_pair` is quantified over every Program, state and prepared pair, and the batch induction of [`InternalTransitionBatch`](../../BpmnSemantics/SemanticProcess/InternalTransitionBatch.lean) consumes it, so every admitted batch that holds both commits through the law. Admission checks join [`rootParallelForksConformanceChecks`](../../BpmnSemantics/RootParallelForksConformance.lean#rootParallelForksConformanceChecks). What stays argued, not proved, is unchanged in kind: that no admitted closure co-enables an End with a mapped invocation, and that every actual closure stays within the computed burst.

## Temporal hosting and refinement preflight

No new hosting mechanism. Ingress is the existing Start, effect result and User Task completion; waits are User Tasks and effects; no timer, cancellation or lifecycle transition is introduced. The new batch commits inside one closure, so the preserved relation stays equality of hosted committed state and publications with the core's, and delivery, ordering, deduplication, retry and replay risks are unchanged. The smallest witness is the hosted pipeline over the expense claim journey at family closure.

## Evidence and acceptance

The model runs as an answer-free scenario with a registered pipeline case and its seeded mutation, a value-domain matrix row, a corpus row and the About disclosure. The CIB lane extends the [pass-through Task probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenPassThroughTaskProbeTest.java) with the journey, calibrating that *File paper receipt* and *Notify cost centre* each end one activity instance, that `verdict` is a local variable of the *Review claim* instance only, and that the Process ends only with *Approve claim*'s completion.

Then `PC-HUM-04` closes, and `PC-HUM-05` is evidenced except implicit split and merge.

## Versioning consequences

No wire, schema or Program change, so the [pre-release wire policy](../../contracts/README.md#evolution-policy) has nothing to migrate. No admitted model changes its Program, route or behavior; previously refused models become admitted.

### Owners this implementation grows

Hubs touched, each because the closed-world dispatch lives there and no leaf can serve: `InternalPreparedTransition` (two arms of `PreparedInternalTransition.Independent`, a body edit of an existing definition) and `InternalTransitionBatch` (two dispatch arms, proof bodies only). Every closed-world consumer that eliminates the pair as `False` takes the same body edit, found by the narrow builds. The law lives in the new leaf, private helpers by default. No guard bound changes.

- Lean: the new leaf; `NestedScopeBranchWork` and the two hubs above, body edits; `RootParallelForksConformance`, `PassThroughParallelBranchesConformance` and `NoneIntermediateThrowConformance` invert their witnesses. Their cost rows are re-measured.
- TypeScript: [`internal-transition-batch.ts`](../../packages/semantic-core/src/internal-transition-batch.ts) (the companion set), the [nested scope-control admission](../../packages/semantic-core/src/nested-scope-control-admission.ts) and [branch-work module](../../packages/semantic-core/src/nested-scope-branch-work.ts).
- Source: none.

Guards the implementation must satisfy, with bounds unchanged: [`lean-fanout`](../../scripts/lean-fanout.test.ts), [`lean-module-cost`](../../scripts/lean-module-cost.test.ts), [`source-hygiene`](../../scripts/source-hygiene.test.ts) and the [Start capacity envelope test](../../packages/temporal-adapter/protocol/test/start-capacity-envelope.test.ts).

Owner passages amended at closure: `TFK-DATA-01` and the co-enabled-member paragraph of the [terminal forks specification](TERMINAL-FORKS-SPEC.md#representation-and-runtime-ownership); the premise and singleton argument of the [concurrent scope data specification](CONCURRENT-SCOPE-DATA-SPEC.md#representation-and-runtime-ownership); the `CIB-EXT-0022` boundary; the profile README and the evidence cells of both rows; the comments that state `TFK-DATA-01` in both admission owners, the Lean leaf and the three conformance modules and source tests.

Registration: the profile artifact's exclusion and its README; scenario, pipeline case, value-domain matrix, corpus, About and the CIB probe; the [requirement ledger](../BPMN-REQUIREMENT-LEDGER.md) needs no new row.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
