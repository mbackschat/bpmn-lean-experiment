# Resumption-bounded cyclic control flow proposal

## Status

**Corrected proposal independently approved; owner re-approval pending.** Implementation remains paused until the owner approves the corrected condition-ownership and forward-compatible Multi-Merge account. This proposal opens the first M2 semantic increment after the required Lean admission-lane split. It does not claim implemented cycle support, BPMN Process Execution Conformance, CIB Seven cycle compatibility, unbounded Temporal history, or Continue-As-New.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `5789223` | `fork-turns-none` | `approve-with-required-edits` | `58417e0` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

The original proposal stage used four warm correction audits in the same reviewer thread. The automatic two-round bound stopped the stage after `88ad69c` and `0d9409e`; the owner explicitly authorized the third correction at `d1173b1` and the fourth correction content at `d5e221e`. Final audit target `d5e7bb9` closed every required finding in that target. The later condition-ownership correction changed reviewed semantic wording and therefore received a new cold proposal review at `5789223`; same-reviewer audit approved correction `58417e0` after it generalized the declarative merge relation, corrected the cardinality and ordering claims, and refreshed the post-extraction owner inventory.

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
- Clause 8.4.13 and Table 8.51 place an optional gating condition on the Sequence Flow itself: a token is placed on that flow only when its condition evaluates true. In this topology, the divergent Exclusive Gateway evaluates the conditions on its two outgoing back-edges before either token can arrive at the converging gateway.
- Clauses 10.6.2 and 13.4.2 define Exclusive Gateway merging and branching. The merging arm has pass-through behavior for alternative incoming paths, while each arriving token activates the gateway and is routed to one outgoing Sequence Flow.
- Table 13.2 classifies the behavior as Exclusive Choice, Simple Merge, and Multi-Merge. The selected slice reaches only the Simple Merge case under a proved at-most-one invariant. The reusable declarative relation preserves per-arriving-token Multi-Merge meaning, while executable choice among concurrent arrivals remains outside this profile.
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

Because both back-edges reconverge before the next stable public observation, branch correctness is bound one internal step earlier. A focused Lean and TypeScript post-`choose` oracle asserts the exact selected back-edge control place before `mergeExclusive` fires. A seeded mutation that swaps the two candidate outputs must fail this oracle even though the later stable User Task occurrence would otherwise look the same.

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
- the converging Exclusive Gateway at arity `3 -> 1`, with `gatewayDirection` absent, explicitly `Unspecified`, or explicitly `Converging`, no default reference, one conditionless Start-to-Merge input, two conditional Choice-to-Merge inputs already gated by the upstream divergent gateway, and one conditionless outgoing flow; topology supplies the inferred direction when the declaration is absent or `Unspecified`, and convergence does not re-evaluate either incoming condition;
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
}>;
```

The node kind is the checked converging classification; it carries only source identity. The authoritative `CheckedProcess.sequenceFlows` endpoints retain the three incoming and one outgoing Sequence Flow identities. Lowering derives the operation endpoints from those validated edges, canonical-ID-sorts the merge's input places, and does not create a second checked topology inventory. Merge input order has no transition meaning. Reordering semantically unordered declarations or either gateway's incoming/outgoing reference arrays may change the canonical source digest but must not change the normalized checked graph or lowered program after identity normalization. Process-level conditional Sequence Flow declaration order remains semantic and is preserved exactly in `choose.candidates`; the existing declaration-order source lock and overlapping-true semantic discriminator from the [Simple Boolean capsule](EXCLUSIVE-GATEWAY-CONDITION-SPEC.md) continue to prove first-true selection. A default reference, a condition on the Start-to-Merge or Merge-to-User-Task flow, a missing condition on either Choice-to-Merge back-edge, a fourth incoming flow, or a second outgoing flow rejects at source admission. Incoming conditions are validated as properties of the divergent gateway's outgoing Sequence Flows and do not become fields or decisions of `ExclusiveMerge`.

Lowering maps that node by endpoints to one reusable Semantic Process operation:

```ts
type MergeExclusiveOperation = OperationBase & DeepReadonly<{
  kind: SemanticOperationKind.MergeExclusive;
  inputs: [string, ...string[]];
  output: string;
}>;
```

The operation is a token mechanism, not a retained BPMN gateway object. Its reusable contract requires a nonempty collection of distinct input control places. The selected profile requires exactly three; input arity belongs to profile admission rather than the operation representation. For each offered token occurrence, the declarative relation has one transition that consumes that occurrence and produces exactly one token at the output with the same scope owner, without synchronization. It has no condition, default, selected-branch record, wait, variable mutation, occurrence, or public projection.

The selected profile proves that total owned token multiplicity across its three inputs never exceeds one, so its executable evaluator has a unique transition whenever the merge is enabled. Executable selection among several offered occurrences remains deliberately incomplete until a later profile either supplies an explicit semantic choice input or proves the possible steps observationally equivalent. That incompleteness does not change the declarative BPMN account: a multi-arrival state has one permitted pass-through transition per offered occurrence, not no transition. Canonical input sorting has no selection meaning.

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

The new transition family is `mergeExclusive`. Lean defines the general declarative relation over one selected offered token occurrence and its pass-through result. The executable Lean evaluator and independent TypeScript function implement the unique-offer subset needed by this profile, and each has a soundness bridge into that relation. Neither target imports, generates, or calls the other. Executable completeness for a state with several offered occurrences is deferred rather than represented as a semantic refusal.

The selected profile has an at-most-one active-unit invariant over control tokens plus live User Task occurrences. Initial and initiation-pending states have zero; `initiate` creates one token; `mergeExclusive`, `choose`, and a User Task completion move one token; `awaitUserTask` exchanges that token for one wait; and `reachNoneEnd` consumes the final token before quiescent completion. From successful initiation until that End consumption, the measure is exactly one. No selected operation duplicates, synchronizes, spawns, calls, or interrupts. Consequently exactly one merge input token is live whenever `mergeExclusive` can fire in a reachable selected-profile state.

## Stable semantic rules

| Rule ID | Proposition |
|---|---|
| `CYCLE-ADMIT-01` | A profile may admit a cyclic full graph only when its profile-selected resumption cut is saturation-certified acyclic; every existing profile retains whole-graph acyclicity. |
| `CYCLE-MERGE-01` | Each offered input token occurrence permits one condition-independent `mergeExclusive` pass-through that consumes that occurrence and produces exactly one output token with the same owner, without synchronization or input-order priority. The selected profile makes that transition unique by proving at most one offered occurrence reachable. |
| `CYCLE-WAIT-01` | Each traversal of the reviewed User Task definition creates one fresh occurrence whose activation ordinal is exactly one greater than the preceding occurrence for that element. |
| `CYCLE-REPEAT-01` | In the representative fixture, completing activation `n + 1` with either reviewed repeat value commits the completion data, routes through the corresponding conditional back-edge, and reaches exactly activation `n + 2` of the same User Task. |
| `CYCLE-EXIT-01` | In the representative fixture, after any finite number `n` of reviewed repeat completions, completing the live activation with a value selecting the default route reaches the None End Event and a terminal completed Process. |
| `CYCLE-REFUSE-01` | A completion addressed to any earlier activation is rejected with the current live occurrence, Process variables, activation counters, tokens, and command-independent observation unchanged. |
| `CYCLE-CLOSURE-01` | Every admitted internal closure is finite and stays within `semanticProcessClosureLimit = 8`; the representative start, repeat, and exit closures each require exactly three internal steps and fail under limit `2`. |
| `CYCLE-HOST-01` | The existing semantic-lifetime Temporal Workflow durably hosts the finite representative schedule, survives Worker replacement between activations, returns every accepted Update result, preserves occurrence identity, and replays its exact history. |

`CYCLE-REPEAT-01` and `CYCLE-EXIT-01` are fixture/program laws, not laws of every graph admitted by the structural profile. `CYCLE-EXIT-01` is quantified over a finite repeat count and does not assert unconditional termination. A schedule that keeps choosing a repeat edge is permitted to keep the Process running.

## Lean lane, laws, non-laws, and witnesses

The Lean lane is **proved**. It adds a cohesive `CyclicControlFlow` semantic module and a narrow conformance module rather than growing the admission umbrella with fixture bodies.

Required quantified or structural facts are:

- saturation-certified resumption-cut acyclicity implies every full-graph cycle contains a selected resumption edge;
- lowering preserves the cut classification and exact Exclusive Merge endpoints for the admitted checked graph;
- the `mergeExclusive` evaluator is sound with respect to its declarative relation;
- every reachable selected-profile state has total control-token plus live-User-Task cardinality at most one, with exact cardinality one from successful initiation until None End consumption;
- exactly one merge input is offered whenever `mergeExclusive` fires;
- for the representative program and every natural `n`, `n` reviewed repeat completions expose activation `n + 1`, and one following default-exit completion reaches the terminal state;
- stale occurrence refusal preserves the complete semantic state for every earlier positive activation ordinal;
- each start, repeat, and exit closure takes exactly three steps, while the selected profile's structural cut gives a general closure bound no greater than its six operations and therefore below the production limit eight.

Required checked non-laws and negative witnesses are:

- whole-graph termination does not follow from resumption-cut acyclicity;
- a synthetic state with tokens on two merge inputs, and a separate state with two same-owner tokens on one merge input, each exhibits the declarative per-occurrence pass-through relation while remaining unreachable under the selected profile; the executable evaluator's choice among multiple offered occurrences remains deliberately incomplete;
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
| `CYCLE-MERGE-01` | Clause 13.4.2 and Table 13.2 | General per-occurrence declarative relation, unique-offer evaluator soundness, selected-profile at-most-one invariant | None | Independent unique-offer transition, focused state tests, and selected-profile unreachability | Executed only through the core | Zero-input refusal, multi-input and same-input relational pass-through, selected-profile unreachability, input-priority, and synchronization mutations |
| `CYCLE-WAIT-01`, fixture-scoped `CYCLE-REPEAT-01`, fixture-scoped `CYCLE-EXIT-01` | User Task, Simple Boolean v1, and exact representative two-back-edge/default fixture | Quantified repeat and exit theorems over that program | No cycle claim | Quantified fixture helper, exact post-`choose` output-place oracle, and exact scenario | Three live activations, Worker replacement, terminal receipt, replay | Element-ID cache, ordinal reset, candidate-output swap, and no-exit mutations |
| `CYCLE-REFUSE-01` | Existing exact occurrence contract | Quantified earlier-ordinal state preservation | Existing `CIB-OP-0001` only for the reused one-live-task mapping, not repetition | Full-state stale refusal | Durable stale Update result with unchanged Query | Element-ID-only completion mutation |
| `CYCLE-CLOSURE-01` | Resumption-bounded graph policy | Structural bound and exact three-step witnesses | None | Exact limit `3` success and `2` exhaustion at all three boundaries | No Workflow harness failure | Remove cut, bypass wait, and limit mutations |
| `CYCLE-HOST-01` | No host-defined BPMN rule | Same canonical finite schedule | None | Canonical reference trace | Live local server, exact history, replacement, result recovery, and replay | Cached occurrence direct-VM bypass and missing-history event |

The answer-free scenario contains source and input schedule only. Expected canonical results remain separate, and every registered target receives no oracle answer.

## Runtime-only and synthetic constructs

No new runtime-only construct is selected. The existing activation counter remains hidden monotonic semantic state and the existing User Task occurrence remains the public interaction identity. The merge exists only as immutable program data and an internal transition.

Synthetic states and programs are test-owned: a two-input merge state and a two-token same-input merge state that exercise the general declarative relation plus selected-profile unreachability, an internal-only cycle, a cycle admitted under the wrong profile, a stale activation, and closure-limit-two executions. None is a scenario result or production recovery mode.

## Layer ownership

- BPMN 2.0.2 owns Sequence Flow cycling and Exclusive Gateway merge behavior.
- The standards profile owns the exact graph capability, Simple Boolean v1 consumer, cardinalities, one-token restriction, and exclusions.
- Checked-source admission owns parser warnings, exact source shape, references, arity, full reachability, co-reachability, and checked resumption-cut validation.
- Semantic Process IL owns nonempty-input `mergeExclusive`, per-arriving-token pass-through, control-place identity, program-level graph validation, and no source topology branch.
- Lean owns the declarative relation, evaluator, structural and quantified laws, and checked non-laws.
- The TypeScript semantic core independently implements the operation, admission, closure, occurrence, and result behavior.
- The Temporal adapter owns durable Update transport, one-Workflow lifecycle, Worker replacement, result recovery, history, and replay without defining merge, branch, or activation semantics.
- The BPM platform consumes the existing published task occurrence and command contract. It receives no new Product 2 code or private engine state from this capsule.

## Required, optional, and excluded

**Required.** The exact profile; both ledger rows; identity-only `ExclusiveMerge` checked node; `mergeExclusive` operation; profile-gated acyclic versus resumption-bounded graph policy; exact source, checked, lowering, schema, Lean, core, scenario, differential, product-example, Temporal, mutation, history, and replay evidence; the target-bound finite baseline catalog and direct-program invariant guards below; the proved Lean lane; one answer-free two-repeat schedule using both back-edges; the post-`choose` branch-binding discriminator; the stale activation discriminator; and the closure cost record.

**Optional.** A second immediate-exit scenario is unnecessary because the quantified theorem covers zero repeats and the one registered schedule already exercises default exit. A non-gating local history-growth calibration over more finite repetitions may be retained as operational research if it remains under the focused 60-second test ceiling.

**Excluded.** Standard Loop Characteristics, Multi-Instance, Activity uncontrolled fan-in, concurrent Multi-Merge arrivals, implicit gateway direction that resolves to `Unspecified`, Mixed Gateways, more or fewer than three merge inputs, more than two conditional branches, a missing or conditional default, any expression language beyond Simple Boolean v1, numbers or Boolean Process variables, automatic variable mutation, parallelism, multiple live waits, scopes, Call Activities, Events, Message, Timer, Service Task, boundary behavior, cancellation, compensation, migration, Continue-As-New, cross-Run result lookup, production history compatibility, a semantic iteration limit, CIB cycle evidence, A12 adoption, platform task inbox or form work, and any BPMN conformance percentage.

## CIB relationship

No new CIB relationship is selected. BPMN 2.0.2 states the selected Exclusive Merge account, admitted source uses no CIB extension, the existing Temporal host needs no CIB observation, and the first M2 platform consumer needs only the standard mechanism. All five questions in the [CIB on-demand gate](../PLAN.md#cib-on-demand-gate) therefore answer no.

The profile may retain `CIB-AGR-0001` and `CIB-OP-0001` as inherited provenance for the reused one-live-User-Task lifecycle and host-task mapping. Those entries do not establish repeated activation, Exclusive Merge, Sequence Flow cycles, condition truth, or a CIB target for the scenario. No CIB runner case or retained CIB evidence is added.

## Preservation obligation and common-mode risks

The source-to-result claim at risk is finite and explicit: every source in the baseline catalog below retains its checked graph, lowered program, admission result, canonical Lean/core/Temporal trace, public occurrence identity, and same-gate replay result after cycle support lands. This proposal does not claim to enumerate every Semantic Process program that callers could construct directly. A profile that did not select cycles must not gain them merely because the generic validator learns the cut algorithm.

Immutable pre-implementation baseline `7529150bf3a83de7e36734cf8d401924a0811b7d` binds this obligation. Before extraction or semantic implementation, the first implementation commit must add a non-updatable ordinary-verification artifact generated by building and running that exact baseline in an isolated export. Its closed catalog enumerates every distinct registered scenario source and product-example source at the baseline, binds each exact source/profile digest, and records its accepted checked projection, lowered program, and admission projection. Seeded source/profile hash, checked-projection, lowered-program, and admission-result mismatches must make ordinary verification fail; ordinary verification has no producer or update flag. Existing answer-free scenarios and retained expected results remain the semantic-result oracle.

Direct Semantic Process programs have separate invariant guards rather than a false universal snapshot claim. A closed baseline profile-policy inventory proves every baseline profile remains `acyclic`; direct hostile programs prove every old profile still rejects a resumption-crossing cycle and the new profile still rejects an internal-only cycle; existing-operation direct programs retain their current admission discriminator set; and schema/decoder coverage proves every old serialized union value remains byte-shaped and accepted or rejected under its existing rule. These guards are generated from the baseline profile and operation registries so a newly added or omitted entry fails the inventory.

The main common-mode risks are:

- checked and Semantic Process validators could call one shared faulty cycle predicate; Lean must implement its own graph and cut decision, while TypeScript directly decodes a hostile program that bypasses lowering;
- the checked wait and IL wait cut lists could drift; a closed cross-layer mapping guard must fail for an omitted, private, or extra cut kind and for a seeded replacement of `awaitUserTask` with an internal operation;
- source lowering and the program validator could agree on the same wrong merge endpoints; deriving the checked topology only from authoritative Sequence Flow endpoints, semantically unordered declaration-permutation equality, exact preservation of conditional Sequence Flow declaration order, direct program counterexamples, and Lean lowering facts separate them;
- the core and Temporal share one evaluator, so Temporal is not semantic independence; its distinct claim is identity-preserving durability, exact Update result recovery, history, and replay;
- every target reuses the existing activation counter shape; a direct-VM element-ID cache and a reset-to-one mutation are required because final completion alone would not distinguish them;
- a finite witness can establish neither unconditional termination nor unbounded physical history. Both unsupported claims remain prominent rather than inferred from one completed schedule.

The nearest realistic counterexample is a graph whose only User Task lies on a path to completion while a separate reachable Choice/Merge subgraph cycles internally. Full reachability and co-reachability can still hold, but the resumption cut retains that internal cycle and must reject it in checked source, Lean, direct program admission, and pre-start Temporal admission.

## Versioning consequences

Pre-release replace-in-place policy applies. The checked-node and Semantic Process operation unions, their strict JSON Schemas, exact Lean decoders, TypeScript decoders, exhaustive switches, operation/profile capability tables, source compiler, lowerers, validators, scenarios, profiles, differential catalog, and Temporal fixtures change atomically. No compatibility reader, nullable field, legacy operation, or topology-specific runtime branch remains.

Existing serialized checked nodes, operations, identities, stimuli, runtime state, canonical observations, public commands, and completed receipts gain no field and retain their exact bytes. The new union alternatives and new profile ID widen the schema without changing old values. Existing scenarios are re-executed and their newly created disposable histories replay within the same changed-code gate. No retained cross-version history corpus exists, so cross-version Temporal replay and durable production-history compatibility remain unclaimed; either would require a separately approved history corpus and policy change.

### Owners this implementation grows

The corrected identity-only checked representation was used to enumerate the complete existing change set. Two non-source contract artifacts must change: the strict [checked-process JSON Schema](../../contracts/schemas/checked-process.schema.json) gains the identity-only checked-node union branch, and the strict [Semantic Process JSON Schema](../../contracts/schemas/semantic-process.schema.json) gains the `mergeExclusive` operation branch. They are part of the planned `what-binds` path set but are outside the mechanically measured source-owner table because JSON contract artifacts have no 600-nonblank-line source headroom.

`node scripts/what-binds.ts` produced these current figures at corrected proposal target `5789223` for every existing source owner implementation must change. The target already contains the behavior-preserving graph-admission extraction:

| Owner | Headroom to 600 nonblank lines | Consequence |
|---|---:|---|
| [checked-process contract](../../packages/semantic-core/src/checked-process-contract.ts) | 390 | Add only the identity-only `ExclusiveMerge` union alternative; Sequence Flow endpoints remain the sole checked topology authority. |
| [checked-element projection](../../packages/bpmn-source/src/checked-element-projection.ts) | 255 | Classify the converging Exclusive Gateway and emit identity only; exact endpoint and arity validation remains in admission. |
| [checked-process admission](../../packages/bpmn-source/src/checked-process-admission.ts) | 290 | Add only profile mechanism/cardinality and source-shape capability; reusable graph policy remains delegated to the extracted graph owner. |
| [checked-process graph admission](../../packages/bpmn-source/src/checked-process-graph-admission.ts) | 328 | Add the profile-selected resumption cut beside the existing reusable ownership, reachability, co-reachability, arity, and acyclicity algorithms. |
| [checked-process graph-admission characterization](../../packages/bpmn-source/test/checked-process-graph-admission.test.ts) | 485 | Extend the direct owner test with the accepted resumption-crossing cycle and rejected internal-only cycle without moving profile policy into the test. |
| [Semantic Process lowering](../../packages/bpmn-source/src/semantic-process-lowering.ts) | 78 | One merge arm may remain only while a fresh measurement keeps the owner at or below 600 and at one lowering responsibility. |
| [contract artifact consistency](../../scripts/contract-artifact-consistency.ts) | 37 | Recognize the new operation's exact control-place uses. Grow only while the complete change retains at least 20 lines of review headroom; otherwise extract cohesive operation/place validation first. |
| [profile capability table](../../packages/semantic-core/src/semantic-process-profile.ts) | 118 | The new profile and graph policy fit only while the fresh post-change owner remains at or below 600; otherwise split checked and program capabilities by their existing two responsibilities. |
| [Semantic Process operation admission](../../packages/semantic-core/src/semantic-process-operation-admission.ts) | 176 | Validate distinct merge places, total shape, and profile capability without sharing graph-policy decisions. |
| [Semantic Process graph admission](../../packages/semantic-core/src/semantic-process-graph-admission.ts) | 154 | Resumption-cut validation is cohesive graph work and may remain while the owner stays below 600. |
| [Semantic Process contract](../../packages/semantic-core/src/semantic-process-contract.ts) | 239 | The one new operation alternative fits without extraction. |
| [Semantic Process runtime dispatcher](../../packages/semantic-core/src/semantic-process-runtime.ts) | 249 | Add one exhaustive dispatch arm to the new cohesive transition owner; do not place merge semantics in the dispatcher. |
| [Lean Semantic Process contract](../../BpmnSemantics/SemanticProcessContract.lean) | 154 | The checked and IL alternatives fit only while the owner remains below 600; a third responsibility is not added. |
| [Lean checked-process JSON decoder](../../BpmnSemantics/SemanticProcessJson/CheckedProcess.lean) | 379 | Decode the identity-only checked-node alternative exactly and reject duplicated endpoint fields. |
| [Lean Semantic Process JSON decoder](../../BpmnSemantics/SemanticProcessJson/Program.lean) | 192 | Decode the exact `mergeExclusive` operation shape and reject missing, extra, duplicated, or malformed places. |
| [Lean checked-process admission](../../BpmnSemantics/SemanticProcess/CheckedProcessAdmission.lean) | 302 | Admit the identity-only checked node only at exact `3 -> 1` arity and retain every existing per-node source invariant. |
| [Lean checked-graph validation](../../BpmnSemantics/SemanticProcess/CheckedGraphValidation.lean) | 503 | Recognize the new checked-node identity and replace unconditional checked-graph acyclicity only through the selected profile graph policy. |
| [Lean graph validation](../../BpmnSemantics/SemanticProcess/GraphValidation.lean) | 264 | The cut predicate is cohesive graph validation and has sufficient measured headroom. |
| [Lean lowering](../../BpmnSemantics/SemanticProcess/Lowering.lean) | 149 | Derive merge endpoints only from checked Sequence Flow endpoints and prove the exact cut correspondence. |
| [Lean profile admission](../../BpmnSemantics/SemanticProcess/ProfileAdmission.lean) | 339 | Admit the new checked node and operation only through the new exact profile capability. |
| [Lean program structural validation](../../BpmnSemantics/SemanticProcess/ProgramStructuralValidation.lean) | 314 | Validate merge place references, distinctness, producer/consumer ownership, and the selected graph policy. |
| [Lean scenario projection](../../BpmnSemantics/SemanticProcess/Scenario.lean) | 308 | Classify `mergeExclusive` exhaustively as exposing no public task, Message, timer, or effect wait. |
| [Lean transition dispatcher](../../BpmnSemantics/SemanticProcess/Transition.lean) | 303 | Add one exhaustive transition arm delegating to the cohesive cyclic-control-flow relation. |
| [Lean checked-source decomposition experiment](../../BpmnSemantics/Experiments/CheckedSourceDecomposition.lean) | 437 | Explicitly reject `ExclusiveMerge` so the frozen experiment surface does not acquire production cycle support. |
| [Lean checked-source transition experiment](../../BpmnSemantics/Experiments/CheckedSourceTransition.lean) | 301 | Classify `ExclusiveMerge` as disabled so the frozen experiment does not gain an unreviewed transition. |
| [Lean checked-source graph experiment](../../BpmnSemantics/Experiments/CheckedSourceGraph.lean) | 518 | Explicitly reject `ExclusiveMerge` in the frozen experiment's arity predicate. |
| [Temporal host admission](../../packages/temporal-adapter/protocol/src/host-admission.ts) | 401 | Classify `MergeExclusive` as passive so the host adds no scheduler, wait, or token-split capability. |
| [Temporal Workflow implementation](../../packages/temporal-adapter/workflow/src/workflow-implementation.ts) | 48 | No production change is planned. Any required growth must first extract trace or ledger lifecycle ownership instead of crossing 600. |

The new transition relation and runtime behavior belong in new cohesive `CyclicControlFlow` owners, not in the contract or graph modules. The checked-source extraction and its focused characterization are already committed at `c406575`; material cycle work grows the extracted owner rather than repeating that refactor.

### Guards and oracles

The implementation must enumerate these again with `node scripts/what-binds.ts` immediately before editing:

| Guard or oracle | Obligation |
|---|---|
| [document reviewability](../../scripts/document-reviewability.test.ts) | Recompute every owner figure and keep this proposal linked from both registries. |
| [requirement ledger consistency](../../scripts/requirement-ledger-consistency.test.ts) | Both new requirement IDs and capsule citations agree before either row can advance. |
| [contract schema coverage](../../scripts/contract-schema-coverage.test.ts) | Both new union alternatives reach exact schema branches and every old branch remains covered. |
| [contract artifact gates](../../scripts/contract-artifacts.test.ts) and [definition artifact gates](../../scripts/contract-definition-artifacts.test.ts) | The strict schemas, typed projections, control-place references, and exact checked-to-IL correspondence accept the new alternatives and reject endpoint drift. |
| [CIB observation fidelity](../../scripts/cib-observation-fidelity.test.ts) | The schema widening does not invent a CIB observation or extend any CIB relationship. |
| [checked-process graph admission](../../packages/bpmn-source/test/checked-process-graph-admission.test.ts) | The extracted graph owner admits only a resumption-crossing cycle under the selected policy and rejects an arity-valid connected internal cycle that remains after the cut. |
| [projected flow-element keys](../../packages/bpmn-source/test/projected-flow-element-keys.test.ts) | The converging Exclusive Gateway projector remains in the mechanically closed production consumer inventory and cannot regain a private source-key allowlist. |
| [metamodel default admission](../../packages/bpmn-source/test/metamodel-default-admission.test.ts) | Absent and explicit `Unspecified` gateway direction continue to use the pinned BPMN default and topology inference, without a local default override. |
| [A12 boundary](../../scripts/a12-boundary.test.ts) and [A12 preservation](../../scripts/a12-preservation.test.ts) | No retained A12 decision, source, profile, or adoption branch enters the standards-only profile or semantic owners. The frozen legacy projected-key and pipeline copies reported by `what-binds` are historical adoption evidence, are not edited, and are not gates for this non-A12 capsule. |
| [BPMN Error route consistency](../../packages/bpmn-source/test/bpmn-error-route-consistency.test.ts) | The shared artifact consistency owner retains exact existing route/place checks while adding the new operation. |
| [Semantic Process lowering](../../packages/bpmn-source/test/semantic-process-lowering.test.ts) | Checked Sequence Flow endpoints remain the sole merge-lowering authority, semantically unordered declaration and gateway-reference permutations leave merge lowering unchanged, and process-level conditional Flow declaration order remains exact in `choose.candidates`. |
| [differential pipeline](../../packages/differential/test/pipeline.test.ts) | Existing scenario results remain exact and the new answer-free scenario compares across all declared targets. |
| [capsule cost](../../scripts/capsule-cost.test.ts) | Closure records the exact commit-bounded code and documentation cost against the named comparison increments. |
| [BPMN corpus policy](../../scripts/bpmn-corpus-policy.test.ts) | The selected normative clauses and machine-readable artifacts remain pinned and verified. |
| [contributor setup](../../scripts/contributor-setup.test.ts) | New registered profile, fixture, and package-owned paths remain provisioned by the documented clean-machine setup. |
| [host interaction plan](../../packages/temporal-adapter/testkit/test/host-interaction-plan.test.ts) | The widened wire contracts do not add a host interaction or bypass the existing content-bound User Task Update. |
| [web definition API](../../platform/apps/web/test/definitions-api.test.ts), [web distribution](../../platform/apps/web/test/distribution.test.ts), [definition HTTP contracts](../../platform/contracts/test/definitions-http-contract.test.ts), [process-start contracts](../../platform/contracts/test/process-instance-start-contract.test.ts), [definition HTTP routes](../../platform/modules/definitions/test/definition-http-routes.test.ts), and [definition-start routes](../../platform/modules/definitions/test/definition-start-http-routes.test.ts) | The shared contract-tree change does not expose checked graph, IL, or Temporal-private fields through Product 2 APIs. |
| [Markdown links](../../scripts/markdown-links.test.ts) | Every new owner, registry, requirement, and evidence link resolves. |
| [normative reference resolution](../../scripts/normative-reference-resolution.test.ts) | Every selected BPMN clause, table, CMOF, and XSD reference resolves against the pinned corpus. |
| [pinned toolchain](../../scripts/pinned-toolchain.test.ts) | The expanded Lean and contract lanes continue to use only the declared toolchain and cache inputs. |
| [platform product boundary](../../scripts/platform-product-boundary.test.ts) | The semantic increment remains in Product 1 and exports no private engine state to Product 2. |
| [pnpm project config](../../scripts/pnpm-project-config.test.ts) | Package ownership and build order remain declared through normal workspace manifests and root scripts. |
| [pre-release architecture](../../scripts/pre-release-architecture.test.ts) | No exact topology predicate, legacy operation, or compatibility reader enters production. |
| [run-command policy](../../scripts/run-command.test.ts) | New direct command examples remain bounded, reproducible, and use the repository wrappers. |
| [source hygiene](../../scripts/source-hygiene.test.ts) | Every hand-written owner stays within its responsibility and the 600-line review target. |
| [Lean source contracts](../../scripts/lean-source-contracts.test.ts) | New modules carry purpose documents, durable conformance facts have public theorem names, and every tactic-position `decide` uses `+kernel`. |
| [semantic review packet](../../scripts/semantic-review-packet.test.ts) | Checkpoint and closure packets route every changed semantic owner and retain immutable gate evidence. |
| [Temporal package boundary](../../scripts/temporal-package-boundary.test.ts) | The Workflow continues to consume only published semantic contracts, and no client, Worker, or testkit dependency crosses into the semantic core. |
| [what-binds](../../scripts/what-binds.test.ts) | The complete planned path set above continues to resolve its current owners, guards, registries, and headroom without a private inventory. |
| [capsule roundtrip](../../scripts/capsule-roundtrip.test.ts) | The profile, scenario, expected result, and example registration land atomically. |
| [pipeline catalog](../../packages/differential/test/pipeline-catalog.test.ts) | The answer-free scenario has one declared target set, non-null Temporal relation, and a meaningful seeded mutation. |
| [BPMN XML validation](../../scripts/bpmn-xml-validation.test.ts) | The cyclic fixture remains valid against the pinned BPMN 2.0.2 schemas. |
| [normative reference resolution](../../scripts/normative-reference-resolution.test.ts) | Clauses 10.6.2 and 13.4.2 plus Tables 7.2 and 13.2 resolve to the tracked normative corpus. |
| [product example configs](../../packages/temporal-adapter/testkit/test/product-example-configs.test.ts) | The new profile has one executable runner example using the existing User Task driver. |
| [host admission](../../packages/temporal-adapter/testkit/test/host-admission.test.ts) | The cyclic passive-User-Task program is accepted while internal cycles and unselected profiles reject before Workflow start. |
| [verification entrypoint](../../scripts/verification-entrypoint.test.ts) | The complete gate continues to build generated TypeScript artifacts before directly importing them and runs the narrow Lean lanes through `scripts/lake.sh`. |

The four registries reported by the expanded command, [shared contracts](../../contracts/README.md), [BPMN source](../../packages/bpmn-source/README.md), [semantic core](../../packages/semantic-core/README.md), and [Temporal adapter](../../packages/temporal-adapter/README.md), must describe the resulting boundary when implementation closes. Generic guards that match every package, contract, script, or Lean path are named here once rather than repeated for each owner.

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
2. **Approve the new mechanism:** identity-only `ExclusiveMerge` derives its endpoints from checked Sequence Flows and lowers to nonempty-input `mergeExclusive`, whose declarative relation passes through each arriving token occurrence without synchronization. The selected profile requires exactly three inputs and proves at most one offered occurrence reachable; executable choice for general multiple arrivals remains deferred rather than being defined as no transition.
3. **Approve the admission replacement:** existing profiles remain whole-graph acyclic; only the new profile uses saturation-certified resumption-cut acyclicity with `UserTask` / `awaitUserTask` as its closed cut pair.
4. **Approve the proof boundary:** the Lean lane is proved, including cut soundness, general per-occurrence merge relation, unique-offer evaluator soundness, the selected profile's at-most-one invariant and phase-specific exact-one result, quantified repeated activation and exit, stale refusal, and the closure bound. Unconditional termination and executable choice among concurrent Multi-Merge arrivals remain deliberately open.
5. **Approve reuse of existing data and expressions:** User Task completion writes the exact current string/null Process-variable patch, and Simple Boolean v1 reads it without grammar or value-domain expansion.
6. **Approve the host boundary:** one finite semantic-lifetime Temporal witness with Worker replacement and replay is required; Continue-As-New, cross-Run result lookup, unbounded physical history, and a semantic iteration cap remain excluded.
7. **Approve the standards-only evidence boundary:** no new CIB relationship, CIB runner target, CIB cycle claim, A12 adoption work, or Product 2 feature enters this capsule.
