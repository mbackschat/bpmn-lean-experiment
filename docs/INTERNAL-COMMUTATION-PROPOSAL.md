# Internal commutation checkpoint proposal

## Status

Lifecycle: draft
Review: pending

## Decision question and boundary

What is the smallest reusable rule that lets bounded internal closure advance two simultaneously enabled, observationally independent operations without treating program collection order as BPMN scheduling meaning?

This proposal owns the first `INTERNAL-COMMUTATION` Beta risk checkpoint. It replaces the constructor-specific exception for exactly two distinct `awaitUserTask` operations with one semantic-footprint criterion over an exact two-operation frontier. The checkpoint covers ordinary `awaitUserTask`, `awaitMessage`, `awaitTimer`, and `awaitEffect` arming operations in Lean and the independently written TypeScript core. It adds no BPMN source shape, profile capability, Semantic Process operation, RuntimeState field, stimulus, public wire field, Temporal host capability, MUE content ID, or support claim.

The full MUE content obligation remains open after this checkpoint. Later closure must decide larger enabled sets, every additional operation family that needs composition, explicit choice representation, and any newly admitted BPMN topology. A passing checkpoint is Beta breadth evidence, not completion of `INTERNAL-COMMUTATION`.

## Existing risk

[The Semantic Process contract](SEMANTIC-PROCESS-IL-SPEC.md#internal-scheduling) requires every material internal choice to be explicit or observationally irrelevant under exact hypotheses. Production closure currently recognizes only one exact pair of distinct ordinary User Task arms. Its check names operation constructors and three identifiers, but does not state the semantic resources each transition reads and writes. Adding another operation kind by extending that checklist would repeat the mechanism without establishing why the pair commutes.

Canonical operation-ID selection is necessary for reproducibility but is not evidence of commutation. Sorting two conflicting transitions merely makes one conflict deterministic. The deciding rule must establish non-interference before the selector may use canonical order.

## Selected semantic-footprint rule

Each candidate transition receives a dynamic `InternalTransitionFootprint` derived from the admitted program, the exact pre-state, and the operation before its successor is selected. The footprint contains canonical sets of tagged semantic atoms, split into `reads`, `writes`, and `publications`. Shared reads are permitted. A pair is non-interfering only when neither side's writes intersect the other side's reads or writes and the publication keys are distinct.

The checkpoint atom vocabulary is closed:

- `controlToken(owner, place)` for the exact consumed token;
- `scopeOccurrence(owner)` and `runtimeControl(instance)` for shared existence and running-state reads;
- `logicalTime` for Timer deadline calculation;
- `activation(kind, elementId)` for the counter read and increment that mints the next occurrence;
- `wait(kind, occurrence)` for the newly created User Task, Message, Timer, or effect wait;
- `processVariable(scope, name)` for exact effect input-mapping reads;
- `activityVariable(activityOccurrence, name)` for exact effect-argument writes;
- `flowNodeOccurrence(kind, occurrence)` for the committed lifecycle publication.

Occurrence atoms include the state-derived next activation, not only an element ID. Atom tags keep User Task, Message, Timer, effect, control-place, and variable domains distinct. Every set uses the repository's canonical Unicode scalar ordering and explicit tagged equality. Locale collation, object enumeration order, and a successor-state diff are excluded from footprint construction.

For the first checkpoint, footprint construction returns `none` for every operation outside ordinary `awaitUserTask`, `awaitMessage`, `awaitTimer`, and `awaitEffect`. An unavailable footprint, more or fewer than two enabled operations, an intersection, a duplicate publication key, or a failed second step retains the existing fail-closed ambiguous-choice result. This is a sufficient rule, not a necessary characterization of every commuting transition.

## Execution and publication contract

Given two enabled operations `left` and `right` with non-interfering footprints, the checkpoint requires all of these facts:

1. firing `left` preserves `right` enabledness and firing `right` preserves `left` enabledness;
2. both two-step executions succeed;
3. both executions produce the same canonical RuntimeState;
4. the unordered transition and lifecycle facts are identical;
5. sorting that two-fact batch by canonical operation ID and occurrence key produces one identical committed publication with reassigned consecutive transition indices.

The production evaluator continues to select the canonical lowest operation ID first. The proof makes that selection observationally irrelevant for the admitted pair; the sort does not serve as the proof. No existing committed-transition or lifecycle wire shape changes. Raw evaluator visit order remains private, while the published batch order remains canonical and replay-stable.

An overlapping pair is not forced into either order. It remains `ambiguousInternalChoice` until a later reviewed profile supplies an explicit semantic choice or a stronger checked commutation account.

## Lean assurance lane

The checkpoint's Lean lane is **proved**. A new focused module owns the atom and footprint definitions, the non-interference predicate, enabledness preservation for each supported constructor pair, two-step state commutation, and canonical publication equality. `TransitionTrace.lean` receives only the narrow classifier integration needed to call the proved rule because its current review headroom is 147 nonblank lines.

The theorem begins from two independently enabled `OperationStep` facts and the footprint predicate. It must not assume equal successors, equal final states, or equal publications. Constructor proofs may reuse established transition relations, canonical collection insertion, and exact occurrence issuance laws. They may not cite finite fixture evaluation as the theorem.

This does not claim arbitrary closure confluence, Church-Rosser, arbitrary-cardinality independence, general BPMN scheduler determinism, or the open run-level checked-source preservation theorem.

## Independent TypeScript realization

The TypeScript core defines the same tagged atom vocabulary and non-interference equation without generated Lean code or a copied decision table. Production closure classifies the complete two-operation enabled set through that predicate and retains current ambiguity and bound precedence.

The independent executable oracle explicitly runs both orders outside the production selector and compares canonical state, transition records, and lifecycle publication. The production code must not implement commutation by running both orders and comparing their results, because that would make the claimed reason a successor-equality test rather than the reviewed footprint rule.

## Temporal hosting and information-preservation preflight

The durable ingress remains the existing content-bound Start, User Task Update, Message delivery, Timer firing, or effect-result command owned by each already admitted profile. This checkpoint changes only pure internal closure after one accepted ingress. It adds no Workflow command, Signal, Timer, Activity, Child Workflow, cancellation scope, retry policy, Task Queue rule, Workflow-chain field, or external-effect lifecycle.

The preserved state relation is exact equality of the canonical semantic state and committed publication after the commuting batch. Delivery order, duplicate transport, retry, Worker replacement, Continue-As-New, and replay remain outside the internal choice because the Workflow calls one deterministic evaluator and persists only its committed result. Canonical operation-ID selection and canonical publication batching must replay byte-identically under the unchanged Temporal SDK and Server versions.

The smallest host witness is the existing production parallel User Task profile under reversed program storage, Worker replacement between task completions, and replay of every Run. Host admission must continue to reject an unsupported mixed-wait profile even when its pure internal arming pair has a footprint, because commutation evidence is not source/profile or host-capability admission. A future live mixed-wait witness requires its own profile and host preflight.

## Required, optional, and excluded work

Required:

- one shared semantic criterion implemented independently in Lean and TypeScript;
- positive ordinary User Task/User Task and mixed User Task/Timer or Message footprint witnesses;
- a realistic same-effect-element counter collision that distinct operation, input, and output IDs do not hide;
- both-order state and publication evidence, canonical program-order permutation evidence, and unchanged ambiguity/bound precedence;
- existing parallel Product 1 Worker-replacement and replay evidence remaining green;
- routed implementation maps, proposal/checkpoint review, focused gates, complete applicable gate, and a reproducible checkpoint cost row.

Optional:

- additional positive pairs among the four supported arming kinds when they use no new atom or proof case.

Excluded:

- more than two enabled operations;
- `duplicate`, joins, choices, scope entry/completion, call/return, termination, Error propagation, event-race arming, boundary-host operations, or Multi-Instance operations;
- new BPMN source admission, semantic profile, scenario registration, Product 2 surface, CIB relationship, or Temporal host capability;
- public exposure of footprints, scheduler choices, raw visit order, or Temporal identity;
- Parallel Multi-Instance, completion conditions, general event subscriptions, compensation, transactions, workload isolation, or closure of another MUE content ID.

## Evidence and adversarial oracles

The first Red is a synthetic internally valid state with one ordinary User Task arm and one ordinary Timer or Message arm on distinct owner-token places: current closure reports ambiguity even though both explicit execution orders reach the same canonical state. The second Red is the class separator: two effect arms have distinct operation, input, and output IDs but share one effect element and therefore the same activation-counter and occurrence-write atoms. A shallow identifier checklist can accept it; the footprint rule must reject it before either successor is selected.

Further mutations drop one activation write, tag two counter domains as equal, treat a write/read intersection as harmless, derive footprints from successor diffs, accept an unsupported operation, compare only final state, preserve raw execution order in publication, use locale collation, or classify only the selected first two members of a larger enabled set. Each mutation must fail an oracle outside the changed decision branch.

The focused TypeScript gate owns the closure classifier and both-order oracle. Narrow Lean builds own the new footprint module and its conformance module, with the first kernel-decided fixture build staying with the root under the memory bound. The root runs the complete affected package gate, exact Lean targets, `test:infrastructure`, every path-selected clean-commit pre-push entry point, and `git diff --check` at the governed checkpoint.

## Same-change owners and reopen conditions

Implementation updates [Semantic Process internal scheduling](SEMANTIC-PROCESS-IL-SPEC.md#internal-scheduling), its [Lean proof obligations](SEMANTIC-PROCESS-IL-SPEC.md#lean-specification-and-proof-obligations), [`implementation-status-owner:ENGINE-RUNTIME-PROOF`](ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), [`implementation-status-owner:ASSURANCE-ADOPTION`](ASSURANCE-AND-ADOPTION-IMPLEMENTATION-MAP.md), the semantic-core source registry, the Lean module graph, and [PLAN](PLAN.md). No source, semantic-family, Temporal, or platform map changes unless implementation discovers a fact in that owner's boundary.

Reopen before adding an atom domain, admitting another operation family, widening enabled-set cardinality, changing a wire order, selecting an explicit nondeterministic choice, using state-diff equality as the production rule, or admitting a source/profile/host composition on the strength of this checkpoint.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
