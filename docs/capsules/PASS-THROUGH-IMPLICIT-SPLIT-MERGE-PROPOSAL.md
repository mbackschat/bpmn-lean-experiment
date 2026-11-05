# Pass-through implicit split and merge proposal

## Status

Lifecycle: draft
Review: approved

## Question and delivery boundary

Can the nested scope-data profile admit a pass-through node, an Abstract or Manual Task or a None Intermediate Throw Event, with several incoming Sequence Flows (implicit merge) or several unconditioned outgoing Sequence Flows (implicit split)? Each arriving token would pass the node once without waiting for the others, and one activation would put a token on every outgoing flow. The question is whether this works with no kernel change, while every model, command and observation the profile admits today keeps its meaning and every other profile keeps its single-flow pass-through nodes.

This is the next family of batch 4 in [PLAN](../PLAN.md#scheduled-delivery-batches). Its mechanism is the pass-through node's own operation taking several inputs or several outputs. A pass-through Task or None Throw already lowers to a one-input `mergeExclusive` with the node as origin ([`PTT-PASS-01`](PASS-THROUGH-TASK-SPEC.md#stable-rules), [`NIT-PASS-01`](NONE-INTERMEDIATE-THROW-SPEC.md#stable-rules)). With k incoming flows it becomes a k-input `mergeExclusive`. With k outgoing flows it becomes a `duplicate` with the node as origin. Neither needs a control place without a Sequence Flow behind it. That was the defect on which the [implicit fan-in review](IMPLICIT-FAN-IN-PROPOSAL.md#independent-cold-review-receipt) rejected the general entry merge. It serves these clauses of the [coverage checklist](../PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list):

- `PC-HUM-05`, primary:
  - "both implicit split and merge cases retain the prescribed tokens and exact occurrence": accepted for the implicit split;
  - for the implicit merge: accepted for arrivals that the admitted graph orders one after another.
  - The row stays open on the merge of concurrent arrivals, a merge under a fork. That is the residual `PC-CF-07` shares, and it needs the concurrent account to admit a merge region.
- `PC-BASIC-01`, the several-flow None Throw forms that the [None Throw specification](NONE-INTERMEDIATE-THROW-SPEC.md#question-and-delivery-boundary) left open, with the same boundary. The row stays open on its multiple outgoing Start flows, concurrent None Ends and root-versus-child completion clauses.
- `PC-CF-07`, evidenced for pass-through nodes in the root and Sub-Process graphs of this profile. The family consumes that part of its contract, which this account reviews.

No row closes. `PC-CF-07` stays open on every other Activity kind, on concurrent arrivals and on its called and Multi-Instance body clauses.

Screened out, each with its reason:

- Implicit split and merge at:
  - every other Activity kind (`PC-CF-07`'s remaining clauses);
  - Start Events (`PC-BASIC-01`);
  - Link targets (`PC-BASIC-02`).

  The Activity's own operation consumes one input place and produces one output place, so fan-in or fan-out there needs the kernel extension the implicit fan-in review named: a typed entry place, or multi-input and multi-output target operations. Control-place origins are read at about 500 Lean sites, so that is a family of its own.
- A node with both several incoming and several outgoing flows. It needs a merge and a split with one origin, which is a new operation shape: two operations per origin, or a typed place. The general Activity family settles that.
- A conditional or default outgoing flow: that is an inclusive split (Clause 13.3.1), a different mechanism.

Selection, 2026-11-05, re-decided after the design review kept `PC-HUM-05` open:

- **Reach** is the case for the general Activity family. In the pinned CIB Seven test resources at `5a45b47`, this account's count of 2,227 deduplicated BPMN models finds 21 with Activity fan-in and 14 with Activity fan-out. Against that, it finds no pass-through fan-in and one pass-through fan-out (which uses a default flow), and no several-flow None Throw. The design review's independent count is 2,225, 21 and 13. The two counts differ only in deduplication, and the difference does not change the selection.
- **Cost and semantic risk** decide for this family:
  - it needs no kernel change;
  - it accepts three clauses;
  - it builds, at their lowest-risk instance, the several-flow checked projections the general family must also make: region walk, shape gate, Call placement, re-entry joint and routing.

## Normative basis and CIB classification

**BPMN.** Clause 13.3.1 (reading copy lines 12286-12294) covers an Activity:
- An Activity that is the target of several Sequence Flows "participates in uncontrolled flow". For each arriving token it is "enabled independently of the arrival of tokens on other incoming Sequence Flows", and the incoming flows behave "as an exclusive gateway".
- With several outgoing flows, "all of them will receive a token when the Activity transitions to the Completed state", which "behaves as a parallel split"; conditioned flows behave as an inclusive split.
- The Activity notes of Clause 10.3 (lines 4614-4618) agree: a further token creates "a separate instance of the Activity", and each outgoing flow creates "a separate parallel path".

Clause 10.5.4 (lines 7724-7734) states the same for an Intermediate Event:
- a further token creates "a separate instance of the Event";
- several outgoing flows each receive a token, a fork in the sense of the glossary (line 14408): "multiple outgoing Sequence Flows from Activities or Events".

Clause 13.3.3 completes an Abstract Task on activation and has a Manual Task's work done outside the engine. A None Throw has no trigger (Clause 10.5.4). That is why all three are pass-through nodes here.

**CIB Seven.** At pinned `5a45b47`, a transition enters its destination without consulting the destination's other incoming transitions (`pvm/runtime/operation/AbstractPvmAtomicOperationTransitionNotifyListenerTake.java:34-51`). Under `bpmn/behavior/`, only the Parallel and Inclusive Gateway behaviors and Parallel Multi-Instance collect joining executions.

A `task`, a `manualTask` (`TaskActivityBehavior`, `ManualTaskActivityBehavior`) and a None Throw (`IntermediateThrowNoneEventActivityBehavior`, through `FlowNodeActivityBehavior.leave`) all leave through `BpmnActivityBehavior.performOutgoingBehavior` (`bpmn/behavior/BpmnActivityBehavior.java:81-130`):
- it takes every unconditioned non-default transition;
- with several, it leaves through `leaveActivityViaTransitions`;
- `PvmAtomicOperationTransitionDestroyScope` (`pvm/runtime/operation/PvmAtomicOperationTransitionDestroyScope.java:82-135`) then reuses the leaving execution for the first transition and creates one concurrent execution per further transition.

So each arrival is one activity instance, and one activation starts every outgoing path.

**Classification.** One new agreement entry in the [register](../CIB-BPMN-RELATION-REGISTER.md): uncontrolled flow at a pass-through node, with per-token activation and a parallel split on unconditioned flows. It is normative agreement with Clauses 13.3.1 and 10.5.4, and it is added with its verifier coverage. A separate entry is chosen, rather than widening only [`CIB-EXT-0022`](../CIB-BPMN-RELATION-REGISTER.md#cib-ext-0022--abstract-and-manual-tasks-as-immediate-pass-through) and [`CIB-AGR-0016`](../CIB-BPMN-RELATION-REGISTER.md#cib-agr-0016--a-none-intermediate-throw-event-passes-its-token-on-at-once-and-records-one-activity-instance), because the relationship is the standard's flow rule, not either node's pass-through extension. It also spans both node kinds, and the general Activity family will reuse it. The boundaries of those two entries widen to the forms admitted below.

## Required, optional and excluded scope

Required: every model the profile admits today, unchanged. In addition, under this profile only, for a pass-through Task or None Throw:

- **Implicit merge:** two or more incoming flows and one unconditioned, non-default outgoing flow, in the root graph of the [re-entry account](SCOPE-REENTRY-SPEC.md#admission). That is exactly where a converging Exclusive Gateway of the same arity is admitted, so the admitted graph orders every arrival after the previous one.
- **Implicit split:** one incoming flow and two or more unconditioned, non-default outgoing flows, wherever a diverging Parallel Gateway of the same arity is admitted on the concurrent route: in the root of a forking model, in a Sub-Process body, and on a branch of an [Inclusive region](INCLUSIVE-GATEWAY-REGIONS-SPEC.md#admission). Its branches follow the branch rules of a Parallel fork:
  - a paired converging Parallel Gateway (`PTPB-WORK-01`);
  - terminal branches ([terminal forks](TERMINAL-FORKS-SPEC.md#admission));
  - beside scope-local data, [data-declaring terminal branches](DATA-DECLARING-TERMINAL-BRANCHES-SPEC.md#admission).

Optional: several such nodes in one model, and an implicit split nested on a branch of another fork or region, within the closure limit of eight.

Excluded, each refused at admission:

- a node with both several incoming and several outgoing flows;
- a conditioned or default outgoing flow from a pass-through node (an inclusive split);
- an implicit merge under a fork or region, where two concurrent arrivals would need a merge region that the concurrent account refuses;
- an implicit merge in a Sub-Process body or the called Process, whose bodies hold no Choice;
- a pass-through node in a called Process, as today;
- a root Call beside a root splitting node, as beside a root Parallel fork (`RPF-ADMIT-01`);
- an Inclusive region on more than one branch of a splitting node, as of a Parallel fork (the profile exclusion `inclusive-regions-on-sibling-branches-of-one-fork`);
- every other Activity kind, Start Event and Link target with several flows;
- every form under any other profile.

These bound admission only. A later merge under forks broadens the class with the same k-input lowering, and reinterprets no admitted model. The general Activity family widens the same projections to other node kinds. A node that both merges and splits needs the new operation shape named above, and no model admitted here has one.

## Profile and public contract

The profile `cibseven-2.2.0-nested-embedded-scope-data-draft` grows in place under the [cumulative profile rule](../../contracts/README.md).

In the [profile artifact](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json):
- the exclusion `implicit-task-split-merge` becomes `implicit-activity-split-merge-outside-pass-through-tasks`;
- the exclusion `none-intermediate-throw-events-with-several-flows-async-continuations-or-listeners-or-in-called-processes` loses its several-flow clause, except a None Throw that both merges and splits;
- the artifact names the new agreement entry.

The [profile README](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/README.md) states the class.

No wire, schema or Program shape changes. A node-origin `duplicate` and a k-input `mergeExclusive` are existing operation shapes. Observation adds nothing. Each activation publishes the node's one instantaneous occurrence, which records process, element and owner and no operation kind, so the source kind stays in the checked graph (`PTT-KIND-01`).

## Representation and runtime ownership

No new opcode, operation family, Program field, checked node kind, control place or transition family.

Lowering of a pass-through node (`PTT-PASS-01`, `NIT-PASS-01`):

- one incoming and one outgoing flow: the one-input `mergeExclusive`, as today;
- k ≥ 2 incoming flows and one outgoing flow: a k-input `mergeExclusive` with the node as origin. It consumes each incoming flow's own place, in canonical order, as an Exclusive merge's inputs (`lowerExclusiveMergeInputs` in Lean).
- one incoming flow and k ≥ 2 outgoing flows: a `duplicate` with the node as origin. It produces each outgoing flow's own place, in canonical order, as a Parallel fork's outputs.

The Lean twins are in [`Lowering`](../../BpmnSemantics/SemanticProcess/Lowering.lean). Today its pass-through arm takes `firstPlace` of the incoming and outgoing places, which silently drops every other place, so both arms take the whole list. The TypeScript twin is the [lowering](../../packages/bpmn-source/src/semantic-process-lowering.ts), whose pass-through arm stops requiring one incoming and one outgoing flow. Both languages change together, and definition binding (lowering equality) keeps them agreeing.

Every control place keeps its Sequence Flow origin, and every place keeps one producer and one consumer, so the census of [`GraphValidation`](../../BpmnSemantics/SemanticProcess/GraphValidation.lean) holds. The node owns exactly one operation, so the Program envelope's one-operation-per-origin test holds unrelaxed.

Runtime is unchanged:

- A k-input `mergeExclusive` fires once per token on any input, as the re-entry account's explicit Merges do. One arrival gives one occurrence, and a second arrival a fresh one (`PTT-FRESH-01`).
- A node-origin `duplicate` fires once: it consumes its input and puts one token on each output, as a Parallel fork does.
- The occurrence lifecycle already gives `duplicate` and `mergeExclusive` the same instantaneous occurrence of their origin, in [`flow-node-occurrence-lifecycle.ts`](../../packages/semantic-core/src/flow-node-occurrence-lifecycle.ts) and in Lean's `FlowNodeOccurrenceLifecycle`.

No pair law is new:
- A node-origin `duplicate` is local control in the commutation census, like a Parallel fork, so the existing local-control laws cover it in a batch.
- A k-input `mergeExclusive` is a Merge input. It is covered beside a declared entry by `prepared_declared_entry_merge_pair` (`PTPB-COMMUTE-01`).

## Admission

Admission stays [profile-parameterized](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md). Every checked-level analysis must classify a pass-through node the way the Program-level analysis already classifies its lowered operation:
- a node with k ≥ 2 outgoing flows is a fork, because the Program sees a `duplicate`;
- a node with k ≥ 2 incoming flows is a Merge, because the Program sees a k-input `mergeExclusive`, which `SRE-ROUTE-01` and the re-entry analysis already read as a Merge.

That rule makes the levels agree by construction. So no Program-level classifier changes, and the forward-compatibility note of the [pass-through Task specification](PASS-THROUGH-TASK-SPEC.md#admission), which foresaw replacing the Program-level classifier, is amended to this resolution.

Each language gets one shared checked predicate, "this checked node forks" (a diverging Parallel or Inclusive Gateway, or a pass-through node with k ≥ 2 outgoing flows), and one shared "this checked node merges" predicate. Each predicate reads the node and its flows. Every locus below consumes the shared predicates instead of matching node kinds. Each widens for this profile only and keeps refusing every exclusion.

- **Checked arity.** The incoming and outgoing arity of `nonOperationalTask` and `noneIntermediateThrowEvent` widens to the two forms above:
  - Lean: [`CheckedProcessAdmission`](../../BpmnSemantics/SemanticProcess/CheckedProcessAdmission.lean);
  - TypeScript: the source [checked graph admission](../../packages/bpmn-source/src/checked-process-graph-admission.ts).

  Both forms at once, and a conditioned or default outgoing flow, stay refused.
- **Checked shape gate (TypeScript).** [`isAdmittedCheckedProcess`](../../packages/bpmn-source/src/checked-process-admission.ts) reaches `profileAllowsCheckedProcessShape` in [the profile module](../../packages/semantic-core/src/semantic-process-profile.ts), and that reaches `structuredScopeDataCheckedShape` and `forks` in [structured scope-data routing](../../packages/semantic-core/src/structured-scope-data-routing.ts). `forks` judges by node kind today, so it takes the flows and consumes the shared predicate.
- **Routing.** The structured route test counts a splitting node as forking: `forks` in TypeScript, and in Lean `checkedRouted` in [`NestedScopeControlAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeControlAdmission.lean). Without that, a model whose only fork is such a node would take the serial route.
- **Call placement.** Lean `checkedRestrictionsHold` in `NestedScopeControlAdmission` refuses a root Call beside a root diverging Parallel or Inclusive Gateway (`RPF-ADMIT-01`). It consumes the shared predicate, so it also refuses a root Call beside a root splitting node, as its Program-level twin already does beside the lowered `duplicate`. The TypeScript twin in [nested scope-control admission](../../packages/semantic-core/src/nested-scope-control-admission.ts) changes alike.
- **Concurrent projection.** The concurrent structured analysis projects a splitting node to a fork vertex of k branches instead of a pass vertex: `checkedKind` in nested scope-control admission, and its Lean twin in `NestedScopeControlAdmission`.
- **Inclusive region projection.** The region walk projects a splitting node to a Fork: `checkedVertexKind` in [Inclusive region admission](../../packages/semantic-core/src/inclusive-region-admission.ts), and its Lean twin in [`InclusiveRegionWalk`](../../BpmnSemantics/SemanticProcess/InclusiveRegionWalk.lean). Today both map every pass-through node to `Pass` by kind.
- **Re-entry projection.** The re-entry analysis projects a merging node in the root as a joint (a Merge) instead of a pass vertex, matching the lowered k-input `mergeExclusive`:
  - TypeScript: `scopeReentryChecked` and `scopeReentryCheckedAnalysis` in [scope re-entry admission](../../packages/semantic-core/src/scope-reentry-admission.ts), through the checked vertex model in [nested scope-data admission](../../packages/semantic-core/src/nested-scope-data-admission.ts);
  - Lean: `checkedVertex?`, `checkedJoint`, `checkedJoint?` and `checkedReentry` in [`ScopeReentryAdmission`](../../BpmnSemantics/SemanticProcess/ScopeReentryAdmission.lean).

  `scopeReentryChecked` counts a root merging node as a Merge, as `SRE-ROUTE-01` counts its lowered operation.
- **Unchanged rules.** The closure limit and these rules apply unchanged:
  - branch cuts (`PTPB-WORK-01`, `TFK-ADMIT-01`, `DTB-ADMIT-01`);
  - Call placement in bodies (`PTPB-CALL-01`);
  - region pairing (`IGR-ADMIT-01`).
- **Burst.** A node-origin fork costs one step, where a node followed by a Parallel fork costs two, so no admitted closure grows.

The nearest wrong algorithms, each with a separating witness below:

1. the arity widened at one level only, which refuses the model at the other;
2. the arity widened for every profile;
3. the merge as a join that waits for every incoming flow;
4. the split as a choice that takes one outgoing flow, or as k activations of the node;
5. any checked analysis classifying a several-flow node by its kind while its Program forks or merges. That disagrees with the Program on the route, the shape gate, Call placement, the region walk, the re-entry joints or the burst.

## Stable rules

| Rule | Statement |
|---|---|
| `PTSM-ADMIT-01` | Under this profile, admission accepts exactly the required and optional forms above, at the checked and Program levels alike. It refuses every exclusion and keeps every model admitted today with its admission. Every checked analysis classifies a several-flow pass-through node as its lowered operation is classified. |
| `PTSM-MERGE-01` | In an admitted model, a token arriving on any incoming flow of a merging pass-through node passes it once and publishes one fresh instantaneous occurrence, without waiting for its other incoming flows. |
| `PTSM-SPLIT-01` | One activation of an admitted pass-through node with k outgoing flows consumes its token, puts one token on each outgoing flow and publishes one instantaneous occurrence. |
| `PTSM-PROFILE-01` | Every other profile refuses a pass-through node with several incoming or outgoing flows. |

## Newly reachable waits and resumption

None of a new kind. The waits are the User Task, effect and join waits of the admitted accounts.

- A merging node runs in the closure of the command that ended its branch's wait.
- A splitting node runs in the closure that reached it and arms its branches' waits there, as a Parallel fork does.

## Separating witnesses

Both models carry a source overlay and a mapped Service Task, as the profile's serial rule requires.

- **Claim archiving** (implicit merge, re-entry route):
  - Start binds `claim`. The mapped Service Task *Assess claim* takes input `claim` and produces output `decision`.
  - It flows to the Choice *Claim approved?*:
    - `stringEquals(decision,"approve")` → User Task *Approve payout*;
    - default → User Task *Write rejection letter*.
  - Both paths flow into Manual Task *Archive claim file* → End.
  - Two journeys, approve and reject. Each passes *Archive claim file* once, publishes one occurrence of it and completes the Process (`PTSM-MERGE-01`). A join-waiting merge would leave the Process running (wrong algorithm 3).
- **Equipment dispatch** (implicit split, concurrent route):
  - Start binds `order`. The mapped Service Task *Reserve equipment* takes input `order` and produces output `reservation`.
  - It flows to Manual Task *Print dispatch note*, with two outgoing flows → User Task *Pack equipment* and User Task *Book courier* → converging Parallel Gateway → End.
  - The reservation result runs one closure: *Print dispatch note* publishes one occurrence, and both User Tasks are armed (`PTSM-SPLIT-01`). Two journeys, one per completion order of the two User Tasks; the Process completes at the join.
  - A choice reading arms one User Task, and k activations publish two occurrences (wrong algorithm 4).
- **Notation twins:** each model with its Manual Task swapped to an Abstract Task, and to a None Throw. Each twin is admitted at both levels and lowers to the same operation with the twin's origin, so each of the three node kinds is witnessed.
- **Projection witness**, admitted at both levels with its region analysis agreeing across levels (wrong algorithm 5): a splitting Task on a branch of an Inclusive region, before the region's join.
- **Refused edits**, each asserted at the checked and Program levels separately (wrong algorithms 1 and 5):
  - *Archive claim file* given a second outgoing flow, so it both merges and splits;
  - one dispatch-note flow given a condition;
  - the dispatch branches reconverging at a Manual Task instead of the Parallel Gateway (a merge under a fork);
  - a root Call Activity beside *Print dispatch note* in a root forking model (`RPF-ADMIT-01`);
  - a root splitting Task with an Inclusive region on each branch, refused as beside a Parallel fork by the rule that at most one branch of a fork holds a region.
- **Profile control:** each model relabelled to the embedded completion and exact-shape profiles is refused per level and at profile admission, while its single-flow twin's admission is unchanged (wrong algorithm 2).
- **Lowering:** in both languages *Archive claim file* lowers to a two-input `mergeExclusive` and *Print dispatch note* to a two-output `duplicate`, each with the node as origin and its places in canonical order.

## Oracles this family changes

Each oracle below asserts a refusal that this family turns into admission. None is deleted. Each refused edit keeps refusing under every other profile, and under this profile it either becomes a positive witness or is retargeted to a form that stays excluded, so that it still kills its mutation. Which of the two applies is settled by the witness, never by preference.

- [`pass-through-task-source.test.ts`](../../packages/bpmn-source/test/pass-through-task-source.test.ts) "two outgoing flows" and "two incoming flows" edits of the document intake. The second-incoming edit is a root re-entry implicit merge, which this family admits. The second-outgoing edit makes the model both fork and choose, and the re-entry route refuses a forking model, so it stays refused, now killing a re-entry route that ignores a splitting node.
- [`PassThroughTaskConformance`](../../BpmnSemantics/PassThroughTaskConformance.lean): `second_outgoing_flow_is_refused` and `second_incoming_flow_is_refused` over the `intakeWith` variants.
- [`pass-through-parallel-branches-source.test.ts`](../../packages/bpmn-source/test/pass-through-parallel-branches-source.test.ts): "a pass-through Task with a second outgoing flow on a branch is refused".
- The `PTT-ADMIT-01` row of the [pass-through Task evidence matrix](PASS-THROUGH-TASK-SPEC.md#rule-to-evidence-matrix), whose killing mutation names a two-outgoing Task.
- [`NoneIntermediateThrowConformance`](../../BpmnSemantics/NoneIntermediateThrowConformance.lean): the "both several-flow forms" check.

## Rule-to-evidence matrix

| Rule | Positive and negative witness | Lanes | Killing mutation |
|---|---|---|---|
| `PTSM-ADMIT-01` | Both models, their notation twins and the projection witness admitted at both levels; the five refused edits per level | Source, core, Lean conformance checks, pipeline | Widen at one level only (1), or classify a several-flow node by its kind in any checked analysis (5) |
| `PTSM-MERGE-01` | Both claim journeys | Core, pipeline across Lean, core and Temporal; CIB probe | A merge that waits for all inputs (3), killed by a seeded pipeline mutation |
| `PTSM-SPLIT-01` | Both dispatch orders | Core, pipeline across Lean, core and Temporal; CIB probe | Arm one branch only (4), killed by a seeded pipeline mutation |
| `PTSM-PROFILE-01` | Both models and their twins under the other profiles | Core and Lean conformance checks | Widen for every profile (2) |

## Lean assurance lane

Lane shape: checked

Evidence: the family adds no runtime transition family and no law. It widens lowering and admission. Their agreement with TypeScript is tested on the witnesses by the conformance checks and by definition binding. The runtime steps are those of `mergeExclusive` and `duplicate`, and the existing batch and preservation laws over them are origin-agnostic. Admission checks join a new `PassThroughImplicitSplitMergeConformance` module in the `BpmnConformance` root, beside the [pass-through branch conformance module](../../BpmnSemantics/PassThroughParallelBranchesConformance.lean).

## Temporal hosting and refinement preflight

No new hosting mechanism:
- Ingress is the existing Start, effect result and User Task completion.
- The waits are User Tasks, effects and the join.
- No timer, cancellation or lifecycle transition is introduced.
- The relation preserved stays equality of hosted committed state and publications with the core's.
- Delivery, ordering, deduplication, retry and replay risks are those of the admitted Merge and fork.

The smallest witness is the hosted pipeline over both models' journeys at family closure.

## Evidence and acceptance

The models run as answer-free scenarios with registered pipeline cases, each with a seeded mutation, plus value-domain matrix rows, corpus rows and the About disclosure.

The CIB lane extends the [pass-through Task probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenPassThroughTaskProbeTest.java) with both journeys and the None Throw twins, and calibrates:

- one ended `manualTask` activity instance of *Archive claim file* per journey, with no task or job;
- one ended instance of *Print dispatch note*, after which both User Tasks are open in the same command;
- one ended `intermediateNoneThrowEvent` instance per None Throw twin activation;
- the Process ending with the last User Task.

Then the clauses of the [delivery boundary](#question-and-delivery-boundary) are accepted. `PC-HUM-05` and `PC-BASIC-01` stay open on the residuals named there, and `PC-CF-07` is evidenced for pass-through nodes only.

## Versioning consequences

No wire, schema or Program shape change, so the [pre-release wire policy](../../contracts/README.md#evolution-policy) has nothing to migrate. No admitted model changes its Program, route or behavior: every admitted pass-through node has one incoming and one outgoing flow, keeps its lowering, and is classified as before by every widened projection. Previously refused models of this profile become admitted.

### Owners this implementation grows

No kernel type, hub interface or guard bound changes.

Lean, each edit a body edit of an existing closed-world or family function:
- [`Lowering`](../../BpmnSemantics/SemanticProcess/Lowering.lean): the pass-through arms;
- [`CheckedProcessAdmission`](../../BpmnSemantics/SemanticProcess/CheckedProcessAdmission.lean): the arity;
- [`NestedScopeControlAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeControlAdmission.lean): the checked projection, `checkedRouted` and `checkedRestrictionsHold`;
- [`InclusiveRegionWalk`](../../BpmnSemantics/SemanticProcess/InclusiveRegionWalk.lean): the region projection;
- [`ScopeReentryAdmission`](../../BpmnSemantics/SemanticProcess/ScopeReentryAdmission.lean): the re-entry projection;
- the new conformance module.

The shared predicates live in the lowest of these modules that the others already import. The family names its rebuild set from `node scripts/what-binds.ts` and the `lean-fanout` model before the first Lean edit, and stays within every fan-out bound.

TypeScript:
- the [lowering](../../packages/bpmn-source/src/semantic-process-lowering.ts);
- the [checked graph admission](../../packages/bpmn-source/src/checked-process-graph-admission.ts);
- the [checked shape gate](../../packages/bpmn-source/src/checked-process-admission.ts);
- the [profile shape](../../packages/semantic-core/src/semantic-process-profile.ts);
- the [structured routing](../../packages/semantic-core/src/structured-scope-data-routing.ts);
- the [nested scope-control admission](../../packages/semantic-core/src/nested-scope-control-admission.ts);
- the [nested scope-data admission](../../packages/semantic-core/src/nested-scope-data-admission.ts);
- the [scope re-entry admission](../../packages/semantic-core/src/scope-reentry-admission.ts);
- the [Inclusive region admission](../../packages/semantic-core/src/inclusive-region-admission.ts).

Source: none. The source reader already projects every flow.

Headroom, measured at `ffeec083` in nonblank lines against the 800 target:

| File | Nonblank lines |
|---|---|
| `NestedScopeControlAdmission.lean` | 782 |
| `nested-scope-control-admission.ts` | 776 |
| `Lowering.lean` | 769 |
| `checked-process-admission.ts` | 755 |
| every other owner | 614 or fewer |

The projections therefore consume the shared predicates instead of adding arms. A growth past 800 means an extraction, never an exception.

Guards the implementation must satisfy, with bounds unchanged: [`lean-fanout`](../../scripts/lean-fanout.test.ts), [`lean-module-cost`](../../scripts/lean-module-cost.test.ts), [`source-hygiene`](../../scripts/source-hygiene.test.ts) and the [Start capacity envelope test](../../packages/temporal-adapter/protocol/test/start-capacity-envelope.test.ts).

Owner passages amended at closure:

- the excluded forms and the [admission forward-compatibility note](PASS-THROUGH-TASK-SPEC.md#admission) of the [pass-through Task specification](PASS-THROUGH-TASK-SPEC.md#required-optional-and-excluded-scope), and its `PTT-ADMIT-01` evidence row;
- the excluded forms of the [pass-through branch specification](PASS-THROUGH-PARALLEL-BRANCHES-SPEC.md#required-optional-and-excluded-scope);
- the several-flow exclusion of the [None Throw specification](NONE-INTERMEDIATE-THROW-SPEC.md#required-optional-and-excluded-scope);
- the `CIB-EXT-0022` and `CIB-AGR-0016` boundaries and the new agreement entry;
- the profile artifact and README;
- the evidence cells of `PC-HUM-05`, `PC-BASIC-01` and `PC-CF-07`;
- the `BPMN-MECH-FLOW-01` evidence cell of the [requirement ledger](../BPMN-REQUIREMENT-LEDGER.md).

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `ffeec083` | `fork-turns-none` | `approve-with-required-edits` | `63409a05, 7d900d26` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
