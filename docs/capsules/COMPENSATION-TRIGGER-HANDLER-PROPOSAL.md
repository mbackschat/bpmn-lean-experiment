# Compensation trigger and handler proposal

## Status

Lifecycle: draft
Review: pending

## Question and bounded outcome

What is the smallest standards-only account that can consume the two approved compensation-retention forms, trigger synchronous global compensation, restore a Compensation Event Sub-Process snapshot, execute dependency-aware handlers, and make handler failure and cancellation explicit?

This proposal selects one root-scoped Intermediate Throw Compensation Event with omitted `activityRef` and synchronous `waitForCompletion=true`. It selects one exact handler graph shape, one occurrence-level dependency representation, concurrent maximal-frontier activation, success continuation, and a fail-fast project interpretation for handler failure.

The first checkpoint remains pre-profile and pre-source: manually constructed Programs establish the semantic representation before BPMN XML admission, shared scenario contracts, or Temporal execution can depend on it. Requirement `BPMN-COMPENSATION-TRIGGER-HANDLER-01` remains `unsupported` until every selected evidence lane closes.

## Normative authority and interpretation boundary

BPMN 2.0.2 Clauses 10.7.2 and 13.5.5 permit a Compensation Event with omitted `activityRef` to trigger every eligible completed Activity visible in the current scope. Only successfully completed Activities are eligible; active work is cancelled rather than compensated. The already approved retention and snapshot proposals own those eligibility facts, so this proposal neither reconstructs completion from current tokens nor broadens their admitted Activity families.

Clause 13.5.5 requires default compensation to respect dependencies in reverse: if completed Activity A precedes completed Activity B, B must finish compensation before A starts. Activities without a dependency may compensate concurrently. Completion chronology alone is therefore not an adequate scheduler, although chronology remains useful evidence for later loop, Multi-Instance, and ad-hoc dependency rules.

The Activity lifecycle in Clause 13.3.2 gives a compensation handler the states `Compensating`, `Compensated`, `Failed`, and `Terminated`. BPMN does not completely settle how one failing handler disposes every independent or still-pending handler in a global synchronous trigger. Rule `COMPH-FAIL-01` below is therefore an explicit project interpretation, not a claimed transcription of a normative sentence or CIB behavior.

The pinned CIB Seven implementation sorts subscriptions by descending creation time and invokes them synchronously. That implementation is a useful feasibility observation but cannot implement the standard's dependency partial order in general. No CIB profile relationship is selected, and CIB timestamp order is excluded from the semantic account.

## Required, optional, and excluded scope

Required for the first checkpoint:

- one root-scope global synchronous throw reached after three eligible subjects complete;
- boundary-handler records for exact subjects A and C from the approved retention representation;
- one promoted Event Sub-Process snapshot for completed embedded Sub-Process subject B;
- one forward Sequence Flow dependency A → B and no dependency involving C;
- exact single-effect handler graphs with no output mappings, retry semantics, or nested BPMN handler control flow;
- occurrence-level trigger, subject, handler, dependency, lifecycle, restored-context, and capacity state;
- concurrent activation of B and C, delayed activation of A until B is `Compensated`, and canonical state order without semantic serialization;
- success and fail-fast cancellation witnesses, including removal of an in-flight nested effect wait;
- proved Lean and independently written TypeScript semantic accounts before source or hosting work.

Optional only after the semantic checkpoint is approved: exact BPMN source admission for the selected shape, a standards-only profile and answer-free scenarios, differential evidence, and the bounded Temporal witness named below.

Excluded are targeted `activityRef`, asynchronous `waitForCompletion=false`, Compensation End Events, Transactions and Cancel Events, implicit compensation, recursive compensation, compensation of active or unsuccessful work, general loops, Multi-Instance Sub-Processes, arbitrary handler graphs, handler data writes, boundary-handler context restoration, data/ad-hoc/boundary-causality dependency admission, CIB compatibility, public projection, Product 2 behavior, and general conformance.

## Program contract

The Program gains one `triggerCompensation` operation carrying the containing root definition scope, throw Event element identity, input place, output place, and a reference to one compensation execution declaration. Reaching its input consumes no token until the complete trigger transition has passed admission and capacity checks.

The declaration identifies the eligible boundary-handler targets already owned by `compensationActivityRetention`, the Event Sub-Process targets already owned by `compensationEventSubProcessSnapshots`, each dormant handler entry, the exact single `awaitEffect` body permitted by this checkpoint, and forward dependency edges. A dependency edge is typed by reason even though the first checkpoint admits only `sequenceFlow`.

```ts
type CompensationDependency = Readonly<{
  predecessorElementId: string;
  successorElementId: string;
  reason: "sequenceFlow";
}>;

type CompensationTriggerLimits = Readonly<{
  maxTriggers: number;
  maxHandlers: number;
  maxCanonicalBytes: number;
}>;
```

The graph validator admits handler entries only when a compensation declaration owns them. They remain unreachable from ordinary Process entry, ordinary Sequence Flow, and ordinary internal closure. This broadens the snapshot checkpoint's operation-free dormant-handler exception to a closed dormant handler graph; it does not reinterpret the retained parent identity or snapshot.

The exact first Program has one occurrence of each subject element. Its Sequence Flow dependency can therefore be lifted unambiguously to subject occurrences. The runtime representation is nevertheless occurrence-level, so later loop or Multi-Instance work can add completion-time dependency production without changing the meaning of an already stored edge.

## Runtime contract

The RuntimeState gains a canonical collection of compensation triggers. Each trigger has an occurrence identity distinct from its throw Event element, owns the withheld continuation token, and contains a canonical set of subject executions plus occurrence-level forward dependency edges.

Each subject execution identifies exactly one consumed boundary retention record or promoted snapshot, one handler occurrence, and one lifecycle state from `pending`, `compensating`, `compensated`, `failed`, or `terminated`. A compensating Event Sub-Process subject additionally owns its immutable restored frames. A terminal subject retains identity and lifecycle but no restored frame, effect wait, Activity-local binding, or incident.

Trigger creation atomically claims every eligible retained record visible to the throw's root occurrence. Claimed boundary records are removed from their register and claimed promoted snapshots are removed from their collection. The trigger record becomes the sole owner, so a second throw cannot retrigger the same completed work.

The source retention collections remain present when their Program declarations are present, even when empty. Trigger terminal records stay until root disposal. Successful trigger completion releases exactly one token to the throw's output; failed trigger completion releases none and blocks ordinary root completion through an explicit terminal-failure record rather than an accidental no-work state.

Trigger ordinals, handler ordinals, Activity/effect ordinals, and existing Process counters are separate monotonic identities. Cancellation removes owned live work but never rewinds a counter or reuses an occurrence identity.

## Trigger selection and dependency order

`COMPH-TRIGGER-01`: An enabled global synchronous throw selects exactly the unclaimed eligible boundary records and promoted snapshots owned by its current root occurrence. Invalid ownership, a provisional snapshot, a duplicate subject, an undeclared handler, an ambiguous element-to-occurrence dependency, a cycle, or any capacity excess refuses before token or retained-state mutation.

`COMPH-ORDER-01`: The forward dependency graph must be acyclic. A pending subject is maximal when none of its uncompensated forward successors remains `pending` or `compensating`. One transition starts the complete canonical set of maximal pending subjects; canonical order governs representation only, while all members become `compensating` together.

For A → B with independent C, the initial frontier is B and C. If B succeeds first, A starts even while C remains active. If C succeeds first, A remains pending until B succeeds. No evaluator iteration order, completion chronology, Temporal task order, or Event History order may add an edge or serialize C.

`COMPH-CONSUME-01`: Trigger creation consumes the input token and eligible source records atomically only after it has constructed a valid complete trigger and its first frontier. A zero-subject global throw is a successful no-op that moves the token directly to the output and creates no retained trigger.

## Snapshot restoration and handler execution

`COMPH-RESTORE-01`: Starting the Event Sub-Process handler for B copies its promoted completion-time frames into handler-private restored context. The handler reads that frozen context even if the enclosing root's current Process bindings differ. It never reconstructs context from Task I/O, public observation, current scope bindings, or host history.

The exact B handler derives its effect input from the selected restored Process frame. The exact A and C boundary handlers use empty effect inputs, so this checkpoint makes no claim about boundary-handler data visibility. All handlers reuse the existing semantic effect occurrence and `CompleteEffect` transport, but the handler lifecycle owns the meaning of the result.

`COMPH-SUCCEED-01`: A successful exact handler effect removes its wait and private restored context, changes that subject from `compensating` to `compensated`, and atomically starts the newly maximal complete frontier. When every subject is `compensated`, the trigger becomes successful, releases the withheld output token once, and retains only terminal lifecycle tombstones until root disposal.

An exact handler carries no BPMN Error route. Its `CompleteEffect` result with kind `bpmnError` is therefore interpreted as the compensation Activity throwing an uncaught exception and invokes `COMPH-FAIL-01`. Temporal Activity failure, retry, timeout, cancellation acknowledgement, and response loss remain transport facts and never directly select this semantic outcome.

## Failure and nested cancellation

`COMPH-FAIL-01`: The first semantic exception changes its active subject to `failed`, changes every other `pending` or `compensating` subject in the same trigger to `terminated`, removes their complete handler-owned runtime regions, and marks the trigger terminal-failed. A subject already `compensated` remains compensated. No continuation token is emitted and no later handler starts.

This is a deliberate fail-fast project interpretation for the bounded synchronous trigger. It prevents an implementation-dependent mixture of continued independent work, abandoned pending work, and zombie waits. A later error-handling or repair capsule must explicitly reopen the terminal-failure boundary rather than treating the trigger as ordinary Process completion.

`COMPH-CANCEL-01`: Handler-region cancellation removes active effect waits, Activity-local bindings, restored frames, handler-owned Task/Message/Timer waits, incidents, and nested scopes if later admitted, while preserving terminal lifecycle records and monotonic counters. The first checkpoint's adversarial case has B and C active, C fail, B's nested effect wait disappear, B become `terminated`, and pending A become `terminated`.

`COMPH-STALE-01`: A late completion or failure report for a cancelled handler-owned effect is rejected by exact occurrence identity and leaves the terminal trigger byte-identical. Host cancellation acknowledgement cannot reopen the handler or change semantic failure order.

## Capacity and atomicity

The declaration bounds simultaneous triggers, total subject executions, and the exact canonical UTF-8 bytes of the complete compensation-trigger collection. These bounds are positive safe integers, and the canonical byte limit is at most 65,536. The existing complete RuntimeState limit remains a separate secondary bound.

`COMPH-CAPACITY-01`: Trigger creation preflights the complete trigger, occurrence identities, restored contexts, first-frontier waits, lifecycle records, and prospective canonical bytes before consuming the input token or retention records. Refusal changes no state, trace, lifecycle, or publication.

`COMPH-CAPACITY-02`: A successful handler completion that would start another frontier preflights the complete successor before consuming the current effect wait. Capacity refusal preserves the pre-command state and exposes no speculative `compensated` lifecycle.

## Separating witnesses

The positive witness completes A, embedded Sub-Process B, and C, mutates the current root variable after B's snapshot, then reaches the global throw. B and C arm together; B's effect input proves snapshot restoration. B completion permits A while C may remain active. All three successes produce exactly one continuation token and empty source retention collections.

The order mutation serializes C behind B and must fail because it removes a legal independent active handler. The reverse-order mutation starts A with B and must fail because it violates A → B. The restoration mutation reads the root's newer value and must fail. The consumption mutation leaves a claimed source record and must fail by enabling retrigger.

The failure witness reaches the same initial B/C frontier, reports a semantic exception from C, and observes C `failed`, B and A `terminated`, B's effect wait and restored frame absent, no continuation token, and a terminal-failed trigger. Late B completion must be a byte-preserving rejection.

The capacity witness sets the exact bound one unit below the prospective first frontier and requires whole-transition refusal. A second witness permits trigger creation but makes A's unlocked frontier exceed its prospective bound, requiring the `CompleteEffect` command to roll back entirely.

## Lean assurance lane

The first checkpoint is a proved lane. Lean defines the declarative trigger, frontier, success, failure, cancellation, and refusal relations separately from executable evaluators, then checks evaluator soundness for every constructor-producing arm.

Required results are acyclic-frontier existence for the finite exact graph, maximal-frontier correctness, A-after-B safety, independent B/C simultaneous enablement, successful restoration, single continuation, source-record consumption, terminal failure, complete handler-region cancellation, stale-result preservation, capacity atomicity, and RuntimeState validity preservation.

The nearest checked non-laws are that handler start preserves source retention collections, that completion chronology determines the frontier, that every handler is serialized, that failure preserves active waits, and that cancellation preserves restored context. The checkpoint claims neither general topological completeness nor Lean/TypeScript correspondence from shared fixtures alone.

## Temporal hosting and refinement preflight

Durable ingress is the ordinary internal arrival at the throw operation; no public command triggers compensation. Each semantic handler effect maps to the existing Activity mechanism with exact semantic effect identity and idempotent completion recovery. The adapter must schedule every member of one semantic frontier without deriving order from Workflow task iteration.

The trigger, terminal lifecycles, consumed-record fact, occurrence dependencies, restored frames, and active effect identities must survive Worker replacement, replay, and Continue-As-New. Temporal retries and Activity attempts remain transport state. A retry never creates another handler occurrence or changes dependency order.

Fail-fast cancellation requires one hidden cancellation scope per handler region plus a trigger-level coordinator. When C fails semantically, the Workflow records the semantic terminal transition before requesting cancellation of B's Activity. A late result or cancellation acknowledgement is reconciled against the already terminal semantic identity and cannot change the state.

The smallest later durable witnesses are: successful B/C concurrency with restored B input and A-after-B order; response loss after one handler completion; Worker replacement before and during the trigger; Continue-As-New carrying an active frontier; C failure cancelling B while A is pending; exact Event History mutation proving that sequential scheduling or rematching would be detected; and replay of every history.

No live Temporal implementation begins at the first semantic checkpoint. An unclassified inability to preserve concurrent frontier, restored context, terminal failure, or late-result refusal reopens this proposal before profile admission.

## Evidence strategy

| Claim | Lean | TypeScript | Source/profile | Temporal | Negative or mutation evidence |
|---|---|---|---|---|---|
| Eligible records are atomically claimed once | Required | Required | Later | Later | retained-record retrigger mutation |
| A → B reverses while C stays independent | Required | Required | Later | Later | A-early and C-serialization mutations |
| B receives its frozen snapshot | Required | Required | Later | Later | current-context substitution |
| Handler success advances the next frontier | Required | Required | Later | Later | missing/duplicate frontier activation |
| Semantic failure cancels nested live work | Required | Required | Later | Later | zombie wait and pending-A mutations |
| Capacity refusal is whole-transition atomic | Required | Required | Later | Later | first-frontier and unlocked-frontier bounds |
| CIB compatibility | Not claimed | Not claimed | Not selected | Not claimed | timestamp-order observation only |

The first green checkpoint consists only of the complete Program/Runtime representation, both independent semantic accounts, their focused validity and adversarial suites, exact cross-language invariant matrix, applicable schema/definition artifacts, and focused documentation gates. It adds no source profile, scenario, public interaction, CIB case, or live host capability.

## Runtime-only inventory and layer ownership

The Program owns dormant handler graphs, trigger operation identity, exact dependency declarations, and limits. RuntimeState owns trigger/handler occurrences, occurrence dependencies, restored private context, lifecycle, source-record consumption, and terminal failure. The pure semantic core and Lean independently own transition meaning.

Source later owns exact XML provenance and checked lowering. Temporal later owns durable scheduling, Activity execution, transport retries, cancellation delivery, continuation, and replay without adding BPMN facts. Publication and Product 2 own no field in this checkpoint.

## Versioning consequences

This is a pre-release additive Program and RuntimeState change plus one new semantic operation family. No admitted profile emits it, no current durable history contains it, and public observations remain unchanged. Once a profile is admitted, Program/schema/runtime/Lean/trace/Temporal changes must be atomic and existing profile artifacts must remain byte- and behavior-compatible.

The complete `what-binds` inventory requires [`implementation-status-owner:ENGINE-RUNTIME-PROOF`](../ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), [`implementation-status-owner:TEMPORAL-HOSTING`](../TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md), [Semantic Process IL](../SEMANTIC-PROCESS-IL-SPEC.md), [contract registry](../../contracts/README.md), [package guide](../../packages/semantic-core/README.md), [source map](../../packages/semantic-core/SOURCE-MAP.md), [schema coverage](../../scripts/contract-schema-coverage.test.ts), [definition artifacts](../../scripts/contract-definition-artifacts.test.ts), [commutation census](../../scripts/internal-commutation-census.test.ts), [collection removal](../../scripts/runtime-collection-removal-completeness.test.ts), [source hygiene](../../scripts/source-hygiene.test.ts), [reviewability](../../scripts/document-reviewability.test.ts), [review policy](../../scripts/independent-review-policy.test.ts), and [requirement-ledger consistency](../../scripts/requirement-ledger-consistency.test.ts).

The operation census must classify trigger creation and frontier activation as one atomic state-transforming family whose simultaneous members are not independently scheduled internal operations. Existing transition traces, replay, canonical ordering, RuntimeState validity, removal helpers, closure, and command-result consumers must either handle the new variants or carry an explicit proved no-change obligation.

### Owners this implementation grows

| Existing owner | Current headroom | Growth condition |
|---|---:|---|
| [TS Program](../../packages/semantic-core/src/semantic-process-contract.ts) | 208 | operation and declaration references only |
| [TS RuntimeState](../../packages/semantic-core/src/semantic-process-state.ts) | 378 | trigger collection reference only |
| [TS command admission](../../packages/semantic-core/src/semantic-command-admission.ts) | 382 | atomic handler-result integration only |
| [TS evaluator](../../packages/semantic-core/src/semantic-process-runtime.ts) | 62 | dispatch only; extract all trigger and handler logic before growth |
| [TS internal attempt](../../packages/semantic-core/src/internal-transition-attempt.ts) | 668 | trigger-attempt delegation only |
| [Lean Program](../../BpmnSemantics/SemanticProcessContract.lean) | 93 | declaration reference only; extract the contract first if the reference cannot fit |
| [Lean RuntimeState](../../BpmnSemantics/SemanticProcess/RuntimeState.lean) | 201 | trigger collection reference only |
| [Lean command admission](../../BpmnSemantics/SemanticProcess/CommandAdmission.lean) | 272 | handler-result dispatch only |
| [Lean transition](../../BpmnSemantics/SemanticProcess/Transition.lean) | 23 | extract before adding the new dispatcher arm |
| [Lean internal attempt](../../BpmnSemantics/SemanticProcess/InternalOperationAttempt.lean) | 757 | trigger-attempt delegation only |

Every headroom figure is the measured nonblank-line remainder below the 800-line review target. No size exception is requested. New bounded owners should contain the compensation execution contract, trigger construction, frontier selection, handler completion, cancellation, validity, and focused tests/proofs; shared integration owners receive references or dispatch only.

## Epistemic closure and reopen conditions

Selected: root-global synchronous triggering, exact eligible-source consumption, occurrence-level dependencies, reverse dependency order, concurrent maximal frontiers, one-effect handler graphs, Event Sub-Process snapshot restoration, terminal lifecycles, fail-fast failure, nested region cancellation, stale-result refusal, capacity, and future hosting obligations.

Open: source admission, shared wires, public projection, targeted/asynchronous throws, general handler graphs and data, other dependency reasons, loops and Multi-Instance Sub-Processes, recursive compensation, Transactions/Cancel Events, recovery from handler failure, CIB profile behavior, live refinement, whole models, corpus, Product 2, and conformance.

Reopen before implementation if review finds the fail-fast rule incompatible with the selected BPMN lifecycle, the occurrence graph cannot widen without reinterpreting accepted models, exact handler effects cannot preserve restored context, the atomic frontier cannot be hosted without observable serialization, or failure cannot cancel nested work while preserving semantic identity.

## Stage boundary

The immutable draft requires a context-cold proposal review before implementation. A green proposal verdict is the approval; any required edits must be audited by the same reviewer and recorded below.

After approval, the first implementation stage stops when the complete Program/Runtime representation and independent Lean/TypeScript semantics named in the evidence strategy are green. That semantic checkpoint requires independent review before source, profile, scenario, CIB, Temporal, public, corpus, or Product 2 work begins.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `not-recorded` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
