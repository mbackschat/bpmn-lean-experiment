# Activity implicit split and merge proposal

## Status

Lifecycle: draft
Review: pending

## Question and delivery boundary

Can the nested scope-data profile admit a User Task, Service or Send Task, embedded Sub-Process or Call Activity with several incoming Sequence Flows (implicit merge), and the User, Service and Send Tasks, the Sub-Process and the root and body None Start Events with several unconditioned outgoing Sequence Flows (implicit split)? Each arriving token would start its own occurrence without waiting for the others and with no step for the merge, and one completion or start would put a token on every outgoing flow with no step for the split. Every model, command and observation the profile admits today must keep its meaning, and every other profile its single-flow Activities.

This is the next family of batch 4 in [PLAN](../PLAN.md#scheduled-delivery-batches). Its mechanism is a kernel extension: the Activity's own operation consumes the one marked place among several input places and produces every one of several output places. The [implicit fan-in review](IMPLICIT-FAN-IN-PROPOSAL.md#independent-cold-review-receipt) rejected the alternative, an entry merge feeding the Activity through a control place with no Sequence Flow behind it, and named this one. The [pass-through implicit split and merge specification](PASS-THROUGH-IMPLICIT-SPLIT-MERGE-SPEC.md) built the several-flow checked projections at the node whose own operation already merges or duplicates; this family generalizes them to the Activities and Starts above. It takes every open row of the [coverage checklist](../PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) that shares the mechanism:

- `PC-CF-07`, primary: one arriving token activates one occurrence rather than synchronizing the incoming flows, and completion takes every unconditioned outgoing flow; "two arrivals and two outputs separate accidental join, deduplication and exclusive choice". Accepted for arrivals the admitted graph orders one after another and for unconditioned outgoing flows in the root and Sub-Process graphs. The row stays open on concurrent arrivals, conditional and default outgoing flows, Calls that split, and called and Multi-Instance bodies.
- `PC-BASIC-01`, its last open clause: multiple outgoing None Start flows, in the root and in Sub-Process bodies. The row closes.
- `PC-BASIC-02`, multiple sources to one target for arrivals the admitted graph orders: the Link contraction already turns each throw's incoming flow into an incoming flow of the catch's successor, so several throws of one name are fan-in there. The row stays open on concurrent sources, the form of CIB's only witness (`LinkEventTest#testEventLinkMultipleSources`: a Parallel fork into a Receive Task).

Screened out, each with its reason:

- Concurrent arrivals at one node (`PC-CF-07`, `PC-HUM-05`'s last clause, `PC-BASIC-02`'s concurrent sources): two arrivals racing for occurrence numbers are an observable choice the profile's envelope refuses (`rejectObservableChoice`, [`NestedScopeDataAdmission`](../../BpmnSemantics/SemanticProcess/NestedScopeDataAdmission.lean)), and the concurrent account admits no merge region. One later account serves all three rows.
- A Call Activity that splits: a split forks its graph, and the profile refuses a root Call in a forking model (`RPF-ADMIT-01` of [root Parallel forks](ROOT-PARALLEL-FORKS-SPEC.md)) and admits a body Call only on a serial body, so no placement admits it. The Call's return keeps its single caller output.
- Conditional and default outgoing flows of an Activity or Start: CIB evaluates them per completion (`BpmnActivityBehavior#performOutgoingBehavior`), an inclusive split. The representation leaves room for them as a separate field.
- Receive, Script and Rule Tasks, Multi-Instance Activities, data-input, data-output, bounded and monitored User Tasks and catch Events: this profile either does not admit them at all or admits them with exactly one incoming and one outgoing flow, and the family keeps that arity rule.
- A node with several incoming and several outgoing flows: a merge needs the re-entry route and a split forks, which the re-entry route refuses, so no placement admits both.

Selection, 2026-11-05: a close call. Every remaining batch-4 control clause needs this kernel extension, Script and Business Rule Tasks wait on a runtime dependency decision, and the cross-gateway matrix (`PC-CF-08`) depends on `PC-CF-07`. Reach, counted 2026-11-05 over the 1,864 deduplicated parsed BPMN files under `engine/src/test/resources` of the pinned CIB Seven checkout at `5a45b47` (the pass-through family counted 2,227 over every test-resource tree of the checkout): 17 hold an Activity other than an Abstract or Manual Task with two or more incoming flows (15 at a User or Service Task), 11 one with two or more unconditioned outgoing flows (9), and 7 a None Start with two or more outgoing flows. The cost is the largest of the batch: a kernel interface edit, estimated below.

## Normative basis and CIB classification

**BPMN.** Clause 13.3.1 (reading copy line 12286): an Activity that is the target of several Sequence Flows "participates in uncontrolled flow", enabled for each arriving token "independently of the arrival of tokens on other incoming Sequence Flows", and if it has several outgoing Sequence Flows "all of them will receive a _token_ when the **Activity** transitions to the _Completed_ state", which "behaves as a parallel split" (line 12294), while conditioned ones behave as an inclusive split. The Activity note of Clause 10.3 (line 4614) adds that a further token creates "a separate instance of the Activity". Clause 10.5.1 (line 7328) generates "a _token_ … for each _outgoing_ **Sequence Flow**" of a triggered Start Event, and Clause 13.2 (line 12268) restates it for every Start Event that occurs.

**CIB Seven** at `5a45b47`:

- A transition enters its destination without consulting the destination's other incoming transitions (`pvm/runtime/operation/AbstractPvmAtomicOperationTransitionNotifyListenerTake.java`); only Parallel, Inclusive and parallel Multi-Instance behaviors collect executions. Each arrival creates its own activity instance and none is created for the merge.
- `BpmnActivityBehavior#performOutgoingBehavior` (lines 82-116) takes every outgoing transition without a condition, and every conditioned one whose condition holds, through one `leaveActivityViaTransitions`; the default is taken only when no other is, and an Activity without outgoing transitions ends its execution. No instance is created for the split. A None Start's outgoing transitions are left the same way.
- A Link throw continues at its catch's target without an activity instance for the catch (`LinkEventTest#testEventLinkMultipleSources`).

Register change: a new entry `CIB-AGR-0020 — an Activity starts one occurrence per arriving token and its completion takes every unconditioned outgoing flow`, a normative agreement bounded to this profile, added with its verifier coverage. It names `CIB-AGR-0019` as the pass-through instance of the same account and `CIB-AGR-0018` as the Link continuation it extends to several sources.

## Required, optional and excluded scope

Required, for the nested scope-data profile only:

- **Implicit merge:** a User, Service or Send Task, Sub-Process or Call Activity with two or more incoming flows, in the root graph of the [re-entry account](SCOPE-REENTRY-SPEC.md#admission), wherever a pass-through merge is admitted ([`PTSM-ADMIT-01`](PASS-THROUGH-IMPLICIT-SPLIT-MERGE-SPEC.md#stable-rules)), on a cycle or not; and two or more Link throws of one name whose catch's successor is such a node or an admitted fan-in node (a pass-through node, None End or Exclusive merge).
- **Implicit split:** a User, Service or Send Task, Sub-Process or a root or body None Start with two or more unconditioned, non-default outgoing flows, at exactly the placements where [`PTSM-ADMIT-01`](PASS-THROUGH-IMPLICIT-SPLIT-MERGE-SPEC.md#stable-rules) admits a splitting pass-through node: in the root of a forking model, in a Sub-Process body and on a branch of an Inclusive region. Its branches follow the branch rules of a Parallel fork.

Optional: none.

Excluded, each refused at admission: concurrent arrivals, a merge under a fork; a node that both merges and splits; a Call that splits; a conditioned or default outgoing flow of an Activity or Start; several flows at the Activity kinds screened out above, and in called Processes and Multi-Instance bodies; every form under any other profile.

These bound admission only. Conditional and default outgoing flows extend the operation with a separate field beside its outputs, in CIB's partition; an Activity without outgoing flows becomes an empty output list, which root completion's own representation keeps distinct; concurrent arrivals replace the unique-input selection below by per-input alternatives as `mergeExclusive` has. None of these reinterprets an admitted model.

## Profile and public contract

The profile `cibseven-2.2.0-nested-embedded-scope-data-draft` grows in place under the [cumulative profile rule](../../contracts/README.md). The [profile artifact](../../profiles/cibseven-2.2.0-nested-embedded-scope-data-draft/profile.json) gains `CIB-AGR-0020`, and its exclusion `implicit-activity-split-merge-outside-pass-through-tasks` and its Link several-throws exclusion narrow to the excluded forms above. Observation adds nothing: an arrival publishes the Activity's ordinary occurrence, a completion or start its ordinary step with one token per outgoing flow.

## Representation and runtime ownership

**Multi-place operations.** The [Semantic Process program](../SEMANTIC-PROCESS-IL-SPEC.md#semantic-process-program) owner and `SemanticProcess` in [`SemanticProcessContract`](../../BpmnSemantics/SemanticProcessContract.lean) and its TypeScript twin [`semantic-process-contract.ts`](../../packages/semantic-core/src/semantic-process-contract.ts) rename and widen these fields, and only these:

| Constructor | Field now | Field after |
|---|---|---|
| `initiate` | `output` | `outputs : List ControlPlaceId` |
| `awaitUserTask` | `input`, `output` | `inputs`, `outputs : List ControlPlaceId` |
| `awaitEffect` | `input`, `output` | `inputs`, `outputs : List ControlPlaceId` |
| `enterScope` | `input`, `childEntry` | `inputs`, `childEntries : List ControlPlaceId` |
| `invokeProcess` | `input` | `inputs : List ControlPlaceId` |
| `completeScope` | `parentOutput : Option ControlPlaceId` | `parentOutputs : Option (List ControlPlaceId)`, `none` still the root's completion |

The wait records `UserTaskWait` and `EffectWait` ([`RuntimeState`](../../BpmnSemantics/SemanticProcess/RuntimeState.lean)) carry `outputs`, so completion needs no Program lookup. `invokeProcess.calledEntry` and `returnProcess.callerOutput` stay single: called Processes are serial in this profile and a Call never splits. Every other constructor is unchanged.

**Validation.** [`ProgramStructuralValidation`](../../BpmnSemantics/SemanticProcess/ProgramStructuralValidation.lean) and its TypeScript twin require each new list to be nonempty, duplicate-free and in canonical order by control-place id, as the [Message Start](MESSAGE-START-EVENT-SPEC.md#checked-graph-and-lowering) outputs are. The single-producer and single-consumer rule of [`GraphValidation`](../../BpmnSemantics/SemanticProcess/GraphValidation.lean) keeps holding, because every flow keeps its own place with one producer and one consumer, and one operation per origin keeps holding, so the Program envelope needs no relaxation.

**Steps.** An operation with several inputs is prepared from its unique marked input: with exactly one input marked the step consumes that token, exactly as the one-input step does; with several marked it is not prepared, a state admission excludes. Completion, start and scope entry produce a token on every output in the one committed step each already is. With one-element lists every operation behaves and publishes exactly as before. The precedent is `initiateMessage` and `initiateTimer`, which already carry output lists ([Message Start](MESSAGE-START-EVENT-SPEC.md#checked-graph-and-lowering): "a nonempty collection of distinct output control places").

**Lowering.** [`Lowering`](../../BpmnSemantics/SemanticProcess/Lowering.lean) and the [source lowering](../../packages/bpmn-source/src/semantic-process-lowering.ts) replace `firstPlace` of these nodes' incoming and outgoing places by the canonical lists. [`LinkContraction`](../../BpmnSemantics/SemanticProcess/LinkContraction.lean) and [`link-contraction.ts`](../../packages/bpmn-source/src/link-contraction.ts) admit several throws per catch under this profile, giving the successor one incoming flow per throw.

Rejected alternatives, each evaluated against the current kernel:

- a typed entry or exit place with a merge or duplicate sharing the Activity's origin: every operation step is published with the tokens it produces (`tokenOrigin` in [`ControlPositionProjection`](../../BpmnSemantics/SemanticProcess/ControlPositionProjection.lean)), so it publishes a step and a token position CIB lacks, adds burst steps, and needs two operations per origin;
- a Program side table of extra ports: still a kernel interface edit, and every enabledness and footprint site would compile unchanged while silently ignoring it;
- per-arrival copies of the Activity's operation, as None End fan-in does: they share an output place, breaking the single-producer census, put several Program vertices on one checked node, and cannot split;
- widening every single-place constructor at once: it would save later interface edits of the same hub, but none of the other constructors is reached by an admitted several-flow model, and each would need its own witnesses.

## Admission

Admission stays [profile-parameterized](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md). The checked arity of the Activities and Starts in scope widens under this profile only, never both forms at once, at both levels, in Lean [`CheckedProcessAdmission`](../../BpmnSemantics/SemanticProcess/CheckedProcessAdmission.lean) and the TypeScript [checked graph admission](../../packages/bpmn-source/src/checked-process-graph-admission.ts). The shared predicates of [`CheckedPassThroughFlow`](../../BpmnSemantics/SemanticProcess/CheckedPassThroughFlow.lean) and [`checked-pass-through-flow.ts`](../../packages/semantic-core/src/checked-pass-through-flow.ts) widen from pass-through nodes to every node in scope and are renamed for that role, so the shape gate, routing, root Call placement, the merge refusal under a fork, the serial vertex model and the concurrent, Inclusive region and re-entry projections classify a splitting node as a fork and a merging node as a merge, as the Program-level analyses classify its lowered operation. A splitting Call is refused by the existing root Call rule and the serial body rule.

The Program-level analyses read the lists: a vertex's outputs are its operation's outputs, a splitting operation counts as forking, and a merging operation is a re-entry joint followed by its Activity. The joint costs no step and adds no cut: the arrival is the Activity's own step, counted once in the burst (`SRE-BURST-01`) as the scheduler takes it, and the Activity stays the cut a cycle needs (`SRE-CYCLE-01`).

The nearest wrong algorithms, each with a separating witness below:

1. the arity widened at one level only;
2. the arity widened for every profile;
3. a merge that waits for every incoming flow;
4. a split that takes one outgoing flow, the first, or an exclusive choice;
5. a lowering that keeps `firstPlace`, which strands the second arrival or drops the second output;
6. an extra step or token position for the merge or split, which CIB does not publish;
7. a checked analysis classifying a several-flow node by its kind while its Program merges or forks;
8. a merge that deduplicates, reusing the first arrival's occurrence for the second.

## Stable rules

| Rule | Statement |
|---|---|
| `AISM-ADMIT-01` | Under the nested scope-data profile, the Activities in scope may have several incoming flows in the root graph of the re-entry account, and the splitting Activities and None Starts in scope several unconditioned outgoing flows at the placements of a splitting pass-through node; never both, at both levels alike. Several Link throws of one name are admitted where their catch's successor admits that many incoming flows. |
| `AISM-MERGE-01` | Each token arriving on any incoming flow starts one fresh occurrence of the Activity in one step that consumes that flow's token, with no step and no position for the merge. |
| `AISM-SPLIT-01` | The Activity's completion, the Process start or the Sub-Process entry puts one token on every outgoing flow in the one step it already is, with no step and no position for the split. |
| `AISM-ONE-01` | With one incoming and one outgoing flow every operation behaves and publishes exactly as before. |
| `AISM-PROFILE-01` | Every other profile refuses each form it refuses today. |

## Newly reachable waits and resumption

None of a new kind. The User Task and effect waits are the existing ones; a wait record carries its output list, so a completion resumes onto every outgoing flow.

## Separating witnesses

Two new whole models with source overlays, each with a mapped Service Task:

- **Claim review** (implicit merge, re-entry route): Start binds `claim` → mapped Service Task *Assess claim* (`claim` → `route`) → Choice *Expert needed?*: `stringEquals(route,"expert")` to Service Task *Obtain expert opinion*, default directly to User Task *Review claim*; *Obtain expert opinion* also flows to *Review claim*, which therefore has two incoming flows → mapped Service Task *Record decision* (`claim` → `outcome`) → Choice *Reopen?*: `stringEquals(outcome,"reopen")` back to *Obtain expert opinion*, which so has two incoming flows too, default to the End. Journeys: the direct path; the expert path; and the direct path reopened once, so *Review claim* is reached by both incoming flows and has two distinct occurrences (wrong algorithm 8). Twins replace *Review claim* by a Service Task, a Send Task, a Sub-Process (body Start → User Task → End) and a Call Activity; a Link twin replaces the two incoming flows by two throws of one name and a catch before *Review claim*.
- **Employee onboarding** (implicit split, concurrent route): Start binds `hire` → mapped Service Task *Register hire* (`hire` → `employee`) with two outgoing flows to User Tasks *Prepare workstation* and *Issue badge* → Parallel join → End. Journeys: both completion orders, each opening both User Tasks in the one completion of *Register hire*. Twins: the splitting node as a User Task, a Send Task and a Sub-Process; a root Start twin whose None Start flows to *Register hire* and to *Issue badge*; a body Start twin whose Sub-Process body Start flows to two User Tasks joined in the body; and an Inclusive region twin with the splitting Service Task on one region branch (the region-walk projection).

Refused edits, each at both levels: a merge and split at one Activity; a splitting Call; a conditioned outgoing flow; a default outgoing flow; arrivals from two Parallel branches (merge under a fork); each model under the embedded completion profile, with the arity arm checked over every profile flag as [`PTSM-PROFILE-01`](PASS-THROUGH-IMPLICIT-SPLIT-MERGE-SPEC.md#stable-rules) does.

Kernel witnesses: a one-element-list Program of every changed constructor commits the same states and publications as before (`AISM-ONE-01`); the expert journey publishes exactly one internal record per arrival, consuming the arriving flow, and the *Register hire* completion one revision producing both flows (wrong algorithm 6); an operation with two marked inputs is not prepared, in both languages.

The merge side of wrong algorithm 7 has no separating witness in the admitted class, as for pass-through merges: a merge is admitted only in a re-entry root, where a Choice already selects the route and the joint costs no step. Its agreement is by construction and recorded as such.

## Oracles this family changes

Every test and fixture that constructs or matches the changed constructors or wait records moves to the list form with identical expectations; the implementation's Rule 2 declaration enumerates them by selector. These named oracles flip or are re-attributed:

- the second-throw refusal of the [Link source test](../../packages/bpmn-source/test/link-events-source.test.ts) ("second throw of one name"), a passed path re-entering, and the two-throws edit of [`LinkEventsConformance`](../../BpmnSemantics/LinkEventsConformance.lean): admitted, with the refusal re-attributed to a concurrent second source;
- the several-flow pins of the [capability catalog disclosures](../../scripts/capability-catalog-disclosures.test.ts): rewritten for the widened class;
- the [pass-through implicit split and merge](PASS-THROUGH-IMPLICIT-SPLIT-MERGE-SPEC.md#required-optional-and-excluded-scope) exclusion of other Activity kinds and the [Link Events](LINK-EVENTS-SPEC.md#required-optional-and-excluded-scope) exclusion of several sources: narrowed, the owner passages amended at closure.

## Rule-to-evidence matrix

| Rule | Positive and negative witness | Lanes | Killing mutation |
|---|---|---|---|
| `AISM-ADMIT-01` | Both models and their twins admitted at both levels; the refused edits per level | Source, core, Lean conformance checks, pipeline | Widen at one level only (1); classify a splitting node by its kind (7) |
| `AISM-MERGE-01` | The claim journeys, the reopened journey's two occurrences and the one-record arrival | Core, pipeline across Lean, core and Temporal; CIB probe | A merge that waits (3), killed by a seeded pipeline mutation; deduplication (8), by the second occurrence; an extra step (6), by the record count |
| `AISM-SPLIT-01` | Both onboarding orders, both Start twins and the one-revision completion | Core, pipeline across Lean, core and Temporal; CIB probe | One branch only (4), killed by a seeded pipeline mutation; `firstPlace` (5), by the second open User Task |
| `AISM-ONE-01` | Every existing scenario of every profile, unchanged | Lean library, `BpmnConformance`, pipeline, differential | Any behavior change of a one-element list |
| `AISM-PROFILE-01` | Both models under the embedded completion profile; the arity arm over every profile flag | Source and Lean conformance checks | Widen for every profile (2) |

## Lean assurance lane

Lane shape: proved

Evidence: the family changes the kernel representation of existing transitions, so the transition laws over the changed constructors (their footprints, pair independence, batch commutation, publication and position uniqueness) are re-established over list footprints for every Program, with the unique-input selection above, not only for the witnesses. No new transition family is added; an arrival, a completion, a start and a scope entry remain the steps they are. Admission and lowering agreement is checked by a new conformance module beside the [pass-through implicit split and merge module](../../BpmnSemantics/PassThroughImplicitSplitMergeConformance.lean).

## Temporal hosting and refinement preflight

No new hosting mechanism. Ingress is the existing Start, effect result and User Task completion; waits are User Tasks and effects; no timer, cancellation or lifecycle transition is introduced. The durable runtime state changes shape (wait records carry output lists), a pre-release replacement of every producer and consumer under the [pre-release evolution policy](../PROJECT-DESIGN.md#pre-release-evolution-policy), with no Event History fixture to migrate; the Start capacity envelope is byte-based and is re-measured, not raised. Every arrival and completion commits inside one closure, so the preserved relation stays equality of hosted committed state and publications with the core's; delivery, ordering, deduplication, retry and replay risks are those of the existing steps. The smallest refinement witness is the hosted pipeline over every journey of both models.

## Evidence and acceptance

The models run as answer-free scenarios with registered pipeline cases, each with a seeded mutation, plus value-domain matrix rows, corpus rows and the About disclosure. A new CIB probe calibrates, per journey: one historic activity instance of the merging Activity per arrival, none for the merge or a Link catch; after the splitting Activity's, Start's or Sub-Process entry's step, both successors active in the same command, including a `sendTask` instance for the Send Task twins; the Process ending with the last User Task.

Then `PC-BASIC-01` closes; `PC-CF-07` is accepted for ordered arrivals and unconditioned outgoing flows at the Activities in scope; `PC-BASIC-02` is accepted for ordered multiple sources.

## Versioning consequences

A Program and runtime-state wire change: the fields in the table above and the wait records' output become lists in the [semantic process](../../contracts/README.md) and runtime-state schemas, replacing every producer, consumer, fixture and test atomically under the [pre-release wire policy](../../contracts/README.md#evolution-policy). No admitted model changes behavior, by `AISM-ONE-01`; previously refused models of this profile become admitted.

### Owners this implementation grows

Hubs touched, each because the closed-world representation lives there and no leaf can serve: [`SemanticProcessContract`](../../BpmnSemantics/SemanticProcessContract.lean) (the constructors), [`RuntimeState`](../../BpmnSemantics/SemanticProcess/RuntimeState.lean) (the wait records), [`ProgramStructuralValidation`](../../BpmnSemantics/SemanticProcess/ProgramStructuralValidation.lean) (the list rules), [`OperationControlPlaces`](../../BpmnSemantics/SemanticProcess/OperationControlPlaces.lean) (input and output places), [`FlowNodeOccurrenceLifecycle`](../../BpmnSemantics/SemanticProcess/FlowNodeOccurrenceLifecycle.lean) (owner selection over inputs), [`Lowering`](../../BpmnSemantics/SemanticProcess/Lowering.lean) and [`LinkContraction`](../../BpmnSemantics/SemanticProcess/LinkContraction.lean); the admission owners named under [Admission](#admission); and in TypeScript their twins, the [contract](../../packages/semantic-core/src/semantic-process-contract.ts), the [runtime](../../packages/semantic-core/src/semantic-process-runtime.ts) and the [source lowering](../../packages/bpmn-source/src/semantic-process-lowering.ts). Any constructor use appears in 264 Lean files (counted 2026-11-05 with `\.(awaitUserTask|awaitEffect|enterScope|invokeProcess|initiate|completeScope)\b`), 135 of them with theorems that read the changed fields, and in about 75 TypeScript files.

Headroom of owners within 100 lines of the 800-line target (nonblank lines, 2026-11-05): `NestedScopeControlAdmission.lean` 788, `RuntimeState.lean` 784, `nested-scope-control-admission.ts` 784, `Lowering.lean` 774, `FlowNodeOccurrenceLifecycle.lean` 773, `semantic-process-runtime.ts` 762, `checked-process-admission.ts` 756, `semantic-process-lowering.ts` 733, `semantic-process-contract.ts` 716. Growth that would cross 800 moves into a family-owned leaf; no size exception is requested.

Guards the implementation must satisfy, with bounds unchanged: [`lean-fanout`](../../scripts/lean-fanout.test.ts), [`lean-module-cost`](../../scripts/lean-module-cost.test.ts), [`source-hygiene`](../../scripts/source-hygiene.test.ts), [`semantic-operation-consumer-census`](../../scripts/semantic-operation-consumer-census.test.ts), [`internal-commutation-census`](../../scripts/internal-commutation-census.test.ts), [`call-forest-selection-census`](../../scripts/call-forest-selection-census.test.ts), [`runtime-collection-removal-completeness`](../../scripts/runtime-collection-removal-completeness.test.ts), [`activity-occurrence-writer-census`](../../scripts/activity-occurrence-writer-census.test.ts), [`lean-source-contracts`](../../scripts/lean-source-contracts.test.ts), [`pre-release-architecture`](../../scripts/pre-release-architecture.test.ts) and the [Start capacity envelope test](../../packages/temporal-adapter/protocol/test/start-capacity-envelope.test.ts).

**Cost and split.** Two commits, each under its own [Rule 2](../../CLAUDE.md#rule-2-declare-review-and-check-every-bulk-change) declaration reviewed before any edit:

1. the representation change with one-element lists only (`AISM-ONE-01`), every existing scenario unchanged, closed by the Lean library, `BpmnConformance`, the differential suite and the pipeline; estimated 8 to 12 hours, dominated by re-proving the changed footprints and three to four whole-library rebuilds of about 15 minutes each;
2. the widening: admission, lowering, Link contraction, projections, witnesses and registration; estimated 6 to 8 hours.

The estimate exceeds the family's 10-hour budget in PLAN. At its limit work stops at the first commit's stop point, which is complete and green on its own; PLAN records the result, the budget consumed and the next budget as an explicit decision under the owner direction of 2026-11-05 (record the boundary and continue unless the evidence invalidates the path), never as an automatic renewal.

Registration: the register entry, the profile artifact and README, scenarios, pipeline cases, value-domain matrix, corpus, About, the CIB probe, and the [requirement ledger](../BPMN-REQUIREMENT-LEDGER.md) cell of `BPMN-MECH-FLOW-01`.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-required` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
