# Root Parallel forks specification

## Status

Lifecycle: implemented
Review: closure-approved

## Question and delivery boundary

Can the nested scope-data profile admit paired Parallel forks and joins in the Process root body, beside the forks it already admits in Sub-Process bodies, so that root branches run User Tasks, mapped Service Tasks and Sub-Processes concurrently over the structured value domain?

This is the next family of batch 4 in [PLAN](../PLAN.md#scheduled-delivery-batches). Its shared mechanism is the concurrent account that the [concurrent structured scope data specification](CONCURRENT-STRUCTURED-SCOPE-DATA-SPEC.md) selected for this profile, which today requires a serial root path. It takes every open row of the [coverage checklist](../PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) whose remaining clause is that root restriction:

- `PC-CF-03`, primary: Parallel fork and join composition with human and automated branches, here at the Process root of the structured profile, where both branch orders preserve sibling waits and writes and the join continues once, after every incoming token;
- `PC-DATA-03`, `PC-DATA-05` and `PC-DATA-06`, their root-fork clauses, which the [concurrent structured scope data family](CONCURRENT-STRUCTURED-SCOPE-DATA-SPEC.md#question-and-delivery-boundary) left open: structured values keep their shape across root branches, an open effect's argument snapshot survives a sibling root branch's later write, and root-branch Service Task results and Sub-Process outputs land at the Process atomically.

No row closes in this family. `PC-CF-03` keeps its separate body Ends and scoped-quiescence clauses on the embedded completion profile's evidence and its `PC-AUTO-01` and `PC-HUM-01` prerequisites; the three data rows keep their cycle, Multi-Instance, expression-mapping, exceptional-exit and merge-region clauses.

Pass-through Tasks on Parallel branches, the remaining clause of `PC-HUM-04` and `PC-HUM-05`, do not share this mechanism. A pass-through Task runs as a one-input `mergeExclusive`, whose prepared family the commutation relation makes dependent on declared Sub-Process entries and mapped invocations (`Independent` in [`InternalPreparedTransition`](../../BpmnSemantics/SemanticProcess/InternalPreparedTransition.lean)), so beside a declaring Sub-Process entry a concurrent closure becomes an observable choice that this profile's scheduling mode rejects. Admitting them needs that relation extended with proved pair laws, a family of its own.

Selection, 2026-11-02: chosen over implicit Activity split and merge (`PC-CF-07`) on reach. Of the 1,947 BPMN models in the pinned CIB engine sources, 263 hold a Parallel Gateway, while 17 hold an Activity with two incoming and 13 one with two outgoing Sequence Flows, many of them loop back-edges or parse-invalid fixtures.

## Normative basis and CIB classification

**BPMN.** Clause 10.6.4 and Clause 13.4.1 define the Parallel Gateway: a diverging one produces a token on every outgoing flow, a converging one waits for a token on every incoming flow and then produces one. Clause 13.3.1 makes each Activity on a branch an independent instance enabled by its own token. Clause 13.2 completes the Process only when no token and no active Activity remains, so a root join followed by one None End completes it once. Nothing in these clauses distinguishes a root body from a Sub-Process body; the profile's restriction to body forks was an admission bound, recorded as one that broadens "without reinterpreting an admitted model" ([CSSD scope](CONCURRENT-STRUCTURED-SCOPE-DATA-SPEC.md#required-optional-and-excluded-scope)). Clause 10.4.1's copy semantics for structured values holds at the Process frame as at any other.

**CIB Seven.** At pinned `v2.2.0-27-g5a45b47`, `ParallelGatewayActivityBehavior` forks and joins the same way in every scope, the Process scope included; the root is an ordinary `PvmExecutionImpl` scope whose concurrent child executions carry the branches. Process variables written by concurrent branches land on the Process instance through `AbstractVariableScope.setVariable`, the same path `CIB-EXT-0020` cites for body branches that write a Process target, and the effect-argument timing that `CIB-OP-0010` and `CIB-EXT-0015` record for this profile applies to root-branch Service Tasks unchanged. The family calibrates root forks on the CIB oracle (below).

Register change, with these citations and the calibration: **`CIB-EXT-0020`**'s concurrent clause for this profile widens from Parallel forks in Sub-Process bodies to Parallel forks in the Process root body and in Sub-Process bodies.

## Required, optional and excluded scope

Required: every model the profile admits today, unchanged, and in addition every concurrent model that the [concurrent structured scope data class](CONCURRENT-STRUCTURED-SCOPE-DATA-SPEC.md#required-optional-and-excluded-scope) admits once its root restriction changes:

- **Forks in the Process root body.** Paired Parallel blocks may sit in the Process root body as in Sub-Process bodies, nested in any order inside branches. The root keeps its one None End and admits no terminal unjoined fork, as the [nested scope-control class](NESTED-EMBEDDED-SCOPE-CONTROL-SPEC.md#required-optional-and-excluded-scope) requires.
- **No Call in a forking root.** A model whose root body forks holds no Call in its root body. A Sub-Process on a root branch keeps the existing Call placements: a mapped Call in a serial Sub-Process body, never its first vertex, so its invocation follows a wait and is never co-enabled with sibling work.

The other restrictions hold unchanged: a source overlay on every model, no Exclusive merge, so no pass-through Task and no root Choice or Merge in a forking model (`SRE-ROUTE-01` keeps refusing a split beside them), the Call bounds and the data bounds.

Optional: several forks in the root body, in sequence or nested in branches.

Excluded: a terminal fork or a second None End in the Process root body; a Call in a forking root; a forking model without an embedded Sub-Process, which holds a single scope, since a Call may not sit in its root, and which the profile's shape check therefore refuses; pass-through Tasks and every other Exclusive merge in a forking model; every other exclusion of the concurrent structured scope data account. These bound admission only: a later root Call, merge region or pass-through Task on a branch broadens the class without reinterpreting an admitted model.

## Profile and public contract

The `DATA` family profile `cibseven-2.2.0-nested-embedded-scope-data-draft` grows in place under the [cumulative profile rule](../../contracts/README.md). The concurrent predicate is unchanged: a Program is concurrent exactly when it splits a token. Every model the profile admits today keeps its route, admission, Start rule, commands and observations: a serial model is untouched, and a concurrent model admitted today has no root fork, so the root-Call clause cannot refuse it.

The [profile artifact](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json) grows in place: the feature list gains `root-body-parallel-gateway-fork` beside `subprocess-body-parallel-gateway-fork`, the normative references gain Clauses 10.6.4 and 13.4.1, and the `root-body-concurrency` exclusion becomes `call-activities-in-forking-root-bodies`. The [profile README](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/README.md) states the class.

## Representation and runtime ownership

**No new representation.** No opcode, Program field, checked node, runtime collection or transition family is added. A root fork lowers to the existing `duplicate` and `synchronize`. The concurrent account's mechanisms, occurrence-chain resolution, declared entry and completion, the prepared declared entry and the frame-ownership state check, are gated by `nestedScopeDataProgram`, and their Lean laws are quantified over every Program with no profile premise, so root branches reach them unchanged. The root body runs in the Process scope, whose frame is the Process store, so a root branch's reads and writes resolve as a body branch's writes to a Process target already do. A root fork that leads straight into two declaring Sub-Processes is a batch of two prepared declared entries (`CSD-PREPARE-01`), as a body fork's is; with no Call in a forking root, a mapped invocation is never co-enabled at the root, so the prepared mapped invocation stays unreached under this profile.

**Routing.** `CSSD-ROUTE-01` is unchanged. The profile restriction on concurrent Programs, in the TypeScript [routing module](../../packages/semantic-core/src/structured-scope-data-routing.ts) and Lean's `StructuredScopeData` section of [`NestedScopeControlAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeControlAdmission.lean), replaces its root-fork clause with the root-Call clause; the nested scope-control analysis itself, shared with the embedded completion profile, is not touched.

## Admission

Admission stays [profile-parameterized](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md). The nearest wrong algorithms each have a separating witness below:

1. a root fork still refused, which refuses the onboarding model;
2. a terminal root fork or a second root End admitted, which leaves the class;
3. a Call admitted in a forking root, which drops the admission bound that keeps every mapped invocation of this profile from being enabled together with other work;
4. a pass-through Task or a merge admitted in a forking model, which the commutation relation turns into an observable choice beside a declared entry;
5. the root-Call clause applied to every concurrent Program, which refuses a model admitted today with a root Call before a body fork.

## Stable rules

- `RPF-ADMIT-01`: admission accepts exactly the required and optional scope above, refuses every exclusion and parser warning, and leaves every model admitted today with its admission.
- `RPF-ROOT-01`: a root fork activates every branch in the step that reaches it; the root join continues once, in the step in which its last incoming token arrives; the Process completes only through its one None End after the join.
- `RPF-WRITE-01`: when root branches write one Process name, every reader after the join sees the value of the write committed last, in whichever order the schedule commits them.
- `RPF-VALUE-01`: `CSSD-VALUE-01`, `CSSD-SNAPSHOT-01` and `CSSD-REFUSE-01` hold for root branches: a structured value keeps its shape through the Process frame, an open effect's argument snapshot is unchanged by a sibling root branch's later write, and a refused completion or result on one root branch changes no sibling.

Observation adds nothing: Process variables, open User Tasks, open effect arguments and flow-node occurrences are observed as today.

## Newly reachable waits and resumption

Root branches make concurrent wait sets reachable at the root: concurrent User Tasks, concurrent effects and Sub-Processes with live frames beside them, within the nested scope-control class's bounds. Each wait resumes only through its own content-bound command, User Task completion or effect result, as for body forks, and refusal is per command. The host capability obligation is the existing one for concurrent Programs of this profile: [host admission](../../packages/temporal-adapter/protocol/src/host-admission.ts), the [ordinary-effect frontier scheduler](../../packages/temporal-adapter/workflow/src/ordinary-effect-frontier-scheduler.ts) and the [pending Activity limit](../../packages/temporal-adapter/protocol/src/workflow-chain.ts).

## Separating witnesses

The model carries a source overlay and a mapped Service Task, as the profile requires.

- **Employee onboarding** (root fork, structured data):
  - Start binds `employee`, a Map with `name` and `department`.
  - Path: *Hire recorded* → fork *Start onboarding* → two branches → join *Onboarding ready* → User Task *Hold welcome meeting* → End.
  - Branch one: User Task *Prepare workstation* → Service Task *Order laptop*, whose input `employee` reads `${employee}` and whose output mappings copy its result's `tag` and `stage` to the Process names `assetTag` and `onboardingStage`; the scenarios return `stage` = `equipment-ordered`.
  - Branch two: Sub-Process *Collect documents*, which declares a local `record` = `${employee}` and a local `stage` = `documents-filed`, holds Start → User Task *Confirm documents* → End, and copies `record` out to `employee` and `stage` out to `onboardingStage`. *Confirm documents* completes with a patch of `record` that changes `department`.
  - Journey one: *Prepare workstation*, then *Confirm documents*, then the *Order laptop* result. The open effect's argument keeps the first `employee` after *Collect documents* writes the second (`RPF-VALUE-01`), and *Hold welcome meeting* reads `onboardingStage` as `equipment-ordered` (`RPF-WRITE-01`).
  - Journey two: *Confirm documents*, then *Prepare workstation*, then the result. *Order laptop* arms after the write and carries the second `employee`; `onboardingStage` ends as `equipment-ordered` because the result commits last.
  - Journey three: *Prepare workstation*, the *Order laptop* result, then *Confirm documents*: `onboardingStage` ends as `documents-filed`.
  - In every journey the join continues once, after both branches (`RPF-ROOT-01`).
- **Refused completion** (`RPF-VALUE-01`, refusal clause): while *Order laptop* is open, a *Confirm documents* patch of `record` whose encoding exceeds the `NSD-TASK-01` cap of 16,384 bytes is `rejected` and leaves the open argument snapshot, the *Collect documents* frame and the Process unchanged; the same patch at exactly 16,384 bytes commits.
- **Refused edits** of this model: a second root End reached by a terminal root fork; a mapped Call at the root before the fork; a pass-through Task on a branch; a root Merge of two inputs. The same model without its fork, with both branches in sequence, stays admitted on the serial route.
- **Root Call pair** (*Loan intake*): a mapped Call *Triage application* to a called *Expert review* Process, then a Sub-Process *Assess application* whose body forks into User Tasks *Check credit* and *Value collateral* and joins. It is a concurrent Program admitted today and stays admitted. The same model with a root fork around *Triage application* and *Assess application* is refused, and only by the root-Call clause: with that clause removed it is admitted. The mapped Call edit of the onboarding model is also refused by `CSE-ADMIT-01`, a Service Task beside a Call, so this pair alone separates the clause.
- **Call in a root-branch Sub-Process** (*Loan review*): a root fork into the Sub-Process *Review application*, whose body runs User Task *Prepare file* and then a mapped Call *Request opinion* to *Expert review*, beside User Task *Check identity*, joined before *Decide loan*. It is admitted at both analysis levels, so a root-Call clause widened to every Call of a forking model fails.
- **Optional scope:** root forks nested in a root branch and root forks in sequence, each beside a Sub-Process, are admitted as concurrent Programs. A root fork around the retained loan assessment's Call-bearing body is no such witness, because its entry closure exceeds the closure limit and the shared analysis refuses it on its own.
- **Existing witnesses that change:** the `fork in the root body` case of the [concurrent structured scope data source test](../../packages/bpmn-source/test/concurrent-structured-scope-data-admission.test.ts) becomes an admitted witness. The [conformance module](../../BpmnSemantics/ConcurrentStructuredScopeDataConformance.lean)'s `root_body_fork_is_refused` is removed: forking the order fulfilment root exceeds the closure limit, so it would stay refused for that reason alone and no longer witness the root restriction, which this family's conformance module now owns.

## Rule-to-evidence matrix

| Rule | Positive and negative witness | Lanes | Killing mutation |
|---|---|---|---|
| `RPF-ADMIT-01` | The model, the root Call pair's control and the loan review admitted; each refused edit and the forking root Call refused; every retained model of the profile keeps its admission | Source, core, Lean conformance module, corpus | Keep refusing a root fork, admit a terminal root fork, admit a Call in a forking root, refuse a Call in a root-branch Sub-Process, or apply the root-Call clause to every concurrent Program |
| `RPF-ROOT-01` | Each journey reaches *Hold welcome meeting* once, after both branches | Pipeline, CIB probe on journeys two and three | Continue the join on its first token |
| `RPF-WRITE-01` | `onboardingStage` differs between journeys two and three | Pipeline, CIB probe | Apply branch writes in Program order |
| `RPF-VALUE-01` | The open *Order laptop* argument holds the first `employee` after the sibling write in journey one, and the second in journey two; the over-cap patch rejected without a change, the at-cap patch committed | Pipeline, value-domain matrix, core runtime test | Re-read the argument when the result arrives, or apply a rejected patch to the sibling frame |

## Lean assurance lane

Lane shape: checked

Evidence: the family adds no transition family and no runtime law. Root branches run through `duplicate`, `synchronize` and the concurrent scope-data mechanisms, whose laws in [`NestedScopeDataLaws`](../../BpmnSemantics/SemanticProcess/NestedScopeDataLaws.lean) are quantified over every Program. An executable conformance module, [`rootParallelForksConformanceChecks`](../../BpmnSemantics/RootParallelForksConformance.lean#rootParallelForksConformanceChecks), importing admission owners only as [`ConcurrentStructuredScopeDataConformance`](../../BpmnSemantics/ConcurrentStructuredScopeDataConformance.lean) does, checks admission and routing over the model and every refused edit, and the pipeline checks agreement with the core and Temporal on the journeys.

Not proved, and recorded as such: that every actual closure of an admitted concurrent Program stays within the computed burst; the runtime closure bound rolls an over-limit closure back atomically.

## Temporal hosting and refinement preflight

No new hosting mechanism. Concurrent Programs of this profile are already hosted: ingress, waits, effects, cancellation, lifecycle and the publication projection are those of body forks. Delivery, ordering, deduplication, retry and replay risks: none new, because a root branch's wait is hosted exactly as a body branch's. The preserved relation is equality of hosted committed state and core state. The smallest witness is the hosted pipeline over the three journeys at family closure.

## Evidence and acceptance

The model runs as answer-free scenarios with registered pipeline cases, seeded mutations, value-domain matrix rows, a corpus row and the About disclosure. The CIB lane is a calibration probe beside the [concurrent structured scope data probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenConcurrentStructuredScopeDataProbeTest.java), asserting for journeys two and three the *Order laptop* argument, the final `onboardingStage` and `employee`, and one *Hold welcome meeting* task after both branches. CIB runs the async-before delegate and its completion in one continuation job, so it realizes only schedules in which that job runs before the next command; journey one's open snapshot is the operational realization that `CIB-EXT-0015` and `CIB-OP-0010` already classify for this profile, and the probe claims no argument agreement for it.

Acceptance:

- Lean, core and pipeline agree on every scenario of the profile.
- The probe agrees.
- Every retained model stays admitted.
- The hosted pipeline passes once at family closure.

Then `PC-CF-03` is evidenced for root forks of this profile and `PC-DATA-03`, `PC-DATA-05` and `PC-DATA-06` for root branches; all four stay open on their other clauses.

Nearest unsupported claims:

- root Calls, merge regions and pass-through Tasks in forking models of this profile;
- argument agreement with CIB when a sibling commits before a continuation job runs (`CIB-OP-0010`);
- quantified bounded closure.

Closure gates, 2026-11-02:

- **Green at `211d34ec`:** `LEAN_FULL_GATE=root-parallel-forks ./scripts/lake.sh build BpmnConformance`, 933 jobs, with the [conformance module](../../BpmnSemantics/RootParallelForksConformance.lean); every check of it and of the concurrent structured scope data module evaluates true.
- **Green at `cd357a5e`:** the complete `verify.sh`: the Lean library and executable checks, the runtime stage, the complete Temporal gate and the pipeline over all 157 registered cases, whose warm total of 117.4 s is 58% of its ceiling; then the research doctor and `test:model-corpus` over all 84 models.
- **Calibration:** the [concurrent structured scope data probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenConcurrentStructuredScopeDataProbeTest.java) passes all 3 tests on pinned CIB Seven `2.2.0`, journeys two and three of the onboarding model included.

As implemented, where the account above left a choice or a witness changed:

- **Root Call pair.** The pair built from the retained loan assessment, which the approved audit named, is no separating witness: forking its root exceeds the closure limit, so the shared analysis refuses it without the root-Call clause. The *Loan intake* pair in [Separating witnesses](#separating-witnesses) replaces it. Its Lean check states each analysis level on its own, because a mutation that dropped only the checked-level clause still passed a check through both levels together.
- **Removed witness.** The concurrent structured scope data module's `root_body_fork_is_refused` is removed rather than flipped, as stated in [Separating witnesses](#separating-witnesses).
- **Probe owner.** The root fork calibration is a test of the existing concurrent structured scope data probe, which gained a model directory parameter, instead of a new probe class with another copy of its session helper.
- **Pipeline budget.** The three cases raised the warm pipeline budget from 200,200 to 204,100 ms and the hosted budget from 300,300 to 306,150 ms, at the unchanged 1,300 ms per-case rate the [verification entrypoint guard](../../scripts/verification-entrypoint.test.ts) requires; the owner approved the raise after a fresh direction review and a Rule 2 bound review. The hosted run at 154 cases used 191.8 s, 64% of its ceiling.

## Versioning consequences

Apply the [pre-release wire policy](../../contracts/README.md#evolution-policy): no wire shape, schema or value arm changes; admission accepts root forks under the profile; the profile artifact grows in place; no legacy reader or migration is added.

### Owners this implementation grows

Build cost is a constraint. No kernel type changes and no hub interface changes. The only Lean semantic edit is a body edit of the private `programRestrictionsHold` and `checkedRestrictionsHold` in [`NestedScopeControlAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeControlAdmission.lean), kept line-neutral within the module-size target that `node scripts/what-binds.ts` reports. Should it not fit, a split is chosen only after the fan-out model prices it, because the [concurrent structured scope data owners](CONCURRENT-STRUCTURED-SCOPE-DATA-SPEC.md#owners-this-implementation-grew) record that a routing module of its own measured one more module in the `PrivateEquationLemmas` meta-import cone.

Lean owners: `NestedScopeControlAdmission`'s two restriction predicates, the flipped witness in `ConcurrentStructuredScopeDataConformance`, and a new executable conformance module, a family-owned leaf.

TypeScript owner: the [routing module](../../packages/semantic-core/src/structured-scope-data-routing.ts).

Registration:

- the `CIB-EXT-0020` widening in the [register](../CIB-BPMN-RELATION-REGISTER.md);
- the [profile artifact](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json) entries above and the README;
- the [concurrent structured scope data specification](CONCURRENT-STRUCTURED-SCOPE-DATA-SPEC.md#required-optional-and-excluded-scope), whose root-fork exclusion this family narrows;
- the [requirement ledger](../BPMN-REQUIREMENT-LEDGER.md) row `BPMN-PARALLEL-GATEWAY-01`, which limits this profile to body forks;
- scenarios, pipeline cases, the value-domain matrix, the corpus, About and the CIB probe.

Guards the implementation must change or satisfy:

- [`lean-fanout`](../../scripts/lean-fanout.test.ts), [`lean-import-boundaries`](../../scripts/lean-import-boundaries.test.ts), [`lean-module-cost`](../../scripts/lean-module-cost.test.ts) and [`source-hygiene`](../../scripts/source-hygiene.test.ts), which bound every grown owner and new module;
- the [Start capacity envelope test](../../packages/temporal-adapter/protocol/test/start-capacity-envelope.test.ts), whose routing of serial Programs stays unchanged;
- the [value-domain matrix](../../packages/differential/test/scenario-value-domain-lean-core.integration-test.ts), the [executable model corpus](../../model-corpus/test/executable-model-corpus.test.ts), [`requirement-ledger-consistency`](../../scripts/requirement-ledger-consistency.test.ts) and the [About disclosure guard](../../scripts/capability-catalog-disclosures.test.ts), for the grown artifact;
- [`document-reviewability`](../../scripts/document-reviewability.test.ts), for this inventory.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `65cc260e` | `fork-turns-none` | `approve-with-required-edits` | `5b1a954f, 01f288d2` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `63e47821` | `fork-turns-none` | `approve-with-required-edits` | `e1c590f2` |
