# Parallel fork/join observable contract

## Status

**Evidence-closed draft contract.** The bounded normative profile, checked source/lowering, Lean and independent TypeScript semantic implementations, canonical balanced and live-sibling CIB observations, production-lifecycle Temporal refinement/replay witnesses, and current differential gate implement this capsule. No immutable production deployment/history compatibility baseline is approved; profile-artifact immutability is a narrower calibration property defined in the [profile registry](../../profiles/README.md).

This capsule defines the observable contract for one private executable `None Start Event → Parallel Gateway fork → two distinct User Tasks → Parallel Gateway join → None End Event` Process. The approved account follows normative per-incoming-Sequence-Flow BPMN behavior. The current CIB User Task profile is not expanded to claim parallel compatibility; observed pinned-CIB count behavior may be retained later only in an explicitly separate compatibility profile.

## Question

What must be observable when one Parallel Gateway creates two concurrent User Task occurrences and a second Parallel Gateway synchronizes them, without prescribing an implementation's hidden token representation, evaluator visit order, or internal microstep count?

## Source basis

BPMN 2.0.2 Clause 10.6.4 says a converging Parallel Gateway waits for all incoming flows before triggering its outgoing flow. Clause 13.4.1 and Table 13.1 make the token rule exact: the gateway is activated only when at least one token is offered on each incoming Sequence Flow; activation consumes exactly one token from each incoming Sequence Flow and produces exactly one token on each outgoing Sequence Flow. Excess offered tokens are not consumed by that activation. Figure 13.3 supplies the canonical fork/join shape.

The normative machine-readable model defines `ParallelGateway` as a specialization of `Gateway` and represents a Flow Node's incoming and outgoing connections as references to `SequenceFlow` elements. The gateway adds no attribute that weakens the per-incoming-flow activation condition.

Two open OMG issues constrain nearby readings without changing that rule. [BPMN21-268](https://issues.omg.org/issues/BPMN21-268) records that multiple uncontrolled incoming Sequence Flows can activate an Activity multiple times, which supplies the smallest way to create two arrivals through the same join input. [BPMN21-429](https://issues.omg.org/issues/BPMN21-429) records an ordering inconsistency between prose and the CMOF model for `FlowNode.outgoing`; it warns against deriving canonical public array order from an incidental model or evaluator order. Neither issue permits two arrivals through one incoming Sequence Flow to substitute for a missing token on another incoming Sequence Flow.

## CIB relationship

The project records [CIB-DEV-0001](../CIB-BPMN-RELATION-REGISTER.md#cib-dev-0001--parallel-join-activates-from-duplicate-arrivals-through-one-incoming-flow) as a **candidate deviation**. At the pinned CIB Seven `2.2.0` release, the bounded [parallel-gateway probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenParallelGatewayProbeTest.java) deploys a schema-valid [separating model](../../runners/cibseven/src/test/resources/org/bpmnlean/cibseven/CibSevenParallelGatewayProbeTest.duplicateSameFlow.bpmn). Two instances of `User_Left_Merge` send two executions through `Flow_Left_Join`; `User_Right` remains active, so `Flow_Right_Join` has supplied no arrival; nevertheless CIB creates `User_After_Join`.

The observation agrees with the pinned source implementation, which compares the number of inactive concurrent executions at the gateway with the number of incoming transitions rather than retaining the incoming transition that supplied each execution. This is executable compatibility evidence, not project semantic authority.

The balanced A-then-B and B-then-A scenarios now have immutable content-bound raw task-query observations, a mutation-sensitive canonical projection, and exact pinned-CIB final agreement with the normative account. Those positive cases establish `CIB-AGR-0003`; they cannot separate per-incoming-flow semantics from the pinned engine's arrival-count behavior because both accounts agree on balanced input. The classification remains candidate rather than confirmed because the duplicate-left/no-right research probe itself is not yet an answer-free immutable evidence artifact with the complete compatibility-impact treatment. Parser and fixture-shape explanations are excluded by BPMN 2.0.2 XSD validation and the exact engine observation; task-query ordering and project canonicalization cannot explain whether `User_After_Join` exists.

The retained [live-sibling stale evidence](../../scenarios/parallel-fork-join/stale-a-while-b-active.cibseven-evidence.json) is bound to the exact third answer-free scenario and the unchanged parallel profile. CIB engine observations establish that A is no longer live after its real completion while B remains live before and after the stale A attempt; structured occurrence identity and canonical sorting remain adapter-derived through `CIB-OP-0001`. The profile names `CIB-AGR-0002` and `CIB-OP-0001` for this User Task behavior. A seeded projection mutation removes B after the stale attempt and must fail, so the retained evidence is sensitive to the live-sibling fact rather than only to rejection.

## Approved semantic rules

The identifiers below are stable traceability labels for the maintained propositions.

| Rule | Approved proposition |
|---|---|
| `PAR-FORK-01` | Activating the fork consumes one offered token from its single incoming Sequence Flow and offers exactly one token on each of its two outgoing Sequence Flows. |
| `PAR-WAIT-01` | Internal closure after start reaches a stable running state with exactly one active occurrence of User Task A and exactly one active occurrence of User Task B. |
| `PAR-JOIN-READY-01` | The join is ready only if every incoming Sequence Flow offers at least one token; total arrival count without incoming-flow provenance is insufficient. |
| `PAR-JOIN-CONSUME-01` | One join activation consumes exactly one token from each incoming Sequence Flow, retains every excess offered token, and offers exactly one token on each outgoing Sequence Flow. |
| `PAR-ORDER-01` | Completing A then B and completing B then A reach equivalent final stable state and canonical state observation; their command traces are not byte-identical because submitted command order and the intermediate remaining task differ. |
| `PAR-PROJECT-01` | Canonical task and enabled-interaction arrays use semantic order `(processInstanceId, elementId, activation)`; `activeWaits` is grouped per `(kind, elementId)` and preserves multiplicity within that element. Internal tokens or partial join offers are absent from the stable canonical state projection. |
| `UTASK-REFUSE-02` | Repeating completion for A under a distinct semantic command ID after A completed is rejected without reactivation while B keeps the Process semantically active. This is the unchanged User Task proposition owned by the [User Task capsule](USER-TASK-INTERACTION-SPEC.md). |

The contract intentionally says “equivalent final stable state and canonical state observation,” not “identical traces.” The first completion is a committed command boundary and therefore produces an observable stable running state. That state exposes the one remaining open task and its enabled completion interaction, but not the completed branch's hidden offer at the join.

For two distinct User Task elements, the stable state contains two `activeWaits` entries with multiplicity `1`, not one aggregate entry with multiplicity `2`. Repeated instances of the same element would increase that element's multiplicity, but allocation of activation ordinals across loops or multi-instance execution is outside this capsule. This model cannot distinguish “ordinal per branch” from “ordinal per Process instance,” because distinct A and B elements both receive activation `1`.

## Observable contract

Let the admitted Process instance be `Instance_1`, the two User Task element IDs be `User_A` and `User_B`, and both first occurrences have activation `1`.

### Stable state after start

- Process status is `running`.
- `openUserTasks` contains exactly `(Instance_1, User_A, 1)` and `(Instance_1, User_B, 1)`, sorted by the semantic tuple rather than engine query order, creation order, source order, or evaluator branch order.
- `activeWaits` contains `User_A/userTask/1` and `User_B/userTask/1`, sorted by `(kind, elementId)`.
- `enabledInteractions` contains exact completion interactions for the same two task occurrences in the same semantic identity order.
- Logical time is unchanged.
- No fork token, branch token, join offer, evaluator cursor, or CIB execution identity appears in the canonical state.

### Stable state after completing A first

- The exact A completion command is `committed`.
- Process status remains `running`.
- Only `(Instance_1, User_B, 1)` remains in `openUserTasks`, `activeWaits`, and `enabledInteractions`.
- The arrival from A may exist in hidden semantic runtime state, but it is not a public wait and is not projected into canonical state.
- The join has not fired and the Process has not completed.

The B-first case is symmetric, with only A remaining.

### Stable state after stale A while B remains active

- A has completed and only B remains open.
- A distinct completion command for occurrence `(Instance_1, User_A, 1)` is `rejected`.
- The running state before and after rejection is identical: B remains the only open task and enabled completion interaction.
- Because the Process is still semantically active, ordinary sequential Temporal Update ingress reaches the semantic core and returns the same semantic rejection as CIB Seven, Lean, and the TypeScript core.

### Stable state after completing both

- Both accepted completion commands are `committed`.
- The join fires once for the balanced two-branch witness.
- Process status is `completed`.
- `openUserTasks`, `activeWaits`, and `enabledInteractions` are empty.
- A-then-B and B-then-A have equivalent final semantic state and canonical state observation.

Canonical task order is a project semantic decision because CIB's `TaskQuery.list()` has no default ordering guarantee when no `orderBy` clause is supplied; the pinned [`Task.xml`](https://github.com/cibseven/cibseven/blob/834a9874760de8a0107f7c1b32806e37f17fb017/engine/src/main/resources/org/cibseven/bpm/engine/impl/mapping/entity/Task.xml) appends ordering only through the query's optional `orderBy` fragment. The oracle adapter must sort after deriving semantic identities; it must not treat database return order as engine-observed BPMN behavior.

## Competing accounts and separating witnesses

| Question | Approved account | Rejected or still-provisional account | Separating witness |
|---|---|---|---|
| Join readiness | At least one offered token for every incoming Sequence Flow | Total arrivals at gateway equals or exceeds incoming-flow count | Two arrivals through left input and none through right must not activate the join |
| Concurrency | Multiplicity-preserving concurrent activations | One linear active-node cursor | Start must expose A and B simultaneously |
| Completion order | Explicit semantic choice permits either external completion order and both commute at final state | Evaluator branch order silently becomes semantic order | Compare A-then-B with B-then-A |
| Intermediate observation | First completion reaches a stable command boundary with only the other User Task exposed | Hide the intermediate state or expose an internal join offer as a public wait | Observe after the first acknowledged completion |
| Public collection order | Sort semantic task identities deterministically | CIB query order, source order, creation order, or evaluator visit order | Reverse engine task return order without changing canonical result |
| Wait multiplicity | Group by wait kind and element ID, preserving repeated occurrence count per element | Aggregate unrelated User Task elements into one multiplicity | Start has two wait entries, each multiplicity `1` |
| Excess offers | Consume one token per incoming flow and retain excess | Clear all offers whenever the join fires | Supply two left and one right token; one left token remains after one join activation |
| Lean input | Decode the admitted checked BPMN graph and Semantic Process program, recompute lowering, and validate exact equality before evaluation | Match scenario identity/content while executing a separately compiled definition | Change the checked graph or lowered program without changing scenario commands and require Lean admission to fail |

The checked nearest non-law is: “a Parallel Gateway with two incoming Sequence Flows is ready whenever two executions have arrived at the gateway.” The duplicate-left/no-right witness must falsify it.

## Approved representation decision

The contract is precise without fixing internal microstep count, explicit versus implied tokens, stored versus recomputed join readiness, internal closure bound, or evaluator branch visit order. The project therefore uses asymmetric representation independence:

- the TypeScript semantic core uses explicit flow-identified tokens or offers because they make multiplicity, provenance, and mutation points direct;
- Lean retains a declarative relation plus an executable evaluator, with a flow-indexed runtime chosen for proof usefulness rather than copied from TypeScript;
- this capsule prescribes observable behavior and the information-preservation invariants needed to prove it, not one shared runtime representation.

Different representations reduce common-mode representation mistakes; they do not create an independent semantic account. Both remain transcriptions of the same approved capsule. A Lean relation and evaluator are also not two representations: they are a permitted-transition account and one executable selector over that account.

The honest cost is maintaining and reviewing two runtime shapes, adjudicating early typed disagreements, and accepting that proof intuitions will not transfer mechanically. Better prose alone is not an equivalent safeguard: a second representation mechanically exposes distinctions the author did not know to name. On disagreement, neither side is patched to the other: the applicable BPMN clause, smallest CIB separator, relationship classification, and capsule rule decide both implementations.

Reconsider this decision if a material rule cannot be stated or proved without prescribing a shared hidden structure. The provisional representation spike contributes useful discriminators and information-preservation requirements, but its general node, scope, token, and wait types remain experimental and must not be transplanted wholesale.

## Source and Semantic Process IL boundary

The bounded source compiler admits exactly the reviewed fork/join topology with two distinct User Tasks and resolved Sequence Flows. The [Semantic Process IL specification](../SEMANTIC-PROCESS-IL-SPEC.md) owns the checked source graph, `initiate`, `awaitUserTask`, `duplicate`, `synchronize`, `reachNoneEnd`, and `completeScope` operations, lowering rules, well-formedness, and growth constraints.

No topology-specific executable representation or evaluator path remains. The independent TypeScript semantic core admits exactly the sequential graph or the balanced two-task parallel graph and executes every supported operation without delegating to topology-specific logic. This does not authorize a general BPMN compiler, universal semantic language, general scope algebra, or arbitrary graph execution.

Lean consumes the exact admitted checked graph and Semantic Process program produced once for the scenario rather than compiling a second definition into its module. The bounded obligations are:

1. decode and validate only the current checked graph and Semantic Process program shapes using the pinned Lean toolchain's existing JSON support;
2. validate exact node kinds, identities, flow references, fork/join arity, and bounded topology before lowering;
3. recompute canonical lowering in Lean and reject any inequality with the emitted program;
4. keep the declarative relation and evaluator over Lean-owned semantic types rather than executing raw JSON;
5. state and review the source-to-program preservation obligation before implementing the lowerer;
6. bind the exact checked graph and program content so the differential harness rejects definition drift as well as scenario drift;
7. reject unsupported topology explicitly and add no dependency or general semantic-description language.

The same Semantic Process program must be supplied to the TypeScript semantic core and each isolated Temporal execution. CIB continues to execute the exact source bytes, with source/profile binding checked by the surrounding evidence pipeline.

## Lean laws and evidence plan

This runtime-transition family maintains a declarative relation separate from the executable evaluator and a theorem that every evaluator-produced transition is admitted by that relation. That soundness bridge does not establish completeness, determinism, BPMN fidelity, TypeScript correspondence, or CIB compatibility.

The checked Lean laws and independent TypeScript witnesses establish:

- start closure creates exactly the two branch waits and no other public wait;
- before both incoming-flow conditions hold, no evaluator step crosses the join;
- one join activation consumes exactly one offer per incoming flow and preserves excess multiplicity;
- exact completion removes only the named active occurrence;
- A-then-B and B-then-A terminate in equivalent final stable state under exact distinct-task hypotheses;
- canonical projection is invariant under permutation of internal task/token storage.

The executable Lean scenario closure resolves the only admitted multiple-enabled internal state after the fork by selecting the canonical first operation only when the enabled pair consists of distinct User Task operations with distinct inputs, outputs, and task identities. A checked theorem requires both activation orders to have the same stable public observation, and the exact start-closure theorem locks the resulting two-task waiting state. Every other multiple-enabled state remains a harness failure requiring an explicit semantic choice.

Maintained negative and mutation evidence includes:

- the duplicate-left/no-right non-law witness;
- erasing parallel control-place incoming-flow provenance is rejected by Lean's lowering-equality gate;
- reversing CIB task-query order leaves the canonical result unchanged;
- omitting one of the distinct projected tasks makes the CIB evidence projection and four-target comparison fail;
- removing live sibling B from the post-stale CIB projection makes the content-bound evidence guard fail;
- the stable intermediate observations demonstrate that a partial join offer does not enter canonical state;
- changing the admitted executable topology without changing the scenario is detected by the Lean input binding.

## Rule-to-evidence matrix

The cells below remain distinct claims. CIB's balanced positive cases do not establish the per-incoming-flow negative rule, and Temporal is a refinement lane over the TypeScript core rather than a second semantic implementation.

| Rule | Normative/profile | Lean | Pinned CIB Seven | Independent TypeScript | Temporal refinement | Negative or mutation guard |
|---|---|---|---|---|---|---|
| `PAR-FORK-01` | [Source basis](#source-basis) and [parallel draft profile](../../profiles/parallel-fork-join-draft/README.md) | `duplicate` relation/evaluator and `parallel_start_creates_exact_branch_waits` in [SemanticProcess.lean](../../BpmnSemantics/SemanticProcess.lean) | Both retained [A-then-B](../../scenarios/parallel-fork-join/a-then-b.cibseven-evidence.json) and [B-then-A](../../scenarios/parallel-fork-join/b-then-a.cibseven-evidence.json) observations expose two waits | Fork and exact-wait witnesses in [parallel-fork-join.test.ts](../../packages/semantic-core/test/parallel-fork-join.test.ts) | Exact initial Query and replay in [temporal-adapter.test.ts](../../packages/temporal-adapter/testkit/test/temporal-adapter.test.ts) | Omitted-task comparator mutation in [pipeline.test.ts](../../packages/differential/test/pipeline.test.ts) |
| `PAR-WAIT-01` | [Observable start contract](#stable-state-after-start) | Exact wait multiplicities, activation-order observation equality, and bounded closure in [SemanticProcess.lean](../../BpmnSemantics/SemanticProcess.lean) | Raw task queries are independently projected into two sorted semantic tasks | Exact two-wait state and projection tests | Query returns both waits without Workflow-owned task semantics | Dropped raw CIB task and omitted four-target task both fail |
| `PAR-JOIN-READY-01` | BPMN per-incoming-flow rule in [source basis](#source-basis) | `duplicate_left_no_right_non_law` | Balanced evidence is positive calibration only; the separate [bounded negative probe](../../runners/cibseven/src/test/java/org/bpmnlean/cibseven/CibSevenParallelGatewayProbeTest.java) records candidate `CIB-DEV-0001` | Duplicate-left/no-right test rejects count-only readiness | No host counter or handler order triggers the join | Parallel provenance erasure is rejected; the CIB negative probe separates the pinned engine |
| `PAR-JOIN-CONSUME-01` | Exact consumption and excess-retention rule in [source basis](#source-basis) | `synchronize_consumes_per_incoming_and_preserves_excess` | Balanced cases establish one completed join only, not the excess-token law | Excess-token test consumes one per input and retains the extra token | Both completions are required before Workflow completion | Duplicate-left/no-right and excess-token witnesses guard the nearest wrong accounts |
| `PAR-ORDER-01` | [Observable completion-order contract](#stable-state-after-completing-both) | `completion_order_independent_at_final_state` | Separate content-bound A-then-B and B-then-A evidence | Both orders have equivalent final state and exact symmetric intermediate observations | Both ordered histories plus one concurrent-submission history replay | Six-case pipeline compares both orders and their exact intermediate Queries |
| `PAR-PROJECT-01` | [Canonical projection contract](#observable-contract) | Storage-permutation and activation-order observation laws plus the synthetic three-kind order lock | Raw query order is non-semantic; independent projection sorts and preserves per-element multiplicity | Task-storage and operation-order permutations preserve canonical projection; a synthetic mixed-kind state locks kind-first ordering | Query exposes core-owned semantic order before and between Updates | Raw-order reversal passes, while dropped raw task and omitted canonical task fail |
| `UTASK-REFUSE-02` | [User Task completion rule](USER-TASK-INTERACTION-SPEC.md#completion-command), `CIB-AGR-0002`, and `CIB-OP-0001` | `staleAWhileBActiveScenario` in [ParallelForkJoinConformance.lean](../../BpmnSemantics/ParallelForkJoinConformance.lean) | Content-bound live-sibling evidence observes A absent and B still active after stale A refusal | Live-sibling scenario rejects stale A with exact state preservation | Ordinary ordered Update ingress returns semantic rejection while B keeps the Workflow active | Dropping B from the post-stale evidence projection fails; sequential post-terminal `processClosed` remains a separate adapter lane |

## Assurance boundary

The exact established claim is: for the admitted content-addressed balanced two-branch Process, the two answer-free completion orders and live-sibling stale witness reach simultaneous distinct User Task waits, expose the specified stable intermediate observations, reject stale A while B remains active, synchronize only after both branch completions, and reach the same completed observation across the definition-bound Lean interpreter, pinned CIB positive calibration, independent TypeScript core, and replayed semantic-lifetime Temporal host.

The closest unsupported claims are repeated live occurrences of one User Task element, immutable negative CIB evidence for `CIB-DEV-0001`, production canonical-observation API design, and full observational checked-source-to-program-run preservation. None is implied by this capsule's draft closure.

The material common-mode risks remain explicit:

- Lean, TypeScript, and Temporal consume the same checked graph and Semantic Process wire contract; Lean independently lowers the checked graph, but no independent checked-source operational relation or second BPMN XML parser proves the complete translation.
- Temporal executes the TypeScript semantic core, so agreement between those two targets establishes host refinement, not independent semantic selection.
- Balanced CIB cases cannot distinguish per-incoming-flow readiness from arrival counting; the duplicate-left/no-right Lean/TypeScript non-law and isolated pinned-CIB probe supply the separator.
- Every target shares the canonical observation vocabulary and verifier. Answer-free scenarios, exact scenario echoes, raw CIB producer observations, definition/provenance mutations, and projection mutations guard that boundary without making it independent.

The nearest realistic semantic counterexample is two arrivals through one join input and none through the other. Lean and TypeScript reject readiness under that state, while the pinned-CIB research probe creates downstream work; the relationship remains candidate until that negative CIB observation has immutable answer-free evidence. The nearest admitted-shape counterexample is two live instances of the same User Task element, which remains rejected rather than assigned host-order-derived activation ordinals.

This is a pre-release contract. A breaking shape or meaning change replaces every current producer, consumer, fixture, schema, test, and disposable Temporal history atomically. The first durable deployment baseline will require explicit compatibility and replay policy before this contract can become immutable.

## Runtime-only and synthetic construct constraints

The observable contract requires hidden runtime state to preserve token multiplicity and incoming-flow provenance, but it does not select one shared representation. Each implementation must inventory its chosen constructs before its evidence lane can close.

| Required information or choice | Source or derivation | Public projection | Lifecycle invariant |
|---|---|---|---|
| Branch activation or token multiplicity | Fork activation and admitted outgoing Sequence Flow identities | Only resulting active waits are public | One fork activation cannot collapse two branch activations into one |
| Incoming-flow provenance at the join | The Sequence Flow on which each offer arrived | Hidden | Provenance is retained until the corresponding token is consumed |
| Partial join state | Offers present on a strict subset of incoming flows | Hidden | Cannot activate the join and cannot appear as a public User Task wait |
| Semantic transition choice | Explicit input or relation choice when more than one internal order is permitted | Only its stable semantic consequence | Evaluator collection order may not silently select semantic behavior |
| Internal microevents and closure bound | Implementation diagnostics and harness protection | Excluded from canonical state | Bound exhaustion remains a harness outcome, not a BPMN incident |
| CIB execution/task IDs and Temporal Workflow/Run/Update IDs | Host runtime | Excluded | May address host operations but may not determine BPMN meaning or canonical ordering |

The TypeScript realization uses a sorted array of `{ placeId, multiplicity }` entries for flow-identified tokens, sorted semantic User Task waits carrying their continuation place, and sorted per-element activation counters. Enum-based operation dispatch implements all current mechanisms. Internal closure classifies the complete enabled set: none is stable, one advances, the exact pair of independent User Task activations advances under the checked commutation account, and every other multiple-enabled shape refuses without publication. An operation-array permutation witness requires the same stable result, and projection is checked independently of wait storage order. These are TypeScript-owned runtime choices, not additions to the public capsule contract.

## Temporal hosting/refinement preflight

The bounded mapping is feasible without a Temporal analogue for either User Tasks or Parallel Gateways:

| Semantic requirement | Temporal host composition | Principal risk and separating evidence |
|---|---|---|
| Two simultaneous task waits | Both waits remain in committed semantic-core state; the exact Query projects both sorted occurrences | Query after start must equal the two-task core projection regardless of evaluator or engine order |
| Exact task completion | One acknowledged Update enqueues one exact task-instance stimulus; only the main loop applies it | A-then-B and B-then-A must both commit and expose the symmetric intermediate state |
| Permitted arrival order | Each handler enqueues synchronously before awaiting its result; one semantic loop consumes the queue | Ordered histories plus one concurrent-submission history must realize one of the two permitted semantic orders |
| Duplicate delivery | Core-owned command identity and the Workflow result ledger return one semantic result | Duplicate either completion without duplicating the transition |
| Partial join and readiness | Incoming-flow offers remain opaque semantic-core state | No Workflow counter, `Promise.all`, or handler order may trigger the join |
| Completion and replay | Workflow return follows semantic completion only after all accepted handlers finish | Update completion precedes Workflow completion and every produced history replays |

The implemented Workflow follows the [Temporal Process lifecycle specification](../TEMPORAL-PROCESS-LIFECYCLE-SPEC.md): lifetime derives from semantic terminal state, not scenario stimulus count; accepted handlers drain; production Workflow and Update identities are content-bound host policy; exact retries recover retained semantic results; and post-closure results remain outside semantic outcomes.

The focused Temporal gate compiles the exact parallel source, queries both initial waits, executes both ordered completion sequences, queries the exact remaining task after the first completion, checks a duplicate command, rejects stale A through ordinary ordered ingress while B remains live, submits two distinct completions concurrently for the same occurrence and requires an unordered one-commit/one-rejection result with identical final state, requires Update completion before Workflow completion, reconciles Query-derived command outcomes and terminal state with Event History and the receipt, and replays every history.

## Boundary ownership

- Current-state task projection, stimulus well-formedness, command identity, and same-stimulus comparison are semantic-core-owned operations. The Temporal Workflow delegates them and may not infer open tasks from diagnostic trace history or maintain policy copies.
- The CIB runner projects multiple distinct active elements as distinct semantic occurrences, sorts them by semantic identity independently of engine query order, and preserves per-element wait multiplicity. Repeated live instances of one element remain rejected because derived activation ordinals are out of scope.

## Contract decisions

1. normative per-incoming-flow semantics for this capsule;
2. the observable contract and stable rule propositions above;
3. asymmetric internal runtime representations under one shared reviewed account;
4. bounded semantic-profile expansion to the named Parallel Gateway fork/join and two simultaneous distinct User Tasks;
5. no parallel compatibility claim for the current CIB User Task profile;
6. a later separate compatibility profile only if the observed pinned-CIB behavior gains a concrete consumer;
7. lowering through the bounded Semantic Process IL rather than expanding the topology-specific executable IR.

Any extension must follow the stop criteria in [the Semantic Process IL specification](../SEMANTIC-PROCESS-IL-SPEC.md) and the evidence workflow in [the testing specification](../TESTING-SPEC.md).

## Explicit exclusions

- repeated activation of the same User Task element, loops, multi-instance execution, and activation-ordinal derivation;
- more than two fork branches, nested gateways, mixed gateway direction, unbalanced topology, and arbitrary graph execution;
- conditions on outgoing Sequence Flows, expressions, variables, and data associations;
- inclusive, exclusive, event-based, and complex gateways;
- cancellation, compensation, boundary Events, Event Sub-Processes, and transaction semantics;
- assignment, authorization, forms, and task output;
- timers, messages, Activities, retries, incidents, and external effects;
- public projection of tokens, join offers, microevents, evaluator order, or host IDs;
- a universal BPMN IL, general BPMN compiler, broad CIB compatibility claim, or Process Execution Conformance claim.
