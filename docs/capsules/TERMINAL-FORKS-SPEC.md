# Terminal forks specification

## Status

Lifecycle: implemented
Review: approved

## Question and delivery boundary

Can the nested scope-data profile admit an unjoined Parallel fork in the Process root, whose branches each end at their own None End, and a terminal-fork branch in the root or a Sub-Process body that reaches its End without waiting, so that the first End reached never completes its scope, the scope completes only when no token, wait or child remains, and every other profile, every admitted model and every command and observation keep their meaning?

This is the next family of batch 4 in [PLAN](../PLAN.md#scheduled-delivery-batches) (control-flow breadth). Its mechanism is the several-End body: a scope that ends through more than one None End, completing by quiescence. It serves the clauses of the [coverage checklist](../PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) that this mechanism holds open:

- `PC-HUM-04`, primary: Plain Task pass-through on a wait-free branch of a terminal fork in a Sub-Process body, the residual form recorded in the [pass-through branch specification](PASS-THROUGH-PARALLEL-BRANCHES-SPEC.md#evidence-and-acceptance), for definitions that declare no scope-local data. The row stays open on the same form in a data-declaring definition (`TFK-DATA-01`).
- `PC-HUM-05`: the same form for the Manual Task. The row stays open on that data-declaring form and on implicit split and merge (`PC-CF-07`).
- `PC-CF-03`: wait-free body Ends and root Ends, where the first separate End cannot complete its scope; terminal forks whose branches wait are already admitted in bodies. The row stays open on its other clauses.
- `PC-BASIC-01`: concurrent None Ends and explicit root-versus-child completion. The row stays open on multiple outgoing Start flows.

Screened out, each with its reason:

- Exclusive Choices whose branches end at separate Ends, the second-largest several-End form below: no open checklist clause names it, and it reuses no element of this family's branch rule; a later family.
- A wait-free terminal branch in a definition that holds a data-declaring Sub-Process: its End could be co-enabled with a declared entry, a pair with no commutation law (see [Representation](#representation-and-runtime-ownership)). Admitted since by the [data-declaring terminal branches account](DATA-DECLARING-TERMINAL-BRANCHES-PROPOSAL.md#admission) through the End and declared-entry pair law (`DTB-ADMIT-01`, `DTB-COMMUTE-01`).
- Script and Business Rule Tasks (`PC-AUTO-05` to `PC-AUTO-08`), the remaining batch-4 task breadth: both open with a dependency and runtime design decision.

Selection, 2026-11-04: chosen on reach and semantic risk. Of the pinned checkout's single-Process BPMN files whose elements this profile reads, plus `subProcess`, 768 parse and 59 hold several None Ends in one scope. Classified by the nearest splitting element behind each End, 38 end Parallel branches at separate root Ends, 15 end Exclusive branches at separate root Ends and 4 end Parallel branches at separate Ends in a Sub-Process body; the remaining 2 hold implicit flows. As before, none is admitted as it stands, because the profile requires a source overlay and refuses CIB attributes. Selector (pinned checkout `5a45b47`, 2026-11-04): every `*.bpmn` and `*.bpmn20.xml` file of the whole checkout outside `target/` directories that parses as XML and holds exactly one `process` element whose descendant element local names all lie in the [single-scope selector set](SINGLE-SCOPE-MODELS-SPEC.md#question-and-delivery-boundary) plus `subProcess`; a scope holds several Ends when two or more `endEvent` elements are its direct children, and an End's form is the kind of the first element with several outgoing flows on its single-input backward path. Close call against Link Events (`PC-BASIC-02`): 4 models against 38, and Link needs a control place with no Sequence Flow behind it, the kernel extension the [implicit fan-in proposal](IMPLICIT-FAN-IN-PROPOSAL.md#independent-cold-review-receipt) was rejected on.

## Normative basis and CIB classification

BPMN 2.0.2 Clause 10.5.3 (End Event) lets each alternative or parallel path end at its own End: an End is a sink for every token that arrives, and the Process stays running until all tokens are consumed. Clause 13.5.6 completes a Process instance, and likewise a Sub-Process instance, once its non-terminate End has consumed a token, if and only if all its start nodes have been visited and no token remains in it. Clause 13.4.1 with Table 13.1 gives the Parallel fork one token on each outgoing flow. A path that reaches its End without an Activity in between is ordinary: nothing in Clauses 10.5.3 or 13.5.6 asks a path to wait. Consult the [external reading copy](../reference/bpmn-2.0.2/README.md#reading-workflow).

CIB Seven `2.2.0` at the pinned checkout executes concurrent paths as concurrent child executions of the scope execution. When one reaches a None End in the root, `PvmAtomicOperationActivityEnd` removes only that concurrent execution and asks its parent to prune its last concurrent child (`tryPruneLastConcurrentChild`); in a Sub-Process body, `SubProcessActivityBehavior#concurrentChildExecutionEnded` ends the Sub-Process only once no concurrent child remains. Classification: no new relationship. The profile keeps [`CIB-AGR-0007`](../CIB-BPMN-RELATION-REGISTER.md#cib-agr-0007--ordinary-embedded-sub-process-quiescent-completion) bound to its one-level fixture; root and body several-End completion is standards-settled, and the CIB target's agreement on the registered scenarios calibrates it. The boundary of [`CIB-EXT-0022`](../CIB-BPMN-RELATION-REGISTER.md), which excludes a wait-free branch of a terminal fork, narrows to such a branch in a data-declaring definition.

## Required, optional and excluded scope

Required, for the nested scope-data profile only:

- **Root terminal forks.** The Process root body admits terminal unjoined Parallel forks and so several None Ends, in every arrangement that contraction rule 3 of the [nested scope-control class](NESTED-EMBEDDED-SCOPE-CONTROL-SPEC.md#admission) reduces, as a Sub-Process body already does.
- **Wait-free terminal branches.** A terminal fork's branch, in the root or a Sub-Process body, may reach its None End without arming a task: through pass-through Tasks, None Throws, a nested fork whose branches are themselves wait-free, or directly. This family admitted it only when no scope of the definition declares scope-local data (`TFK-DATA-01`); the [data-declaring terminal branches account](DATA-DECLARING-TERMINAL-BRANCHES-PROPOSAL.md#admission) retired that condition (`DTB-ADMIT-01`).

Optional: none.

Excluded, each refused at admission:

- every form above under any other profile, including the embedded completion profile, which shares the structural class and keeps its single root End and its branch cut;
- a wait-free terminal branch in a definition with a data-declaring Sub-Process, admitted since by the [data-declaring terminal branches account](DATA-DECLARING-TERMINAL-BRANCHES-PROPOSAL.md#admission);
- an empty branch from a fork straight to its paired join, a Call in a forking root (the unchanged rule that refuses a root `duplicate` beside a root `invokeProcess`), a root merge region, and every other exclusion of the [root Parallel forks](ROOT-PARALLEL-FORKS-SPEC.md#required-optional-and-excluded-scope), [pass-through branch](PASS-THROUGH-PARALLEL-BRANCHES-SPEC.md#required-optional-and-excluded-scope) and [single-scope models](SINGLE-SCOPE-MODELS-SPEC.md#required-optional-and-excluded-scope) accounts;
- Exclusive Choices to separate Ends, implicit split and merge, Terminate Ends and Link Events.

These bound admission only, so later families broaden them without reinterpreting a model. No model this profile admits today changes meaning: every root it admits holds one End, and every terminal branch arms a task before its End.

## Profile and public contract

The profile `cibseven-2.2.0-nested-embedded-scope-data-draft` grows in place under the [cumulative profile rule](../../contracts/README.md). Its value domain, Start contract, effect contract and closure limit are unchanged. The [profile artifact](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json) adds the feature `terminal-forks` and narrows its exclusion `pass-through-tasks-on-wait-free-terminal-branches-or-in-called-processes` to called Processes and to wait-free terminal branches in data-declaring definitions; the [profile README](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/README.md) states the class. Observation, wire contracts and the checked-process schema are unchanged.

## Representation and runtime ownership

No kernel type, IL, opcode or runtime change. A root terminal fork lowers to the existing `duplicate` and one `reachNoneEnd` per End; root completion stays the quiescent `completeScope` of the root (`selectQuiescentScopeCompletion`), which already waits for every token, wait and child. A wait-free branch lowers to the existing pass vertices (one-input merges) and `reachNoneEnd`.

**Co-enabled members.** A wait-free terminal branch makes `reachNoneEnd` (`ordinaryEnd`) reachable in the same closure batch as a sibling branch's arming, scope creation, local control, Merge input or another End. Lean proves each of these pairs commutes under independent footprints in [`InternalTransitionBatch`](../../BpmnSemantics/SemanticProcess/InternalTransitionBatch.lean): `prepared_end_arming_pair_commutes`, `prepared_end_scope_creation_pair_commutes`, `prepared_end_local_control_pair_commutes`, `prepared_merge_end_pair_commutes` and `prepared_end_pair_commutes`; the TypeScript batch preparation accepts the same pairs. A regional completion is never co-enabled in this class: every body arms a task on entry, and every token of a closure descends from the one token that started it, so a body empties only along a single path. The only members without a law beside an End were the declared entry and the mapped invocation, whose pairs `PreparedInternalTransition.Independent` set to `False`:

- a declared entry exists only for a Sub-Process with scope-local data, so `TFK-DATA-01` removed it from every definition that held a wait-free terminal branch; the [data-declaring terminal branches account](DATA-DECLARING-TERMINAL-BRANCHES-PROPOSAL.md#representation-and-runtime-ownership) replaced that rule by the pair law `prepared_end_declared_entry_pair`, so a declared entry now commits beside an End;
- a mapped invocation stays where `CMCALL-ADMIT-01` and the root Parallel forks account put it: never first in a serial body, and in the root only when the root does not fork. It therefore follows a wait from a single token and is never co-enabled.

This re-establishes the singleton premise of the [concurrent scope data specification](CONCURRENT-SCOPE-DATA-SPEC.md) for the widened class without a new law. A violated premise fails closed: the batch preparation returns `ambiguousInternalChoice` and commits nothing.

Rejected alternatives:

- proving an `ordinaryEnd` pair law beside declared entries: an End would commute with an entry, but the law lands on the `InternalPreparedTransition` and `InternalTransitionBatch` hubs, and no selected model needed that shape (adopted since by the [data-declaring terminal branches account](DATA-DECLARING-TERMINAL-BRANCHES-PROPOSAL.md#representation-and-runtime-ownership), whose expense claim does);
- a per-closure analysis that refuses only closures holding both an End and a declared entry: exact, but it adds a flag to the burst composition in both languages for no selected model, where the definition-wide test is one read of the scope-local data.

## Admission

Admission stays [profile-parameterized](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md). Under this profile only, and at the Program and checked levels alike:

1. the scope-tree check stops requiring exactly one End in the root body and applies contraction rule 3 there, keeping its refusal of root merge regions and of a Call in a forking root;
2. the branch cut (`branchesStartWithWork`, `PTPB-WORK-01`) also accepts a terminal-fork branch whose closure scan stops at its End, when no scope of the definition declares scope-local data, a condition the [data-declaring terminal branches account](DATA-DECLARING-TERMINAL-BRANCHES-PROPOSAL.md#admission) retired (`DTB-ADMIT-01`). A branch that reaches its paired join keeps today's rule: it holds work or a pass vertex.

**Mechanism.** The shared analysis (`analyze` and `scanBody` in Lean, `analyzeTree` in TypeScript) relaxes both rules for every caller, and the private profile-aware entry points (`checkedModel` and `programModel` in Lean, the checked and Program model functions of the TypeScript twin) re-impose the single root End and the strict cut for every other profile, and, until `DTB-ADMIT-01`, the strict cut for a data-declaring definition of this profile. They already read the profile identity and the scope-local data, so no public signature changes. The relaxed cut is a new declaration of the [`NestedScopeBranchWork`](../../BpmnSemantics/SemanticProcess/NestedScopeBranchWork.lean) leaf, which only `NestedScopeControlAdmission` imports, privately.

The closure-burst composition is unchanged: an End costs its step, a closure that leaves a body without a wait already charges a `completeScope` and the parent's resumption, and a definition whose largest burst exceeds `semanticProcessClosureLimit = 8` stays refused.

Nearest wrong algorithms, each with a separating witness below:

1. completing a scope at its first End;
2. admitting a wait-free terminal branch beside a data-declaring Sub-Process, whose End can then share a closure with a declared entry, a pair that then had no law (`DTB-COMMUTE-01` has since proved it);
3. relaxing the cut for joined branches too, admitting an empty branch from a fork to its join;
4. relaxing the root End count or the branch cut for every profile, which widens the embedded completion profile;
5. relaxing at one level only.

## Stable rules

| Rule | Statement |
|---|---|
| `TFK-ADMIT-01` | The nested scope-data profile admits root terminal forks, and wait-free terminal branches in the root and Sub-Process bodies, within the unchanged depth, task and closure bounds, at the Program and checked levels alike. |
| `TFK-END-01` | A None End consumes only its own token; while its scope owns another token, wait or child, the scope, root included, stays live. |
| `TFK-QUIESCE-01` | A scope, root included, completes exactly when its last token is consumed and it owns no wait or child; the root's completion completes the Process. |
| `TFK-DATA-01` | Retired by `DTB-ADMIT-01`: a definition with a wait-free terminal branch held no Sub-Process that declares scope-local data. |
| `TFK-PROFILE-01` | Every other profile refuses each form it refuses today. |

## Newly reachable waits and resumption

None of a new kind. The waits are the User Task, effect and join waits of the admitted accounts. A wait-free branch adds no wait; its End runs in the closure that forks it, and may share a batch with sibling work.

## Separating witnesses

Both models carry a source overlay and a mapped Service Task, as the profile's serial rule requires, and declare no scope-local data.

- **Employee offboarding** (root terminal fork, no Sub-Process):
  - Start binds `employee`; mapped Service Task *Look up employee*, input `employee`, output `employeeNumber` → fork into four branches.
  - Branch one: User Task *Collect equipment* → End *Equipment collected*.
  - Branch two: User Task *Revoke system access* → End *Access revoked*.
  - Branch three, wait-free: plain Task *Notify payroll* → End *Payroll notified*.
  - Branch four, wait-free and direct: End *Departure recorded*.
  - After the lookup result, the closure runs the fork, then one batch of both armings, the *Notify payroll* merge and the *Departure recorded* End (End beside arming and Merge input), then the *Payroll notified* End. Two journeys, one in each completion order of the two User Tasks: after the first completion the Process is still running; after the second it completes (`TFK-END-01`, `TFK-QUIESCE-01`).
- **Office move** (wait-free terminal branches in a Sub-Process body):
  - Start binds `office`; mapped Service Task *Book movers*, input `office`, output `bookingCode` → Sub-Process *Clear old office*, which declares no data → User Task *Confirm new office* → End.
  - *Clear old office* body: Start → fork. Branch one: User Task *Pack desk* → End. Branch two, wait-free: Manual Task *Return keys* → End. Branch three, wait-free: plain Task *Cancel parking permit* → End.
  - Entering the body runs the fork, then one batch of the arming and both merges, then one batch of both wait-free Ends (End beside End, in a body). After the booking result, *Clear old office* is live with the *Pack desk* wait; completing *Pack desk* completes the Sub-Process and arms *Confirm new office*.
- **Refused edits**, each asserted at the checked and Program levels separately:
  - *Clear old office* declaring `keysReturned = "no"`, refused (wrong algorithm 2); its twin with both wait-free branches replaced by User Tasks keeps the declaration and is admitted, so the refusal came from `TFK-DATA-01` alone; since `DTB-ADMIT-01` both are admitted.
  - The offboarding's branch two replaced by a paired block, fork → [*Revoke system access*], [empty] → join → End *Access revoked*, refused by the cut alone (wrong algorithm 3); the same block with a pass-through Task on its second branch is admitted.
- **Profile control (minimal pairs)**, each data-free and effect-free, with neither a pass-through Task nor a None Throw, and each asserted at the checked and Program analyses and at profile admission separately. The embedded completion twin carries no source overlay and the nested scope-data twin carries one, as each profile's overlay rule requires, so the relaxed rule is each twin's only refusal. Both differ in a count from the embedded completion profile's retained exact multiset of three User Tasks, three None Ends, one Sub-Process, one Parallel Gateway and two scopes, so its exact class cannot admit them:
  - (a) root terminal fork: Start → fork → [Sub-Process with Start → User Task → End] → End, [User Task] → End, [User Task] → End; four None Ends;
  - (b) body wait-free branch: Start → User Task → Sub-Process with Start → fork → [User Task → End], [direct End] → End; two User Tasks, and one root End, so only the cut separates it.
  - Each is refused under the embedded completion identity and admitted under this profile's identity (wrong algorithms 4 and 5).
- **Runtime control:** seeded pipeline mutations that complete the root at its first End on an offboarding journey, and the Sub-Process at its first End on the office move, must each disagree (wrong algorithm 1).

End beside local control and End beside scope creation rest on `prepared_end_local_control_pair_commutes` and `prepared_end_scope_creation_pair_commutes` without a scenario witness: no retained model batches an End with a Sub-Process entry, the reach form of a Sub-Process branch beside a direct End.

## Rule-to-evidence matrix

| Rule | Positive and negative witness | Lanes | Killing mutation |
|---|---|---|---|
| `TFK-ADMIT-01` | Both models admitted at both levels; the empty joined branch refused and its pass-through twin admitted | Source, core, Lean conformance checks, pipeline | Relax at one level only (5), or relax joined branches (3) |
| `TFK-END-01`, `TFK-QUIESCE-01` | Both offboarding orders and the office move, through the batched Ends and the first End to completion | Core, pipeline across Lean, core and Temporal; CIB through the pass-through Task probe | Complete a scope at its first End (1), at the root and in a body |
| `TFK-DATA-01`, retired by `DTB-ADMIT-01` | The declaring office move admitted as its waiting twin, per level | Source, core, Lean conformance checks | Restore the data test |
| `TFK-PROFILE-01` | The two embedded completion minimal pairs, per analysis level and at profile admission | Core and Lean conformance checks | Relax for every profile (4) |

## Lean assurance lane

Lane shape: checked

Evidence: the family adds no transition family and no runtime law. The owner direction of 2026-10-14 in the [assurance-lane rule](../PROJECT-DESIGN.md#lean-assurance-lane) gives concurrency families `proved`; this family is breadth over an already proved mechanism. Every batch it makes reachable commits only through the quantified pair laws listed under [Representation](#representation-and-runtime-ownership), and a violated premise fails closed to `ambiguousInternalChoice`. What stays argued, not proved, is that no admitted closure co-enables an End with a declared entry or mapped invocation. Executable admission checks join the root Parallel forks conformance module's [`rootParallelForksConformanceChecks`](../../BpmnSemantics/RootParallelForksConformance.lean#rootParallelForksConformanceChecks), which stays admission-only and outside `CommandAdmission`'s cone: both models at both levels, the refused edits with their admitted twins, and the profile control. The journeys run through the pipeline's Lean target.

## Temporal hosting and refinement preflight

No new hosting mechanism. Ingress is the existing Start, effect result and User Task completion; waits are User Tasks and effects; no timer, cancellation or new lifecycle transition is introduced, and the Workflow completes when the root's quiescent `completeScope` commits, as today. The preserved relation is equality of hosted committed state and publications with the core's. Delivery, ordering, deduplication, retry and replay risks are unchanged, since several Ends add only internal steps inside one committed closure. The smallest witness is the hosted pipeline over both models' journeys at family closure.

## Evidence and acceptance

The models run as answer-free scenarios with registered pipeline cases, each with a seeded mutation, plus value-domain matrix rows, corpus rows and the About disclosure. The CIB lane extends the [pass-through Task probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenPassThroughTaskProbeTest.java) with both models' journeys, calibrating each End's activity instance and that the Process instance ends only with its last execution.

Then `PC-HUM-04` is evidenced except a wait-free terminal branch in a data-declaring definition; `PC-HUM-05` except that form and implicit split and merge; `PC-CF-03` gains wait-free body Ends and root Ends; and `PC-BASIC-01` gains concurrent None Ends and root-versus-child completion, staying open on multiple outgoing Start flows. All four stay open.

Implemented as proposed. The [source test](../../packages/bpmn-source/test/terminal-forks-source.test.ts) admits both models at both levels and refuses the declaring office move, the empty joined branch and both profile controls, each per level beside its admitted twin. The [root Parallel forks conformance module](../../BpmnSemantics/RootParallelForksConformance.lean) holds thirteen checks, its terminal root fork inverted to admitted with its embedded completion refusal and five added for the separating witnesses; before the Lean admission change five of them fail. The single-scope models module and its source twin admit the root terminal fork, and the pass-through branch and None Throw refusals held through `TFK-DATA-01`, since their models declare scope-local data, until `DTB-ADMIT-01` admitted them. Three [pipeline cases](../../packages/differential/test/terminal-forks-pipeline-cases.ts) carry the journeys and seeded mutations that complete the root at *Departure recorded* or *Access revoked* and *Clear old office* at its first End; the CIB probe's two new tests observe each End end alone and the owner end with its last execution. Re-measured module costs: the root Parallel forks module at 317,072 KiB, from 312,656, for its added fixtures, and the single-scope models module at 317,952 KiB. One guard repair outside the family: the private-by-default scan read a negating `!` as part of an identifier, so a declaration named elsewhere only under Boolean negation counted as unused; it now treats `!` and `?` as identifier characters only after one.

Nearest unsupported claims:

- several Ends under any other profile, or reached by an Exclusive Choice;
- that no admitted closure co-enables an End with a mapped invocation, which is argued and checked, not proved;
- that every actual closure stays within the admitted burst, not proved in Lean, as for the accounts this family reuses.

## Versioning consequences

No wire, schema or Program change, so the [pre-release wire policy](../../contracts/README.md#evolution-policy) has nothing to migrate. No admitted model changes its Program, route or behavior.

### Owners this implementation grows

No kernel type, hub interface, public signature, import or guard bound changes.

- Lean: [`NestedScopeBranchWork`](../../BpmnSemantics/SemanticProcess/NestedScopeBranchWork.lean) gains the relaxed cut, an interface edit of a leaf that only `NestedScopeControlAdmission` imports, privately. [`NestedScopeControlAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeControlAdmission.lean) takes body edits only (`analyze`, `scanBody`, `checkedModel`, `programModel`), at 745 of 800 nonblank lines; any helper the re-imposition needs lives in the leaf, because a new private declaration there changes its public `.olean`. Predicted rebuild set: the two modules, the six modules that `import all` it (`RuntimeStateInitializationConformance`, `SequentialMultiInstanceProgramBindingConformance`, `SerialBusinessTaskDataProofs`, `SerialBusinessTaskLifecycleProofs`, `SerialBusinessTaskProgressProofs`, `StructuredCompositionAdmissionProofs`), and `RootParallelForksConformance`. Their statements are unchanged; a kernel-decided consumer that unfolds a changed body must still reduce, which its narrow build confirms before the commit.
- TypeScript: the [nested scope-control admission](../../packages/semantic-core/src/nested-scope-control-admission.ts) stood at 791 of 800 nonblank lines when this proposal was drafted, so its branch cut moved into its own module in `908b65db`, mirroring the Lean leaf, before it grew; never an exception.
- Source: none. The [checked graph admission](../../packages/bpmn-source/src/checked-process-graph-admission.ts) refuses only an End-free scope, and the source reader projects every End.

Guards the implementation must satisfy, with bounds unchanged: [`lean-fanout`](../../scripts/lean-fanout.test.ts), [`lean-module-cost`](../../scripts/lean-module-cost.test.ts), [`source-hygiene`](../../scripts/source-hygiene.test.ts) and the [Start capacity envelope test](../../packages/temporal-adapter/protocol/test/start-capacity-envelope.test.ts).

Existing witnesses that change, each with its disposition:

- `terminal_root_fork_is_refused` of the [root Parallel forks conformance module](../../BpmnSemantics/RootParallelForksConformance.lean) and its TypeScript twin in the root Parallel forks source test: the branches arm, so the model becomes admitted; the witness is inverted and keeps its refusal under the embedded completion profile, where both analyses admit the plain onboarding and refuse the edit.
- The `terminalFork` refusal of the [single-scope models conformance module](../../BpmnSemantics/SingleScopeModelsConformance.lean) and its TypeScript twin in the single-scope models source test: inverted the same way; its embedded completion refusal is a regression row, not a profile-control separator, because that profile also requires a Sub-Process or a Call.
- The wait-free refusals of the [pass-through branch](../../BpmnSemantics/PassThroughParallelBranchesConformance.lean) and [None Throw](../../BpmnSemantics/NoneIntermediateThrowConformance.lean) conformance modules and their TypeScript twins: each stays refused only if its model declares scope-local data; otherwise it is rewritten to declare data, so it witnesses `TFK-DATA-01`, and its data-free form becomes an admission witness.

Owner passages amended at closure:

- the terminal-root exclusions of the [root Parallel forks](ROOT-PARALLEL-FORKS-SPEC.md#required-optional-and-excluded-scope), [nested scope-control](NESTED-EMBEDDED-SCOPE-CONTROL-SPEC.md#required-optional-and-excluded-scope) and [single-scope models](SINGLE-SCOPE-MODELS-SPEC.md#required-optional-and-excluded-scope) specifications;
- stable rule `PTPB-WORK-01` with its singleton restatement and the residual forms of the [pass-through branch specification](PASS-THROUGH-PARALLEL-BRANCHES-SPEC.md#representation-and-runtime-ownership), and the [None Throw specification](NONE-INTERMEDIATE-THROW-SPEC.md#required-optional-and-excluded-scope);
- the singleton premise and its reopening condition in the [concurrent scope data specification](CONCURRENT-SCOPE-DATA-SPEC.md#representation-and-runtime-ownership);
- the `CIB-EXT-0022` boundary in the [register](../CIB-BPMN-RELATION-REGISTER.md);
- the profile README, and the evidence cells of the four rows;
- the comments that state the single root End or the strict terminal cut, in both admission owners and the Lean leaf.

Registration: the profile artifact's `features` and its README; scenarios, pipeline cases, the value-domain matrix, the corpus, About and the CIB probe; the [requirement ledger](../BPMN-REQUIREMENT-LEDGER.md) needs no new row.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `d3e99ac9` | `fork-turns-none` | `approve-with-required-edits` | `bb47474f, 13b13cad` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `d645c982` | `fork-turns-none` | `approve-with-required-edits` | `c5dbcf50, 6b1249f5` |
