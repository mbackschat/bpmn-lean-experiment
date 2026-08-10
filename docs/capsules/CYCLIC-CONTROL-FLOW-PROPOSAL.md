# Resumption-bounded cyclic control flow proposal

## Status

**Draft; independent proposal review and owner approval are pending. No implementation is authorized.** This proposal opens the first M2 semantic increment after the required Lean admission-lane split. It does not claim implemented cycle support, BPMN Process Execution Conformance, CIB Seven cycle compatibility, unbounded Temporal history, or Continue-As-New.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `31dd294` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

## Question

May one root-scope BPMN Sequence Flow cycle be admitted when every directed cycle crosses an explicit User Task resumption boundary, using a converging Exclusive Gateway that passes through one alternative token without synchronization, while preserving finite automatic closure, exact repeated occurrence identity, stable-state resumability, and durable execution of every finite tested schedule?

The recommendation is **yes, under the exact profile, graph criterion, operation, proof obligations, and exclusions below**. This is the smallest cycle that exercises a real business interaction repeatedly and can still exit. It does not authorize arbitrary graph cycles, Activity loop characteristics, Multi-Instance, uncontrolled Activity fan-in, parallel tokens, or an iteration cap that would invent BPMN behavior.

## Selection basis

[PLAN.md](../PLAN.md#engine-backlog-behind-the-ladder) puts compositional admission with cycles first in M2 because acyclicity is currently a structural premise of reachability, closure, and stable-state laws. Replacing it is more fundamental than adding another source element to an acyclic graph.

The predecessor [compositional admission experiment](../archived/COMPOSITIONAL-BPMN-ADMISSION-PROPOSAL.md) proved reusable finite graph validation but deliberately excluded cycles and was superseded before production widening. The [profile-parameterized admission specification](../PROFILE-PARAMETERIZED-ADMISSION-SPEC.md) now owns the production mechanism: generic structural validation plus an exact profile capability. This proposal reopens that mechanism only at its recorded trigger, a profile that needs graph structure the universal acyclicity predicate rejects.

The first witness reuses the already approved User Task interaction, User Task completion-data patch, and Simple Boolean v1 condition language. It adds only the missing semantic mechanism, Exclusive Merge, and the missing structural premise, resumption-bounded cycle admission. A second new Event, Task, scope, value, or expression family would obscure whether those two mechanisms are sufficient and is excluded.

## Normative basis

BPMN 2.0.2 is the semantic authority for this capsule.

- Table 7.2 states that a Sequence Flow loop is formed by connecting a flow to an upstream object. This distinguishes graph-level looping from Standard Loop and Multi-Instance Activity characteristics, which remain outside this proposal.
- Clauses 10.6.2 and 13.4.2 define Exclusive Gateway merging and branching. The merging arm has pass-through behavior for alternative incoming paths, while each arriving token activates the gateway and is routed to one outgoing Sequence Flow.
- Table 13.2 classifies the behavior as Exclusive Choice, Simple Merge, and Multi-Merge. The selected slice uses Simple Merge under a proved one-token invariant. It does not claim the general multiple-token Multi-Merge case.
- Clauses 10.7.3, 13.3.2, and 13.3.3 retain the existing User Task activation and completion account. Re-entering the same User Task definition creates a fresh semantic occurrence; it does not reactivate or alias the completed occurrence.
- Clause 13.2 retains the existing Process completion condition. Taking the default exit reaches the None End Event and completes only when the root scope is quiescent.

The CMOF and XSD `ExclusiveGateway`, `Gateway.gatewayDirection`, `SequenceFlow`, `UserTask`, and `FlowNode.incoming`/`outgoing` facts constrain source shape. They do not by themselves define token behavior.

Open issue `BPMN21-268` concerns uncontrolled multiple incoming Sequence Flows on an Activity. This proposal avoids that account by requiring an explicit converging Exclusive Gateway. The issue is an exclusion discriminator, not semantic authority for the selected merge.

Two new reviewed requirement rows enter the [BPMN requirement ledger](../BPMN-REQUIREMENT-LEDGER.md): `BPMN-SEQUENCE-FLOW-CYCLE-01` and `BPMN-EXCLUSIVE-MERGE-01`. They remain `unsupported` until implementation and evidence closure.

## Selected account and rejected alternatives

The selected source shape is:

```text
None Start -> Exclusive Merge -> Review User Task -> Exclusive Choice
                 ^                                  | repeat
                 |                                  | rework
                 +----------------------------------+
                                                    | default
                                                    v
                                                None End
```

The representative schedule completes activation 1 with `route = "repeat"`, attempts one stale activation-1 completion after activation 2 is visible, completes activation 2 with `route = "rework"`, and completes activation 3 with a value that selects the default exit. Both conditional back-edges are therefore live evidence rather than decorative alternatives.

The competing accounts are:

1. **Delete acyclicity and trust the closure fuel.** Rejected. Fuel exhaustion would turn a structurally predictable internal livelock into a harness failure after Workflow start, and a larger fuel only moves the failure.
2. **Keep whole-graph acyclicity and add one exact topology exception.** Rejected. That recreates the whole-program disjunct architecture the profile-parameterized admission specification forbids.
3. **Treat multiple incoming Sequence Flows on the User Task as the merge.** Rejected. That selects uncontrolled Activity fan-in and repeated Activity creation, the exact account this proposal does not need.
4. **Widen `choose` to accept several inputs and one output mode.** Rejected. Merge and conditional choice have different enabling data and would become an optional mode bag over two transition families.
5. **Add `mergeExclusive` and replace whole-graph acyclicity only for a profile whose cycle cut is proved finite.** Selected.

## Exact source profile

One new immutable standards-only profile is registered as `bpmn-2.0.2-user-task-cycle-draft`. It selects one private executable root Process with:

- one None Start Event, one converging Exclusive Gateway, one User Task, one divergent Exclusive Gateway, and one None End Event;
- six distinct Sequence Flows with exact resolved source and target identities;
- the None Start Event at arity `0 -> 1` and the None End Event at `1 -> 0`;
- the converging Exclusive Gateway at arity `3 -> 1`, with `gatewayDirection` absent, explicitly `Unspecified`, or explicitly `Converging`, no default reference, and no condition expression on any incoming or outgoing flow; topology supplies the inferred direction when the declaration is absent or `Unspecified`;
- the User Task at arity `1 -> 1` and no assignment, form, data association, loop characteristic, or Multi-Instance characteristic;
- the divergent Exclusive Gateway at arity `1 -> 3`, with `gatewayDirection` absent, explicitly `Unspecified`, or explicitly `Diverging`, exactly two Simple Boolean v1 conditional Sequence Flows in XML declaration order, and one conditionless referenced default flow; topology supplies the inferred direction when the declaration is absent or `Unspecified`;
- exactly one definition scope, exact reference closure, unique producer and consumer ownership, full reachability from Start, full co-reachability to End, and the resumption-cut criterion below;
- no parser warning, foreign executable content, extension element, boundary Event, nested scope, Message, Timer, Service Task, parallel split, or second wait.

The profile pins a mechanism multiset and structural facts rather than source IDs or one serialized diagram. The representative fixture uses `route == "repeat"` and `route == "rework"` conditions, but arbitrary well-formed identifiers and the exact existing Simple Boolean string literals remain permitted. The profile does not expand the expression grammar.

All existing profiles retain the `acyclic` graph policy. Only `bpmn-2.0.2-user-task-cycle-draft` selects `resumptionBounded`, and its only admitted cut mechanism is the ordinary User Task lowered to `awaitUserTask`. A future cycle through Timer, Message, effect, boundary, scope, or called-Process continuation must extend this closed mapping through its own capsule.

## Checked graph and lowering

The checked graph gains one closed node alternative rather than an optional direction mode on the existing conditional gateway:

```ts
type CheckedExclusiveMerge = DeepReadonly<{
  kind: CheckedNodeKind.ExclusiveMerge;
  id: string;
  inputFlowIds: [string, string, string];
  outputFlowId: string;
}>;
```

Projection derives those identities from the resolved converging Exclusive Gateway and preserves their declared Sequence Flow identities. `inputFlowIds` is canonical-ID-sorted and its order has no transition meaning. Reordering XML declarations may change the canonical source digest but must not change the normalized checked graph or lowered program after identity normalization. A default reference, a condition, a fourth incoming flow, or a second outgoing flow rejects at source admission.

Lowering maps that node by endpoints to one reusable Semantic Process operation:

```ts
type MergeExclusiveOperation = OperationBase & DeepReadonly<{
  kind: SemanticOperationKind.MergeExclusive;
  inputs: [string, string, string];
  output: string;
}>;
```

The operation is a token mechanism, not a retained BPMN gateway object. It consumes exactly one token from exactly one input control place and produces exactly one token at the output with the same scope owner. It has no condition, default, selected-branch record, wait, variable mutation, occurrence, scheduler decision, or public projection.

If zero inputs carry a token, the operation is disabled. If more than one input carries a token, it is also disabled rather than choosing by input order. The selected profile proves that second state unreachable. General Multi-Merge behavior with concurrent arrivals therefore remains unsupported instead of being hidden behind a canonical sort.

## Resumption-bounded graph admission

The graph algorithm is profile-parameterized and identical in shape at checked-source and Semantic Process levels:

1. Keep the complete finite graph, exact references, ownership, one-producer/one-consumer control places, root Start and completion identities, reachability, and co-reachability checks.
2. For an `acyclic` profile, retain the existing saturation-certified whole-graph acyclicity check byte-for-byte in meaning.
3. For `resumptionBounded`, derive a cut graph by removing only the continuation edge produced after an operation in the profile's closed resumption set. This profile removes outgoing edges from the one `UserTask` / `awaitUserTask` pair.
4. Require saturation-certified acyclicity of that cut graph.
5. Require lowering to preserve every retained edge and the exact removed-edge classification. The checked graph and program validator decide the criterion independently; equality with lowering is an additional bridge, not the program validator's implementation.

For a finite graph, cut-graph acyclicity is equivalent to saying every directed full-graph cycle crosses at least one selected resumption edge. The removed edge is not an ignored transition: completing the exact active User Task is the explicit semantic stimulus that later produces its continuation token.

This criterion does not prove that a Process eventually exits. It proves that automatic internal evaluation cannot traverse a cycle without another admitted external stimulus. Termination is conditional on a finite input schedule that eventually selects the exit.

An internal-only cycle with the User Task outside the cycle is the primary negative graph witness. A cycle that crosses the same User Task but is stamped with any existing acyclic profile is the profile-isolation witness. A checked graph and a directly decoded Semantic Process program each receive independent versions of both witnesses.

## Runtime state and operation semantics

No runtime field is added for the merge or the loop. Existing control-place tokens carry exact Sequence Flow identity; existing `taskActivations` allocates the next ordinal for each User Task element; existing Process variables carry the selected completion patch; and existing canonical observations already publish the full active User Task occurrence.

The new transition family is `mergeExclusive`. Lean defines a declarative relation whose premise identifies exactly one owned token across the operation's distinct inputs and whose result removes that token and adds the same owner's token to the output. The executable Lean evaluator and independent TypeScript function each implement that relation, and each has a soundness bridge. Neither target imports, generates, or calls the other.

The selected profile has a one-token conservation invariant. `initiate` creates one token; `mergeExclusive`, `choose`, and a User Task completion move one token; `awaitUserTask` exchanges that token for one wait; and `reachNoneEnd` consumes the token before quiescent completion. No selected operation duplicates, synchronizes, spawns, calls, or interrupts. Consequently exactly one merge input can be live in every reachable state.

## Stable semantic rules

| Rule ID | Proposition |
|---|---|
| `CYCLE-ADMIT-01` | A profile may admit a cyclic full graph only when its profile-selected resumption cut is saturation-certified acyclic; every existing profile retains whole-graph acyclicity. |
| `CYCLE-MERGE-01` | With exactly one owned input token, `mergeExclusive` consumes that token and produces exactly one output token with the same owner, without synchronization or input-order choice. |
| `CYCLE-WAIT-01` | Each traversal of the reviewed User Task definition creates one fresh occurrence whose activation ordinal is exactly one greater than the preceding occurrence for that element. |
| `CYCLE-REPEAT-01` | Completing activation `n + 1` with either reviewed repeat value commits the completion data, routes through the corresponding conditional back-edge, and reaches exactly activation `n + 2` of the same User Task. |
| `CYCLE-EXIT-01` | After any finite number `n` of reviewed repeat completions, completing the live activation with a value selecting the default route reaches the None End Event and a terminal completed Process. |
| `CYCLE-REFUSE-01` | A completion addressed to any earlier activation is rejected with the current live occurrence, Process variables, activation counters, tokens, and command-independent observation unchanged. |
| `CYCLE-CLOSURE-01` | Every admitted internal closure is finite and stays within `semanticProcessClosureLimit = 8`; the representative start, repeat, and exit closures each require exactly three internal steps and fail under limit `2`. |
| `CYCLE-HOST-01` | The existing semantic-lifetime Temporal Workflow durably hosts the finite representative schedule, survives Worker replacement between activations, returns every accepted Update result, preserves occurrence identity, and replays its exact history. |

`CYCLE-EXIT-01` is quantified over a finite repeat count and does not assert unconditional termination. A schedule that keeps choosing a repeat edge is permitted to keep the Process running.

## Lean lane, laws, non-laws, and witnesses

The Lean lane is **proved**. It adds a cohesive `CyclicControlFlow` semantic module and a narrow conformance module rather than growing the admission umbrella with fixture bodies.

Required quantified or structural facts are:

- saturation-certified resumption-cut acyclicity implies every full-graph cycle contains a selected resumption edge;
- lowering preserves the cut classification and exact Exclusive Merge endpoints for the admitted checked graph;
- the `mergeExclusive` evaluator is sound with respect to its declarative relation;
- every reachable selected-profile state has total control-token plus live-User-Task cardinality one before terminal completion;
- exactly one merge input is offered whenever `mergeExclusive` fires;
- for every natural `n`, `n` reviewed repeat completions expose activation `n + 1`, and one following default-exit completion reaches the terminal state;
- stale occurrence refusal preserves the complete semantic state for every earlier positive activation ordinal;
- each start, repeat, and exit closure takes exactly three steps, while the selected profile's structural cut gives a general closure bound no greater than its six operations and therefore below the production limit eight.

Required checked non-laws and negative witnesses are:

- whole-graph termination does not follow from resumption-cut acyclicity;
- a synthetic state with tokens on two merge inputs has no `mergeExclusive` step and is not claimed to implement general Multi-Merge;
- an internal-only directed cycle is rejected even when another User Task is reachable elsewhere;
- the same resumption-crossing graph is rejected under every existing acyclic profile;
- a wrong, stale, or future activation cannot complete the current occurrence;
- closure limit two fails for each of the representative start, repeat, and exit boundaries;
- arbitrary uncontrolled Activity fan-in, parallel duplication before the merge, nested-scope cycles, and cycles through any unlisted wait family remain rejected.

The first Lean source change must build `SemanticProcessAdmissionConformance` narrowly under the recorded 3 GiB, one-thread, OS-enforced ceiling before any complete Lean gate. An OOM kill or a regression above that ceiling stops the implementation for another proof-ownership split; the ceiling is not raised to obtain green.

## Temporal hosting and refinement preflight

**Durable ingress.** Every loop decision arrives through the existing content-bound complete-User-Task Update. The semantic command names the full occurrence, including the activation ordinal, and the submitted string patch. No Signal, Activity, Child Workflow, Timer, or new SDK surface is added.

**Wait and stable state.** Each stable running prefix has exactly one passive User Task Update surface. The existing pre-start host capability may admit it without a new managed host class because no Timer, effect, event race, boundary deadline, concurrent wait set, or host-owned callback is reachable.

**Ordering and concurrency.** The semantic queue retains accepted Update order. The profile has one live occurrence, so no two distinct live tasks compete. An exact retry uses the existing content-bound Update ID and recovers its first semantic result. Reusing a command ID with another activation or patch remains an identity conflict rather than an alias.

**Worker replacement and replay.** The primary live witness starts the Process, completes activation 1 through the repeat edge, stops the Worker, accepts no command while the Worker is absent, starts a replacement Worker, recovers activation 2, proves the stale activation-1 refusal, traverses the second repeat edge, exits from activation 3, validates the terminal receipt, fetches history, and replays it. A direct-VM mutation that caches a task by BPMN element ID or resets its activation to `1` must fail before the full live gate.

**Effects, cancellation, and lifecycle.** The profile creates no effect and defines no cancellation. The Process Workflow remains one semantic lifetime and closes only after the default exit produces terminal semantic state and every accepted handler finishes.

**Continue-As-New and resource limit.** Continue-As-New remains excluded by the production lifecycle specification. The exact finite witness must keep `continueAsNewSuggested()` false and record its Event History count and size as operational evidence. The capsule does not promise an infinite physical history or set a semantic iteration limit. If the exact witness reaches the suggestion threshold, or closure evidence shows that a realistic finite platform schedule cannot remain below the service limit, implementation stops for a separate Continue-As-New lifecycle proposal carrying state, identity, deduplication, accepted-result, and replay obligations across Runs.

Temporal is refinement evidence for durability only. It executes the TypeScript semantic core and is not an independent choice of merge or loop meaning.

## Planned rule-to-evidence matrix

| Rule | BPMN/profile | Lean | CIB | TypeScript semantic core | Temporal | Negative and mutation evidence |
|---|---|---|---|---|---|---|
| `CYCLE-ADMIT-01` | New exact profile and both new ledger rows | Cut-cycle theorem, cut-preserving lowering, internal-cycle refusal | None | Independent checked and program graph validators | Pre-start rejection creates no Workflow | Old-profile cycle, internal-only cycle, and cut-classification mutation |
| `CYCLE-MERGE-01` | Clause 13.4.2 and Table 13.2 | Declarative relation, evaluator soundness, token conservation | None | Independent transition and focused state test | Executed only through the core | Zero-input, two-input, input-order, and synchronization mutations |
| `CYCLE-WAIT-01`, `CYCLE-REPEAT-01`, `CYCLE-EXIT-01` | User Task, Simple Boolean v1, and exact two-back-edge/default profile | Quantified repeat and exit theorems | No cycle claim | Quantified fixture helper plus exact scenario | Three live activations, Worker replacement, terminal receipt, replay | Element-ID cache, ordinal reset, wrong branch, and no-exit mutations |
| `CYCLE-REFUSE-01` | Existing exact occurrence contract | Quantified earlier-ordinal state preservation | Existing `CIB-OP-0001` only for the reused one-live-task mapping, not repetition | Full-state stale refusal | Durable stale Update result with unchanged Query | Element-ID-only completion mutation |
| `CYCLE-CLOSURE-01` | Resumption-bounded graph policy | Structural bound and exact three-step witnesses | None | Exact limit `3` success and `2` exhaustion at all three boundaries | No Workflow harness failure | Remove cut, bypass wait, and limit mutations |
| `CYCLE-HOST-01` | No host-defined BPMN rule | Same canonical finite schedule | None | Canonical reference trace | Live local server, exact history, replacement, result recovery, and replay | Cached occurrence direct-VM bypass and missing-history event |

The answer-free scenario contains source and input schedule only. Expected canonical results remain separate, and every registered target receives no oracle answer.

## Runtime-only and synthetic constructs

No new runtime-only construct is selected. The existing activation counter remains hidden monotonic semantic state and the existing User Task occurrence remains the public interaction identity. The merge exists only as immutable program data and an internal transition.

Synthetic states and programs are test-owned: a two-input merge state, an internal-only cycle, a cycle admitted under the wrong profile, a stale activation, and closure-limit-two executions. None is a scenario result or production recovery mode.

## Layer ownership

- BPMN 2.0.2 owns Sequence Flow cycling and Exclusive Gateway merge behavior.
- The standards profile owns the exact graph capability, Simple Boolean v1 consumer, cardinalities, one-token restriction, and exclusions.
- Checked-source admission owns parser warnings, exact source shape, references, arity, full reachability, co-reachability, and checked resumption-cut validation.
- Semantic Process IL owns `mergeExclusive`, control-place identity, program-level graph validation, and no source topology branch.
- Lean owns the declarative relation, evaluator, structural and quantified laws, and checked non-laws.
- The TypeScript semantic core independently implements the operation, admission, closure, occurrence, and result behavior.
- The Temporal adapter owns durable Update transport, one-Workflow lifecycle, Worker replacement, result recovery, history, and replay without defining merge, branch, or activation semantics.
- The BPM platform consumes the existing published task occurrence and command contract. It receives no new Product 2 code or private engine state from this capsule.

## Required, optional, and excluded

**Required.** The exact profile; both ledger rows; `ExclusiveMerge` checked node; `mergeExclusive` operation; profile-gated acyclic versus resumption-bounded graph policy; exact source, checked, lowering, schema, Lean, core, scenario, differential, product-example, Temporal, mutation, history, and replay evidence; immutable preservation locks for every existing accepted program; the proved Lean lane; one answer-free two-repeat schedule using both back-edges; the stale activation discriminator; and the closure cost record.

**Optional.** A second immediate-exit scenario is unnecessary because the quantified theorem covers zero repeats and the one registered schedule already exercises default exit. A non-gating local history-growth calibration over more finite repetitions may be retained as operational research if it remains under the focused 60-second test ceiling.

**Excluded.** Standard Loop Characteristics, Multi-Instance, Activity uncontrolled fan-in, concurrent Multi-Merge arrivals, implicit gateway direction that resolves to `Unspecified`, Mixed Gateways, more or fewer than three merge inputs, more than two conditional branches, a missing or conditional default, any expression language beyond Simple Boolean v1, numbers or Boolean Process variables, automatic variable mutation, parallelism, multiple live waits, scopes, Call Activities, Events, Message, Timer, Service Task, boundary behavior, cancellation, compensation, migration, Continue-As-New, cross-Run result lookup, production history compatibility, a semantic iteration limit, CIB cycle evidence, A12 adoption, platform task inbox or form work, and any BPMN conformance percentage.

## CIB relationship

No new CIB relationship is selected. BPMN 2.0.2 states the selected Exclusive Merge account, admitted source uses no CIB extension, the existing Temporal host needs no CIB observation, and the first M2 platform consumer needs only the standard mechanism. All five questions in the [CIB on-demand gate](../PLAN.md#cib-on-demand-gate) therefore answer no.

The profile may retain `CIB-AGR-0001` and `CIB-OP-0001` as inherited provenance for the reused one-live-User-Task lifecycle and host-task mapping. Those entries do not establish repeated activation, Exclusive Merge, Sequence Flow cycles, condition truth, or a CIB target for the scenario. No CIB runner case or retained CIB evidence is added.

## Preservation obligation and common-mode risks

The source-to-result claim at risk is: every source and Semantic Process program admitted before this capsule produces the same checked graph, lowered program, admission result, canonical Lean/core/Temporal trace, public occurrence identity, and durable replay result after cycle support lands. A profile that did not select cycles must not gain them merely because the generic validator learns the cut algorithm.

Immutable pre-implementation baseline `7529150bf3a83de7e36734cf8d401924a0811b7d` binds this obligation. Implementation must create a non-updatable ordinary-verification fixture containing the accepted checked and Semantic Process projections for every distinct registered scenario source and product-example source at that baseline, plus a closed profile-policy inventory proving every baseline profile remains `acyclic`. Existing answer-free scenarios and retained expected results remain the semantic result oracle; ordinary verification has no update flag.

The main common-mode risks are:

- checked and Semantic Process validators could call one shared faulty cycle predicate; Lean must implement its own graph and cut decision, while TypeScript directly decodes a hostile program that bypasses lowering;
- the checked wait and IL wait cut lists could drift; a closed cross-layer mapping guard must fail for an omitted, private, or extra cut kind and for a seeded replacement of `awaitUserTask` with an internal operation;
- source lowering and the program validator could agree on the same wrong merge endpoints; declaration-permutation equality, direct program counterexamples, and Lean lowering facts separate them;
- the core and Temporal share one evaluator, so Temporal is not semantic independence; its distinct claim is identity-preserving durability, exact Update result recovery, history, and replay;
- every target reuses the existing activation counter shape; a direct-VM element-ID cache and a reset-to-one mutation are required because final completion alone would not distinguish them;
- a finite witness can establish neither unconditional termination nor unbounded physical history. Both unsupported claims remain prominent rather than inferred from one completed schedule.

The nearest realistic counterexample is a graph whose only User Task lies on a path to completion while a separate reachable Choice/Merge subgraph cycles internally. Full reachability and co-reachability can still hold, but the resumption cut retains that internal cycle and must reject it in checked source, Lean, direct program admission, and pre-start Temporal admission.

## Versioning consequences

Pre-release replace-in-place policy applies. The checked-node and Semantic Process operation unions, their strict JSON Schemas, exact Lean decoders, TypeScript decoders, exhaustive switches, operation/profile capability tables, source compiler, lowerers, validators, scenarios, profiles, differential catalog, and Temporal fixtures change atomically. No compatibility reader, nullable field, legacy operation, or topology-specific runtime branch remains.

Existing serialized checked nodes, operations, identities, stimuli, runtime state, canonical observations, public commands, and completed receipts gain no field and retain their exact bytes. The new union alternatives and new profile ID widen the schema without changing old values. Existing disposable Temporal histories must all replay after the code change, but this capsule creates no durable production-history compatibility claim.

### Owners this implementation grows

`node scripts/what-binds.ts` produced these current figures at baseline `7529150`:

| Owner | Headroom to 600 nonblank lines | Consequence |
|---|---:|---|
| [checked-process admission](../../packages/bpmn-source/src/checked-process-admission.ts) | 52 | The graph-policy and arity work is expected to exceed the remaining headroom, so extract cohesive graph admission before adding semantics. This condition stops applying if a fresh measurement shows at least the complete estimated change plus 20 lines of review headroom. |
| [Semantic Process lowering](../../packages/bpmn-source/src/semantic-process-lowering.ts) | 78 | One merge arm may remain only while a fresh measurement keeps the owner at or below 600 and at one lowering responsibility. |
| [profile capability table](../../packages/semantic-core/src/semantic-process-profile.ts) | 118 | The new profile and graph policy fit only while the fresh post-change owner remains at or below 600; otherwise split checked and program capabilities by their existing two responsibilities. |
| [Semantic Process graph admission](../../packages/semantic-core/src/semantic-process-graph-admission.ts) | 154 | Resumption-cut validation is cohesive graph work and may remain while the owner stays below 600. |
| [Semantic Process contract](../../packages/semantic-core/src/semantic-process-contract.ts) | 239 | The one new operation alternative fits without extraction. |
| [Lean Semantic Process contract](../../BpmnSemantics/SemanticProcessContract.lean) | 154 | The checked and IL alternatives fit only while the owner remains below 600; a third responsibility is not added. |
| [Lean graph validation](../../BpmnSemantics/SemanticProcess/GraphValidation.lean) | 264 | The cut predicate is cohesive graph validation and has sufficient measured headroom. |
| [Temporal Workflow implementation](../../packages/temporal-adapter/workflow/src/workflow-implementation.ts) | 48 | No production change is planned. Any required growth must first extract trace or ledger lifecycle ownership instead of crossing 600. |

The new transition relation and runtime behavior belong in new cohesive `CyclicControlFlow` owners, not in the contract or graph modules. The checked-source extraction is a separate behavior-preserving commit with its focused gate before Red for the material feature.

### Guards and oracles

The implementation must enumerate these again with `node scripts/what-binds.ts` immediately before editing:

| Guard or oracle | Obligation |
|---|---|
| [document reviewability](../../scripts/document-reviewability.test.ts) | Recompute every owner figure and keep this proposal linked from both registries. |
| [requirement ledger consistency](../../scripts/requirement-ledger-consistency.test.ts) | Both new requirement IDs and capsule citations agree before either row can advance. |
| [contract schema coverage](../../scripts/contract-schema-coverage.test.ts) | Both new union alternatives reach exact schema branches and every old branch remains covered. |
| [pre-release architecture](../../scripts/pre-release-architecture.test.ts) | No exact topology predicate, legacy operation, or compatibility reader enters production. |
| [source hygiene](../../scripts/source-hygiene.test.ts) | Every hand-written owner stays within its responsibility and the 600-line review target. |
| [Lean source contracts](../../scripts/lean-source-contracts.test.ts) | New modules carry purpose documents, durable conformance facts have public theorem names, and every tactic-position `decide` uses `+kernel`. |
| [capsule roundtrip](../../scripts/capsule-roundtrip.test.ts) | The profile, scenario, expected result, and example registration land atomically. |
| [pipeline catalog](../../packages/differential/test/pipeline-catalog.test.ts) | The answer-free scenario has one declared target set, non-null Temporal relation, and a meaningful seeded mutation. |
| [BPMN XML validation](../../scripts/bpmn-xml-validation.test.ts) | The cyclic fixture remains valid against the pinned BPMN 2.0.2 schemas. |
| [normative reference resolution](../../scripts/normative-reference-resolution.test.ts) | Clauses 10.6.2 and 13.4.2 plus Tables 7.2 and 13.2 resolve to the tracked normative corpus. |
| [product example configs](../../packages/temporal-adapter/testkit/test/product-example-configs.test.ts) | The new profile has one executable runner example using the existing User Task driver. |
| [host admission](../../packages/temporal-adapter/testkit/test/host-admission.test.ts) | The cyclic passive-User-Task program is accepted while internal cycles and unselected profiles reject before Workflow start. |
| [verification entrypoint](../../scripts/verification-entrypoint.test.ts) | The complete gate continues to build generated TypeScript artifacts before directly importing them and runs the narrow Lean lanes through `scripts/lake.sh`. |

## Epistemic closure and cost boundary

The closure review must state exactly what is established: one root-scope, one-token Sequence Flow cycle crossing one ordinary User Task; one explicit Exclusive Merge; finite automatic closure; repeated exact occurrence identity; conditional repeat and default exit under Simple Boolean v1; stable resumability; and finite Temporal durability/replay.

The nearest unsupported claims are arbitrary cyclic graphs, unconditional termination, concurrent Multi-Merge, uncontrolled Activity fan-in, loops through another wait family, nested or called-scope cycles, Activity loop characteristics, Multi-Instance, migration, Continue-As-New, and unbounded production history.

Closure must compare its commit-bounded code and documentation cost in [the capsule cost ledger](../CAPSULE-COST-LEDGER.md) against the Exclusive Gateway condition capsule and the profile-parameterized admission increment, because those are the nearest changes to the same expression/control-flow and structural-admission layers. It must also record the admission-lane peak RSS and CPU under the standing 3 GiB bound and the exact live Temporal history count/size for the representative schedule. These are assurance costs and operational evidence, not BPMN semantics.

## Stop conditions

Stop for owner direction if:

- the full graph can traverse an internal cycle after cutting the selected User Task continuation;
- the selected profile can reach two live tokens or two merge inputs without adding a reviewed semantic-choice account;
- exact merge semantics require input-order selection, synchronization, or a runtime occurrence record;
- the first narrow Lean admission build does not fit the standing 3 GiB ceiling;
- a stable running state can be reached without an explicit User Task resumption surface;
- the exact live Temporal witness triggers Continue-As-New advice, cannot recover every accepted Update result, or cannot replay after Worker replacement;
- implementation needs a new expression form, value type, wait family, scope, Temporal mechanism, dependency, CIB observation, A12 source, or Product 2 private-engine access;
- an existing acyclic profile admits a cycle or an existing accepted projection/result changes;
- a semantic iteration cap is proposed to solve a host resource limit.

## Owner decisions required

1. **Approve the first M2 slice:** one root-scope User Task Sequence Flow cycle using both conditional back-edges and one default exit.
2. **Approve the new mechanism:** `ExclusiveMerge` lowers to `mergeExclusive`, which consumes exactly one alternative input token and rejects a multi-input state rather than selecting by order.
3. **Approve the admission replacement:** existing profiles remain whole-graph acyclic; only the new profile uses saturation-certified resumption-cut acyclicity with `UserTask` / `awaitUserTask` as its closed cut pair.
4. **Approve the proof boundary:** the Lean lane is proved, including cut soundness, evaluator soundness, one-token conservation, quantified repeated activation and exit, stale refusal, and the closure bound, while unconditional termination and general Multi-Merge remain checked non-laws.
5. **Approve reuse of existing data and expressions:** User Task completion writes the exact current string/null Process-variable patch, and Simple Boolean v1 reads it without grammar or value-domain expansion.
6. **Approve the host boundary:** one finite semantic-lifetime Temporal witness with Worker replacement and replay is required; Continue-As-New, cross-Run result lookup, unbounded physical history, and a semantic iteration cap remain excluded.
7. **Approve the standards-only evidence boundary:** no new CIB relationship, CIB runner target, CIB cycle claim, A12 adoption work, or Product 2 feature enters this capsule.
