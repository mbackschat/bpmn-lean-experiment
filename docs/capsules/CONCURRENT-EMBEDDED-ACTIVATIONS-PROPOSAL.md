# Concurrent embedded activations proposal

## Status

Lifecycle: draft
Review: pending

## Question and delivery boundary

Can the engine admit an embedded body in which the branches of a Parallel fork each reach one User Task or embedded Sub-Process through uncontrolled incoming Sequence Flows, so that every arriving token activates its own occurrence of that Activity, two live occurrences of one Sub-Process definition progress and complete independently, and finishing one leaves the other and all outside work untouched?

This is the third batch of the embedded and called scope family in [PLAN](../PLAN.md#exact-resume-point). It serves the concurrent-occurrence clause of `PC-SCOPE-02` and the merge clause of `PC-CF-07` for User Task and embedded Sub-Process targets in the [coverage checklist](../PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list), and closes neither row. A later re-entry through a Sequence Flow cycle needs the scope extension of the [cyclic control-flow account](CYCLIC-CONTROL-FLOW-SPEC.md), which excludes nested scopes (`PC-CF-06`). Per-occurrence locals and counters need the concurrent owners of `PC-DATA-04`. Effects need concurrent-effect hosting. Conditional and fan-out outgoing flows need expression binding. All four stay later increments.

A second live occurrence of one embedded definition arises in BPMN only through uncontrolled fan-in, a cycle or Multi-Instance; uncontrolled fan-in is the only one of the three that this profile can reach without cycles, data or new hosting. Depth follows the [nested scope-control capsule](NESTED-EMBEDDED-SCOPE-CONTROL-PROPOSAL.md#question-and-delivery-boundary): the root body has depth zero.

## Normative basis and CIB classification

BPMN 2.0.2 Clause 10.3 states that an Activity with multiple incoming Sequence Flows is uncontrolled flow: an arriving token instantiates the Activity without waiting for tokens on its other paths, and another arriving token creates a separate instance. Clause 13.3.1 restates it for execution: for each token arriving on any incoming flow the Activity is enabled independently, and multiple incoming flows behave as an Exclusive Gateway. Clause 13.3.4 instantiates an embedded Sub-Process per arrival and completes each instance only when no token remains inside it and no contained Activity is active. The glossary entries for Merge and Uncontrolled Flow agree. Consult the [external reading copy](../reference/bpmn-2.0.2/README.md#reading-workflow); its lines 4614, 12286–12290 and 14417 carry the passages.

The standard settles every selected behavior, so no new CIB relationship is required. The pinned CIB Seven checkout (`5a45b47ea2`) retains no engine test of incoming uncontrolled flow on an Activity: `UncontrolledFlowTest` covers only two outgoing flows of a Sub-Process. A CIB probe of one retained model is optional calibration, not acceptance. The profile keeps naming [`CIB-AGR-0007`](../CIB-BPMN-RELATION-REGISTER.md#cib-agr-0007--ordinary-embedded-sub-process-quiescent-completion), still bound only to its one-level fixture.

## Required, optional and excluded scope

Required: everything the [nested scope-control class](NESTED-EMBEDDED-SCOPE-CONTROL-PROPOSAL.md#required-optional-and-excluded-scope) requires, except that a merge target may have two or more incoming flows. A merge target is a User Task or embedded Sub-Process in a child body, with one outgoing flow, whose incoming flows are exactly the outputs of one Parallel fork after each output's branch has reduced to a single edge containing at least one User Task or Sub-Process. Its outgoing path reduces to a single edge ending at a None End of the same body. A body containing a merge target contains no further merge target below that target, so multiplicity is at most the fork's width. The 128-task bound applies to the multiplicity-weighted count: a task vertex downstream of a merge target counts once per fork branch.

Optional: User Task and Sub-Process merge targets in any child body at depths one to three, and nested scope-control structures inside a Sub-Process merge target's body.

Excluded: merge targets in the root body; incoming flows that do not all come from one fork's reduced branches; a fork output that reaches the merge target without a User Task or Sub-Process first; merge targets with more than one outgoing flow; a further merge target downstream of or inside a merge target; joins after a merge target; re-entry through cycles; data, locals and completion values; Service and other Tasks as merge targets or anywhere else; Exclusive, Inclusive and Event-Based Gateways; and every exclusion of the nested scope-control class.

The restrictions narrow admission only. The representation below does not assume a bounded multiplicity, a root position or a fork-only source, so cycles, data and wider merges can later broaden admission without reinterpreting an admitted model.

## Profile and public contract

The profile `cibseven-2.2.0-embedded-subprocess-completion-draft` grows in place under the [cumulative profile rule](../../contracts/README.md): every model it admits today keeps its exact admission, commands and observations. Start, User Task completion and every observation keep their wire shapes. Public task identity already carries a per-element activation: [`OccurrenceId`](../../packages/semantic-core/src/contract.ts) is `{ processInstanceId, elementId, activation }`, and the schema's `occurrenceId` matches. Two live occurrences of one User Task definition are therefore distinguishable without a new field, and a completion command addresses exactly one of them.

## Representation and runtime ownership

Lowering adds no opcode. For each merge target, lowering emits one existing `mergeExclusive` whose canonical inputs are the target's incoming Sequence Flow places and whose output is one synthetic control place; the target's operation reads that place. The synthetic place carries a new control-place origin `{ kind: "bpmnImplicitMerge", elementId: <target id> }` and the merge operation keeps the existing `bpmnElement` origin of the target. Control-place origins currently admit only `bpmnSequenceFlow`, so this is the one Program-shape change; it is additive, and no existing Program changes. The [IL contract](../SEMANTIC-PROCESS-IL-SPEC.md#exclusive-merge) already defines `mergeExclusive` as the owner-preserving BPMN Multi-Merge relation, one pass per offered token without synchronization or priority.

Runtime keeps its collections. `enterScope` creates the occurrence `(definitionScopeId, activation)` from the monotone per-element activation counter, so a second entry while an earlier occurrence of the same definition is live yields a fresh identity. Both languages currently refuse that second entry (TypeScript [`selectChildScopeEntry`](../../packages/semantic-core/src/semantic-process-scope-runtime.ts), Lean `enterScopeState?` in [`RuntimeState`](../../BpmnSemantics/SemanticProcess/RuntimeState.lean)), and both select a completing occurrence by definition, failing unless exactly one is live ([`ScopeCompletion`](../../BpmnSemantics/SemanticProcess/ScopeCompletion.lean)). This increment replaces those two selections: entry takes the token's owner as parent and always issues a fresh activation, and `completeScope` is prepared once per live occurrence of its definition and enabled exactly for the quiescent ones. Quiescence is already decided per occurrence. The parallel Multi-Instance frontier's `(operationId, owner)` addressing shows the intended shape, but it runs only for that profile and keeps its own guards.

Join counting needs no change, because the class admits no join after a merge target and every other join stays inside one occurrence. Under the branch condition, every closure starts from one Start or one task completion and offers at most one token to a merge, so `mergeExclusive` fires within the cycle profile's proven unique-offer subset and is the only enabled operation when it fires. Several occurrences of one definition never become enabled in one closure, because each becomes quiescent through its own task completion. An `ambiguousInternalChoice` on a retained journey fails acceptance.

## Runtime-only and synthetic constructs

| Construct | Derivation | Owner | Public projection | Lifecycle |
|---|---|---|---|---|
| merge control place | one per merge target, origin `bpmnImplicitMerge` with the target id | the target's definition scope | none | holds a token only inside one closure, between the merge pass and the target's activation |
| merge operation | the existing `mergeExclusive`, one per merge target | the target's definition scope | none | static Program element |
| second live occurrence | a fresh activation of an existing definition scope | the parent occurrence holding the arriving token | through its User Tasks' occurrence ids only | created by `enterScope`, removed only by its own `completeScope` |

## Admission

Admission stays [profile-parameterized](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md) and extends the nested scope-control composition owner in each language with one contraction rule, applied in child bodies only:

4. a Parallel fork whose two or more outputs each reduce to one edge that leads into the same merge target, which has exactly those incoming flows and whose outgoing path reduces to one edge into a None End, becomes a single End: an analysis sink, never a runtime join or completion rule.

Rules 1–3 apply unchanged, and a body admits when its contraction reaches Start, one edge and End. The burst bound charges a branch completion its existing `afterTask` steps plus one merge pass, and then the target's arming or its `enterScope` with the child entry burst. Because the target and its downstream chain run once per arriving token, the downstream resumption is charged per arrival, never summed across arrivals in one closure. The multiplicity-weighted task count must stay within 128 and every closure within `semanticProcessClosureLimit = 8`.

The nearest wrong algorithm treats the merge target as a join, which opens one occurrence after all branches arrive. The second nearest deduplicates arrivals while an occurrence is live. The third completes every live occurrence of a definition when one becomes quiescent.

## Stable rules

- `CEA-ADMIT-01`: profile admission is the existing admission or the nested scope-control class extended by rule 4 within the multiplicity-weighted task bound and the closure bound; every excluded construct is refused before Workflow start.
- `CEA-MERGE-01`: a token arriving on any incoming flow of a merge target passes alone. It neither waits for nor consumes tokens on the target's other incoming flows, and two arrivals give two passes.
- `CEA-OCCUR-01`: each pass into a Sub-Process target creates a fresh child occurrence owned by the arriving token's occurrence, even while another occurrence of that definition is live. Each pass into a User Task target creates a fresh task occurrence.
- `CEA-QUIESCE-01`: a child occurrence completes exactly when it owns no token, User Task or child occurrence, independently of other live occurrences of its definition. Its completion removes only that occurrence and emits one token at its parent output.
- `CEA-ISOLATE-01`: completing or progressing work in one occurrence leaves every other occurrence of the same definition, with its tasks and tokens, and every outside task unchanged.
- `CEA-REFUSE-01`: a command for a task of a completed occurrence is rejected with the committed state preserved, even while a live occurrence of the same definition owns a task of the same element.

## Separating witnesses

All differ at the public boundary of open User Tasks, with their activations, and Process status.

- A complaint model: the root runs *Investigation* and then *Respond to customer*. Investigation forks into *Check billing* and *Check delivery*, both flowing into the User Task *Log finding*, which ends at a None End. Completing *Check billing* opens *Log finding* (activation 1) beside *Check delivery*. Completing *Check delivery* opens a second *Log finding* (activation 2). Completing activation 2 leaves activation 1 open and *Respond to customer* absent, which appears only after both complete. A join mutant opens no *Log finding* after the first check. A deduplication mutant opens only one after both checks. A first-pass mutant completes Investigation after one *Log finding*.
- An audit model: the root runs *Audit* and then *Close audit*. Audit forks into *Review controls* and *Review payments*, both flowing into the Sub-Process *Remediation*, which ends at a None End. Remediation runs *Fix finding* and then *Verify fix*. Completing *Review controls* opens *Fix finding* (activation 1). Completing *Review payments* opens *Fix finding* (activation 2) while the first Remediation is live. Completing activation 2's *Fix finding* and *Verify fix* completes only the second Remediation: activation 1's *Fix finding* stays open and *Close audit* is absent. *Close audit* appears only after the first Remediation also completes. A wrong-occurrence mutant removes activation 1's work when the second Remediation completes, or opens *Close audit* early.
- Stale commands (`CEA-REFUSE-01`): completing activation 2's *Verify fix* again after the second Remediation completed, while activation 1's *Fix finding* is open, is rejected with the state unchanged.
- Reversed arrival and completion orders of each journey end in the same final observation, up to activation numbering, which follows command order.
- Refusals: a merge target in the root body; incoming flows from two different forks; a fork output straight into the merge target; a merge target with two outgoing flows; a join after a merge target; a merge target inside a merge target's body; a Service Task merge target; and a multiplicity-weighted task count over 128 are each refused before start.

## Lean assurance lane

Lane shape: proved

Evidence: concurrency families are `proved` under the owner direction of 2026-10-14. The two replaced selections need quantified laws, because their correctness for every admitted topology is exactly what this increment adds:

- `CEA-QUIESCE-01` and `CEA-ISOLATE-01` for completion: generalize [`completeScopeState_selected_update`](../../BpmnSemantics/SemanticProcess/ScopeCompletion.lean#completeScopeState_selected_update), [`completeScopeState_refuses_nonquiescent`](../../BpmnSemantics/SemanticProcess/ScopeCompletion.lean#completeScopeState_refuses_nonquiescent) and [`completeScopeState_preserves_unrelated_components`](../../BpmnSemantics/SemanticProcess/ScopeCompletion.lean#completeScopeState_preserves_unrelated_components) from the unique occurrence of a definition to a selected occurrence. Every component owned by another occurrence, including another occurrence of the same definition, is preserved. The if half stays a conformance check.
- `CEA-OCCUR-01`: a quantified freshness law for entry, stating that the issued occurrence differs from every live occurrence of its definition. It follows from the activation counter strictly exceeding every issued activation, an invariant the runtime well-formedness owner must state if it does not already.
- `CEA-MERGE-01`: the existing `mergeExclusive` relation and its unique-offer `fire?` result, specialized by conformance theorems on each journey.
- `CEA-ADMIT-01`: per-body `structureOrder_certificate` stays quantified; admission of each retained model and the refusal of each listed exclusion are fixed with `decide +kernel` under the [decision-procedure measurement rules](../CONTRIBUTOR-SETUP-GUIDE.md#lean-decision-procedures-and-build-memory).
- `CEA-REFUSE-01`: conformance theorems on the stale command.

The nearest unsupported claim is that every admitted definition completes under every arrival and completion order with sibling occurrences preserved. Progress over newly reachable states rests on the targeted preservation gate below, not on a theorem.

## Targeted preservation gate

Over every retained journey prefix in both arrival orders and both completion orders, the core gate establishes that every stable running state exposes a User Task or has completed. It also establishes that no closure yields `ambiguousInternalChoice`, that each closure stays within its computed bound and the longest reaches it, that each task completion leaves every other occurrence's open User Tasks unchanged, and that host admission accepts every reachable wait set.

## Temporal hosting and refinement preflight

Ingress stays Start and User Task Update. Waits remain concurrent passive User Tasks, which [host admission](../../packages/temporal-adapter/protocol/src/host-admission.ts) already admits for token splits without effect or Timer waits. Concurrent occurrences of one definition are Workflow state interpreted by the pure core, never Child Workflows. There is no new Timer, Activity, Signal, cancellation or projection mechanism, so the complete pipeline's Temporal target, with its isolation run and history replay, covers the new schedules without a separate refinement witness.

The preserved state relation is the nested scope-control relation extended to several live occurrences per definition. It preserves every occurrence's identity and parent, exact User Task occurrence ids including activations, token ownership, Process status, command classification and canonical trace. Workflow, Run, Update and history identities stay host facts. Ordering and deduplication of concurrent completions are decided by per-task-occurrence Update identity, which now distinguishes same-element tasks by activation. The checkpoint must show that a completion addressed to one activation cannot be delivered to another after recovery. The multiplicity-weighted bound keeps every reachable open-task set within the concurrent-wait ceiling hosting already carries. The profile admits no values, so publication bytes are fixed by the definition and the multiplicity-weighted task count; the checkpoint measures the largest retained model against the 192 KiB query and terminal ceilings of the [lifecycle specification](../TEMPORAL-PROCESS-LIFECYCLE-SPEC.md).

## Evidence and acceptance

The two models carry the witnesses as answer-free scenarios with registered pipeline cases and seeded join, deduplication, first-pass and wrong-occurrence mutations. They also get a corpus row, the About disclosure and a runnable Product 1 example. Acceptance requires:

- Lean, core and Temporal agree on every schedule in the complete pipeline;
- both languages refuse every listed exclusion;
- every model the profile admits today keeps its exact evidence;
- the [requirement ledger](../BPMN-REQUIREMENT-LEDGER.md) records `BPMN-MECH-FLOW-01` as profile-scoped for User Task and embedded Sub-Process merge targets.

## Versioning consequences

Under the [pre-release wire policy](../../contracts/README.md#evolution-policy), the Program schema gains the `bpmnImplicitMerge` control-place origin in every producer and consumer at once: the [Program schema](../../contracts/schemas/semantic-process.schema.json), both languages' codecs and Lean's origin type. No reader, counter or migration is added, and the profile identity and every existing Program stay byte-identical. Before the first edit, `node scripts/what-binds.ts` on every grown path names the binding guards and owner headroom. The decisive guards are listed here.

- Contract: [schema coverage](../../scripts/contract-schema-coverage.test.ts), [contract artifacts](../../scripts/contract-artifacts.test.ts) and the [IL contract](../SEMANTIC-PROCESS-IL-SPEC.md), whose lowering table, merge validation rule and exclusion of concurrent Multi-Merge execution change.
- Profile and registration: [capsule roundtrip](../../scripts/capsule-roundtrip.test.ts), [pipeline catalog](../../packages/differential/test/pipeline-catalog.test.ts), the [warm budget](../../scripts/pipeline-budget.ts) with its 130-case headroom, [product examples](../../packages/temporal-adapter/testkit/test/product-example-configs.test.ts), [requirement ledger consistency](../../scripts/requirement-ledger-consistency.test.ts) and the [executable model corpus](../../model-corpus/test/executable-model-corpus.test.ts).
- Hosting: [host admission](../../packages/temporal-adapter/testkit/test/host-admission.test.ts).
- Structure: [Lean import boundaries](../../scripts/lean-import-boundaries.test.ts), the [profile capability dispatch guard](../../scripts/lean-profile-capability-dispatch.test.ts) and [source hygiene](../../scripts/source-hygiene.test.ts).

### Owners this implementation grows

- Source: uncontrolled merge targets for this profile in [checked graph admission](../../packages/bpmn-source/src/checked-process-graph-admission.ts) and the merge lowering.
- TypeScript core: the [nested scope-control composition owner](../../packages/semantic-core/src/nested-scope-control-admission.ts) gains rule 4 and the weighted bound, and [scope runtime](../../packages/semantic-core/src/semantic-process-scope-runtime.ts) gains occurrence-addressed entry and completion.
- Lean: the nested scope-control admission owner, `RuntimeState` entry, `ScopeCompletion` and the control-place origin type, plus one new conformance owner.

Growth makes these passages false, and the implementation corrects them in the same change:

- the nested scope-control capsule's single-occurrence statement in its representation section and its reopen condition on a second live occurrence;
- the [embedded owner's](EMBEDDED-SUBPROCESS-COMPLETION-SPEC.md) exclusion of repeated or concurrent activation;
- the IL contract's exclusion of concurrent Exclusive Multi-Merge execution, which narrows to every profile but this one.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
