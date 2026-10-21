# Concurrent embedded activations proposal

## Status

Lifecycle: draft
Review: pending

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

Two runtime selections and one projection assume one live occurrence per definition scope:

- **Entry.** TypeScript [`selectChildScopeEntry`](../../packages/semantic-core/src/semantic-process-scope-runtime.ts) and Lean `enterScopeState?` refuse a second live occurrence of a definition.
- **Completion.** `selectScopeCompletion` and Lean `completeScopeState?` in [`ScopeCompletion`](../../BpmnSemantics/SemanticProcess/ScopeCompletion.lean) fail unless exactly one occurrence is live.
- **Entry projection.** The flow-node occurrence start of `enterScope`, in [`flow-node-occurrence-boundary-starts.ts`](../../packages/semantic-core/src/flow-node-occurrence-boundary-starts.ts) and [`FlowNodeOccurrenceBoundaryStarts`](../../BpmnSemantics/SemanticProcess/FlowNodeOccurrenceBoundaryStarts.lean), selects the unique occurrence of the definition under the parent. For a second occurrence with the same parent it would fail, and the canonical trace would be dropped.

The existing functions stay unchanged, together with every consumer:

- TypeScript: bounded-scope, interrupting Message Event Sub-Process and sequential-scope runtime, scope-creation, scope-completion and regional preparation, the attempt and occurrence frontiers, and the main runtime;
- Lean: 13 modules use `enterScopeState?` and 59 use `completeScopeState?`, including the premise in `ActivityBodyClaimWriterPreservation`.

This increment adds occurrence-addressed variants beside them in both languages:

- entry issues a fresh activation of the child definition from the monotone counter, parented by the arriving token's owner, even while another occurrence is live;
- completion is prepared per live occurrence and enabled exactly for the quiescent ones;
- the entry projection selects the child occurrence absent from the predecessor state.

Each variant is proven equal to the existing function whenever at most one occurrence of the definition is live. The evaluator selects the variants by profile identity, following the parallel Multi-Instance frontier that [internal preparation](../../packages/semantic-core/src/internal-transition-preparation.ts) enables only for its profile. Every other profile keeps its exact execution path, and the equality law together with the unchanged retained evidence of this profile's existing models guards the switch. `OperationStep`'s `enterScope` and `completeScope` arms gain the matching variant constructors, and the evaluator-to-relation soundness bridge covers them. If the entry variant would push [`RuntimeState`](../../BpmnSemantics/SemanticProcess/RuntimeState.lean) past its review target, it first moves into a scope-entry owner of its own.

Join counting is untouched. Every join in an admitted model lies outside merge-target bodies, and each region's fork and merge carry one owner's tokens. Several occurrences of one definition never become enabled in one closure, because each becomes quiescent through its own task completion. An `ambiguousInternalChoice` on a retained journey fails acceptance.

## Admission

Admission stays [profile-parameterized](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md). Neither reusable admission owner can represent a merge region:

- the structured-body analysis behind the nested scope-control class has no merge vertex, because a task vertex has exactly one input and every vertex with several inputs is a Parallel join;
- the structured process composition owner's merge vertex closes only a divergent Exclusive choice.

A merge region is therefore recognized by a separate region scan in each language, before the body is projected to the structured-body analysis. In TypeScript the scan is one new merge-region owner next to [`nested-scope-control-admission.ts`](../../packages/semantic-core/src/nested-scope-control-admission.ts), whose Program analysis must also accept `mergeExclusive`. In Lean it is one new module next to `NestedScopeControlAdmission`.

The scan checks the region shape above and replaces the region with one End sink in the body's projection. Rules 1–3 of the nested scope-control contraction then apply unchanged to what remains. Their quantified [`structureOrder_certificate`](../../BpmnSemantics/SemanticProcess/StructuredParallelBodyAdmission.lean#structureOrder_certificate) covers only those rules. The region scan has no quantified certificate and is fixed per retained model and refusal with `decide +kernel`.

The scan computes its own bursts. Each charge is per arrival, never summed across arrivals in one closure:

- entry of the region's body reaches the fork, which charges its `duplicate` and the arming of each branch's first task;
- a branch's last task completion charges the merge pass, the `enterScope` and the arming of the target's first task;
- the target's last task completion charges `completeScope` and then either the arming of the first task after the target or the None End.

The multiplicity-weighted task count must stay within 128, and every closure within `semanticProcessClosureLimit = 8`.

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
  - Mutants: a join mutant opens no *Fix finding* after the first review. A deduplication mutant opens only one *Fix finding* after both reviews. A wrong-occurrence mutant removes *Fix finding* 1 when the second Remediation completes, or opens *Close audit* early.
- **Stale command** (`CEA-REFUSE-01`). Re-sending the completion of *Fix finding* 2 after it completed, while *Fix finding* 1 is open, is rejected with the state unchanged. A resolver that matches by element alone would complete *Fix finding* 1 instead.
- **Intake model.** The root runs the Sub-Process *Intake* and then *Decide*. Intake forks *Check identity*, *Check address* and *Check income* into a merge before the Sub-Process *Assess*, which runs *Score applicant*, and then reaches a None End. Three live *Assess* occurrences coexist, and completing them in reverse order ends in the same final observation.
- **Orders.** Reversed arrival and completion orders of each journey end in the same final observation, up to activation numbering, which follows command order.
- **Refusals.** Each of the following is refused before start: a merge region in the root body; a merge region in a depth-three body; a Parallel Gateway inside a merge target's body; a fork output straight into the merge; a conditional flow on the merge; a Service Task in a branch; and a multiplicity-weighted task count over 128.

## Lean assurance lane

Lane shape: proved

Concurrency families are `proved` under the owner direction of 2026-10-14. The new variants need quantified laws, because their correctness for every reachable state is exactly what this increment adds.

- `CEA-QUIESCE-01` and `CEA-ISOLATE-01`: occurrence-addressed analogues of [`completeScopeState_selected_update`](../../BpmnSemantics/SemanticProcess/ScopeCompletion.lean#completeScopeState_selected_update), [`completeScopeState_refuses_nonquiescent`](../../BpmnSemantics/SemanticProcess/ScopeCompletion.lean#completeScopeState_refuses_nonquiescent) and [`completeScopeState_preserves_unrelated_components`](../../BpmnSemantics/SemanticProcess/ScopeCompletion.lean#completeScopeState_preserves_unrelated_components). They preserve every component owned by another occurrence, including another occurrence of the same definition. A further law states that the variant equals the existing function when one occurrence is live. The if half of quiescence stays a conformance check.
- `CEA-OCCUR-01`: a quantified freshness law for the entry variant: the issued occurrence differs from every live occurrence of its definition. It rests on a definite obligation that extends [`RSI-BOUND-01`](../RUNTIME-STATE-INVARIANT-SPEC.md) to ordinary Scope occurrences, with the matching issuing rule, in both languages. The [non-reissue claim guard](../../scripts/runtime-state-non-reissue-claims.test.ts) constrains how that extension is described.
- `CEA-MERGE-01`: the existing `mergeExclusive` relation and its unique-offer `fire?` result, specialized by conformance theorems on each journey.
- `CEA-ADMIT-01`: rules 1–3 keep the quantified per-body certificate. The region scan, the admission of each retained model and each refusal are fixed with `decide +kernel` under the [decision-procedure measurement rules](../CONTRIBUTOR-SETUP-GUIDE.md#lean-decision-procedures-and-build-memory).
- `CEA-REFUSE-01`: conformance theorems on the stale command.

Checked non-law: completion through the existing definition-addressed function is not total on states this profile now reaches. A conformance theorem shows that `completeScopeState?` returns `none` in the audit state with two live Remediation occurrences, one of them quiescent, while the occurrence-addressed variant completes exactly the quiescent one. This shows the variant is needed, not merely renamed.

The nearest unsupported claim is that every admitted definition completes under every arrival and completion order with sibling occurrences preserved. Progress over newly reachable states rests on the targeted preservation gate, not on a theorem.

## Rule-to-evidence matrix

| Rule | BPMN or profile | Lean | TypeScript | Temporal | Negative witness | Mutation |
|---|---|---|---|---|---|---|
| `CEA-ADMIT-01` | required scope above | region scan and refusals by `decide +kernel`; per-body certificate for rules 1–3 | region-scan tests and source-admission refusals | host admission of every reachable wait set | listed refusals | none; refusals are admission tests |
| `CEA-MERGE-01` | Table 13.2 | `mergeExclusive` relation; journey conformance | core journeys | pipeline schedules | none | join, deduplication |
| `CEA-OCCUR-01` | Clause 13.3.4 | freshness law; extended `RSI-BOUND-01` | core journeys | pipeline schedules | none | deduplication |
| `CEA-QUIESCE-01` | Clause 13.3.4 | occurrence-addressed completion laws; checked non-law | core journeys | pipeline schedules | none | wrong occurrence |
| `CEA-ISOLATE-01` | Clause 13.3.4 | preservation law; journey conformance | per-command sibling check in the preservation gate | pipeline schedules | none | wrong occurrence |
| `CEA-REFUSE-01` | profile command contract | stale-command conformance | stale-command journey | pipeline schedule | stale command | none |

## Targeted preservation gate

The core gate covers every retained journey prefix in every tested arrival and completion order. On each prefix it establishes that:

- every stable running state exposes a User Task or has completed;
- no closure yields `ambiguousInternalChoice`, every closure stays within its computed bound, and the longest closure reaches it;
- each task completion leaves every other occurrence's open User Tasks unchanged;
- host admission accepts every reachable wait set.

## Temporal hosting and refinement preflight

Ingress stays Start and User Task Update. Waits remain concurrent passive User Tasks, which [host admission](../../packages/temporal-adapter/protocol/src/host-admission.ts) already admits for token splits without effect or Timer waits. Concurrent occurrences of one definition are Workflow state interpreted by the pure core, never Child Workflows. There is no new Timer, Activity, Signal, cancellation or projection mechanism. The complete pipeline's Temporal target, with its isolation run and history replay, therefore covers the new schedules without a separate refinement witness.

The preserved state relation is the nested scope-control relation extended to several live occurrences per definition. It preserves:

- every occurrence's identity and parent;
- exact User Task occurrence ids, including activations;
- token ownership and Process status;
- command classification;
- the canonical trace, including the corrected entry start.

Workflow, Run, Update and history identities stay host facts. Per-task-occurrence Update identity decides the ordering and deduplication of concurrent completions, and it distinguishes same-element tasks by activation. The checkpoint must show that a completion addressed to one activation is never applied to another after recovery.

The multiplicity-weighted bound keeps every reachable open-task set within the concurrent-wait ceiling that hosting already carries. The profile admits no values, so publication bytes are fixed by the definition and its weighted task count. The checkpoint measures the largest retained model against the 192 KiB query and terminal ceilings of the [lifecycle specification](../TEMPORAL-PROCESS-LIFECYCLE-SPEC.md).

## Evidence and acceptance

The two models carry the witnesses as answer-free scenarios with registered pipeline cases and seeded join, deduplication and wrong-occurrence mutations. They also get a corpus row, the About disclosure and a runnable Product 1 example.

Acceptance requires:

- Lean, core and Temporal agree on every schedule in the complete pipeline;
- both languages refuse every listed exclusion;
- every model the profile admits today keeps its exact evidence;
- the [requirement ledger](../BPMN-REQUIREMENT-LEDGER.md) rows `BPMN-EXCLUSIVE-MERGE-01` and `BPMN-SUBPROCESS-ENTRY-01` extend their closed slices to concurrent-branch tokens that pass one per closure into a Sub-Process with concurrently live occurrences. Simultaneous multiple offers and implicit fan-in stay unsupported, and the family rows keep their dispositions.

## Common-mode risks

- Both languages share the place-based join-owner idiom. The serial merge-target restriction keeps it unreachable, and a regression that admitted a join there would deadlock both languages identically. The admission refusal of a Parallel Gateway inside a merge target is the only guard.
- Both languages share the definition-keyed lookups that this increment bypasses with variants. A profile-dispatch error that sent this profile down the existing path would fail identically in both languages. The checked non-law and the two-occurrence journey detect it.
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
- Runtime invariants: the [non-reissue claim guard](../../scripts/runtime-state-non-reissue-claims.test.ts).
- Hosting: [host admission](../../packages/temporal-adapter/testkit/test/host-admission.test.ts).
- Structure:
  - [Lean import boundaries](../../scripts/lean-import-boundaries.test.ts);
  - the [profile capability dispatch guard](../../scripts/lean-profile-capability-dispatch.test.ts);
  - [source hygiene](../../scripts/source-hygiene.test.ts).

### Owners this implementation grows

- Source: merge-region admission for this profile in [checked graph admission](../../packages/bpmn-source/src/checked-process-graph-admission.ts), which admits identity-only Exclusive merges inside child bodies. Lowering is unchanged.
- TypeScript core:
  - the merge-region owner;
  - occurrence-addressed entry and completion beside [scope runtime](../../packages/semantic-core/src/semantic-process-scope-runtime.ts);
  - the profile-gated selection in internal preparation;
  - the entry projection in [flow-node occurrence starts](../../packages/semantic-core/src/flow-node-occurrence-boundary-starts.ts).
- Lean:
  - the merge-region module and the occurrence-addressed variants beside `RuntimeState` and `ScopeCompletion`;
  - the `OperationStep` arms and the soundness bridge;
  - the extended `RSI-BOUND-01`;
  - the entry projection in `FlowNodeOccurrenceBoundaryStarts`;
  - one new conformance owner.

Growth makes the following passages false, and the implementation corrects them in the same change:

- in the nested scope-control capsule, its single-occurrence statement and its reopen condition on a second live occurrence;
- in the [embedded owner](EMBEDDED-SUBPROCESS-COMPLETION-SPEC.md), its exclusion of repeated or concurrent activation;
- in the [runtime-state invariant specification](../RUNTIME-STATE-INVARIANT-SPEC.md), `RSI-BOUND-01`'s statement that ordinary Scope remains unstated.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
