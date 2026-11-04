# Terminal forks proposal

## Status

Lifecycle: draft
Review: pending

## Question and delivery boundary

Can the nested scope-data profile admit an unjoined Parallel fork in the Process root, whose branches each end at their own None End, and a terminal-fork branch in the root or a Sub-Process body that reaches its End without waiting, so that the first End reached never completes its scope, the scope completes only when no token, wait or child remains, and every other profile, every admitted model and every command and observation keep their meaning?

This is the next family of batch 4 in [PLAN](../PLAN.md#scheduled-delivery-batches) (control-flow breadth). Its mechanism is the several-End body: a scope that ends through more than one None End, completing by quiescence. It serves the clauses of the [coverage checklist](../PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) that this mechanism holds open:

- `PC-HUM-04`, primary: Plain Task pass-through on a wait-free branch of a terminal fork in a Sub-Process body, its last residual form, recorded in the [pass-through branch specification](PASS-THROUGH-PARALLEL-BRANCHES-SPEC.md#evidence-and-acceptance).
- `PC-HUM-05`: the same form for the Manual Task. The row stays open on implicit split and merge (`PC-CF-07`).
- `PC-CF-03`: separate body and root Ends, where the first separate End cannot complete its scope. The row stays open on its other clauses.
- `PC-BASIC-01`: concurrent None Ends and explicit root-versus-child completion. The row stays open on multiple outgoing Start flows.

Screened out, each with its reason:

- Exclusive Choices whose branches end at separate Ends, the second-largest several-End form below: no open checklist clause names it, and it reuses no element of this family's branch rule; a later family.
- A wait-free terminal branch in a definition that holds a data-declaring Sub-Process: its End or regional completion would be co-enabled with a declared entry, a pair with no commutation law (see [Representation](#representation-and-runtime-ownership)).
- Script and Business Rule Tasks (`PC-AUTO-05` to `PC-AUTO-08`), the remaining batch-4 task breadth: both open with a dependency and runtime design decision.

Selection, 2026-11-04: chosen on reach and semantic risk. Of the pinned checkout's single-Process BPMN files whose elements this profile reads, plus `subProcess`, 768 parse and 59 hold several None Ends in one scope. Classified by the nearest splitting element behind each End, 38 end Parallel branches at separate root Ends, 15 end Exclusive branches at separate root Ends and 4 end Parallel branches at separate Ends in a Sub-Process body; the remaining 2 hold implicit flows. As before, none is admitted as it stands, because the profile requires a source overlay and refuses CIB attributes. Selector (pinned checkout `5a45b47`, 2026-11-04): every `*.bpmn` and `*.bpmn20.xml` file of the whole checkout outside `target/` directories that parses as XML and holds exactly one `process` element whose descendant element local names all lie in the [single-scope selector set](SINGLE-SCOPE-MODELS-SPEC.md#question-and-delivery-boundary) plus `subProcess`; a scope holds several Ends when two or more `endEvent` elements are its direct children, and an End's form is the kind of the first element with several outgoing flows on its single-input backward path. Close call against Link Events (`PC-BASIC-02`): 4 models against 38, and Link needs a control place with no Sequence Flow behind it, the kernel extension the [implicit fan-in proposal](IMPLICIT-FAN-IN-PROPOSAL.md#independent-cold-review-receipt) was rejected on.

## Normative basis and CIB classification

BPMN 2.0.2 Clause 10.5.3 (End Event) lets each alternative or parallel path end at its own End: an End is a sink for every token that arrives, and the Process stays running until all tokens are consumed. Clause 13.5.6 completes a Process instance, and likewise a Sub-Process instance, once its non-terminate End has consumed a token, if and only if all its start nodes have been visited and no token remains in it. Clause 13.4.1 with Table 13.1 gives the Parallel fork one token on each outgoing flow. A path that reaches its End without an Activity in between is ordinary: nothing in Clauses 10.5.3 or 13.5.6 asks a path to wait. Consult the [external reading copy](../reference/bpmn-2.0.2/README.md#reading-workflow).

CIB Seven `2.2.0` at the pinned checkout executes concurrent paths as concurrent child executions of the scope execution. When one reaches a None End, `PvmAtomicOperationActivityEnd` removes only that concurrent execution and asks its parent to prune its last concurrent child (`tryPruneLastConcurrentChild`); the scope execution ends only once no concurrent child remains. Classification: no new relationship. The profile keeps [`CIB-AGR-0007`](../CIB-BPMN-RELATION-REGISTER.md#cib-agr-0007--ordinary-embedded-sub-process-quiescent-completion) bound to its one-level fixture; root and body several-End completion is standards-settled, and the CIB target's agreement on the registered scenarios calibrates it.

## Required, optional and excluded scope

Required, for the nested scope-data profile only:

- **Root terminal forks.** The Process root body admits terminal unjoined Parallel forks and so several None Ends, in every arrangement that contraction rule 3 of the [nested scope-control class](NESTED-EMBEDDED-SCOPE-CONTROL-SPEC.md#admission) reduces, as a Sub-Process body already does.
- **Wait-free terminal branches.** A terminal fork's branch, in the root or a Sub-Process body, may reach its None End without arming a task: through pass-through Tasks, None Throws, a nested fork whose branches are themselves wait-free, or directly. This is admitted only when no scope of the definition declares scope-local data (`TFK-DATA-01`).

Optional: none.

Excluded, each refused at admission:

- every form above under any other profile, including the embedded completion profile, which shares the structural class and keeps its single root End and its branch cut;
- a wait-free terminal branch in a definition with a data-declaring Sub-Process;
- an empty branch from a fork straight to its paired join, a Call in a forking root, a root merge region, and every other exclusion of the [root Parallel forks](ROOT-PARALLEL-FORKS-SPEC.md#required-optional-and-excluded-scope), [pass-through branch](PASS-THROUGH-PARALLEL-BRANCHES-SPEC.md#required-optional-and-excluded-scope) and [single-scope models](SINGLE-SCOPE-MODELS-SPEC.md#required-optional-and-excluded-scope) accounts;
- Exclusive Choices to separate Ends, implicit split and merge, Terminate Ends and Link Events.

These bound admission only, so later families broaden them without reinterpreting a model. No admitted model changes meaning: today every admitted root holds one End, and every terminal branch arms a task before its End.

## Profile and public contract

The profile `cibseven-2.2.0-nested-embedded-scope-data-draft` grows in place under the [cumulative profile rule](../../contracts/README.md). Its value domain, Start contract, effect contract and closure limit are unchanged. The [profile artifact](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json) adds the feature `terminal-forks` and narrows its exclusion `pass-through-tasks-on-wait-free-terminal-branches-or-in-called-processes` to called Processes and to wait-free terminal branches in data-declaring definitions; the [profile README](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/README.md) states the class. Observation, wire contracts and the checked-process schema are unchanged.

## Representation and runtime ownership

No kernel type, IL, opcode or runtime change. A root terminal fork lowers to the existing `duplicate` and one `reachNoneEnd` per End; root completion stays the quiescent `completeScope` of the root (`selectQuiescentScopeCompletion`), which already waits for every token, wait and child. A wait-free branch lowers to the existing pass vertices and `reachNoneEnd`.

**Co-enabled members.** A wait-free terminal branch makes `reachNoneEnd` (`ordinaryEnd`), and when it empties a scope `completeScope` (`regional`), reachable in the same closure as a sibling branch's arming, scope creation, local control or another End. Lean already proves each of these pairs commutes under independent footprints ([`InternalTransitionBatch`](../../BpmnSemantics/SemanticProcess/InternalTransitionBatch.lean): `prepared_end_arming_pair_commutes`, `prepared_end_scope_creation_pair_commutes`, `prepared_end_local_control_pair_commutes`, `prepared_end_pair_commutes` and the regional pairs), and the TypeScript batch preparation accepts them. The only members without a law beside an End or a regional completion are the declared entry and the mapped invocation, whose pairs `PreparedInternalTransition.Independent` sets to `False`:

- a declared entry exists only for a Sub-Process with scope-local data, so `TFK-DATA-01` removes it from every definition that holds a wait-free terminal branch;
- a mapped invocation stays where `CMCALL-ADMIT-01` puts it, never first in a serial body, so it follows a wait from a single token and is never co-enabled.

This re-establishes the singleton premise of the [concurrent scope data specification](CONCURRENT-SCOPE-DATA-SPEC.md) for the widened class without a new law. It is argued here and checked on the registered scenarios, not proved, as for the pass-through branch account.

Rejected alternatives:

- proving `ordinaryEnd` and `regional` pair laws beside declared entries: an End would commute, but a regional completion writes its outputs into the parent frame that a sibling's declared entry reads, so the pair is footprint-dependent and needs a frame-level law on the `InternalPreparedTransition` and `InternalTransitionBatch` hubs. No selected model needs that shape;
- a per-closure analysis that refuses only closures holding both an End and a declared entry: exact, but it adds a flag to the burst composition in both languages for no selected model, where the definition-wide test is one read of the scope-local data.

## Admission

Admission stays [profile-parameterized](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md). Under this profile only, and at the Program and checked levels alike:

1. the scope-tree check stops requiring exactly one End in the root body and applies contraction rule 3 there, keeping its refusal of root merge regions and of a Call in a forking root;
2. the branch cut (`branchesStartWithWork`, `PTPB-WORK-01`) also accepts a terminal-fork branch whose closure scan stops at its End, when no scope of the definition declares scope-local data. A branch that reaches its paired join keeps today's rule: it holds work or a pass vertex.

The closure-burst composition is unchanged: an End costs its step, a closure that leaves a body without a wait already charges a `completeScope` and the parent's resumption, and a definition whose largest burst exceeds `semanticProcessClosureLimit = 8` stays refused.

Nearest wrong algorithms, each with a separating witness below:

1. completing a scope at its first End;
2. admitting a wait-free terminal branch beside a data-declaring Sub-Process, which reaches a batch the runtime refuses;
3. relaxing the cut for joined branches too, admitting an empty branch from a fork to its join;
4. relaxing the root End count or the branch cut for every profile, which widens the embedded completion profile;
5. relaxing at one level only.

## Stable rules

| Rule | Statement |
|---|---|
| `TFK-ADMIT-01` | The nested scope-data profile admits root terminal forks, and wait-free terminal branches in the root and Sub-Process bodies, within the unchanged depth, task and closure bounds, at the Program and checked levels alike. |
| `TFK-END-01` | A None End consumes only its own token; while its scope owns another token, wait or child, the scope, root included, stays live. |
| `TFK-QUIESCE-01` | A scope, root included, completes exactly when its last token is consumed and it owns no wait or child; the root's completion completes the Process. |
| `TFK-DATA-01` | A definition with a wait-free terminal branch holds no Sub-Process that declares scope-local data. |
| `TFK-PROFILE-01` | Every other profile refuses each form it refuses today. |

## Newly reachable waits and resumption

None of a new kind. The waits are the User Task, effect and join waits of the admitted accounts. A wait-free branch adds no wait; its End runs in the closure that forks it.

## Separating witnesses

Both models carry a source overlay and a mapped Service Task, as the profile's serial rule requires.

- **Employee offboarding** (root terminal fork, no Sub-Process):
  - Start binds `employee`; mapped Service Task *Look up employee*, input `employee`, output `employeeNumber` → fork into three branches.
  - Branch one: User Task *Collect equipment* → End *Equipment collected*.
  - Branch two: User Task *Revoke system access* → End *Access revoked*.
  - Branch three, wait-free: plain Task *Notify payroll* → End *Payroll notified*.
  - Two journeys, one in each completion order of the two User Tasks. After the lookup result, the Process holds both waits and has ended *Payroll notified*; after the first completion it is still running; after the second it completes (`TFK-END-01`, `TFK-QUIESCE-01`).
- **Office move** (wait-free terminal branch in a Sub-Process body):
  - Start binds `office`; mapped Service Task *Book movers*, input `office`, output `bookingCode` → Sub-Process *Clear old office*, which declares no data → User Task *Confirm new office* → End.
  - *Clear old office* body: Start → fork. Branch one: User Task *Pack desk* → End. Branch two, wait-free: Manual Task *Return keys* → End.
  - One journey. After the booking result, *Clear old office* is live with the *Pack desk* wait, and *Return keys* and its End have ended; completing *Pack desk* completes the Sub-Process and arms *Confirm new office*.
- **Refused edits:**
  - *Clear old office* declaring `keysReturned = "no"`, refused (wrong algorithm 2); its twin with *Return keys* replaced by a User Task is admitted, so the refusal comes from `TFK-DATA-01` alone.
  - The offboarding fork's third branch replaced by an empty branch to a new join that merges it with branch two, refused (wrong algorithm 3).
  - A mapped Call in the offboarding root before the fork, refused as today.
- **Profile control (minimal pairs):** under the embedded completion profile, the offboarding model without its data and the office move without its data are each refused at the source level, and their checked graphs and Programs are refused by the core and Lean analyses under that profile's identity. Under this profile, the same graphs are admitted (wrong algorithms 4 and 5).
- **Runtime control:** a seeded pipeline mutation that completes the root at its first End must disagree on the offboarding journeys (wrong algorithm 1).

## Rule-to-evidence matrix

| Rule | Positive and negative witness | Lanes | Killing mutation |
|---|---|---|---|
| `TFK-ADMIT-01` | Both models admitted at both levels; the empty-branch and root-Call edits refused | Source, core, Lean conformance checks, pipeline | Relax at one level only (5), or relax joined branches (3) |
| `TFK-END-01`, `TFK-QUIESCE-01` | Both offboarding orders and the office move, through the first End and to completion | Core, Lean execution, pipeline across Lean, core, Temporal and CIB | Complete a scope at its first End (1) |
| `TFK-DATA-01` | The declaring office move refused, its waiting twin admitted | Source, core, Lean conformance checks | Drop the data test (2) |
| `TFK-PROFILE-01` | The embedded completion minimal pairs at both levels | Source, core, Lean conformance checks | Relax for every profile (4) |

## Lean assurance lane

Lane shape: checked

Evidence: the family adds no transition family and no runtime law. The commutation of every member a wait-free End can meet rests on the existing pair laws listed under [Representation](#representation-and-runtime-ownership); the absence of a declared entry or mapped invocation beside it is argued there, not proved. Executable checks added to the [root Parallel forks conformance module](../../BpmnSemantics/RootParallelForksConformance.lean) cover admission of both models at both levels, the refused edits with their admitted twins, the profile control, and the Lean execution of both offboarding journeys and the office move to completion.

## Temporal hosting and refinement preflight

No new hosting mechanism. Ingress is the existing Start and User Task completion; waits are User Tasks and effects; no timer, cancellation or new lifecycle transition is introduced, and the Workflow completes when the root's quiescent `completeScope` commits, as today. The preserved relation is equality of hosted committed state and publications with the core's. Delivery, ordering, deduplication, retry and replay risks are unchanged, since several Ends add only internal steps inside one committed closure. The smallest witness is the hosted pipeline over both models' journeys at family closure.

## Evidence and acceptance

The models run as answer-free scenarios with registered pipeline cases, each with a seeded mutation, plus value-domain matrix rows, corpus rows and the About disclosure. The CIB lane extends the [pass-through Task probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenPassThroughTaskProbeTest.java) with both models' journeys, calibrating each End's activity instance and that the Process instance ends only with its last execution.

Then `PC-HUM-04` closes; `PC-HUM-05` is evidenced except implicit split and merge; `PC-CF-03` gains separate body and root Ends; and `PC-BASIC-01` gains concurrent None Ends and root-versus-child completion, staying open on multiple outgoing Start flows.

Nearest unsupported claims:

- several Ends under any other profile, or reached by an Exclusive Choice;
- a wait-free terminal branch beside a data-declaring Sub-Process;
- that no admitted closure co-enables an End or regional completion with a declared entry or mapped invocation, which is argued and checked, not proved;
- that every actual closure stays within the admitted burst, not proved in Lean, as for the accounts this family reuses.

## Versioning consequences

No wire, schema or Program change, so the [pre-release wire policy](../../contracts/README.md#evolution-policy) has nothing to migrate. No admitted model changes its Program, route or behavior.

### Owners this implementation grows

No kernel type, hub interface, import or guard bound changes.

- Lean: [`NestedScopeBranchWork`](../../BpmnSemantics/SemanticProcess/NestedScopeBranchWork.lean) gains the relaxed cut. `NestedScopeControl` consumes it through a private import in hidden bodies only, so the root End test and the call site in [`NestedScopeControlAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeControlAdmission.lean) are body edits, and its public interface is unchanged. The source-side checked admission takes the same rule.
- TypeScript: the [nested scope-control admission](../../packages/semantic-core/src/nested-scope-control-admission.ts) stands at 791 of 800 nonblank lines, so its branch cut moves into its own module, mirroring the Lean leaf, before it grows; never an exception.
- Source: the [nested scope-data source admission](../../packages/bpmn-source/src/nested-scope-data-source.ts), if it refuses a second root End.

Guards the implementation must satisfy, with bounds unchanged: [`lean-fanout`](../../scripts/lean-fanout.test.ts), [`lean-module-cost`](../../scripts/lean-module-cost.test.ts), [`source-hygiene`](../../scripts/source-hygiene.test.ts) and the [Start capacity envelope test](../../packages/temporal-adapter/protocol/test/start-capacity-envelope.test.ts).

Owner passages amended at closure: the terminal-root exclusions of the [root Parallel forks](ROOT-PARALLEL-FORKS-SPEC.md#required-optional-and-excluded-scope), [nested scope-control](NESTED-EMBEDDED-SCOPE-CONTROL-SPEC.md#required-optional-and-excluded-scope) and [single-scope models](SINGLE-SCOPE-MODELS-SPEC.md#required-optional-and-excluded-scope) specifications, the residual forms of the [pass-through branch](PASS-THROUGH-PARALLEL-BRANCHES-SPEC.md#evidence-and-acceptance) and [None Throw](NONE-INTERMEDIATE-THROW-SPEC.md#required-optional-and-excluded-scope) specifications, the profile README, and the evidence cells of the four rows.

Registration: the profile artifact's `features` and its README; scenarios, pipeline cases, the value-domain matrix, the corpus, About and the CIB probe; the [requirement ledger](../BPMN-REQUIREMENT-LEDGER.md) needs no new row.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
