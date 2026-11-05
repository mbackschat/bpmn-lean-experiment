# Activity implicit split and merge proposal

## Status

Lifecycle: draft
Review: pending

## Question and delivery boundary

Can the nested scope-data profile admit a User Task, Service Task, embedded Sub-Process or Call Activity with several incoming Sequence Flows (implicit merge), and those Activities and the None Start Event with several unconditioned outgoing Sequence Flows (implicit split)? Each arriving token would start its own occurrence without waiting for the others and with no step for the merge, and one completion would put a token on every outgoing flow with no step for the split. Every model, command and observation the profile admits today must keep its meaning, and every other profile its single-flow Activities.

This is the next family of batch 4 in [PLAN](../PLAN.md#scheduled-delivery-batches). Its mechanism is a kernel extension: the Activity's own operation consumes any one of several input places and produces every one of several output places. The [implicit fan-in review](IMPLICIT-FAN-IN-PROPOSAL.md#independent-cold-review-receipt) rejected the alternative, an entry merge feeding the Activity through a control place with no Sequence Flow behind it, and named this one. The [pass-through implicit split and merge specification](PASS-THROUGH-IMPLICIT-SPLIT-MERGE-SPEC.md) built the several-flow checked projections at the node whose own operation already merges or duplicates; this family generalizes them to every Activity the profile admits. It serves the open rows of the [coverage checklist](../PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) that share the mechanism:

- `PC-CF-07`, primary: one arriving token activates one occurrence of a User Task, Service Task, Sub-Process or Call rather than synchronizing its incoming flows, and completion takes every unconditioned outgoing flow; "two arrivals and two outputs separate accidental join, deduplication and exclusive choice". Accepted for arrivals the admitted graph orders one after another and for unconditioned outgoing flows in the root and Sub-Process graphs. The row stays open on concurrent arrivals, conditional and default outgoing flows and called and Multi-Instance bodies.
- `PC-BASIC-01`, its last open clause: multiple outgoing None Start flows. The row closes.

Screened out, each with its reason:

- Concurrent arrivals at one Activity (`PC-CF-07`, `PC-HUM-05`'s last clause, and the only CIB witness of `PC-BASIC-02`'s multiple Link sources, whose arrivals come from a Parallel fork into a Receive Task): two arrivals racing for occurrence numbers are an observable choice the profile's envelope refuses (`rejectObservableChoice`, [`NestedScopeDataAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeDataAdmission.lean)), and the concurrent account admits no merge region. That is the residual the pass-through family left, and one later account serves all three rows.
- Conditional and default outgoing flows of an Activity: CIB evaluates them per completion (`BpmnActivityBehavior#performOutgoingBehavior`), an inclusive split. This representation leaves room for them as a separate field.
- Every other Activity kind (Receive, Send, Script, Rule, Multi-Instance, data-input User Tasks, bounded and monitored User Tasks, catch Events): no admitted model of this profile reaches them with several flows; their constructors change when a profile needs them.
- A node with several incoming and several outgoing flows: a merge needs the re-entry route and a split forks, which the re-entry route refuses, so no placement admits both.

Selection, 2026-11-05: a close call. Every remaining batch-4 control clause needs this kernel extension, Script and Business Rule Tasks wait on a runtime dependency decision, and the cross-gateway matrix (`PC-CF-08`) depends on `PC-CF-07`. Reach, counted 2026-11-05 over the 1,864 deduplicated parsed BPMN files under `engine/src/test/resources` of the pinned CIB Seven checkout at `5a45b47`: 17 hold an Activity other than an Abstract or Manual Task with two or more incoming flows (15 at a User or Service Task), 11 one with two or more unconditioned outgoing flows (9), and 7 a None Start with two or more outgoing flows. The cost is the largest of the batch: a kernel interface edit.

## Normative basis and CIB classification

**BPMN.** Clause 13.3.1 (reading copy line 12286): an Activity that is the target of several Sequence Flows "participates in uncontrolled flow", enabled for each arriving token "independently of the arrival of tokens on other incoming Sequence Flows", and if it has several outgoing Sequence Flows "all of them will receive a _token_ when the **Activity** transitions to the _Completed_ state", which "behaves as a parallel split" (line 12294), while conditioned ones behave as an inclusive split. The Activity note of Clause 10.3 (line 4614) adds that a further token creates "a separate instance of the Activity". Clause 10.5.1 (line 7328) generates "a _token_ … for each _outgoing_ **Sequence Flow**" of a triggered Start Event, and Clause 13.2 (line 12268) restates it for every Start Event that occurs.

**CIB Seven** at `5a45b47`:

- A transition enters its destination without consulting the destination's other incoming transitions (`pvm/runtime/operation/AbstractPvmAtomicOperationTransitionNotifyListenerTake.java`); only Parallel, Inclusive and parallel Multi-Instance behaviors collect executions. Each arrival creates its own activity instance and none is created for the merge.
- `BpmnActivityBehavior#performOutgoingBehavior` (lines 82-116) takes every outgoing transition without a condition, and every conditioned one whose condition holds, through one `leaveActivityViaTransitions`; the default is taken only when no other is. No instance is created for the split. The None Start's outgoing transitions are left the same way.

Register change: a new entry `CIB-AGR-0020 — an Activity starts one occurrence per arriving token and its completion takes every unconditioned outgoing flow`, a normative agreement bounded to this profile, added with its verifier coverage. It names `CIB-AGR-0019` as the pass-through instance of the same account.

## Required, optional and excluded scope

Required, for the nested scope-data profile only:

- **Implicit merge:** a User Task, Service Task, Sub-Process or Call Activity with two or more incoming flows, in the root graph of the [re-entry account](SCOPE-REENTRY-SPEC.md#admission), wherever a pass-through merge is admitted ([`PTSM-ADMIT-01`](PASS-THROUGH-IMPLICIT-SPLIT-MERGE-SPEC.md#stable-rules)).
- **Implicit split:** those Activities and the None Start with two or more unconditioned, non-default outgoing flows, wherever a diverging Parallel Gateway of the same arity is admitted on the concurrent route: in the root of a forking model and in a Sub-Process body. Their branches follow the branch rules of a Parallel fork.

Optional: none.

Excluded, each refused at admission:

- concurrent arrivals, a merge under a fork;
- a node that both merges and splits;
- a conditioned or default outgoing flow of an Activity or Start;
- several flows at any other Activity kind, and in called Processes and Multi-Instance bodies;
- every form under any other profile.

These bound admission only. Conditional and default outgoing flows extend the operation with a separate field beside `outputs`, in CIB's partition, without reinterpreting an admitted model; concurrent arrivals reuse the per-input alternative the merge already has.

## Profile and public contract

The profile `cibseven-2.2.0-nested-embedded-scope-data-draft` grows in place under the [cumulative profile rule](../../contracts/README.md). The [profile artifact](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json) gains `CIB-AGR-0020`, and its exclusion `implicit-activity-split-merge-outside-pass-through-tasks` narrows to the excluded forms above. Observation adds nothing: an arrival publishes the Activity's ordinary occurrence, a completion its ordinary completion with one token per outgoing flow.

## Representation and runtime ownership

**Multi-place Activity operations.** The profile-reached constructors of `SemanticOperation` ([`SemanticProcessContract`](../../BpmnSemantics/SemanticProcessContract.lean)) replace their single place by a list:

- `inputs : List ControlPlaceId` on `awaitUserTask`, `awaitEffect`, `enterScope` and `invokeProcess`;
- `outputs : List ControlPlaceId` on `initiate`, `awaitUserTask`, `awaitEffect`, `completeScope` (its parent output) and `returnProcess` (its caller output);
- the wait records `UserTaskWait` and `EffectWait` ([`RuntimeState`](../../BpmnSemantics/SemanticProcess/RuntimeState.lean)) carry the output list, so completion needs no Program lookup.

An arrival is the operation's existing step consuming the token of the one marked input; with every admitted model ordering its arrivals, at most one input is marked. Completion produces a token on every output in the one committed step it already is. The precedent is `initiateMessage` and `initiateTimer`, which already carry output lists ([Message Start](MESSAGE-START-EVENT-SPEC.md#checked-graph-and-lowering): "a nonempty collection of distinct output control places").

Every single-flow Activity keeps its exact behavior with one-element lists. The single-producer and single-consumer rule of [`GraphValidation`](../../BpmnSemantics/SemanticProcess/GraphValidation.lean) keeps holding, because every flow keeps its own place with one producer and one consumer, and one operation per origin keeps holding, so the Program envelope needs no relaxation. Lowering replaces its `firstPlace` of an Activity's incoming and outgoing places by the canonical lists.

Rejected alternatives, each evaluated against the current kernel:

- a typed entry or exit place with a merge or duplicate sharing the Activity's origin: every operation step is published with the tokens it produces (`tokenOrigin` in [`ControlPositionProjection`](../../BpmnSemantics/SemanticProcess/ControlPositionProjection.lean)), so it publishes a step and a token position CIB lacks, adds burst steps, and needs two operations per origin;
- a Program side table of extra ports: still a kernel interface edit, and every enabledness and footprint site would compile unchanged while silently ignoring it;
- per-arrival copies of the Activity's operation, as None End fan-in does: they share an output place, breaking the single-producer census, put several Program vertices on one checked node, and cannot split.

## Admission

Admission stays [profile-parameterized](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md). The checked arity of these Activities and the Start widens under this profile only, never both forms at once, at both levels, in Lean [`CheckedProcessAdmission`](../../BpmnSemantics/SemanticProcess/CheckedProcessAdmission.lean) and the TypeScript [checked graph admission](../../packages/bpmn-source/src/checked-process-graph-admission.ts). The shared predicates of [`CheckedPassThroughFlow`](../../BpmnSemantics/SemanticProcess/CheckedPassThroughFlow.lean) and [`checked-pass-through-flow.ts`](../../packages/semantic-core/src/checked-pass-through-flow.ts) widen from pass-through nodes to every admitted several-flow node and are renamed for that role, so the shape gate, routing, root Call placement, the merge refusal under a fork, the serial vertex model and the concurrent, Inclusive region and re-entry projections classify a splitting Activity or Start as a fork and a merging Activity as a merge, as the Program-level analyses classify its lowered operation.

The Program-level analyses read the lists: a vertex's outputs are its operation's outputs, a splitting operation counts as forking, and a merging operation is a re-entry joint followed by its Activity. The burst is unchanged per step: an arrival and a completion are one step each, as today.

The nearest wrong algorithms, each with a separating witness below:

1. the arity widened at one level only;
2. the arity widened for every profile;
3. a merge that waits for every incoming flow;
4. a split that takes one outgoing flow, the first, or an exclusive choice;
5. a lowering that keeps `firstPlace`, which strands the second arrival or drops the second output;
6. an extra step or token position for the merge or split, which CIB does not publish;
7. a checked analysis classifying a several-flow Activity by its kind while its Program merges or forks.

## Stable rules

| Rule | Statement |
|---|---|
| `AISM-ADMIT-01` | Under the nested scope-data profile, a User Task, Service Task, Sub-Process or Call Activity may have several incoming flows in the root graph of the re-entry account, and those Activities and the None Start several unconditioned outgoing flows wherever a Parallel fork of that arity is admitted; never both, at both levels alike. |
| `AISM-MERGE-01` | Each token arriving on any incoming flow starts one occurrence of the Activity in one step that consumes that flow's token, with no step and no position for the merge. |
| `AISM-SPLIT-01` | The Activity's completion, or the Process start for a None Start, puts one token on every outgoing flow in the one step it already is, with no step and no position for the split. |
| `AISM-ONE-01` | With one incoming and one outgoing flow every operation behaves and publishes exactly as before. |
| `AISM-PROFILE-01` | Every other profile refuses each form it refuses today. |

## Newly reachable waits and resumption

None of a new kind. The User Task and effect waits are the existing ones; a wait record carries its output list, so a completion resumes onto every outgoing flow.

## Separating witnesses

Two new whole models with source overlays:

- **Claim review** (implicit merge, re-entry route): Start binds `claim` → mapped Service Task *Assess claim* (`claim` → `route`) → Choice *Expert needed?*: `stringEquals(route,"expert")` to Service Task *Obtain expert opinion*, default directly to User Task *Review claim*; *Obtain expert opinion* also flows to *Review claim*, which therefore has two incoming flows → End. Journeys: the direct and the expert path, each with exactly one occurrence of *Review claim*. Twins replace *Review claim* by a Service Task, a Sub-Process (body Start → User Task → End) and a Call Activity.
- **Employee onboarding** (implicit split, concurrent route): Start binds `hire` → mapped Service Task *Register hire* (`hire` → `employee`) with two outgoing flows to User Tasks *Prepare workstation* and *Issue badge* → Parallel join → End. Journeys: both completion orders, each opening both User Tasks in the one completion of *Register hire*. Twins: the splitting node as a User Task, a Sub-Process and a Call; and a Start twin whose None Start flows directly to both User Tasks.

Refused edits, each at both levels: a merge and split at one Activity; a conditioned outgoing flow; a default outgoing flow; arrivals from two Parallel branches (merge under a fork); several flows at a Receive Task; each model under the embedded completion profile, with the arity arm checked over every profile flag as [`PTSM-PROFILE-01`](PASS-THROUGH-IMPLICIT-SPLIT-MERGE-SPEC.md#stable-rules) does.

Kernel witnesses: a one-element-list Program of every changed constructor commits the same states and publications as before (wrong algorithm 5's twin, `AISM-ONE-01`); the claim's expert journey publishes exactly one internal record for each arrival, consuming the arriving flow, and the onboarding's *Register hire* completion one revision producing both flows (wrong algorithm 6).

## Oracles this family changes

Every test and fixture that constructs or matches the changed constructors or wait records moves to the list form with identical expectations. The refusals of several-flow Activities and Starts in the [pass-through implicit split and merge](PASS-THROUGH-IMPLICIT-SPLIT-MERGE-SPEC.md#required-optional-and-excluded-scope), [Message Start](MESSAGE-START-EVENT-SPEC.md) and [single-scope models](SINGLE-SCOPE-MODELS-SPEC.md) accounts flip or are re-attributed to the remaining exclusions; each is listed in the implementation's Rule 2 declaration.

## Rule-to-evidence matrix

| Rule | Positive and negative witness | Lanes | Killing mutation |
|---|---|---|---|
| `AISM-ADMIT-01` | Both models and their twins admitted at both levels; the refused edits per level | Source, core, Lean conformance checks, pipeline | Widen at one level only (1); classify by kind (7) |
| `AISM-MERGE-01` | Both claim journeys and the one-record arrival | Core, pipeline across Lean, core and Temporal; CIB probe | A merge that waits (3), killed by a seeded pipeline mutation; an extra step (6), by the record count |
| `AISM-SPLIT-01` | Both onboarding orders, the Start twin and the one-revision completion | Core, pipeline across Lean, core and Temporal; CIB probe | One branch only (4), killed by a seeded pipeline mutation; `firstPlace` (5), by the second open User Task |
| `AISM-ONE-01` | Every existing scenario of every profile, unchanged | Lean library, `BpmnConformance`, pipeline, differential | Any behavior change of a one-element list |
| `AISM-PROFILE-01` | Both models under the embedded completion profile; the arity arm over every profile flag | Source and Lean conformance checks | Widen for every profile (2) |

## Lean assurance lane

Lane shape: proved

Evidence: the family changes the kernel representation of existing transitions, so the transition laws over the changed constructors (their footprints, pair independence, batch commutation, publication and position uniqueness) are re-established over list footprints for every Program, not only for the witnesses. No new transition family is added; an arrival and a completion remain the steps they are. Admission and lowering agreement is checked by a new conformance module beside the [pass-through implicit split and merge module](../../BpmnSemantics/PassThroughImplicitSplitMergeConformance.lean).

## Temporal hosting and refinement preflight

No new hosting mechanism. Ingress is the existing Start, effect result and User Task completion; waits are User Tasks and effects; no timer, cancellation or lifecycle transition is introduced. The durable runtime state changes shape (wait records carry output lists), a pre-release replacement of every producer and consumer under the [pre-release evolution policy](../PROJECT-DESIGN.md#pre-release-evolution-policy), with no Event History fixture to migrate. Every arrival and completion commits inside one closure, so the preserved relation stays equality of hosted committed state and publications with the core's; delivery, ordering, deduplication, retry and replay risks are those of the existing steps. The smallest refinement witness is the hosted pipeline over every journey of both models.

## Evidence and acceptance

The models run as answer-free scenarios with registered pipeline cases, each with a seeded mutation, plus value-domain matrix rows, corpus rows and the About disclosure. A new CIB probe calibrates, per journey: one historic activity instance of the merging Activity per arrival, none for the merge; after the splitting Activity's or Start's step, both successors active in the same command; the Process ending with the last User Task.

Then `PC-BASIC-01` closes, and `PC-CF-07` is accepted for ordered arrivals and unconditioned outgoing flows at every Activity this profile admits.

## Versioning consequences

A Program and runtime-state wire change: the changed constructors' `input` and `output` fields and the wait records' `output` become lists in the [semantic process](../../contracts/README.md) and runtime-state schemas, replacing every producer, consumer, fixture and test atomically under the [pre-release wire policy](../../contracts/README.md#evolution-policy). No admitted model changes behavior, by `AISM-ONE-01`; previously refused models of this profile become admitted.

### Owners this implementation grows

Hubs touched, each because the closed-world representation lives there and no leaf can serve: [`SemanticProcessContract`](../../BpmnSemantics/SemanticProcessContract.lean) (the constructors), [`RuntimeState`](../../BpmnSemantics/SemanticProcess/RuntimeState.lean) (the wait records), [`OperationControlPlaces`](../../BpmnSemantics/SemanticProcess/OperationControlPlaces.lean) (input and output places), [`FlowNodeOccurrenceLifecycle`](../../BpmnSemantics/SemanticProcess/FlowNodeOccurrenceLifecycle.lean) (owner selection over inputs) and [`Lowering`](../../BpmnSemantics/SemanticProcess/Lowering.lean); in TypeScript their twins, the [contract](../../packages/semantic-core/src/contract.ts) and the [source lowering](../../packages/bpmn-source/src/semantic-process-lowering.ts); every module that matches the changed constructors follows, about 163 Lean files, 135 of them with theorems (counted 2026-11-05 with the pattern `\.(awaitUserTask|awaitEffect|enterScope|invokeProcess|initiate|returnProcess|completeScope) [^.\n]*\b(input|output|parentOutput|callerOutput)\b`), and about 75 TypeScript files. The change lands in one commit so the global fixtures rebuild once, under a [Rule 2](../../CLAUDE.md#rule-2-declare-review-and-check-every-bulk-change) declaration reviewed before any edit.

Guards the implementation must satisfy, with bounds unchanged: [`lean-fanout`](../../scripts/lean-fanout.test.ts), [`lean-module-cost`](../../scripts/lean-module-cost.test.ts), [`source-hygiene`](../../scripts/source-hygiene.test.ts).

Registration: the register entry, the profile artifact and README, scenarios, pipeline cases, value-domain matrix, corpus, About, the CIB probe, and the [requirement ledger](../BPMN-REQUIREMENT-LEDGER.md) cell of `BPMN-MECH-FLOW-01`.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
