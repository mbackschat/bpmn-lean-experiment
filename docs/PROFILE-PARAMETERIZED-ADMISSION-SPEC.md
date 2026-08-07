# Profile-parameterized admission specification

## Status

**Implemented current pre-release contract.**

## Scope

This specification owns the production decision that Semantic Process admission is the conjunction of reusable structural graph validation and profile-selected mechanism/cardinality capabilities. It replaces the former growing disjunction of exact whole-program topology predicates.

The first composition witness is [one literal `PT1S` Timer followed by one User Task](../scenarios/timer-user-task-composition/README.md). It composes already implemented Timer and User Task meaning; it adds no new BPMN transition family and makes no CIB composition-compatibility claim. The first scope witness is [ordinary embedded Sub-Process completion](capsules/EMBEDDED-SUBPROCESS-COMPLETION-SPEC.md): it retains the same profile-multiset rule while adding generic definition-scope ownership, entry, and completion facts rather than a whole-topology admission predicate. The first exceptional scope witness is [direct-parent Error propagation](capsules/SUBPROCESS-ERROR-PROPAGATION-SPEC.md): it adds explicit Error node kinds, one `throwError`, a generic exceptional attachment edge, and regional runtime cancellation without adding a topology predicate.

## Exact claim

For every currently selected profile, source and program admission require:

1. a project-owned checked graph or Semantic Process program whose references, operation payloads, arities, origins, and identities are valid;
2. one profile capability whose exact multiset of operation kinds matches the candidate;
3. topology-independent graph checks establishing a canonical acyclic definition-scope forest and exact node/flow or operation/place ownership: checked source has exactly one entry root plus, only for the bounded Call profile, one distinct parentless called root, and validates reachability and co-reachability independently inside every scope; the Semantic Process program has one `initiate` owned by the entry root, one completion strategy per scope, and global operation reachability from that initiation and co-reachability to entry-root completion, including the virtual called-End-to-`returnProcess` edge, under the current producer/consumer discipline;
4. exact checked-source-to-program lowering equality before Lean evaluation;
5. capsule-local closure, enabledness, and stable-state resumability evidence for each newly reachable structure.

The profile capability names kinds and cardinalities, not complete node IDs, Sequence Flow IDs, or one full model path. The Timer/User Task and Message/User Task composition profiles therefore permit both finite acyclic linear orders selected by graph facts and their exact operation multisets; production code contains no whole-topology predicate for either profile. Each retained end-to-end scenario selects the new mechanism before the User Task, while focused source, Lean, and TypeScript checks also cover the reverse order so the broader structural admission is not accidental.

The closest unsupported claim is arbitrary serial composition. Admission does not infer an unbounded grammar, repeated Timer or User Task mechanisms, loops, arbitrary graph cardinalities, or general BPMN Process Execution Conformance.

## Current profile capabilities

| Profile | Definition scopes | Exact operation multiset |
|---|---:|---|
| CIB Seven User Task (`cibseven-2.2.0-user-task-process-data-draft`) | 1 | one `initiate`, one `awaitUserTask`, one `reachNoneEnd`, one `completeScope` |
| CIB Seven User Task with preserved notation (`cibseven-2.2.0-user-task-preserved-notation-draft`) | 1 | one `initiate`, one `awaitUserTask`, one `reachNoneEnd`, one `completeScope` |
| CIB Seven Intermediate Catch Timer (`cibseven-2.2.0-intermediate-catch-timer-draft`) | 1 | one `initiate`, one `awaitTimer`, one `reachNoneEnd`, one `completeScope` |
| CIB Seven Service Task effect (`cibseven-2.2.0-service-task-effect-draft`) | 1 | one `initiate`, one `awaitEffect`, one `reachNoneEnd`, one `completeScope` |
| CIB Seven A12 CreateDocument (`cibseven-2.0.0-a12-create-document-draft`) | 1 | one `initiate`, one `awaitEffect`, one `reachNoneEnd`, one `completeScope` |
| CIB Seven A12 boundary error (`cibseven-2.0.0-a12-boundary-error-draft`) | 1 | one `initiate`, one `awaitEffect`, one `awaitUserTask`, two `reachNoneEnd`, one `completeScope` |
| Normative parallel fork/join (`parallel-fork-join-draft`) | 1 | one `initiate`, one `duplicate`, two `awaitUserTask`, one `synchronize`, one `reachNoneEnd`, one `completeScope` |
| BPMN Simple Boolean Exclusive Gateway (`bpmn-2.0.2-simple-boolean-exclusive-gateway-draft`) | 1 | one `initiate`, one `choose`, three `awaitUserTask`, three `reachNoneEnd`, one `completeScope` |
| BPMN structured Inclusive Gateway (`bpmn-2.0.2-inclusive-gateway-selected-branches-draft`) | 1 | one `initiate`, one `selectMany`, three `awaitUserTask`, one `synchronizeSelected`, one `reachNoneEnd`, one `completeScope` |
| BPMN interrupting Activity boundary Timer (`bpmn-2.0.2-activity-boundary-timer-draft`) | 1 | one `initiate`, one `awaitBoundedUserTask`, two `awaitUserTask`, two `reachNoneEnd`, one `completeScope` |
| BPMN non-interrupting boundary Timer (`bpmn-2.0.2-non-interrupting-boundary-timer-draft`) | 1 | one `initiate`, one `awaitMonitoredUserTask`, two `awaitUserTask`, two `reachNoneEnd`, one `completeScope` |
| BPMN Event-Based Gateway Message/Timer race (`bpmn-2.0.2-event-based-gateway-message-timer-draft`) | 1 | one `initiate`, one `awaitEventRace`, two `awaitUserTask`, two `reachNoneEnd`, one `completeScope` |
| BPMN Timer/User Task composition (`bpmn-2.0.2-timer-user-task-composition-draft`) | 1 | one `initiate`, one `awaitTimer`, one `awaitUserTask`, one `reachNoneEnd`, one `completeScope` |
| BPMN Intermediate Catch Message (`bpmn-2.0.2-intermediate-catch-message-draft`) | 1 | one `initiate`, one `awaitMessage`, one `awaitUserTask`, one `reachNoneEnd`, one `completeScope` |
| CIB Seven Message-addressed Receive Task (`cibseven-2.2.0-message-addressed-receive-task-draft`) | 1 | one `initiate`, one `awaitMessage`, one `reachNoneEnd`, one `completeScope` |
| CIB Seven ordinary embedded Sub-Process completion (`cibseven-2.2.0-embedded-subprocess-completion-draft`) | 2 | one `initiate`, one `enterScope`, one `duplicate`, three `awaitUserTask`, three `reachNoneEnd`, two `completeScope` |
| CIB Seven embedded Sub-Process Error propagation (`cibseven-2.2.0-subprocess-error-propagation-draft`) | 2 | one `initiate`, one `enterScope`, one `duplicate`, three `awaitUserTask`, one `throwError`, three `reachNoneEnd`, two `completeScope` |
| BPMN called Process Call Activity (`bpmn-2.0.2-called-process-call-activity-draft`) | 2 | one `initiate`, one `invokeProcess`, two `awaitUserTask`, two `reachNoneEnd`, one `returnProcess`, one `completeScope` |
| BPMN interrupting Sub-Process boundary Timer (`bpmn-2.0.2-subprocess-boundary-timer-draft`) | 2 | one `initiate`, one `enterBoundedScope`, three `awaitUserTask`, three `reachNoneEnd`, two `completeScope` |

Two profiles now share one operation multiset, and that is the contract rather than a duplicate row. The preserve-enabled successor to the CIB Seven User Task profile admits Diagram Interchange, pools, lanes, artifacts, and documentation that its predecessor rejects, and executes exactly the same program. A differing multiset would mean preserved notation had reached the executed partition, so agreement between these two rows is what [the preserve-only admission proposal](PRESERVE-ONLY-ADMISSION-PROPOSAL.md) claims and not an omission. Which source each profile admits is decided by the preservation capability, which is disjoint from the operation multiset this table records.

The typed capability table in `packages/semantic-core/src/semantic-process-profile.ts` remains the executable authority. The documentation-reviewability guard derives the registered identifiers from that source and requires this summary to contain exactly one row for every identifier.

Profile capability does not replace operation-payload validation. Exact Timer duration, effect descriptor and mapping, boundary route, gateway condition, source-language, origin, and arity restrictions remain checked by their existing owners.

An unknown profile or a known profile with the wrong operation multiset is rejected before execution. The same structurally valid Timer/User Task program is therefore accepted under the composition profile and rejected under the Timer-only, User-Task-only, and unknown profiles.

## Structural validators

The checked-source validator operates on project-owned BPMN nodes and Sequence Flows after XML parsing and source-shape projection. It requires distinct resolved identities, a canonical acyclic definition-scope forest, exact node and Sequence Flow ownership, profile-permitted node arities and conditions, one None Start Event and at least one admitted exit Event in every scope, scope-local reference closure, reachability of every node from that scope's Start Event, co-reachability of every node to one of that scope's exits, and an acyclic finite graph inside every scope. Every profile except the bounded Call profile has exactly one parentless entry root whose origin identifies `processId`; the Call profile has that same unique entry root plus one distinct parentless called root whose origin identifies the Call Activity's resolved `calledProcessId`. An admitted exit is a None End Event or Error End Event. A boundary Error remains a parent-scope node and receives one checked-graph-only exceptional reachability edge from its attached Sub-Process; that edge is never a Sequence Flow and never crosses definition scopes. Every non-root definition scope corresponds to exactly one ordinary embedded Sub-Process in its parent; Event Sub-Processes are rejected.

The Semantic Process validator operates independently on control places and typed operations. It requires the same canonical forest and unique entry root, exact operation and control-place ownership, exact one-producer/one-consumer control-place shape, and exactly one `initiate` owned by that entry root. Every nested scope has one `enterScope` and one `completeScope`; the entry root has one root `completeScope`; and each parentless non-entry called root has no `enterScope` or `completeScope` and instead has one paired `returnProcess`. The global operation graph includes the virtual edge from the called root's unique `reachNoneEnd` to its return, then requires every operation to be reachable from the unique initiation and co-reachable to the entry-root completion under finite acyclicity. TypeScript and Lean each implement this check; neither calls the other.

The old exact execution-surface predicates are forbidden by the pre-release architecture guard. Adding a profile must extend the typed capability table and its separating tests, not add another whole-program disjunct.

## Targeted preservation gate

The Timer/User Task composition establishes the following executable facts independently in Lean and TypeScript:

- start closure requires exactly one internal initiation step before the Timer wait, and a zero-step limit reports closure-bound exhaustion;
- after Timer firing, exactly one internal Timer continuation exposes the User Task wait, and a zero-step limit reports closure-bound exhaustion;
- after User Task completion, `reachNoneEnd` followed by quiescent root `completeScope` reaches completed state, and a zero-step limit reports closure-bound exhaustion;
- no stable state in the admitted witness contains more than one enabled internal operation;
- the stable Timer wait and User Task wait are resumable through explicit public semantic input;
- the completed state is terminal;
- a synthetic running state with stranded control tokens and no wait is not resumable.

The reverse User Task/Timer ordering independently reaches a resumable User Task wait, then a resumable Timer wait, never exposes more than one enabled internal operation at a stable boundary, and completes under the same closure limit.

The Message/User Task capability applies the same gate to a newly introduced subscription mechanism. Message-first start closure requires exactly two internal steps before the Message wait and rejects a one-step limit; exact delivery requires one internal step before the trailing User Task wait. The reverse order reaches the User Task first, then the Message wait. Both orders expose exactly one public resumption surface at every stable running boundary, never expose multiple enabled internal operations, complete under the configured closure limit, and retain a synthetic stranded-token rejection. The source reference-chain discriminator proves that generic graph lowering preserves the selected Interface, Interface Operation, and Message channel rather than a fixture constant.

The owner-approved Message-addressed Receive Task capability reuses that same `awaitMessage` operation family with the exact root operation multiset initiation, one Message wait, one None End reach, and root completion. Its source profile contributes a distinct `receiveTask` checked node and `directMessage` channel arm; generic arity, reference, reachability, co-reachability, acyclicity, producer/consumer, and closure checks remain unchanged. The focused source cross-profile witness rejects the Receive Task under the Intermediate Catch Message capability and rejects the Catch Event graph under the Receive Task capability, while a combined declaration permutation preserves the checked and lowered definition after normalizing only the intentionally source-content-bound digest.

The ordinary embedded Sub-Process capability applies the gate to a scope-owned independent pair. Source lowering is invariant under outer Sequence Flow reference order, child node declaration order, and child Sequence Flow declaration order. After entry and child duplication, both child User Tasks are the exact independent enabled set in either operation order. Completing either task first consumes only its owned branch and reaches one child None End while the sibling remains resumable; child `completeScope` refuses while that sibling wait is live. Only the second child completion makes the owned child region quiescent, removes the child occurrence, and emits the one outer continuation. The trailing outer User Task then remains resumable and root completion stays within the configured closure limit. A synthetic stranded child token neither resumes nor completes.

The Sub-Process Error-propagation capability applies the gate to the same independent child pair with one Error End replacing one normal child result. One combined representative source mutation reorders the selected fork, child-task, child-flow, Error End, boundary Error, outer End, outer Sequence Flow reference, and root Error declarations while preserving the checked nodes and lowered program; this is not an exhaustive declaration-permutation result. Trigger-first and Sibling-first schedules both expose only the outer Recover task after one atomic `throwError`; the child `completeScope` neither competes with nor precedes the throw, every stable running prefix has a User Task resumption surface, and closure stays within the configured limit. Trigger-first preserves `endOccurrences = 0`, Sibling-first preserves `endOccurrences = 1`, and their equal canonical recovery result does not imply equal internal runtime state. A synthetic unrelated root task survives child interruption, separating regional from global cancellation.

These checks decide the current stuck-state question without widening the public observation contract: a newly admitted capsule must prove that no reachable stable running state is stranded. Failure blocks admission of that capsule. `semanticFailure` and a new public status therefore remain unnecessary while such a state is unreachable; if a future capsule needs to expose one, it must reopen the observation contract explicitly.

This is a targeted executable preservation result, not a proof of general closure soundness, arbitrary-graph progress, or universal source-to-program run preservation.

## Temporal host capability

Semantic admission and Temporal host capability are separate decisions. After semantic admission and before Workflow start, the adapter returns a typed result:

- `admitted` when the current host can realize every reachable wait-set shape covered by its conservative structural predicate;
- `rejected` with `concurrentHostDrivenWaits` when a token split combined with a Timer or effect can create a host-driven concurrent branch.

Passive parallel User Tasks, Message subscriptions, and scope-owned child User Tasks remain admitted because they use external Update or Signal ingress and require no Workflow-created host driver. `throwError` is internal semantic closure and adds no host-driven wait. The linear Timer/User Task composition remains admitted because its waits are sequential. A token split with a Timer or effect is rejected even when a more precise future reachability analysis might prove a particular shape safe; widening that capability requires a deterministic multi-wait scheduler and its own replay evidence.

The Workflow retains defensive invariant failures for impossible projected wait cardinalities. They are not an admission result and must be unreachable for every program accepted by the pre-start gate.

## Evidence

The [answer-free Timer/User Task composition scenario](../scenarios/timer-user-task-composition/scenario.json), [answer-free Message/User Task scenario](../scenarios/intermediate-catch-message/scenario.json), four-scenario [ordinary embedded Sub-Process suite](../scenarios/embedded-subprocess-completion/README.md), and three-scenario [Sub-Process Error-propagation suite](../scenarios/subprocess-error-propagation/README.md) are consumed from the same exact source/profile identity by Lean, the independently implemented TypeScript semantic core, and Temporal. The differential pipeline requires exact canonical agreement plus a one-millisecond Timer-deadline mutation, a Message-channel mutation, an early child-scope-exit mutation, and Error wrong-route, sibling-retention, and stale-state mutations. CIB is deliberately absent from the first two target sets; the Sub-Process target sets include separately classified `CIB-AGR-0007` and `CIB-AGR-0008` normative-agreement evidence, while the Error stale host-task refusal mapping separately reuses `CIB-OP-0001`.

The focused Temporal Timer witness schedules one durable Timer from committed semantic state, observes the later User Task, completes it through Update ingress, reaches the same canonical result as the core, and replays the fetched history. The runner never delivers the scenario Timer stimulus. The Message witness treats the subscription as passive ingress, delivers the exact Signal while the Worker is absent, resolves the semantic result through the Message ledger Query, completes the later User Task, and replays both mechanism orders. The ordinary Sub-Process witness treats both child tasks and the trailing outer task as passive Updates, replaces the Worker between child completions, preserves the completed Update result, proves that the sibling remains live and the parent continuation stays absent until quiescence, replays the fetched history, and asserts zero Signals, Timers, Activities, Child Workflows, and cancellation events. The Error witness replaces the Worker immediately after the committed throw/catch/cancel Update, recovers its accepted result plus the Recover-only wait set, refuses a fresh stale sibling command without changing that state, completes Recover, replays, and asserts the same zero-host-mechanism history. Its semantic-core bypass matches the recovery prefix but retains pre-throw state, so the following stale sibling command produces a detectably wrong durable suffix.

Generic structural rejection, profile mismatch, closure-bound exhaustion, multiple-enabledness, stranded-state non-resumability, pre-start host rejection, durable Timer history, exact target agreement, and the seeded deadline mutation are distinct executable checks. Agreement does not establish general BPMN conformance or independent semantic-account selection.

## Runtime and synthetic constructs

The scope checkpoint adds runtime definition-scope occurrences and scope ownership on control tokens and all semantic waits. A root occurrence is created at start; `enterScope` creates the only child occurrence; `completeScope` removes it after exact owned quiescence, while `throwError` removes it exceptionally after canceling its owned subtree. These constructs are semantic runtime state but remain absent from the canonical public observation, whose task/wait projection is sufficient for the approved claims.

Synthetic negative states include test-owned stranded root and child running states used to prove that the resumability and scope-completion predicates distinguish token presence from an actual semantic ingress surface and exact quiescence. They are never emitted as admitted scenario results.

## Versioning consequences

The Timer/User Task checkpoint left the checked BPMN graph, Semantic Process program, scenario, canonical-result, and CIB evidence wire shapes unchanged. The later Intermediate Catch Message capsule replaced the current checked-node, operation, stimulus, state-observation, and CIB evidence shapes atomically; all retained CIB states carry an empty `openMessageSubscriptions` field because CIB is not a Message target. The ordinary embedded Sub-Process capsule then replaced the single flat definition contract atomically with definition-scope arrays and ownership maps, replaced `terminate` with `reachNoneEnd` plus synthetic `completeScope`, and replaced token/wait state with scope-owned occurrences across schemas, every producer and consumer, Lean, TypeScript, fixtures, retained CIB projections, and Temporal.

The later Error-propagation capsule replaced the closed checked-node and operation unions atomically with explicit boundary/Error End variants and `throwError`, while retaining the runtime-state, canonical observation, active-wait, stimulus, command-result, and outcome shapes. Every producer, validator, decoder, exhaustive switch, artifact, and target runner changed together; no compatibility reader remains.

The production start API returns a typed `started | rejected` adapter result so semantic or host-capability refusal is observable before Workflow creation. Under the pre-release replace-in-place policy, the sole production-lifecycle consumer was updated atomically; no legacy throwing start path or compatibility reader remains.

## Exclusions and re-open conditions

This specification does not add repeated host-driven mechanisms, multiple Timers, multiple effects, multiple live Message subscriptions, mixed concurrent host-driven waits beyond the exact bounded Message/Timer Event-Based Gateway race, a general serial grammar, arbitrary scope nesting, exceptional scope cancellation or propagation beyond the exact direct-parent Error slice, key-based/global Message correlation, arbitrary graph liveness, CIB admission equivalence, or A12 adoption coverage.

Reopen this contract when:

- a profile needs a mechanism or cardinality not expressible by the current capability table;
- a newly admitted graph can reach more than one internal operation without an approved independence or semantic-choice account;
- a newly admitted graph can reach a stable running state without an explicit resumption surface;
- a Temporal consumer needs concurrent Timer, effect, or subscription scheduling beyond the exact bounded Message/Timer Event-Based Gateway race;
- a second capsule needs the same source-to-result preservation proposition and the targeted proof would duplicate a general theorem.
