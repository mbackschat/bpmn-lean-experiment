# Root Parallel forks proposal

## Status

Lifecycle: draft
Review: pending

## Question and delivery boundary

Can the nested scope-data profile admit paired Parallel forks and joins in the Process root body, beside the forks it already admits in Sub-Process bodies, and admit pass-through Abstract and Manual Tasks on the branches of any of its Parallel forks, so that root branches run User Tasks, mapped Service Tasks, Sub-Processes and pass-through Tasks concurrently over the structured value domain?

This is the next family of batch 4 in [PLAN](../PLAN.md#scheduled-delivery-batches). Its shared mechanism is the concurrent account that the [concurrent structured scope data specification](CONCURRENT-STRUCTURED-SCOPE-DATA-SPEC.md) selected for this profile, which today requires a serial root path and refuses every Exclusive merge, and so every pass-through Task, in a forking Program. It takes every open row of the [coverage checklist](../PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) that shares that mechanism:

- `PC-CF-03`, primary: Parallel fork and join composition with human and automated branches, here at the Process root of the structured profile, where both branch orders preserve sibling waits and writes and the join continues once, after every incoming token;
- `PC-HUM-04`, its Parallel-branch clause: a plain Task on a Parallel branch passes through without a wait;
- `PC-HUM-05`, its Parallel-branch clause: a Manual Task on a Parallel branch does the same and keeps its source kind.

No row closes in this family. `PC-CF-03` keeps its separate body Ends and scoped-quiescence clauses on the embedded completion profile's evidence and its `PC-AUTO-01` and `PC-HUM-01` prerequisites, and `PC-HUM-05` keeps its implicit split and merge clause on `PC-CF-07`.

Selection, 2026-11-02: chosen over implicit Activity split and merge (`PC-CF-07`) on reach. Parallel Gateways appear in 144 of the pinned CIB test models; an Activity with two incoming or two outgoing Sequence Flows appears in 17 and 13 of 1,947, many of them loop back-edges or parse-invalid fixtures.

## Normative basis and CIB classification

**BPMN.** Clause 10.6.4 and Clause 13.4.1 define the Parallel Gateway: a diverging one produces a token on every outgoing flow, a converging one waits for a token on every incoming flow and then produces one. Clause 13.3.1 makes each Activity on a branch an independent instance enabled by its own token. Clause 13.2 completes the Process only when no token and no active Activity remains, so a root join followed by one None End completes it once. Nothing in these clauses distinguishes a root body from a Sub-Process body; the profile's restriction to body forks was an admission bound, recorded as one that broadens "without reinterpreting an admitted model" ([CSSD scope](CONCURRENT-STRUCTURED-SCOPE-DATA-SPEC.md#required-optional-and-excluded-scope)). Clauses 10.3.3.1, 10.3.4.1, 13.1 and 13.3.3 give the Abstract and Manual Task meaning that the [pass-through Task specification](PASS-THROUGH-TASK-SPEC.md#normative-basis-and-cib-classification) selected; a branch changes nothing in it.

**CIB Seven.** At pinned `v2.2.0-27-g5a45b47`, `ParallelGatewayActivityBehavior` forks and joins the same way in every scope, the Process scope included; the root is an ordinary `PvmExecutionImpl` scope whose concurrent child executions carry the branches. `TaskActivityBehavior.performExecution` leaves through `leave` (`TaskActivityBehavior.java:54-56`), so a pass-through Task on a concurrent execution passes on as on the scope execution. Process variables written by concurrent branches land on the Process instance through `AbstractVariableScope.setVariable`, the same path `CIB-EXT-0020` cites for body branches that write a Process target. The family calibrates root forks and pass-through Tasks on branches on the CIB oracle (below).

Register changes, each with these citations and the calibration:

- **`CIB-EXT-0020`.** Its concurrent clause for this profile widens from Parallel forks in Sub-Process bodies to Parallel forks in the Process root body and in Sub-Process bodies.
- **`CIB-EXT-0022`.** Its placement widens to the branches of a Parallel fork of this profile, at the root or in a Sub-Process body.

## Required, optional and excluded scope

Required: every model the profile admits today, unchanged, and in addition every concurrent model that the [concurrent structured scope data class](CONCURRENT-STRUCTURED-SCOPE-DATA-SPEC.md#required-optional-and-excluded-scope) admits once two of its restrictions change:

- **Forks in the Process root body.** Paired Parallel blocks may sit in the Process root body as in Sub-Process bodies, nested in any order inside branches; the root keeps its one None End and admits no terminal unjoined fork, as the [nested scope-control class](NESTED-EMBEDDED-SCOPE-CONTROL-SPEC.md#required-optional-and-excluded-scope) requires.
- **Pass-through Tasks on branches.** A plain Task or Manual Task with only an identity and a name, one incoming and one unconditioned, non-default outgoing flow may sit anywhere a User Task may in a concurrent Program: on a branch, between a fork and a join, before or after a fork, at the root or in a Sub-Process body. A branch that holds only pass-through Tasks has no work and stays refused, as the class requires a User Task or Sub-Process on every path before any join or End.

The other restrictions hold unchanged: a source overlay on every model; no Exclusive merge of two or more inputs; and the Call bounds, under which a body that holds a fork holds no Call, so a forking root holds none either, while a Call-bearing Sub-Process may lie on a root branch.

Optional: root branches that each hold Sub-Processes with their own forks; pass-through Tasks after a join.

Excluded: a terminal fork or a second None End in the Process root body; a Call in a forking root; merges of two or more inputs, so root Choices and Merges stay with the re-entry account, which refuses every split (`SRE-ROUTE-01`); every other exclusion of the concurrent structured scope data and pass-through Task accounts. These bound admission only: a later merge region or root Call broadens the class without reinterpreting an admitted model.

## Profile and public contract

The `DATA` family profile `cibseven-2.2.0-nested-embedded-scope-data-draft` grows in place under the [cumulative profile rule](../../contracts/README.md). The concurrent predicate is unchanged: a Program is concurrent exactly when it splits a token. Every model the profile admits today keeps its route, admission, Start rule, commands and observations, because each one either has no split or has its splits only in Sub-Process bodies without a pass-through Task, and the two changes only admit models that were refused.

The [profile artifact](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json) grows in place: the feature list gains Parallel forks in the Process root body and pass-through Tasks on Parallel branches, and the `root-body-concurrency` exclusion is removed. The [profile README](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/README.md) states the class.

## Representation and runtime ownership

**No new representation.** No opcode, Program field, checked node, runtime collection or transition family is added. A root fork lowers to the existing `duplicate` and `synchronize`, and a pass-through Task to the existing one-input `mergeExclusive` ([`PTT-PASS-01`](PASS-THROUGH-TASK-SPEC.md#stable-rules)). The concurrent account's mechanisms, occurrence-chain resolution, declared entry and completion and the frame-ownership state check, are gated by `nestedScopeDataProgram` and their Lean laws are quantified over every Program, so root branches reach them unchanged. The root body runs in the Process scope, whose frame is the Process store, so a root branch's reads and writes resolve as a body branch's writes to a Process target already do.

**The concurrent analysis gains one vertex.** The nested scope-control analysis projects each body to the reviewed structured-body analysis, whose vertices are Start, Task, Fork, Join and End. A one-input `mergeExclusive`, the Program-level pass-through Task, becomes a **pass** vertex: it is structurally transparent, costs one step in the burst analysis, is no wait and is no work. Merges of two or more inputs stay refused by the profile restriction. The checked graph's `nonOperationalTask` node projects to the same vertex.

**Routing.** `CSSD-ROUTE-01` is unchanged. The profile restriction on concurrent Programs drops its root-fork clause, gains a no-Call-in-a-forking-root clause, and narrows its merge clause to merges of two or more inputs.

## Admission

Admission stays [profile-parameterized](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md). The nearest wrong algorithms each have a separating witness below:

1. a root fork still refused, which refuses the onboarding model;
2. a terminal root fork or a second root End admitted, which leaves the class;
3. a Call admitted in a forking root, which reaches the prepared mapped invocation this profile does not claim for structured values;
4. a pass-through vertex counted as work, which admits a branch holding only a pass-through Task;
5. a pass-through vertex given no burst cost, which admits a branch chain whose closure exceeds eight steps;
6. a merge of two or more inputs admitted in a forking Program, which bypasses `SRE-ROUTE-01`.

## Stable rules

- `RPF-ADMIT-01`: admission accepts exactly the required and optional scope above, refuses every exclusion and parser warning, and leaves every model admitted today with its admission.
- `RPF-ROOT-01`: a root fork activates every branch in the step that reaches it, and the root join continues once, in the step in which its last incoming token arrives; the Process completes only through its one None End after the join.
- `RPF-WRITE-01`: when root branches write one Process name, every reader after the join sees the value of the write committed last; both branch orders are admitted and each yields its own last writer.
- `RPF-PASS-01`: a pass-through Task on a branch passes its token on in the step that reaches it and publishes one occurrence that starts and ends in that step, without a wait, effect or command (`PTT-PASS-01` on a branch).
- `RPF-BURST-01`: the concurrent account's burst analysis counts each pass-through Task as one step; a concurrent model whose burst exceeds the closure limit of eight is refused at admission.

Observation adds nothing: Process variables, open User Tasks, open effect arguments and flow-node occurrences are observed as today.

## Newly reachable waits and resumption

Root branches make concurrent wait sets reachable at the root: concurrent User Tasks, concurrent effects and Sub-Processes with live frames beside them, within the nested scope-control class's bounds. Each wait resumes only through its own content-bound command, User Task completion or effect result, as for body forks, and refusal is per command. The host capability obligation is the existing one for concurrent Programs of this profile: [host admission](../../packages/temporal-adapter/protocol/src/host-admission.ts), the [ordinary-effect frontier scheduler](../../packages/temporal-adapter/workflow/src/ordinary-effect-frontier-scheduler.ts) and the [pending Activity limit](../../packages/temporal-adapter/protocol/src/workflow-chain.ts). Pass-through Tasks add no wait.

## Separating witnesses

Both models carry a source overlay and a mapped Service Task, as the profile requires, and each is useful without its Tasks.

- **Employee onboarding** (root fork):
  - Path: *Hire recorded* → fork *Start onboarding* → two branches → join *Onboarding ready* → User Task *Hold welcome meeting* → End.
  - Branch one: Manual Task *Hand over badge* → User Task *Prepare workstation* → Service Task *Order laptop*, whose output mappings copy its result's `tag` and `stage` to the Process names `assetTag` and `onboardingStage`; the scenarios return `stage` = `equipment-ordered`.
  - Branch two: plain Task *Record start date* → Sub-Process *Collect documents*, which declares a local `stage` = `documents-filed`, holds Start → User Task *Confirm documents* → End and copies `stage` out to `onboardingStage`.
  - Journeys: *Order laptop* completes before *Collect documents* does, and the other way round. *Hold welcome meeting* reads `onboardingStage` as `documents-filed` in the first and `equipment-ordered` in the second (`RPF-WRITE-01`), and in both the join continues once after both branches (`RPF-ROOT-01`).
- **Quote preparation** (body fork):
  - Path: *Quote requested* → User Task *Capture request* → Sub-Process *Prepare quote* → User Task *Send quote* → End.
  - The Sub-Process body forks into plain Task *Log quote request* → Service Task *Price items*, and Manual Task *Check catalogue binder* → User Task *Approve discount*, and joins before its End.
  - Journey: *Approve discount* before *Price items* completes.
- **Refused edits** of these models: a second root End reached by a terminal root fork; a Call on a root branch; a branch holding only *Hand over badge*; a Merge of two inputs in a forking model; and a branch chain of plain Tasks whose burst is nine, beside the same chain at eight, admitted.

## Rule-to-evidence matrix

| Rule | Positive and negative witness | Lanes | Killing mutation |
|---|---|---|---|
| `RPF-ADMIT-01` | Both models admitted; each refused edit refused; every retained model of the profile keeps its admission | Source, core, Lean conformance module, corpus | Keep refusing a root fork, or admit a terminal root fork |
| `RPF-ROOT-01` | The onboarding journeys reach *Hold welcome meeting* once, after both branches | Pipeline, CIB probe | Continue the join on its first token |
| `RPF-WRITE-01` | `onboardingStage` differs between the two journeys | Pipeline, CIB probe | Apply branch writes in Program order |
| `RPF-PASS-01` | Each pass-through Task on a branch publishes one instantaneous occurrence | Pipeline, CIB probe | Lower the Task on a branch as a wait |
| `RPF-BURST-01` | Burst-eight branch chain admitted, burst-nine refused | Core, Lean conformance module, source test running the eight-step model's journey | Cost zero for the pass vertex |

## Lean assurance lane

Lane shape: checked

Evidence: the family adds no transition family and no runtime law. Root branches and pass-through Tasks run through `duplicate`, `synchronize`, `mergeExclusive` and the concurrent scope-data mechanisms, whose laws in [`NestedScopeDataLaws`](../../BpmnSemantics/SemanticProcess/NestedScopeDataLaws.lean) are quantified over every Program. An executable conformance module, a leaf beside [`PassThroughTaskConformance`](../../BpmnSemantics/PassThroughTaskConformance.lean), checks admission, routing and the burst over both models and every refused edit, and the pipeline checks agreement with the core and Temporal on the journeys.

Not proved, and recorded as such: that every actual closure of an admitted concurrent Program stays within the computed burst; the runtime closure bound rolls an over-limit closure back atomically, as for the serial and re-entry accounts.

## Temporal hosting and refinement preflight

No new hosting mechanism. Concurrent Programs of this profile are already hosted: ingress, waits, effects, cancellation, lifecycle and the publication projection are those of body forks. Delivery, ordering, deduplication, retry and replay risks: none new, because a root branch's wait is hosted exactly as a body branch's and a pass-through Task adds no wait. The preserved relation is equality of hosted committed state and core state. The smallest witness is the hosted pipeline over both orders of the onboarding model at family closure.

## Evidence and acceptance

Both models run as answer-free scenarios with registered pipeline cases, seeded mutations, value-domain matrix rows, corpus rows and About disclosures. The CIB lane is a calibration probe beside the [pass-through Task probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenPassThroughTaskProbeTest.java), asserting for both onboarding orders the final `onboardingStage`, one *Hold welcome meeting* task after both branches, and one ended activity instance per pass-through Task.

Acceptance:

- Lean, core and pipeline agree on every scenario of the profile.
- The probe agrees.
- Every retained model stays admitted.
- The hosted pipeline passes once at family closure.

Then `PC-CF-03` is evidenced for root forks of this profile, and `PC-HUM-04` and `PC-HUM-05` on Parallel branches; all three stay open on their other clauses.

Nearest unsupported claims:

- root Calls and merge regions in forking models of this profile;
- implicit Activity split and merge;
- quantified bounded closure.

## Versioning consequences

Apply the [pre-release wire policy](../../contracts/README.md#evolution-policy): no wire shape, schema or value arm changes; admission accepts root forks and pass-through Tasks on branches under the profile; the profile artifact grows in place; no legacy reader or migration is added.

### Owners this implementation grows

Build cost is a constraint. No kernel type changes. [`NestedScopeControlAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeControlAdmission.lean) stands at 799 nonblank lines against the 800-line target, so its `StructuredScopeData` section, the Lean counterpart of the TypeScript routing module, first moves to a family-owned leaf, `StructuredScopeDataRouting`, as its own commit; the analysis's pass vertex then grows the module by the lines that move out.

Lean owners:

- `StructuredScopeDataRouting` (moved out of `NestedScopeControlAdmission`): the profile restriction's root, Call and merge clauses.
- [`NestedScopeControlAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeControlAdmission.lean): the pass vertex in the Program and checked projections.
- [`StructuredParallelBodyAdmission`](../../BpmnSemantics/SemanticProcess/StructuredParallelBodyAdmission.lean): the pass vertex kind, transparent in the structure and one step in the scans.
- A new executable conformance module: a family-owned leaf.

TypeScript owners: the [routing module](../../packages/semantic-core/src/structured-scope-data-routing.ts), the [nested scope-control analysis](../../packages/semantic-core/src/nested-scope-control-admission.ts) and the [structured-body analysis](../../packages/semantic-core/src/structured-parallel-body-analysis.ts).

Registration: the `CIB-EXT-0020` and `CIB-EXT-0022` widenings in the [register](../CIB-BPMN-RELATION-REGISTER.md); the [profile artifact](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json) and README; the [pass-through Task specification](PASS-THROUGH-TASK-SPEC.md#admission) and the [concurrent structured scope data specification](CONCURRENT-STRUCTURED-SCOPE-DATA-SPEC.md#required-optional-and-excluded-scope), whose exclusions this family narrows; scenarios, pipeline cases, the value-domain matrix, the corpus, About and the CIB probe.

Guards the implementation must change or satisfy:

- [`lean-fanout`](../../scripts/lean-fanout.test.ts), [`lean-import-boundaries`](../../scripts/lean-import-boundaries.test.ts), [`lean-module-cost`](../../scripts/lean-module-cost.test.ts) and [`source-hygiene`](../../scripts/source-hygiene.test.ts), which bound every grown owner and new module;
- the [Start capacity envelope test](../../packages/temporal-adapter/protocol/test/start-capacity-envelope.test.ts), whose routing of serial Programs stays unchanged;
- the [value-domain matrix](../../packages/differential/test/scenario-value-domain-lean-core.integration-test.ts), the [executable model corpus](../../model-corpus/test/executable-model-corpus.test.ts), [`requirement-ledger-consistency`](../../scripts/requirement-ledger-consistency.test.ts) and the [About disclosure guard](../../scripts/capability-catalog-disclosures.test.ts), for the grown artifact;
- [`document-reviewability`](../../scripts/document-reviewability.test.ts), for this inventory.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
