# Profile-parameterized admission specification

## Status

**Implemented current pre-release contract.**

## Scope

This specification owns the production decision that Semantic Process admission is the conjunction of reusable structural graph validation and profile-selected mechanism/cardinality capabilities. It replaces the former growing disjunction of exact whole-program topology predicates.

The first composition witness is [one literal `PT1S` Timer followed by one User Task](../scenarios/timer-user-task-composition/README.md). It composes already implemented Timer and User Task meaning; it adds no new BPMN transition family and makes no CIB composition-compatibility claim.

## Exact claim

For every currently selected profile, source and program admission require:

1. a project-owned checked graph or Semantic Process program whose references, operation payloads, arities, origins, and identities are valid;
2. one profile capability whose exact multiset of operation kinds matches the candidate;
3. one topology-independent graph check establishing a unique initiation, at least one termination, reachability, co-reachability, acyclicity, and the current producer/consumer discipline;
4. exact checked-source-to-program lowering equality before Lean evaluation;
5. capsule-local closure, enabledness, and stable-state resumability evidence for each newly reachable structure.

The profile capability names kinds and cardinalities, not complete node IDs, Sequence Flow IDs, or one full model path. The Timer/User Task composition profile therefore permits both finite acyclic linear orders selected by graph facts and its exact operation multiset; production code contains no seventh whole-topology predicate. The retained end-to-end scenario selects Timer then User Task, while focused source, Lean, and TypeScript checks also cover User Task then Timer so the broader structural admission is not accidental.

The closest unsupported claim is arbitrary serial composition. Admission does not infer an unbounded grammar, repeated Timer or User Task mechanisms, loops, arbitrary graph cardinalities, or general BPMN Process Execution Conformance.

## Current profile capabilities

| Profile | Exact operation multiset |
|---|---|
| CIB Seven User Task | one `initiate`, one `awaitUserTask`, one `terminate` |
| CIB Seven Intermediate Catch Timer | one `initiate`, one `awaitTimer`, one `terminate` |
| CIB Seven Service Task effect | one `initiate`, one `awaitEffect`, one `terminate` |
| CIB Seven A12 CreateDocument | one `initiate`, one `awaitEffect`, one `terminate` |
| CIB Seven A12 boundary error | one `initiate`, one `awaitEffect`, one `awaitUserTask`, two `terminate` |
| Normative parallel fork/join | one `initiate`, one `duplicate`, two `awaitUserTask`, one `synchronize`, one `terminate` |
| BPMN Simple Boolean Exclusive Gateway | one `initiate`, one `choose`, three `awaitUserTask`, three `terminate` |
| BPMN Timer/User Task composition | one `initiate`, one `awaitTimer`, one `awaitUserTask`, one `terminate` |

Profile capability does not replace operation-payload validation. Exact Timer duration, effect descriptor and mapping, boundary route, gateway condition, source-language, origin, and arity restrictions remain checked by their existing owners.

An unknown profile or a known profile with the wrong operation multiset is rejected before execution. The same structurally valid Timer/User Task program is therefore accepted under the composition profile and rejected under the Timer-only, User-Task-only, and unknown profiles.

## Structural validators

The checked-source validator operates on project-owned BPMN nodes and Sequence Flows after XML parsing and source-shape projection. It requires distinct resolved identities, profile-permitted node arities and conditions, a unique None Start Event, at least one None End Event, reachability of every node from the Start Event, co-reachability of every node to an End Event, and an acyclic finite graph.

The Semantic Process validator operates independently on control places and typed operations. It requires exact one-producer/one-consumer control-place ownership, a unique initiation operation, at least one termination operation, reachability, co-reachability, and finite acyclicity. TypeScript and Lean each implement this check; neither calls the other.

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

These checks decide the current stuck-state question without widening the public observation contract: a newly admitted capsule must prove that no reachable stable running state is stranded. Failure blocks admission of that capsule. `semanticFailure` and a new public status therefore remain unnecessary while such a state is unreachable; if a future capsule needs to expose one, it must reopen the observation contract explicitly.

This is a targeted executable preservation result, not a proof of general closure soundness, arbitrary-graph progress, or universal source-to-program run preservation.

## Temporal host capability

Semantic admission and Temporal host capability are separate decisions. After semantic admission and before Workflow start, the adapter returns a typed result:

- `admitted` when the current host can realize every reachable wait-set shape covered by its conservative structural predicate;
- `rejected` with `concurrentHostDrivenWaits` when a token split combined with a Timer or effect can create a host-driven concurrent branch.

Passive parallel User Tasks remain admitted because they use external Update ingress. The linear Timer/User Task composition remains admitted because its waits are sequential. A token split with a Timer or effect is rejected even when a more precise future reachability analysis might prove a particular shape safe; widening that capability requires a deterministic multi-wait scheduler and its own replay evidence.

The Workflow retains defensive invariant failures for impossible projected wait cardinalities. They are not an admission result and must be unreachable for every program accepted by the pre-start gate.

## Evidence

The [answer-free composition scenario](../scenarios/timer-user-task-composition/scenario.json) is consumed from the same exact source/profile identity by Lean, the independently implemented TypeScript semantic core, and Temporal. The differential pipeline requires exact canonical agreement and a one-millisecond Timer-deadline mutation. CIB is deliberately absent from the target set.

The focused Temporal witness schedules one durable Timer from committed semantic state, observes the later User Task, completes it through Update ingress, reaches the same canonical result as the core, and replays the fetched history. The runner never delivers the scenario Timer stimulus.

Generic structural rejection, profile mismatch, closure-bound exhaustion, multiple-enabledness, stranded-state non-resumability, pre-start host rejection, durable Timer history, exact target agreement, and the seeded deadline mutation are distinct executable checks. Agreement does not establish general BPMN conformance or independent semantic-account selection.

## Runtime and synthetic constructs

This checkpoint adds no runtime-only or synthetic semantic construct. It reuses control tokens, Timer occurrences, User Task occurrences, logical time, and existing canonical observations.

The only synthetic negative state is a test-owned stranded running state used to prove that the resumability predicate distinguishes token presence from an actual semantic ingress surface. It is never emitted as an admitted scenario result.

## Versioning consequences

The checked BPMN graph, Semantic Process program, scenario, canonical-result, and CIB evidence wire shapes are unchanged. The new profile and scenario are additional current artifacts.

The production start API now returns a typed `started | rejected` adapter result so semantic or host-capability refusal is observable before Workflow creation. Under the pre-release replace-in-place policy, the sole production-lifecycle consumer was updated atomically; no legacy throwing start path or compatibility reader remains.

## Exclusions and re-open conditions

This specification does not add repeated mechanisms, multiple Timers, multiple effects, mixed concurrent waits, a general serial grammar, message subscriptions, scope propagation, arbitrary graph liveness, CIB admission equivalence, or A12 adoption coverage.

Reopen this contract when:

- a profile needs a mechanism or cardinality not expressible by the current capability table;
- a newly admitted graph can reach more than one internal operation without an approved independence or semantic-choice account;
- a newly admitted graph can reach a stable running state without an explicit resumption surface;
- a Temporal consumer needs concurrent Timer, effect, or subscription scheduling;
- a second capsule needs the same source-to-result preservation proposition and the targeted proof would duplicate a general theorem.
