# Pass-through Task implicit split and merge proposal

## Status

Lifecycle: draft
Review: pending

## Question and delivery boundary

Can the nested scope-data profile admit a pass-through Abstract or Manual Task with several incoming Sequence Flows (implicit merge) or several unconditioned outgoing Sequence Flows (implicit split), so that every arriving token passes the Task once without waiting for the others and one activation puts a token on every outgoing flow, with no kernel change, while every model, command and observation the profile admits today keeps its meaning and every other profile keeps its single-flow Tasks?

This is the next family of batch 4 in [PLAN](../PLAN.md#scheduled-delivery-batches). Its mechanism is the pass-through Task's own operation taking several inputs or several outputs. A pass-through Task already lowers to a one-input `mergeExclusive` with the Task as origin ([`PTT-PASS-01`](PASS-THROUGH-TASK-SPEC.md#stable-rules)). With k incoming flows it becomes a k-input `mergeExclusive`. With k outgoing flows it becomes a `duplicate` with the Task as origin. Neither needs a control place without a Sequence Flow behind it, the defect on which the [implicit fan-in review](IMPLICIT-FAN-IN-PROPOSAL.md#independent-cold-review-receipt) rejected the general entry merge. It serves this clause of the [coverage checklist](../PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list):

- `PC-HUM-05`, primary: "both implicit split and merge cases retain the prescribed tokens and exact occurrence", the row's last open clause. It consumes the pass-through part of `PC-CF-07`'s contract, which this account reviews.

`PC-CF-07` itself stays open on every other Activity kind and on its embedded, called and Multi-Instance body clauses. `PC-HUM-04` is done.

Screened out, each with its reason:

- Implicit split and merge at every other Activity kind (`PC-CF-07`'s remaining clauses), at Start Events (`PC-BASIC-01`) and at Link targets (`PC-BASIC-02`). The Activity's own operation consumes one input place and produces one output place, so fan-in or fan-out there needs the kernel extension the implicit fan-in review named: a typed entry place, or multi-input and multi-output target operations. Control-place origins are read at about 500 Lean sites, so that is a family of its own and the next one. This account's lowering is the pass-through case of multi-input and multi-output target operations, so the general family can extend it without re-cutting it.
- A conditional or default outgoing flow from the Task: that is an inclusive split (Clause 13.3.1), a different mechanism.

Selection, 2026-11-05: close call against the general Activity family. That family has the larger reach: 21 and 14 of 2,227 deduplicated BPMN models in the pinned CIB Seven test resources at `5a45b47` hold Activity fan-in and fan-out, against no pass-through fan-in and one pass-through fan-out, and that one uses a default flow. This family needs no kernel change and closes a row, so it goes first.

## Normative basis and CIB classification

**BPMN.** Clause 13.3.1 (reading copy line 12286): an Activity that is the target of several Sequence Flows "participates in uncontrolled flow". For each token arriving on any incoming flow, the Activity "will be enabled independently of the arrival of tokens on other incoming Sequence Flows", and the incoming flows behave "as an exclusive gateway". If it has several outgoing flows, "all of them will receive a token when the Activity transitions to the Completed state", which "behaves as a parallel split", while conditioned outgoing flows behave as an inclusive split. The Activity notes of Clause 10.3 (lines 4614-4618) state the same: a further token creates "a separate instance of the Activity", and each outgoing flow creates "a separate parallel path". Clause 13.3.3 completes an Abstract Task on activation and has a Manual Task's work done outside the engine, which is why both are pass-through Tasks here.

**CIB Seven.** At pinned `5a45b47` a transition enters its destination without consulting the destination's other incoming transitions (`pvm/runtime/operation/AbstractPvmAtomicOperationTransitionNotifyListenerTake.java:34-51`). Under `bpmn/behavior/` only the Parallel and Inclusive Gateway behaviors and Parallel Multi-Instance collect joining executions. A `task` or `manualTask` (`TaskActivityBehavior`, `ManualTaskActivityBehavior`) leaves through `BpmnActivityBehavior.performOutgoingBehavior` (`bpmn/behavior/BpmnActivityBehavior.java:81-130`), which takes every unconditioned non-default transition. With several, it leaves through `leaveActivityViaTransitions`, and `PvmAtomicOperationTransitionDestroyScope` (`pvm/runtime/operation/PvmAtomicOperationTransitionDestroyScope.java:82-135`) reuses the leaving execution for the first transition and creates one concurrent execution per further one. So each arrival is one activity instance of type `task` or `manualTask`, and one activation starts every outgoing path.

Classification: no new relationship. The boundary of [`CIB-EXT-0022`](../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0022--abstract-and-manual-tasks-as-immediate-pass-through) widens from one incoming and one outgoing flow to the forms admitted below. The per-token and parallel-split readings are normative agreement inside that extension's boundary.

## Required, optional and excluded scope

Required: every model the profile admits today, unchanged. In addition, under this profile only:

- **Implicit merge:** a pass-through Task with two or more incoming flows and one unconditioned, non-default outgoing flow, in the root graph of the [re-entry account](SCOPE-REENTRY-SPEC.md#admission). That is exactly where a converging Exclusive Gateway of the same arity is admitted.
- **Implicit split:** a pass-through Task with one incoming flow and two or more unconditioned, non-default outgoing flows, wherever a diverging Parallel Gateway of the same arity is admitted on the concurrent route: in the root of a forking model and in a Sub-Process body. Its branches follow the branch rules of a Parallel fork: a paired converging Parallel Gateway (`PTPB-WORK-01`), or terminal branches ([terminal forks](TERMINAL-FORKS-SPEC.md#admission), and [data-declaring terminal branches](DATA-DECLARING-TERMINAL-BRANCHES-SPEC.md#admission) beside scope-local data).

Optional: several such Tasks in one model, and an implicit split nested on a branch of another fork, within the closure limit of eight.

Excluded, each refused at admission:

- a Task with both several incoming and several outgoing flows;
- a conditioned or default outgoing flow from a Task (inclusive split);
- an implicit merge under a fork, where two concurrent arrivals would need the concurrent account's merge, which it refuses; an implicit merge in a Sub-Process body or the called Process, whose bodies hold no Choice;
- a pass-through Task in a called Process, as today;
- every other Activity kind, Start Event and Link target with several flows;
- every form under any other profile.

These bound admission only. A later merge under forks, or the general Activity family, broadens the class with the same lowering and reinterprets no admitted model.

## Profile and public contract

The profile `cibseven-2.2.0-nested-embedded-scope-data-draft` grows in place under the [cumulative profile rule](../../contracts/README.md). The [profile artifact](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json) exclusion `implicit-task-split-merge` becomes `implicit-activity-split-merge-outside-pass-through-tasks`, and the [profile README](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/README.md) states the class. No wire, schema or Program shape changes. A Task-origin `duplicate` and a k-input `mergeExclusive` are existing operation shapes. Observation adds nothing: each activation publishes the Task's one instantaneous occurrence, which records process, element and owner and no operation kind, so the source kind stays in the checked graph (`PTT-KIND-01`).

## Representation and runtime ownership

No new opcode, operation family, Program field, checked node kind, control place or transition family. Lowering of a pass-through Task (`PTT-PASS-01`):

- one incoming and one outgoing flow: the one-input `mergeExclusive`, as today;
- k ≥ 2 incoming flows and one outgoing flow: a k-input `mergeExclusive` with the Task as origin, consuming each incoming flow's own place;
- one incoming flow and k ≥ 2 outgoing flows: a `duplicate` with the Task as origin, producing each outgoing flow's own place in source order.

Every control place keeps its Sequence Flow origin, and every place keeps one producer and one consumer, so the census of [`GraphValidation`](../../BpmnSemantics/SemanticProcess/GraphValidation.lean) holds. The Task owns exactly one operation, so the Program envelope's one-operation-per-origin test holds unrelaxed. The lowering sites are the TypeScript [lowering](../../packages/bpmn-source/src/semantic-process-lowering.ts), whose pass-through arm stops requiring one incoming and one outgoing flow, and Lean [`Lowering`](../../BpmnSemantics/SemanticProcess/Lowering.lean), whose pass-through arm stops taking `firstPlace` of the incoming places. In Lean, `firstPlace` silently drops every other incoming place, so the merge arm takes the whole list. Both languages change together, and definition binding (lowering equality) keeps them agreeing.

Runtime is unchanged:

- A k-input `mergeExclusive` fires once per token on any input, as the re-entry account's explicit Merges do. One arrival gives one occurrence, and a second arrival a fresh one (`PTT-FRESH-01`).
- A Task-origin `duplicate` fires once, consuming its input and putting one token on each output, as a Parallel fork does. The occurrence lifecycle already gives `duplicate` and `mergeExclusive` the same instantaneous occurrence of their origin, in [`flow-node-occurrence-lifecycle.ts`](../../packages/semantic-core/src/flow-node-occurrence-lifecycle.ts) and in Lean's `FlowNodeOccurrenceLifecycle`.

No pair law is new. A Task-origin `duplicate` is local control in the commutation census, like a Parallel fork, so the existing local-control laws cover it in a batch. A k-input `mergeExclusive` is a Merge input, covered beside a declared entry by `prepared_declared_entry_merge_pair` (`PTPB-COMMUTE-01`).

## Admission

Admission stays [profile-parameterized](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md). Each locus widens for this profile only and keeps refusing every exclusion:

- **Checked arity.** The incoming and outgoing arity of `nonOperationalTask` widens to the two forms above, in [`CheckedProcessAdmission`](../../BpmnSemantics/SemanticProcess/CheckedProcessAdmission.lean) and the source [checked graph admission](../../packages/bpmn-source/src/checked-process-graph-admission.ts). Both forms at once, and a conditioned or default outgoing flow, stay refused.
- **Checked projections.**
  - The concurrent structured analysis projects a Task with k ≥ 2 outgoing flows to a fork vertex of k branches instead of a pass vertex: `checkedKind` in [nested scope-control admission](../../packages/semantic-core/src/nested-scope-control-admission.ts) and its Lean twin in [`NestedScopeControlAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeControlAdmission.lean).
  - The re-entry analysis projects a Task with k ≥ 2 incoming flows to its existing pass-through vertex with k inputs, which matches the lowered k-input `mergeExclusive` it reads at the Program level: the re-entry vertex projection in [nested scope-data admission](../../packages/semantic-core/src/nested-scope-data-admission.ts), [`ScopeReentryAdmission`](../../BpmnSemantics/SemanticProcess/ScopeReentryAdmission.lean) and their Program-level twins.
- **Routing.** The structured route test counts a Task with several outgoing flows as forking, both in `forks` in [structured scope-data routing](../../packages/semantic-core/src/structured-scope-data-routing.ts) and in Lean's `checkedRouted`. Without that, a model whose only fork is such a Task would take the serial route.
- **Unchanged rules.** The Program-level route rule `SRE-ROUTE-01` already counts a root `mergeExclusive` of two or more inputs as a Merge, and the concurrent analysis already reads every `duplicate` as a fork, so no Program-level rule changes. Branch cuts (`PTPB-WORK-01`, `TFK-ADMIT-01`, `DTB-ADMIT-01`), Call placement (`PTPB-CALL-01`) and the closure limit apply unchanged.
- **Burst.** A Task-origin fork costs one step, where a Task followed by a Parallel fork costs two, so no admitted closure grows.

The nearest wrong algorithms, each with a separating witness below:

1. the arity widened at one level only, which refuses the model at the other;
2. the arity widened for every profile;
3. the merge as a join that waits for every incoming flow;
4. the split as a choice that takes one outgoing flow, or as k activations of the Task;
5. a Task with fan-out projected as a pass vertex at the checked level while its Program forks, which disagrees on the route and the burst.

## Stable rules

| Rule | Statement |
|---|---|
| `PTSM-ADMIT-01` | Under this profile, admission accepts exactly the required and optional forms above at the checked and Program levels alike. It refuses every exclusion and keeps every model admitted today with its admission. |
| `PTSM-MERGE-01` | A token arriving on any incoming flow of an admitted pass-through Task passes it once and publishes one fresh instantaneous occurrence, whether or not tokens arrived or will arrive on its other incoming flows. |
| `PTSM-SPLIT-01` | One activation of an admitted pass-through Task with k outgoing flows consumes its token, puts one token on each outgoing flow and publishes one instantaneous occurrence. |
| `PTSM-PROFILE-01` | Every other profile refuses a pass-through Task with several incoming or outgoing flows. |

## Newly reachable waits and resumption

None of a new kind. The waits are the User Task, effect and join waits of the admitted accounts. A merging Task runs in the closure of the command that ended its branch's wait. A splitting Task runs in the closure that reached it and arms its branches' waits there, as a Parallel fork does.

## Separating witnesses

Both models carry a source overlay and a mapped Service Task, as the profile's serial rule requires.

- **Claim archiving** (implicit merge, re-entry route):
  - Start binds `claim`; mapped Service Task *Assess claim*, input `claim`, output `decision` → Choice *Claim approved?*: `stringEquals(decision,"approve")` → User Task *Approve payout*; default → User Task *Write rejection letter*.
  - Both paths flow into Manual Task *Archive claim file* → End.
  - Two journeys, approve and reject: each passes *Archive claim file* once, publishes one occurrence of it and completes the Process (`PTSM-MERGE-01`). A join-waiting merge would leave the Process running (wrong algorithm 3).
- **Equipment dispatch** (implicit split, concurrent route):
  - Start binds `order`; mapped Service Task *Reserve equipment*, input `order`, output `reservation` → Manual Task *Print dispatch note* with two outgoing flows → User Task *Pack equipment* and User Task *Book courier* → converging Parallel Gateway → End.
  - The reservation result runs one closure: *Print dispatch note* publishes one occurrence, and both User Tasks are armed (`PTSM-SPLIT-01`). Two journeys, one per completion order of the two User Tasks; the Process completes at the join.
  - A choice reading arms one User Task, and k activations publish two occurrences (wrong algorithm 4).
- **Refused edits**, each asserted at the checked and Program levels separately (wrong algorithms 1 and 5):
  - *Archive claim file* given a second outgoing flow, so it both merges and splits;
  - one dispatch-note flow given a condition;
  - the dispatch branches reconverging at a Manual Task instead of the Parallel Gateway (merge under a fork).
- **Profile control:** each model relabelled to the embedded completion and exact-shape profiles is refused per level and at profile admission, while its single-flow twin's admission is unchanged (wrong algorithm 2).
- **Lowering:** in both languages *Archive claim file* lowers to a two-input `mergeExclusive` and *Print dispatch note* to a two-output `duplicate`, each with the Task as origin.

## Rule-to-evidence matrix

| Rule | Positive and negative witness | Lanes | Killing mutation |
|---|---|---|---|
| `PTSM-ADMIT-01` | Both models admitted at both levels; the three refused edits per level | Source, core, Lean conformance checks, pipeline | Widen at one level only (1), or project the splitting Task as a pass vertex (5) |
| `PTSM-MERGE-01` | Both claim journeys | Core, pipeline across Lean, core and Temporal; CIB probe | A merge that waits for all inputs (3), killed by a seeded pipeline mutation |
| `PTSM-SPLIT-01` | Both dispatch orders | Core, pipeline across Lean, core and Temporal; CIB probe | Arm one branch only (4), killed by a seeded pipeline mutation |
| `PTSM-PROFILE-01` | Both models under the other profiles | Core and Lean conformance checks | Widen for every profile (2) |

## Lean assurance lane

Lane shape: checked

Evidence: the family adds no runtime transition family and no law. It widens lowering and admission, whose agreement with TypeScript the conformance checks and definition binding test on the witnesses. The runtime steps are those of `mergeExclusive` and `duplicate`, and the existing batch and preservation laws over them are origin-agnostic. Admission checks join a new `PassThroughImplicitSplitMergeConformance` module in the `BpmnConformance` root, beside the [pass-through branch conformance module](../../BpmnSemantics/PassThroughParallelBranchesConformance.lean).

## Temporal hosting and refinement preflight

No new hosting mechanism. Ingress is the existing Start, effect result and User Task completion. The waits are User Tasks, effects and the join. No timer, cancellation or lifecycle transition is introduced. The relation preserved stays equality of hosted committed state and publications with the core's, and delivery, ordering, deduplication, retry and replay risks are those of the admitted Merge and fork. The smallest witness is the hosted pipeline over both models' journeys at family closure.

## Evidence and acceptance

The models run as answer-free scenarios with registered pipeline cases, each with a seeded mutation, plus value-domain matrix rows, corpus rows and the About disclosure. The CIB lane extends the [pass-through Task probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenPassThroughTaskProbeTest.java) with both journeys, and calibrates:

- one ended `manualTask` activity instance of *Archive claim file* per journey, with no task or job;
- one ended instance of *Print dispatch note*, after which both User Tasks are open in the same command;
- the Process ending with the last User Task.

Then `PC-HUM-05` closes, and `PC-CF-07` is evidenced for pass-through Tasks only.

## Versioning consequences

No wire, schema or Program shape change, so the [pre-release wire policy](../../contracts/README.md#evolution-policy) has nothing to migrate. No admitted model changes its Program, route or behavior: every admitted Task has one incoming and one outgoing flow and keeps its lowering. Previously refused models of this profile become admitted.

### Owners this implementation grows

No kernel type, hub interface or guard bound changes.

- Lean: [`Lowering`](../../BpmnSemantics/SemanticProcess/Lowering.lean) (the pass-through arm, a body edit), [`CheckedProcessAdmission`](../../BpmnSemantics/SemanticProcess/CheckedProcessAdmission.lean) (the `nonOperationalTask` arity), [`NestedScopeControlAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeControlAdmission.lean) (the checked projection and `checkedRouted`), [`ScopeReentryAdmission`](../../BpmnSemantics/SemanticProcess/ScopeReentryAdmission.lean) (the re-entry projection), and the new conformance module. Each edit is a body edit of an existing closed-world or family function. The family names its rebuild set from `node scripts/what-binds.ts` and the `lean-fanout` model before the first Lean edit, and stays within every fan-out bound.
- TypeScript: the [lowering](../../packages/bpmn-source/src/semantic-process-lowering.ts), the [checked graph admission](../../packages/bpmn-source/src/checked-process-graph-admission.ts), the [nested scope-control admission](../../packages/semantic-core/src/nested-scope-control-admission.ts), the [nested scope-data admission](../../packages/semantic-core/src/nested-scope-data-admission.ts) and the [structured routing](../../packages/semantic-core/src/structured-scope-data-routing.ts).
- Source: none. The source reader already projects every flow.

Guards the implementation must satisfy, with bounds unchanged: [`lean-fanout`](../../scripts/lean-fanout.test.ts), [`lean-module-cost`](../../scripts/lean-module-cost.test.ts), [`source-hygiene`](../../scripts/source-hygiene.test.ts) and the [Start capacity envelope test](../../packages/temporal-adapter/protocol/test/start-capacity-envelope.test.ts).

Owner passages amended at closure:

- the excluded forms of the [pass-through Task](PASS-THROUGH-TASK-SPEC.md#required-optional-and-excluded-scope) and [pass-through branch](PASS-THROUGH-PARALLEL-BRANCHES-SPEC.md#required-optional-and-excluded-scope) specifications;
- the `CIB-EXT-0022` boundary;
- the profile artifact and README;
- the evidence cells of `PC-HUM-05` and `PC-CF-07`.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
