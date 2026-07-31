# Profile-parameterized admission specification

## Status

**Implemented current pre-release contract.**

## Scope

This specification owns the production decision that Semantic Process admission is the conjunction of reusable structural graph validation and profile-selected mechanism/cardinality capabilities. It replaces the former growing disjunction of exact whole-program topology predicates.

The first composition witness is [one literal `PT1S` Timer followed by one User Task](../scenarios/timer-user-task-composition/README.md). It composes already implemented Timer and User Task meaning; it adds no new BPMN transition family and makes no CIB composition-compatibility claim. The first scope witness is [ordinary embedded Sub-Process completion](capsules/EMBEDDED-SUBPROCESS-COMPLETION-SPEC.md): it retains the same profile-multiset rule while adding generic definition-scope ownership, entry, and completion facts rather than a whole-topology admission predicate.

## Exact claim

For every currently selected profile, source and program admission require:

1. a project-owned checked graph or Semantic Process program whose references, operation payloads, arities, origins, and identities are valid;
2. one profile capability whose exact multiset of operation kinds matches the candidate;
3. one topology-independent graph check establishing one rooted definition-scope tree, exact node/flow or operation/place ownership, a unique root initiation, one completion per scope, scope-local reachability and co-reachability, global initiation-to-root-completion reachability, acyclicity, and the current producer/consumer discipline;
4. exact checked-source-to-program lowering equality before Lean evaluation;
5. capsule-local closure, enabledness, and stable-state resumability evidence for each newly reachable structure.

The profile capability names kinds and cardinalities, not complete node IDs, Sequence Flow IDs, or one full model path. The Timer/User Task and Message/User Task composition profiles therefore permit both finite acyclic linear orders selected by graph facts and their exact operation multisets; production code contains no whole-topology predicate for either profile. Each retained end-to-end scenario selects the new mechanism before the User Task, while focused source, Lean, and TypeScript checks also cover the reverse order so the broader structural admission is not accidental.

The closest unsupported claim is arbitrary serial composition. Admission does not infer an unbounded grammar, repeated Timer or User Task mechanisms, loops, arbitrary graph cardinalities, or general BPMN Process Execution Conformance.

## Current profile capabilities

| Profile | Definition scopes | Exact operation multiset |
|---|---:|---|
| CIB Seven User Task | 1 | one `initiate`, one `awaitUserTask`, one `reachNoneEnd`, one `completeScope` |
| CIB Seven Intermediate Catch Timer | 1 | one `initiate`, one `awaitTimer`, one `reachNoneEnd`, one `completeScope` |
| CIB Seven Service Task effect | 1 | one `initiate`, one `awaitEffect`, one `reachNoneEnd`, one `completeScope` |
| CIB Seven A12 CreateDocument | 1 | one `initiate`, one `awaitEffect`, one `reachNoneEnd`, one `completeScope` |
| CIB Seven A12 boundary error | 1 | one `initiate`, one `awaitEffect`, one `awaitUserTask`, two `reachNoneEnd`, one `completeScope` |
| Normative parallel fork/join | 1 | one `initiate`, one `duplicate`, two `awaitUserTask`, one `synchronize`, one `reachNoneEnd`, one `completeScope` |
| BPMN Simple Boolean Exclusive Gateway | 1 | one `initiate`, one `choose`, three `awaitUserTask`, three `reachNoneEnd`, one `completeScope` |
| BPMN Timer/User Task composition | 1 | one `initiate`, one `awaitTimer`, one `awaitUserTask`, one `reachNoneEnd`, one `completeScope` |
| BPMN Intermediate Catch Message | 1 | one `initiate`, one `awaitMessage`, one `awaitUserTask`, one `reachNoneEnd`, one `completeScope` |
| CIB Seven ordinary embedded Sub-Process completion | 2 | one `initiate`, one `enterScope`, one `duplicate`, three `awaitUserTask`, three `reachNoneEnd`, two `completeScope` |

Profile capability does not replace operation-payload validation. Exact Timer duration, effect descriptor and mapping, boundary route, gateway condition, source-language, origin, and arity restrictions remain checked by their existing owners.

An unknown profile or a known profile with the wrong operation multiset is rejected before execution. The same structurally valid Timer/User Task program is therefore accepted under the composition profile and rejected under the Timer-only, User-Task-only, and unknown profiles.

## Structural validators

The checked-source validator operates on project-owned BPMN nodes and Sequence Flows after XML parsing and source-shape projection. It requires distinct resolved identities, one rooted acyclic definition-scope tree, exact node and Sequence Flow ownership, profile-permitted node arities and conditions, one None Start Event and at least one None End Event in every scope, scope-local reference closure, reachability of every node from that scope's Start Event, co-reachability of every node to one of that scope's End Events, and an acyclic finite graph. Every non-root definition scope corresponds to exactly one ordinary embedded Sub-Process in its parent; Event Sub-Processes are rejected.

The Semantic Process validator operates independently on control places and typed operations. It requires the same scope tree, exact operation and control-place ownership, exact one-producer/one-consumer control-place shape, a unique root initiation, one completion per scope, one entry per non-root scope, reachability, co-reachability to root completion, and finite acyclicity. TypeScript and Lean each implement this check; neither calls the other.

The old exact execution-surface predicates are forbidden by the pre-release architecture guard. Adding a profile must extend the typed capability table and its separating tests, not add another whole-program disjunct.

## Targeted preservation gate

The Timer/User Task composition establishes the following executable facts independently in Lean and TypeScript:

- start closure requires exactly one internal initiation step before the Timer wait, and a zero-step limit reports closure-bound exhaustion;
- after Timer firing, exactly one internal Timer continuation exposes the User Task wait, and a zero-step limit reports closure-bound exhaustion;
- after User Task completion, exactly one internal termination step reaches completed state, and a zero-step limit reports closure-bound exhaustion;
- no stable state in the admitted witness contains more than one enabled internal operation;
- the stable Timer wait and User Task wait are resumable through explicit public semantic input;
- the completed state is terminal;
- a synthetic running state with stranded control tokens and no wait is not resumable.

The reverse User Task/Timer ordering independently reaches a resumable User Task wait, then a resumable Timer wait, never exposes more than one enabled internal operation at a stable boundary, and completes under the same closure limit.

The Message/User Task capability applies the same gate to a newly introduced subscription mechanism. Message-first start closure requires exactly two internal steps before the Message wait and rejects a one-step limit; exact delivery requires one internal step before the trailing User Task wait. The reverse order reaches the User Task first, then the Message wait. Both orders expose exactly one public resumption surface at every stable running boundary, never expose multiple enabled internal operations, complete under the configured closure limit, and retain a synthetic stranded-token rejection. The source reference-chain discriminator proves that generic graph lowering preserves the selected Interface, Interface Operation, and Message channel rather than a fixture constant.

The ordinary embedded Sub-Process capability applies the gate to a scope-owned independent pair. Source lowering is invariant under outer Sequence Flow reference order, child node declaration order, and child Sequence Flow declaration order. After entry and child duplication, both child User Tasks are the exact independent enabled set in either operation order. Completing either task first consumes only its owned branch and reaches one child None End while the sibling remains resumable; child `completeScope` refuses while that sibling wait is live. Only the second child completion makes the owned child region quiescent, removes the child occurrence, and emits the one outer continuation. The trailing outer User Task then remains resumable and root completion stays within the configured closure limit. A synthetic stranded child token neither resumes nor completes.

These checks decide the current stuck-state question without widening the public observation contract: a newly admitted capsule must prove that no reachable stable running state is stranded. Failure blocks admission of that capsule. `semanticFailure` and a new public status therefore remain unnecessary while such a state is unreachable; if a future capsule needs to expose one, it must reopen the observation contract explicitly.

This is a targeted executable preservation result, not a proof of general closure soundness, arbitrary-graph progress, or universal source-to-program run preservation.

## Temporal host capability

Semantic admission and Temporal host capability are separate decisions. After semantic admission and before Workflow start, the adapter returns a typed result:

- `admitted` when the current host can realize every reachable wait-set shape covered by its conservative structural predicate;
- `rejected` with `concurrentHostDrivenWaits` when a token split combined with a Timer or effect can create a host-driven concurrent branch.

Passive parallel User Tasks, Message subscriptions, and scope-owned child User Tasks remain admitted because they use external Update or Signal ingress and require no Workflow-created host driver. The linear Timer/User Task composition remains admitted because its waits are sequential. A token split with a Timer or effect is rejected even when a more precise future reachability analysis might prove a particular shape safe; widening that capability requires a deterministic multi-wait scheduler and its own replay evidence.

The Workflow retains defensive invariant failures for impossible projected wait cardinalities. They are not an admission result and must be unreachable for every program accepted by the pre-start gate.

## Evidence

The [answer-free Timer/User Task composition scenario](../scenarios/timer-user-task-composition/scenario.json), [answer-free Message/User Task scenario](../scenarios/intermediate-catch-message/scenario.json), and four-scenario [ordinary embedded Sub-Process suite](../scenarios/embedded-subprocess-completion/README.md) are consumed from the same exact source/profile identity by Lean, the independently implemented TypeScript semantic core, and Temporal. The differential pipeline requires exact canonical agreement plus a one-millisecond Timer-deadline mutation, a Message-channel mutation, and an early child-scope-exit mutation. CIB is deliberately absent from the first two target sets; the Sub-Process target set includes separately classified `CIB-AGR-0007` normative-agreement evidence.

The focused Temporal Timer witness schedules one durable Timer from committed semantic state, observes the later User Task, completes it through Update ingress, reaches the same canonical result as the core, and replays the fetched history. The runner never delivers the scenario Timer stimulus. The Message witness treats the subscription as passive ingress, delivers the exact Signal while the Worker is absent, resolves the semantic result through the Message ledger Query, completes the later User Task, and replays both mechanism orders. The Sub-Process witness treats both child tasks and the trailing outer task as passive Updates, replaces the Worker between child completions, preserves the completed Update result, proves that the sibling remains live and the parent continuation stays absent until quiescence, replays the fetched history, and asserts zero Signals, Timers, Activities, Child Workflows, and cancellation events.

Generic structural rejection, profile mismatch, closure-bound exhaustion, multiple-enabledness, stranded-state non-resumability, pre-start host rejection, durable Timer history, exact target agreement, and the seeded deadline mutation are distinct executable checks. Agreement does not establish general BPMN conformance or independent semantic-account selection.

## Runtime and synthetic constructs

The scope checkpoint adds runtime definition-scope occurrences and scope ownership on control tokens and all semantic waits. A root occurrence is created at start; `enterScope` creates the only child occurrence; `completeScope` removes it after exact owned quiescence. These constructs are semantic runtime state but remain absent from the canonical public observation, whose task/wait projection is sufficient for the approved claim.

Synthetic negative states include test-owned stranded root and child running states used to prove that the resumability and scope-completion predicates distinguish token presence from an actual semantic ingress surface and exact quiescence. They are never emitted as admitted scenario results.

## Versioning consequences

The Timer/User Task checkpoint left the checked BPMN graph, Semantic Process program, scenario, canonical-result, and CIB evidence wire shapes unchanged. The later Intermediate Catch Message capsule replaced the current checked-node, operation, stimulus, state-observation, and CIB evidence shapes atomically; all retained CIB states carry an empty `openMessageSubscriptions` field because CIB is not a Message target. The ordinary embedded Sub-Process capsule then replaced the single flat definition contract atomically with definition-scope arrays and ownership maps, replaced `terminate` with `reachNoneEnd` plus synthetic `completeScope`, and replaced token/wait state with scope-owned occurrences across schemas, every producer and consumer, Lean, TypeScript, fixtures, retained CIB projections, and Temporal.

The production start API now returns a typed `started | rejected` adapter result so semantic or host-capability refusal is observable before Workflow creation. Under the pre-release replace-in-place policy, the sole production-lifecycle consumer was updated atomically; no legacy throwing start path or compatibility reader remains.

## Exclusions and re-open conditions

This specification does not add repeated host-driven mechanisms, multiple Timers, multiple effects, multiple live Message subscriptions, mixed concurrent host-driven waits, a general serial grammar, arbitrary scope nesting, exceptional scope cancellation or propagation, key-based/global Message correlation, arbitrary graph liveness, CIB admission equivalence, or A12 adoption coverage.

Reopen this contract when:

- a profile needs a mechanism or cardinality not expressible by the current capability table;
- a newly admitted graph can reach more than one internal operation without an approved independence or semantic-choice account;
- a newly admitted graph can reach a stable running state without an explicit resumption surface;
- a Temporal consumer needs concurrent Timer, effect, or subscription scheduling;
- a second capsule needs the same source-to-result preservation proposition and the targeted proof would duplicate a general theorem.
