# Concurrent embedded activations specification

## Status

Lifecycle: implemented
Review: closure-approved

## Question and delivery boundary

Can the engine admit a child body in which the branches of a Parallel fork merge through a condition-free converging Exclusive Gateway into one embedded Sub-Process? Each token passing the merge must activate its own occurrence of that Sub-Process. Two live occurrences of one definition must progress and complete independently, and finishing one must leave the other and all outside work untouched.

This is the third batch of the embedded and called scope family in [PLAN](../PLAN.md#exact-resume-point). It serves the concurrent-occurrence clause of `PC-SCOPE-02` in the [coverage checklist](../PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) and does not close it. The following stay later increments:

- re-entry through a cycle, which needs the scope extension of the [cyclic control-flow account](CYCLIC-CONTROL-FLOW-SPEC.md) (`PC-CF-06`);
- per-occurrence locals and counters (`PC-DATA-04`);
- effects, which need concurrent-effect hosting;
- implicit fan-in into an Activity (`PC-CF-07`), whose lowering needs a synthetic merge that the public control-position and flow-node projections cannot yet represent.

A second live occurrence of one embedded definition arises in BPMN only through a merge of concurrent tokens, a cycle or Multi-Instance. An explicit Exclusive merge is the only one of these that this profile can reach with existing operations, real Sequence Flows and passive hosting. Depth follows the [nested scope-control capsule](NESTED-EMBEDDED-SCOPE-CONTROL-PROPOSAL.md#question-and-delivery-boundary): the root body has depth zero, and the deepest admitted Sub-Process body has depth three.

## Normative basis and CIB classification

The passages below are in the [external reading copy](../reference/bpmn-2.0.2/README.md#reading-workflow).

- **Clause 13.4.2, Table 13.2.** Each token arriving at any incoming Sequence Flow activates the Exclusive Gateway and is routed to exactly one outgoing flow, which is the only flow when there is one unconditioned outgoing flow. The table names Simple Merge (WCP-5) and Multi-Merge (WCP-8), so two concurrent arrivals give two passes and no synchronization.
- **Clause 13.3.4.** An embedded Sub-Process is instantiated when a token arrives and completes only when no token remains inside it and no contained Activity is active. Each pass therefore creates its own instance.
- **Clause 10.6.2 and the Merge glossary entry.** Both describe merging *alternative* paths, with no synchronization needed because no parallel activity runs at the merge. That premise does not hold for the selected Parallel topology. This capsule rests on the operational semantics of Table 13.2, which covers every arriving token, and records the tension instead of citing the descriptive passages as agreement.

CIB Seven agrees at source level. In the pinned checkout `5a45b47ea2`, `ExclusiveGatewayActivityBehavior.doLeave` (engine `impl/bpmn/behavior`, line 52) leaves each arriving execution through the selected flow and has no join. No retained CIB test asserts per-arrival occurrence counts for a Sub-Process behind a merge, so a CIB probe of one retained model is optional calibration, not acceptance. No new CIB relationship is required. The profile keeps naming [`CIB-AGR-0007`](../CIB-BPMN-RELATION-REGISTER.md#cib-agr-0007--ordinary-embedded-sub-process-quiescent-completion), which stays bound only to its one-level fixture.

## Required, optional and excluded scope

Required: everything the [nested scope-control class](NESTED-EMBEDDED-SCOPE-CONTROL-PROPOSAL.md#required-optional-and-excluded-scope) requires, plus the merge region below as an additional child-body construct. A merge region lies in a child body at depth one or two. It consists of:

- a Parallel fork with two or more outputs, each starting a branch that is a serial chain of one or more User Tasks;
- one identity-only converging Exclusive Gateway whose incoming flows are exactly those branches' last flows, with one unconditioned outgoing flow;
- one embedded Sub-Process, the merge target, whose body is a serial chain of one or more User Tasks between its None Start and one None End;
- a serial chain of zero or more User Tasks after the merge target, ending at a None End of the region's body.

The 128-task bound applies to the multiplicity-weighted count: the merge target's tasks and the tasks after it count once per fork output.

Optional: merge regions beside other admitted constructs of the nested scope-control class in the same child body, which the contraction below reduces.

Excluded:

- merge regions in the root body or in a depth-three body, whose merge target would exceed the depth bound;
- Parallel Gateways, Sub-Processes or merge regions inside a merge target's body or after the target;
- a fork output that reaches the merge without a User Task;
- implicit Activity fan-in;
- conditional or default flows on the merge, and divergent Exclusive Gateways;
- re-entry through cycles; data, locals and completion values; Service and other Tasks;
- every exclusion of the nested scope-control class.

The serial merge-target body is load-bearing. A Parallel join inside it would hold tokens of two occurrences on one input place. Both languages pick a join's owner per place ([`onlyTokenOwner`](../../packages/semantic-core/src/semantic-process-scope-runtime.ts), and `onlyTokenOwner?` in [`RuntimeState`](../../BpmnSemantics/SemanticProcess/RuntimeState.lean)), so the join could fire for neither occurrence and the Process would deadlock. The restrictions narrow admission only. Owner-addressed joins, cycles and data can later broaden the class without reinterpreting an admitted model.

## Profile and public contract

The profile `cibseven-2.2.0-embedded-subprocess-completion-draft` grows in place under the [cumulative profile rule](../../contracts/README.md). Every model it admits today keeps its exact admission, commands and observations. The wire shapes of Programs, Start, User Task completion and every observation stay unchanged.

Public task identity already carries a per-element activation: [`OccurrenceId`](../../packages/semantic-core/src/contract.ts) is `{ processInstanceId, elementId, activation }`, minted from a per-element counter. Two live occurrences of one User Task element are therefore distinct, and a completion addresses exactly one of them. The witnesses below name tasks by element and activation. Task activations count per element, independently of scope activations.

## Representation and runtime ownership

Lowering is unchanged. The merge is an ordinary identity-only converging Exclusive Gateway, which the [IL](../SEMANTIC-PROCESS-IL-SPEC.md#exclusive-merge) already lowers to `mergeExclusive` with real Sequence Flow inputs and output. There is no synthetic place, operation or origin, so control positions, flow-node occurrences and the canonical trace publish the gateway as the real flow node it is.

Under the branch condition, every closure starts from one Start or one task completion and offers at most one token to the merge. `mergeExclusive` therefore fires within the cycle profile's proven unique-offer subset and is the only enabled operation when it fires. The IL's exclusion of concurrent Exclusive Multi-Merge execution, meaning several simultaneous offers, stays in force. This increment adds Multi-Merge across closures, where tokens of concurrent branches pass one closure at a time.

Runtime selections, owner derivations and projections that assume one live occurrence per definition scope:

- **Entry.** TypeScript [`selectChildScopeEntry`](../../packages/semantic-core/src/semantic-process-scope-runtime.ts) and Lean `enterScopeState?` refuse a second live occurrence of a definition.
- **Completion.** `selectScopeCompletion` and Lean `completeScopeState?` in [`ScopeCompletion`](../../BpmnSemantics/SemanticProcess/ScopeCompletion.lean) fail unless exactly one occurrence is live.
- **Completion owner for records.** Lean `uniqueCompletingScopeOwner?` in [`FlowNodeOccurrenceLifecycle`](../../BpmnSemantics/SemanticProcess/FlowNodeOccurrenceLifecycle.lean) feeds `selectedOperationOwner?` in `TransitionRecord` and so `internalTransitionRecord?`, the record of an `.operation` singleton in `InternalScheduledClosure`. TypeScript `completeScopeOwner` in [`semantic-process-runtime.ts`](../../packages/semantic-core/src/semantic-process-runtime.ts) derives the completing owner the same way.
- **Completion lifecycle.** The `.completeScope` arm of Lean's owned-operation lifecycle `candidateFlowNodeOccurrenceDeltaForOwnedOperation?`, which `flowNodeOccurrenceDeltaForOperation?` also reaches, ignores its owner, filters scope occurrences by definition and fails unless one matches. TypeScript's completion lifecycle already selects by owner.
- **Occurrence application.** The `completeScope` arms of Lean `applyInternalOperationOccurrence?` and TypeScript `applyInternalOperationOccurrence` require exactly one live occurrence of the definition before comparing it with the owner.
- **Trace replay and publication.** TypeScript `replayInternalTransitionRecord` and the singleton publication check in [`semantic-transition-trace.ts`](../../packages/semantic-core/src/semantic-transition-trace.ts) replay by owner only for the parallel Multi-Instance profile and otherwise go through `applyInternalOperationStep`, whose completion owner is `completeScopeOwner`.
- **Entry projection.** The flow-node occurrence start of `enterScope`, in [`flow-node-occurrence-boundary-starts.ts`](../../packages/semantic-core/src/flow-node-occurrence-boundary-starts.ts) and the `enterScope` arm of Lean's owned-operation lifecycle `candidateFlowNodeOccurrenceDeltaForOwnedOperation?`, select the unique child of the definition under the parent in the successor state. For a second occurrence with the same parent they fail, and the canonical trace would be dropped.

Further definition-keyed helpers are inert for this profile because its Programs declare no data frames, Compensation retentions or bounded deadlines: `initializeNestedScopeFrame`, `writeNestedScopeOutputs`, the Compensation retention lookup and `withdrawBoundedScopeDeadline`. A later broadening that admits those records together with merge regions must replace them first.

The existing functions stay unchanged, together with every consumer:

- TypeScript: bounded-scope, interrupting Message Event Sub-Process and sequential-scope runtime, scope-creation, scope-completion and regional preparation, the attempt and occurrence frontiers, and the main runtime;
- Lean: on 2026-10-21, 13 modules used `enterScopeState?` and 59 used `completeScopeState?`, including the premise in `ActivityBodyClaimWriterPreservation`.

A **merge-target operation** is the `enterScope` whose input place is the output of a `mergeExclusive`, together with the `completeScope` of that `enterScope`'s child definition; the Program determines both. Only merge-target operations change path. This profile offers them as the existing occurrence-addressed alternative `operationOccurrence(operationId, owner)` ([`InternalTransitionAlternative`](../../BpmnSemantics/SemanticProcess/InternalTransitionAlternative.lean), [`internal-transition-alternative.ts`](../../packages/semantic-core/src/internal-transition-alternative.ts)). Every other operation, including every other `enterScope` and `completeScope`, keeps its present `operation` or `mergeInput` alternative and its existing preparation, so the profile's prepared ScopeCreation batches are untouched. Occurrence offers carry no preparation and the occurrence batch certificate stays parallel Multi-Instance only, so a merge-target offer is publishable only as a singleton frontier. The branch condition guarantees that: a merge-target `enterScope` is reached only from one branch task's completion through the merge, and a merge-target `completeScope` only from one target task's completion through the target's None End, each a chain in which it is the only enabled operation. A merge-target offer in a frontier of several offers rolls the closure back as ambiguous and fails acceptance. Mixed frontiers are already ordered by `internalAlternativeBefore`.

A merge-target singleton publishes through the exact-owner path, `singletonOccurrencePublication?` with `replayInternalOperationOccurrence?` and the owned-operation lifecycle in Lean, and the singleton publication check and `replayInternalTransitionRecord` in TypeScript. Their parallel Multi-Instance profile gates widen to this profile's merge-target operations only. The completion lifecycle arm becomes owner-addressed, so the record carries the owner explicitly and neither the record, the lifecycle nor replay re-derives it by definition. The occurrence-addressed resolution and application in both languages ([`InternalOperationOccurrence`](../../BpmnSemantics/SemanticProcess/InternalOperationOccurrence.lean), [`internal-operation-occurrence.ts`](../../packages/semantic-core/src/internal-operation-occurrence.ts)) gain an `enterScope` arm and, for merge-target `completeScope` only, the lookup-by-id composition below. Every other `completeScope` candidate keeps the present declared-scope wrapper, which in Lean also writes data outputs and withdraws bounded deadlines, so the parallel Multi-Instance profile's use of that arm cannot change:

- entry issues a fresh activation of the child definition from the monotone counter, parented by the alternative's owner, even while another occurrence is live;
- completion is offered per live occurrence and enabled exactly for the quiescent ones. In Lean it is lookup by occurrence id, then `scopeQuiescent`, then the existing `completeQuiescentScope?`;
- the entry projections select the child occurrence under the owner that is absent from the predecessor state.

The equality laws carry the hypotheses under which the existing functions succeed. Entry and the entry projections equal the existing functions when no occurrence of the definition is live in the predecessor, or none under the owner for the projections. Completion equals `completeScopeState?` when exactly one occurrence is live, and `completeScopeState?` is proven to factor through the lookup-by-id composition under that uniqueness. Every model the profile admits today is acyclic with unique elements and so satisfies these hypotheses. Merge-target operations exist only in Programs with a merge region, so every model the profile admits today keeps its exact execution path, and so does every other profile; no equality law is needed for the occurrence-application arms, which keep their present behavior for every other candidate. `OperationStep`'s `enterScope` and `completeScope` arms gain the matching variant constructors, and the evaluator-to-relation soundness bridge covers them; `OperationStep` is only constructed, never inverted. [`RuntimeState`](../../BpmnSemantics/SemanticProcess/RuntimeState.lean) had 23 nonblank lines of headroom on 2026-10-21, so the entry variant goes into a new scope-entry owner.

Join counting is untouched. Every join in an admitted model lies outside merge-target bodies, and each region's fork and merge carry one owner's tokens. Several occurrences of one definition never become enabled in one closure, because each becomes quiescent through its own task completion. An `ambiguousInternalChoice` on a retained journey fails acceptance.

## Admission

Admission stays [profile-parameterized](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md). Neither reusable admission owner can represent a merge region:

- the structured-body analysis behind the nested scope-control class has no merge vertex, because a task vertex has exactly one input and every vertex with several inputs is a Parallel join;
- the structured process composition owner's merge vertex closes only a divergent Exclusive choice.

A merge region is therefore recognized by a separate region scan in each language, before the body is projected to the structured-body analysis. In TypeScript the scan is one new merge-region owner next to [`nested-scope-control-admission.ts`](../../packages/semantic-core/src/nested-scope-control-admission.ts), whose checked shape alphabet and Program analysis must also accept the Exclusive merge and `mergeExclusive`. In Lean it is one new module next to `NestedScopeControlAdmission`.

The scan checks the region shape above and hands the composition this interface:

- **Projection.** The region becomes one region vertex followed by the region's None End in the body's projection. The region vertex is a task vertex, like a Sub-Process vertex today, so a body that consists only of a region still contains the task vertex that `structureOrder` and `parallelBodyScans` require. Rules 1–3 then apply unchanged to the projection. Their quantified [`structureOrder_certificate`](../../BpmnSemantics/SemanticProcess/StructuredParallelBodyAdmission.lean#structureOrder_certificate) covers only those rules. The region scan has no quantified certificate and is fixed per retained model and refusal with `decide +kernel`.
- **Scope tree.** The merge target's body stays in the tree as an ordinary serial body whose parent is the region's body, keyed by the target Sub-Process element, at the region body's depth plus one. The tree's parent, depth and body-count checks therefore apply unchanged.
- **Tasks.** The region's User Tasks, including the target body's, leave the outer resumption set, and the scan supplies their bursts. The 128 bound sums the multiplicity-weighted count: the target body's tasks and the tasks after the target count once per fork output, and every other task once.

Each charge is per arrival, never summed across arrivals in one closure:

- arming the region vertex, whether by body entry or by a predecessor's resumption, charges the fork's `duplicate` and the arming of each branch's first task, instead of one task arming;
- a branch task's completion charges the next branch task's arming or, for the last, the merge pass, the `enterScope` and the arming of the target's first task;
- a target task's completion charges the next target task's arming or, for the last, the target's `reachNoneEnd`, its `completeScope`, and then either the arming of the first task after the target or the region's None End;
- a completion that reaches the region's None End charges its `reachNoneEnd` and is then treated as possibly the body's last wait: it continues into the existing `completeScope` and parent-resumption recursion of the nested scope-control analysis.

Every closure must stay within `semanticProcessClosureLimit = 8`. On the Intake model below, completing *Score applicant* of the last live *Assess* charges five steps: `reachNoneEnd` and `completeScope` of *Assess*, `reachNoneEnd` and `completeScope` of *Intake*, and the arming of *Decide*.

The nearest wrong algorithm treats the merge as a join, entering the target once after every branch arrives. The second deduplicates arrivals while an occurrence is live. The third completes, or removes the work of, every live occurrence of a definition when one becomes quiescent.

## Stable rules

- `CEA-ADMIT-01`: profile admission is the existing admission or the nested scope-control class extended by merge regions within the multiplicity-weighted task bound and the closure bound. Every excluded construct is refused before Workflow start.
- `CEA-MERGE-01`: each token arriving at a merge passes alone to its outgoing flow. It neither waits for nor consumes tokens of the merge's other incoming flows, and two arrivals give two passes.
- `CEA-OCCUR-01`: each token reaching a merge target creates a fresh child occurrence owned by the token's occurrence, even while another occurrence of that definition is live.
- `CEA-QUIESCE-01`: a child occurrence completes exactly when it owns no token, User Task or child occurrence, independently of other live occurrences of its definition. Its completion removes only that occurrence and emits one token at its parent output.
- `CEA-ISOLATE-01`: completing or progressing work in one occurrence leaves every other occurrence of the same definition, with its tasks and tokens, and every outside task unchanged.
- `CEA-REFUSE-01`: a command addressing a completed task occurrence is rejected with the committed state preserved, even while a task occurrence of the same element in another occurrence is open.

## Separating witnesses

All witnesses differ at the public boundary of open User Tasks, named by element and activation, and Process status.

- **Audit model.** The root runs the Sub-Process *Audit* and then *Close audit*. Audit forks into *Review controls* and *Review payments*. These merge through an Exclusive Gateway into the Sub-Process *Remediation*, which is followed by *Report finding* and a None End. Remediation runs *Fix finding* and then *Verify fix*.
  - Completing *Review controls* opens *Fix finding* 1. Completing *Review payments* opens *Fix finding* 2 while the first Remediation is live.
  - Completing *Fix finding* 2 opens *Verify fix* 1 and leaves *Fix finding* 1 open. Completing *Verify fix* 1 completes only the second Remediation and opens *Report finding* 1, while *Fix finding* 1 stays open and *Close audit* stays absent.
  - *Close audit* appears only after the first Remediation and both *Report finding* occurrences complete.
  - Seeded mutations: on the reversed audit, a join mutation opens no *Fix finding* after the first review. On the interleaved audit, a wrong-activation mutation applies the completion of *Fix finding* 2 to *Fix finding* 1, leaving *Fix finding* 2 open beside *Verify fix* 1. On the intake, a deduplication mutation keeps only the first *Score applicant* after the second check completes. Each mutation alters one target's retained observation to calibrate the comparator; no seeded mutation sits at the quiescence boundary, which the Lean journey theorem `second_remediation_completes_alone` and the expected open-task sets of the core and pipeline cases discriminate.
- **Stale command** (`CEA-REFUSE-01`). Re-sending the completion of *Fix finding* 2 after it completed, while *Fix finding* 1 is open, is rejected with the state unchanged. A resolver that matches by element alone would complete *Fix finding* 1 instead.
- **Intake model.** The root runs the Sub-Process *Intake* and then *Decide*. Intake runs *Open application*, whose completion reaches the region by resumption, and then forks *Check identity*, *Check address* and *Check income* into a merge before the Sub-Process *Assess*, which runs *Score applicant*, and then reaches a None End. Three live *Assess* occurrences coexist, completing them in reverse order ends in the same final observation, and the last completion is the five-step cascade above.
- **Depth-two region.** A model whose region lies in a depth-two body, so that its merge target's body has depth three, is admitted by both languages. It is an admission witness only; no journey runs at that depth.
- **Orders.** Reversed arrival and completion orders of each journey end in the same final observation, up to activation numbering, which follows command order.
- **Refusals.** Each of the following is refused before start: a merge region in the root body; a merge region in a depth-three body; a Parallel Gateway inside a merge target's body; a Sub-Process inside a merge target's body; a partial merge, where one fork output reaches its own End; a merge fed by branches of two forks; a fork output straight into the merge; a conditional flow on the merge; a Service Task in a branch; and a multiplicity-weighted task count over 128.

## Lean assurance lane

Lane shape: proved

Evidence: concurrency families are `proved` under the owner direction of 2026-10-14. The new variants need quantified laws, because their correctness on states with several live occurrences of one definition is exactly what this increment adds. The guaranteeing declarations are [`enterConcurrentScopeState_fresh`](../../BpmnSemantics/SemanticProcess/ScopeOccurrenceEntry.lean#enterConcurrentScopeState_fresh), [`completeScopeState_factors`](../../BpmnSemantics/SemanticProcess/ScopeCompletion.lean#completeScopeState_factors), [`completeScopeOccurrenceState_selected`](../../BpmnSemantics/SemanticProcess/ScopeCompletion.lean#completeScopeOccurrenceState_selected), [`completeScopeOccurrenceState_refuses_nonquiescent`](../../BpmnSemantics/SemanticProcess/ScopeCompletion.lean#completeScopeOccurrenceState_refuses_nonquiescent), the frame laws [`enterConcurrentScopeState_frame`](../../BpmnSemantics/SemanticProcess/MergeTargetOccurrenceLaws.lean#enterConcurrentScopeState_frame) and [`completeScopeOccurrenceState_frame`](../../BpmnSemantics/SemanticProcess/MergeTargetOccurrenceLaws.lean#completeScopeOccurrenceState_frame), and the dispatcher bridge [`applyInternalOperationOccurrence_mergeTarget_sound`](../../BpmnSemantics/SemanticProcess/MergeTargetOccurrenceLaws.lean#applyInternalOperationOccurrence_mergeTarget_sound). They start from [`ScopeCompletion`](../../BpmnSemantics/SemanticProcess/ScopeCompletion.lean) and [`InternalOperationOccurrence`](../../BpmnSemantics/SemanticProcess/InternalOperationOccurrence.lean):

- `CEA-QUIESCE-01`: the analogues of [`completeScopeState_selected_update`](../../BpmnSemantics/SemanticProcess/ScopeCompletion.lean#completeScopeState_selected_update) and [`completeScopeState_refuses_nonquiescent`](../../BpmnSemantics/SemanticProcess/ScopeCompletion.lean#completeScopeState_refuses_nonquiescent) follow by specialization from the lookup-by-id composition and the factoring law, not by restatement. The if half of quiescence stays a conformance check.
- `CEA-ISOLATE-01`: a new frame law, because [`completeScopeState_preserves_unrelated_components`](../../BpmnSemantics/SemanticProcess/ScopeCompletion.lean#completeScopeState_preserves_unrelated_components) covers only six fields. Completing occurrence `o` changes tokens only by adding the one parent-output token, `scopeOccurrences` only by removing `o`, variables only by removing those owned by `o`, and waits not at all, so every component of another occurrence of the same definition is unchanged. Entry has the matching frame: it adds the fresh occurrence and its Start token and consumes only the arriving token.
- `CEA-OCCUR-01`: a quantified freshness law for the entry variant: given the extended `RSI-BOUND-01` in the predecessor, the issued occurrence differs from every live occurrence of its definition. The extension states [`RSI-BOUND-01`](../RUNTIME-STATE-INVARIANT-SPEC.md) for the whole Scope family, every writer of `scopeOccurrences` (ordinary, sequential and parallel Multi-Instance, interrupting Message Event Sub-Process, bounded and triggered-start occurrences), with called roots excluded as today. TypeScript adds it to `runtimeStateIdentityBound`, so the core gates of every family with Scope occurrences are its regression oracle. Lean states it as the separate predicate `scopeIdentityBound`, which the freshness law assumes and the two journey states discharge by kernel check; no other Lean family's gate decides it. Its preservation across transitions stays in [the deliberately open lane](../RUNTIME-STATE-INVARIANT-SPEC.md#the-deliberately-open-lane) (`RSI-OBL-03` to `RSI-OBL-06`). Reachability on the retained journeys is discharged by the executable core lane: `runtimeStateDefects`, which gains the same extension, holds on every gate prefix. The [non-reissue claim guard](../../scripts/runtime-state-non-reissue-claims.test.ts) constrains how that extension is described.
- `CEA-MERGE-01`: the existing `mergeExclusive` relation and its unique-offer `fire?` result, specialized by conformance theorems on each journey.
- `CEA-ADMIT-01`: rules 1–3 keep the quantified per-body certificate. The region scan, the admission of each retained model and each refusal are fixed with `decide +kernel` under the [decision-procedure measurement rules](../CONTRIBUTOR-SETUP-GUIDE.md#lean-decision-procedures-and-build-memory).
- `CEA-REFUSE-01`: conformance theorems on the stale command.

Checked non-law: completion through the existing definition-addressed function is not total on states this profile now reaches. A conformance theorem shows that `completeScopeState?` and `uniqueCompletingScopeOwner?` return `none` in the audit state with two live Remediation occurrences, one of them quiescent, while the occurrence-addressed variant completes exactly the quiescent one. This shows the variant is needed, not merely renamed.

The nearest unsupported claims are that every admitted definition, including one whose region lies at depth two, completes under every arrival and completion order with sibling occurrences preserved, and that scope identity is fresh in every reachable state. Progress over newly reachable states rests on the targeted preservation gate, and freshness beyond the retained journeys rests on the open preservation lane.

## Rule-to-evidence matrix

| Rule | BPMN or profile | Lean | TypeScript | Temporal | Negative witness | Mutation |
|---|---|---|---|---|---|---|
| `CEA-ADMIT-01` | required scope above | region scan, depth-two admission and refusals by `decide +kernel`; per-body certificate for rules 1–3 | region-scan tests and source-admission refusals | host admission of each retained Program | listed refusals | none; refusals are admission tests |
| `CEA-MERGE-01` | Table 13.2 | `mergeExclusive` relation; journey conformance | core journeys | pipeline schedules | none | join, deduplication |
| `CEA-OCCUR-01` | Clause 13.3.4 | freshness law given the extended `RSI-BOUND-01` | core journeys; `runtimeStateDefects` on every gate prefix | pipeline schedules | none | deduplication |
| `CEA-QUIESCE-01` | Clause 13.3.4 | specialized completion laws; checked non-law | core journeys | pipeline schedules | none | none; the Lean journey theorem and the expected open-task sets discriminate |
| `CEA-ISOLATE-01` | Clause 13.3.4 | completion and entry frame laws; journey conformance | per-command sibling check in the preservation gate | pipeline schedules | none | wrong activation |
| `CEA-REFUSE-01` | profile command contract | stale-command conformance | stale-command journey | pipeline schedule | stale command | none |

## Targeted preservation gate

The core gate covers every retained journey prefix in every tested arrival and completion order. On each prefix it establishes that:

- every stable running state exposes a User Task or has completed;
- no closure yields `ambiguousInternalChoice`, every closure stays within its computed bound, and the longest closure reaches it;
- each task completion leaves every other occurrence's open User Tasks unchanged;
- `runtimeStateDefects`, with the extended `RSI-BOUND-01`, reports no defect.

Host admission is Program-static and is checked once per retained Program.

## Temporal hosting and refinement preflight

Ingress stays Start and User Task Update. Waits remain concurrent passive User Tasks, which [host admission](../../packages/temporal-adapter/protocol/src/host-admission.ts) already admits for token splits without effect or Timer waits. Concurrent occurrences of one definition are Workflow state interpreted by the pure core, never Child Workflows. There is no new Timer, Activity, Signal, cancellation or projection mechanism. The complete pipeline's Temporal target, with its isolation run and history replay, covers the new schedules; the recovery witness below adds Worker replacement and accepted-result recovery beside live sibling activations.

The preserved state relation is the nested scope-control relation extended to several live occurrences per definition. It preserves:

- every occurrence's identity and parent;
- exact User Task occurrence ids, including activations;
- token ownership and Process status;
- command classification;
- the canonical trace, including the corrected entry start.

Workflow, Run, Update and history identities stay host facts. Per-task-occurrence Update identity decides the ordering and deduplication of concurrent completions, and it distinguishes same-element tasks by activation. The [recovery witness](../../packages/temporal-adapter/testkit/test/concurrent-embedded-activations-recovery.temporal-test.ts) shows on all three registered schedules that a completion addressed to one activation is never applied to another: it replaces the Worker before every completion that has a live same-element sibling, repeats each such accepted Update, finds the sibling still open and one committed recovery entry per command, and replays every Run to the core's trace.

The multiplicity-weighted bound keeps every reachable open-task set within the concurrent-wait ceiling that hosting already carries. The profile admits no values, so publication bytes are fixed by the definition and its weighted task count. Against the 192 KiB query and terminal ceilings of the [lifecycle specification](../TEMPORAL-PROCESS-LIFECYCLE-SPEC.md), the [same witness](../../packages/temporal-adapter/testkit/test/concurrent-embedded-activations-recovery.temporal-test.ts) measured on 2026-10-22 at most 2,239 terminal bytes and 46,041 bytes for a schedule's complete aligned E1 and E2 publication, which fits one page.

## Evidence and acceptance

The audit and intake models carry the journey witnesses as answer-free scenarios with registered pipeline cases and seeded join, deduplication and wrong-activation mutations. They also get a corpus row, the About disclosure and a runnable Product 1 example. The depth-two model and the refusals are admission fixtures in both languages.

Acceptance requires:

- Lean, core and Temporal agree on every schedule in the complete pipeline;
- both languages admit the depth-two model and refuse every listed refusal witness;
- every model the profile admits today keeps its exact evidence;
- the [requirement ledger](../BPMN-REQUIREMENT-LEDGER.md) rows `BPMN-EXCLUSIVE-MERGE-01` and `BPMN-SUBPROCESS-ENTRY-01` extend their closed slices to concurrent-branch tokens that pass one per closure into a Sub-Process with concurrently live occurrences. Simultaneous multiple offers and implicit fan-in stay unsupported, and the family rows keep their dispositions.

## Common-mode risks

- Both languages share the place-based join-owner idiom. The serial merge-target restriction keeps it unreachable, and a regression that admitted a join there would deadlock both languages identically. The admission refusal of a Parallel Gateway inside a merge target is the only guard.
- Both languages share the definition-keyed lookups that this increment bypasses: entry, completion, the completion owner for records, the completion lifecycle and the entry projections. A profile-dispatch error that sent this profile down an existing path would fail identically in both languages. The checked non-law and the two-occurrence journey detect it.
- Both languages transcribe the same region-scan account, so an undercounted burst would pass both admissions identically. The core closure-bound check on the Intake cascade is the only executable detector.
- The Worker shares the TypeScript core, so hosted agreement is a refinement check, not independent semantics.
- The witness boundary observes open tasks and status, not control positions or flow-node occurrences. The pipeline's canonical trace comparison covers the entry-projection correction; the scenarios do not.

## Versioning consequences

Under the [pre-release wire policy](../../contracts/README.md#evolution-policy) no wire shape changes. The profile identity, every schema and every existing Program stay byte-identical. Before the first edit, `node scripts/what-binds.ts` on every grown path names the binding guards and owner headroom. The decisive guards are:

- Profile and registration:
  - [capsule roundtrip](../../scripts/capsule-roundtrip.test.ts);
  - [pipeline catalog](../../packages/differential/test/pipeline-catalog.test.ts);
  - the [warm budget](../../scripts/pipeline-budget.ts), whose `defaultWarmBudgetMs` and hosted allowance rise when the registered cases exceed the ceiling divided by the per-case rate;
  - [product examples](../../packages/temporal-adapter/testkit/test/product-example-configs.test.ts);
  - [requirement ledger consistency](../../scripts/requirement-ledger-consistency.test.ts);
  - the [executable model corpus](../../model-corpus/test/executable-model-corpus.test.ts).
- Runtime invariants: the [non-reissue claim guard](../../scripts/runtime-state-non-reissue-claims.test.ts) and [collection-removal completeness](../../scripts/runtime-collection-removal-completeness.test.ts).
- Operation consumers: the [semantic operation consumer census](../../scripts/semantic-operation-consumer-census.test.ts) and the [internal commutation census](../../scripts/internal-commutation-census.test.ts).
- Hosting: [host admission](../../packages/temporal-adapter/testkit/test/host-admission.test.ts).
- Structure:
  - [Lean import boundaries](../../scripts/lean-import-boundaries.test.ts);
  - the [profile capability dispatch guard](../../scripts/lean-profile-capability-dispatch.test.ts);
  - [source hygiene](../../scripts/source-hygiene.test.ts).

### Owners this implementation grew

- Source: merge-region admission for this profile in [checked graph admission](../../packages/bpmn-source/src/checked-process-graph-admission.ts), which admits identity-only Exclusive merges with two or more incoming flows inside child bodies; its exact-three merge arity stays for every other profile. Lowering is unchanged.
- TypeScript core:
  - the merge-region owner and the merge-accepting shape alphabet of nested scope-control admission;
  - occurrence-addressed `enterScope` and the lookup-by-id `completeScope` arm in [occurrence application](../../packages/semantic-core/src/internal-operation-occurrence.ts), and the `operationOccurrence` offers of merge-target operations in internal preparation;
  - the widened replay and singleton publication gates in [trace replay](../../packages/semantic-core/src/semantic-transition-trace.ts);
  - the extended `RSI-BOUND-01` in `runtimeStateDefects`;
  - the entry projection in [flow-node occurrence starts](../../packages/semantic-core/src/flow-node-occurrence-boundary-starts.ts).
- Lean:
  - the merge-region module, the new scope-entry owner, and occurrence-addressed `enterScope` and the lookup-by-id `completeScope` arm in `InternalOperationOccurrence`;
  - the merge-target `operationOccurrence` offers in `InternalExecutionFrontier` and the widened profile gate of `replayInternalOperationOccurrence?`;
  - the `OperationStep` arms and the soundness bridge;
  - the extended `RSI-BOUND-01`;
  - the entry-child selection in the owned-operation lifecycle, and that lifecycle's owner-addressed `completeScope` arm; `FlowNodeOccurrenceBoundaryStarts` only validates the occurrence it is given and stays unchanged;
  - one new conformance owner.

Growth falsified the following passages, which the implementation corrected:

- in the nested scope-control capsule, its single-occurrence statement and its reopen condition on a second live occurrence;
- in the [embedded owner](EMBEDDED-SUBPROCESS-COMPLETION-SPEC.md), its exclusion of repeated or concurrent activation;
- in the [runtime-state invariant specification](../RUNTIME-STATE-INVARIANT-SPEC.md), `RSI-BOUND-01`'s statement that ordinary Scope remains unstated;
- in the [Semantic Process IL specification](../SEMANTIC-PROCESS-IL-SPEC.md#definition-scope-entry-and-completion), `completeScope`'s refusal of duplicate occurrences, which merge-target completion in this profile no longer applies;
- in the IL specification's unsupported list, the exclusion of converging Exclusive Gateways outside the cycle merge and of concurrent Multi-Merge execution, which now hold only outside merge regions and for several offers in one closure;
- in the runtime-and-proof, contracts-and-source and semantic-family implementation maps, the absence of repeated scope activation, concurrent Multi-Merge execution, other Exclusive Gateway topology and Exclusive Gateways in nested bodies, and the source compiler list, which omitted merge regions.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `ee316777` | `fork-turns-none` | `approve-with-required-edits` | `d48061da, 1b40e87c, 65e7bc85, owner-authorized` |
| Semantic checkpoint | `8e7d80b2` | `fork-turns-none` | `approve-with-required-edits` | `42075b5a, f7a3e568` |
| Closure | `f65f05a1` | `fork-turns-none` | `approve-with-required-edits` | `76a63032, cfdd18e7` |
