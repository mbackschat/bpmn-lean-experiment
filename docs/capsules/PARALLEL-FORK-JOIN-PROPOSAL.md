# Parallel fork/join observable-contract proposal

## Status

**Owner-approved semantic proposal on 2026-07-26; production implementation, immutable profile artifact, and closure evidence are pending. It graduates to `PARALLEL-FORK-JOIN-SPEC.md` only with the implemented contract and its required evidence lanes.**

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

The classification remains candidate rather than confirmed because this research probe is not yet an answer-free scenario with immutable content-bound raw evidence, a mutation-sensitive canonical projection, or completed Lean, TypeScript, Temporal, and compatibility impact lanes. Parser and fixture-shape explanations are excluded by BPMN 2.0.2 XSD validation and the exact engine observation; task-query ordering and project canonicalization cannot explain whether `User_After_Join` exists.

## Approved semantic rules

The identifiers below are stable traceability labels for the approved propositions. Approval records meaning and scope; it does not claim implementation or evidence closure.

| Rule | Approved proposition |
|---|---|
| `PAR-FORK-01` | Activating the fork consumes one offered token from its single incoming Sequence Flow and offers exactly one token on each of its two outgoing Sequence Flows. |
| `PAR-WAIT-01` | Internal closure after start reaches a stable running state with exactly one active occurrence of User Task A and exactly one active occurrence of User Task B. |
| `PAR-JOIN-READY-01` | The join is ready only if every incoming Sequence Flow offers at least one token; total arrival count without incoming-flow provenance is insufficient. |
| `PAR-JOIN-CONSUME-01` | One join activation consumes exactly one token from each incoming Sequence Flow, retains every excess offered token, and offers exactly one token on each outgoing Sequence Flow. |
| `PAR-ORDER-01` | Completing A then B and completing B then A reach equivalent final stable state and canonical state observation; their command traces are not byte-identical because submitted command order and the intermediate remaining task differ. |
| `PAR-PROJECT-01` | Canonical task and enabled-interaction arrays use semantic order `(processInstanceId, elementId, activation)`; `activeWaits` is grouped per `(kind, elementId)` and preserves multiplicity within that element. Internal tokens or partial join offers are absent from the stable canonical state projection. |

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

The contract is precise without fixing internal microstep count, explicit versus implied tokens, stored versus recomputed join readiness, internal closure bound, or evaluator branch visit order. The project therefore adopts asymmetric representation independence:

- the TypeScript semantic core should use explicit flow-identified tokens or offers because it makes multiplicity, provenance, and mutation points direct;
- Lean should retain a declarative relation plus an executable evaluator, with a flow-indexed or relational state chosen for proof usefulness rather than copied from TypeScript;
- the capsule should continue to prescribe only observable behavior and the information-preservation invariants needed to prove it.

Different representations reduce common-mode representation mistakes; they do not create an independent semantic account. Both remain transcriptions of the same approved capsule. A Lean relation and evaluator are also not two representations: they are a permitted-transition account and one executable selector over that account.

The honest cost is maintaining and reviewing two runtime shapes, adjudicating early typed disagreements, and accepting that proof intuitions will not transfer mechanically. Better prose alone is not an equivalent safeguard: a second representation mechanically exposes distinctions the author did not know to name. On disagreement, neither side is patched to the other: the applicable BPMN clause, smallest CIB separator, relationship classification, and capsule rule decide both implementations.

Reconsider this decision if a material rule cannot be stated or proved without prescribing a shared hidden structure. The provisional representation spike contributes useful discriminators and information-preservation requirements, but its general node, scope, token, and wait types remain experimental and must not be transplanted wholesale.

## Source and Semantic Process IL boundary

The bounded source compiler expansion admits exactly the reviewed fork/join topology with two distinct User Tasks and resolved Sequence Flows. The approved [Semantic Process IL proposal](../SEMANTIC-PROCESS-IL-PROPOSAL.md) owns the proposed checked source graph, `initiate`, `awaitUserTask`, `duplicate`, `synchronize`, and `terminate` operations, lowering rules, well-formedness, and growth constraints.

The sequential topology-specific executable representation and evaluator path were replaced atomically by the checked graph, Semantic Process program, and program-driven sequential evaluator. They do not survive as delegated or compatibility paths. This does not authorize a general BPMN compiler, universal semantic language, general scope algebra, or arbitrary graph execution.

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

The new runtime-transition family needs a declarative relation separate from the executable evaluator and a theorem that every evaluator-produced transition is admitted by that relation. That soundness bridge does not establish completeness, determinism, BPMN fidelity, TypeScript correspondence, or CIB compatibility.

Useful proposed laws are:

- start closure creates exactly the two branch waits and no other public wait;
- before both incoming-flow conditions hold, no evaluator step crosses the join;
- one join activation consumes exactly one offer per incoming flow and preserves excess multiplicity;
- exact completion removes only the named active occurrence;
- A-then-B and B-then-A terminate in equivalent final stable state under exact distinct-task hypotheses;
- canonical projection is invariant under permutation of internal task/token storage.

Required negative and mutation evidence includes:

- the duplicate-left/no-right non-law witness;
- erasing incoming-flow provenance makes the negative witness fail;
- reversing CIB task-query order leaves the canonical result unchanged;
- aggregating distinct `activeWaits` entries makes the start projection fail;
- exposing a partial join offer changes canonical state and is rejected;
- changing the admitted executable topology without changing the scenario is detected by the Lean input binding.

The future rule-to-evidence matrix must keep normative/profile, Lean relation/law, pristine CIB observation, independent TypeScript behavior, Temporal refinement/replay, negative-witness, and mutation claims in separate cells. The current candidate CIB probe fills only the bounded research-observation cell.

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

## R5 and R6 prerequisites

The observable contract resolves the questions that previously blocked the two implementation corrections:

- **R5 — completed:** current-state task projection, stimulus well-formedness, command identity, and same-stimulus comparison are semantic-core-owned operations. The current Workflow invokes them directly and no longer infers open tasks from diagnostic trace history or maintains validation and identity-policy copies.
- **R6:** before the CIB runner emits canonical parallel evidence, remove its single-active-task guard only together with deterministic semantic task sorting and per-element wait multiplicity. Distinct active elements produce distinct entries; repeated instances of one element require derived activation ordinals and remain out of scope here.

These corrections are implementation prerequisites, not evidence that this capsule is already implemented.

## Owner decisions

The owner approved:

1. normative per-incoming-flow semantics for this capsule;
2. the observable contract and stable rule propositions above;
3. asymmetric internal runtime representations under one shared reviewed account;
4. bounded semantic-profile expansion to the named Parallel Gateway fork/join and two simultaneous distinct User Tasks;
5. no parallel compatibility claim for the current CIB User Task profile;
6. a later separate compatibility profile only if the observed pinned-CIB behavior gains a concrete consumer;
7. lowering through the bounded Semantic Process IL rather than expanding the topology-specific executable IR.

Implementation may now cross the semantic decision boundary only in the order and under the stop criteria in [the plan](../PLAN.md) and [the Semantic Process IL proposal](../SEMANTIC-PROCESS-IL-PROPOSAL.md).

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
