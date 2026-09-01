# Compensation trigger and handler proposal

## Status

Lifecycle: draft
Review: pending

## Prior review

Cold review rejected `21f83fa9`: the handler join was prose, failure had no Process lifecycle or receipt, Continue-As-New carried an already scheduled Activity, and the migration inventory omitted decisive owners. This material redesign requires a new cold review, not a correction audit.

## Question and bounded outcome

What is the smallest standards-only account that can consume the two approved compensation-retention forms, trigger synchronous global compensation, restore a Compensation Event Sub-Process snapshot, execute dependency-aware handlers, and make handler failure and cancellation explicit?

This proposal selects one root-scoped Intermediate Throw Compensation Event with omitted `activityRef`, synchronous `waitForCompletion=true`, one handler-body shape, occurrence dependencies, concurrent maximal frontiers, success continuation, and fail-fast typed Process failure.

The first checkpoint uses manual Programs before source, shared scenarios, or Temporal. `BPMN-COMPENSATION-TRIGGER-HANDLER-01` remains `unsupported` until every selected lane closes.

## Normative authority and interpretation boundary

BPMN 2.0.2 Clauses 10.7.2 and 13.5.5 let an omitted-`activityRef` Compensation Event trigger every eligible completed Activity visible in scope. Active or unsuccessful work is not compensated. Approved retention and snapshot proposals own eligibility; this proposal neither reconstructs it nor broadens admitted Activities.

Clause 13.5.5 reverses dependencies: if A precedes B, B must finish compensation before A starts, while independent Activities may compensate concurrently. Completion chronology is not that order.

Clause 13.3.2 gives handlers `Compensating`, `Compensated`, `Failed`, and `Terminated`, but does not settle how one failure disposes independent or pending handlers. `COMPH-FAIL-01` is therefore project interpretation, not BPMN or CIB transcription.

Pinned CIB Seven uses descending subscription creation time and synchronous invocation, which cannot generally implement the dependency partial order. No CIB relationship is selected; timestamp order is excluded.

## Required, optional, and excluded scope

Required for the first checkpoint:

- one root-scope global synchronous throw reached after three eligible subjects complete;
- boundary-handler records for exact subjects A and C from the approved retention representation;
- one promoted Event Sub-Process snapshot for completed embedded Sub-Process subject B;
- one forward Sequence Flow dependency A → B and no dependency involving C;
- exact declaration-owned single-effect handler bodies with no output mappings, incident/retry semantics, or nested BPMN handler control flow;
- a separate compensation-handler effect-wait collection whose identity remains compatible with the existing effect transport without changing ordinary effect-wait bytes;
- occurrence-level trigger, subject, handler, dependency, lifecycle, restored-context, and capacity state;
- concurrent activation of B and C, delayed activation of A until B is `Compensated`, and canonical state order without semantic serialization;
- success and fail-fast Process-failure witnesses, including removal of an in-flight handler effect wait, terminal canonical observation, and terminal receipt;
- proved Lean and independently written TypeScript semantic accounts before source or hosting work.

Optional after checkpoint approval: source admission, a standards-only profile, answer-free scenarios, differential evidence, and the bounded Temporal witness.

Excluded are targeted/asynchronous throws, Compensation End Events, Transactions/Cancel Events, implicit or recursive compensation, active/unsuccessful work, loops, Multi-Instance Sub-Processes, general handler graphs/data, boundary context, other dependency sources, failure recovery, CIB, Product 2, and general conformance.

## Program contract

The Program gains one `triggerCompensation` operation and one optional `compensationExecution` declaration. Reaching the operation's input consumes no token until the complete trigger transition has passed Program, RuntimeState, dependency, and capacity checks.

```ts
type TriggerCompensationOperation = Readonly<{
  kind: "triggerCompensation";
  id: string;
  origin: { kind: "bpmnElement"; elementId: string };
  definitionScopeId: string;
  input: string;
  output: string;
}>;

type SingleEffectCompensationHandlerBody = Readonly<{
  kind: "singleEffect";
  handlerElementId: string;
  effectElementId: string;
  descriptor: EffectDescriptor;
  input:
    | Readonly<{ kind: "empty" }>
    | Readonly<{
        kind: "restoredProcessBinding";
        sourceName: string;
        argumentName: string;
      }>;
}>;

type CompensationSubjectDefinition =
  | Readonly<{
      kind: "boundaryActivity";
      subjectElementId: string;
      body: SingleEffectCompensationHandlerBody;
    }>
  | Readonly<{
      kind: "eventSubProcess";
      parentScopeId: string;
      handlerScopeId: string;
      body: SingleEffectCompensationHandlerBody;
    }>;

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

type CompensationExecutionDeclaration = Readonly<{
  definitionScopeId: string;
  triggerOperationId: string;
  subjects: CompensationSubjectDefinition[];
  dependencies: CompensationDependency[];
  limits: CompensationTriggerLimits;
}>;
```

The declaration-owned `singleEffect` is neither an ordinary operation nor a control place. Snapshot handler scopes stay operation/control-place-free. Arbitrary handler flow must add a body-union arm and graph admission without reinterpreting `singleEffect`.

Validation requires agreement with retention targets, snapshot pairs, trigger origin, handler/effect identities, input disposition, canonical order, uniqueness, and acyclicity. Boundary bodies require `empty` and equal handler/effect elements; B requires `restoredProcessBinding` and a distinct effect element owned only by its handler scope. Declared elements are unavailable to ordinary operations.

The first Program has one occurrence per subject, so Sequence Flow lifts unambiguously to occurrence dependencies. The stored identity still permits later completion-time loop/Multi-Instance edges without reinterpretation.

## Runtime and public failure contract

A declaring RuntimeState has canonical `compensationTriggers` and `compensationHandlerEffectWaits` collections, including when empty. Programs without the declaration require both keys absent, preserving existing profile bytes. The existing `effectWaits` shape and ordinary `CompleteEffect` behavior remain unchanged.

```ts
type CompensationSubjectOccurrence =
  | Readonly<{ kind: "boundaryActivity"; activity: ActivityOccurrenceId }>
  | Readonly<{ kind: "eventSubProcess"; parent: ScopeOccurrenceId }>;

type CompensationHandlerIdentity = Readonly<{
  id: OccurrenceId;
  subject: CompensationSubjectOccurrence;
  handlerElementId: string;
}>;

type CompensationHandlerExecution = CompensationHandlerIdentity & (
  | Readonly<{ lifecycle: "pending" }>
  | Readonly<{
      lifecycle: "compensating";
      restoredContext: CompensationParentContextSnapshot | null;
      effectId: EffectOccurrenceId;
    }>
  | Readonly<{
      lifecycle: "compensated" | "failed" | "terminated";
    }>
);

type CompensationTriggerExecution = Readonly<{
  id: OccurrenceId;
  owner: ScopeOccurrenceId;
  output: string;
  lifecycle: "active" | "succeeded" | "failed";
  handlers: CompensationHandlerExecution[];
  dependencies: ReadonlyArray<{
    predecessor: CompensationSubjectOccurrence;
    successor: CompensationSubjectOccurrence;
    reason: "sequenceFlow";
  }>;
}>;

type CompensationHandlerEffectWait = Readonly<{
  id: EffectOccurrenceId;
  triggerId: OccurrenceId;
  handlerId: OccurrenceId;
  descriptor: EffectDescriptor;
  arguments: VariableBinding[];
}>;

type CompensationHandlerFailure = Readonly<{
  kind: "compensationHandlerFailure";
  triggerId: OccurrenceId;
  handlerId: OccurrenceId;
  effectId: EffectOccurrenceId;
  code: string;
  message: string | null;
}>;
```

`ControlStateKind` and `ProcessStatus` gain `Failed`; its control arm carries `instanceId` and the typed failure. `StateObservation` becomes status-discriminated: existing arms retain exact bytes, while `failed` requires the same failure. V1 gains `FailedProcessReceipt` with that final state. It is terminal, accepts no command or continuation, and is not Workflow failure.

Each trigger has an identity distinct from its throw Event, owns the withheld token, and contains canonical handlers and occurrence dependencies. Each handler identifies one consumed retention or snapshot. Restored context and `effectId` exist only while an Event Sub-Process handler compensates.

Trigger creation atomically removes every eligible root-owned retention or promoted snapshot into sole trigger ownership, preventing retrigger.

Declared source collections remain present when empty, and trigger tombstones survive Process termination. Success releases one output token. Failure releases none, changes root control to `failed`, retains failure/tombstones, and permits no token, wait, incident, live scope, restored frame, or Activity-local binding.

Trigger, handler, Activity, effect, and existing Process counters are separate and monotonic; cancellation never reuses identity.

## Trigger selection and dependency order

`COMPH-TRIGGER-01`: The throw selects exactly unclaimed eligible root-owned retentions and promoted snapshots. Invalid ownership, provisional state, duplication, undeclared handlers, ambiguous dependency lifting, cycles, or capacity excess refuses before mutation.

`COMPH-ORDER-01`: The forward dependency graph must be acyclic. A pending subject is maximal when none of its uncompensated forward successors remains `pending` or `compensating`. One transition starts the complete canonical set of maximal pending subjects; canonical order governs representation only, while all members become `compensating` together.

For A → B with independent C, the initial frontier is B and C. If B succeeds first, A starts even while C remains active. If C succeeds first, A remains pending until B succeeds. No evaluator iteration order, completion chronology, Temporal task order, or Event History order may add an edge or serialize C.

`COMPH-CONSUME-01`: Trigger creation consumes the input token and eligible source records atomically only after it has constructed a valid complete trigger and its first frontier. A zero-subject global throw is a successful no-op that moves the token directly to the output and creates no retained trigger.

## Snapshot restoration and handler execution

`COMPH-RESTORE-01`: Starting the Event Sub-Process handler for B copies its promoted completion-time frames into handler-private restored context. The handler reads that frozen context even if the enclosing root's current Process bindings differ. It never reconstructs context from Task I/O, public observation, current scope bindings, or host history.

B derives its input from the restored Process frame; A and C use empty inputs and claim no boundary-data visibility. Compensation waits project as existing `OpenEffect`/`CompleteEffect` transport but remain separate. IDs are globally unique. Admission searches both collections, refuses ambiguity, dispatches compensation first, and otherwise preserves ordinary completion. Compensation requires `localPatch: []`; success invokes `COMPH-SUCCEED-01`, `bpmnError` invokes `COMPH-FAIL-01`, and incident commands reject these IDs.

`COMPH-SUCCEED-01`: A successful exact handler effect removes its wait and private restored context, changes that subject from `compensating` to `compensated`, and atomically starts the newly maximal complete frontier. When every subject is `compensated`, the trigger becomes successful, releases the withheld output token once, and retains only terminal lifecycle tombstones until root disposal.

`COMPH-LIFECYCLE-01`: Private anchor arms identify the long-lived throw and handlers. Trigger creation starts the throw plus every frontier handler and, for B only, its distinct body effect in one transition batch. Success ends them `completed`. Failure and sibling termination retain exact internal `failed`/`terminated` tombstones but end their public occurrences with the existing coarse `cancelled` terminal; Process failure supplies the public discriminator. Pending handlers never start. Compensation waits bypass ordinary `awaitEffect` lifecycle projection, preventing duplicate occurrences. Handler success emits no control token; only trigger success emits the throw output.

An exact handler carries no BPMN Error route. Its `CompleteEffect` result with kind `bpmnError` is therefore interpreted as the compensation Activity throwing an uncaught exception and invokes `COMPH-FAIL-01`. Temporal Activity failure, retry, timeout, cancellation acknowledgement, and response loss remain transport facts and never directly select this semantic outcome.

## Failure and nested cancellation

`COMPH-FAIL-01`: The first admitted compensation `bpmnError` changes its active handler to `failed`, changes every other `pending` or `compensating` handler in the same trigger to `terminated`, preserves already `compensated` handlers, removes all handler and remaining root live regions, records the exact failure in control, and changes the Process to terminal `failed`. No continuation token is emitted and no later handler starts.

The deciding `CompleteEffect` returns `CommandOutcome.Committed`: `failed` is its committed semantic successor, not `CommandOutcome.SemanticFailure` or a host exception.

This fail-fast interpretation prevents continued independent work, abandoned work, zombie waits, or a nonterminal dead end. Recovery requires a later explicit arm; this Process is never completed, cancelled, running, or host-failed.

`COMPH-CANCEL-01`: Handler-region cancellation removes active effect waits, Activity-local bindings, restored frames, handler-owned Task/Message/Timer waits, incidents, and nested scopes if later admitted, while preserving terminal lifecycle records and monotonic counters. The first checkpoint's adversarial case has B and C active, C fail, B's nested effect wait disappear, B become `terminated`, and pending A become `terminated`.

`COMPH-STALE-01`: A late completion or failure report for a cancelled handler-owned effect is rejected by exact occurrence identity and leaves the terminal trigger byte-identical. Host cancellation acknowledgement cannot reopen the handler or change semantic failure order.

## Capacity and atomicity

The declaration bounds simultaneous triggers, total subjects, and canonical UTF-8 bytes of the ordered `(compensationTriggers, compensationHandlerEffectWaits)` pair. Bounds are positive safe integers; bytes are at most 65,536. The complete RuntimeState limit remains secondary.

`COMPH-CAPACITY-01`: Trigger creation preflights the complete trigger, occurrence identities, restored contexts, first-frontier waits, lifecycle records, and prospective canonical bytes before consuming the input token or retention records. Refusal changes no state, trace, lifecycle, or publication.

`COMPH-CAPACITY-02`: A successful handler completion that would start another frontier preflights the complete successor before consuming the current effect wait. Capacity refusal preserves the pre-command state and exposes no speculative `compensated` lifecycle.

## Separating witnesses

The positive witness completes A, embedded Sub-Process B, and C, mutates the current root variable after B's snapshot, then reaches the global throw. B and C arm together; B's effect input proves snapshot restoration. B completion permits A while C may remain active. All three successes produce exactly one continuation token and empty source retention collections.

The order mutation serializes C behind B and must fail because it removes a legal independent active handler. The reverse-order mutation starts A with B and must fail because it violates A → B. The restoration mutation reads the root's newer value and must fail. The consumption mutation leaves a claimed source record and must fail by enabling retrigger.

The failure witness reports C's exception from the B/C frontier and observes C `failed`, B/A `terminated`, no B wait/context or continuation, exact failed Process observation and v1 receipt. Late B completion rejects byte-preservingly before hosting and resolves `processClosed` after closure.

The capacity witness sets the exact bound one unit below the prospective first frontier and requires whole-transition refusal. A second witness permits trigger creation but makes A's unlocked frontier exceed its prospective bound, requiring the `CompleteEffect` command to roll back entirely.

## Lean assurance lane

The first checkpoint is a proved lane. Lean defines the declarative trigger, frontier, success, failure, cancellation, and refusal relations separately from executable evaluators, then checks evaluator soundness for every constructor-producing arm.

Required results are acyclic-frontier existence for the finite exact graph, maximal-frontier correctness, A-after-B safety, independent B/C simultaneous enablement, successful restoration, single continuation, source-record consumption, typed terminal Process failure, complete root/handler-region cancellation, stale-result preservation, capacity atomicity, observation agreement, and RuntimeState validity preservation.

Checked non-laws reject preserved source retentions, chronology order, universal serialization, surviving failed waits, and surviving cancelled context. No general topological completeness or fixture-derived Lean/TS correspondence is claimed.

## Temporal hosting and refinement preflight

Durable ingress is ordinary internal arrival at the throw operation; no public command triggers compensation. A dedicated frontier scheduler owns a state only when one trigger has compensation handler waits and no ordinary Timer, effect, Message, User Task, incident, or second trigger wait is live. Host admission rejects every other coexistence shape for this capsule before Workflow creation.

At a committed frontier the main loop first evaluates the existing rollover fence. If rollover is required, it carries the complete semantic waits before scheduling any Activity; the successor Run schedules them. Otherwise the scheduler creates every frontier Activity and its hidden cancellation scope before observing any completion, retains those promises across loop iterations, and reports each content-bound result through ordinary `CompleteEffect`. Callbacks from one Workflow activation are enqueued in canonical effect-identity order, making raw promise callback order non-semantic. Once the first frontier Activity is scheduled, Continue-As-New is forbidden until every scheduled result or cancellation acknowledgement has been reconciled and the scheduler owns no in-flight Activity. Temporal cannot transfer an Activity between Runs, so no witness or implementation may claim rollover with an already scheduled Activity.

The trigger, handler lifecycles, consumed-record fact, occurrence dependencies, restored frames, and effect identities survive Worker replacement, replay, and the pre-schedule continuation boundary. Activity attempts and retries remain transport state and never create a handler occurrence or change dependency order.

When C reports `bpmnError`, the Workflow first commits and publishes semantic `failed`, then requests cancellation of B's Activity, drains accepted handlers, and returns the failed v1 receipt only after the cancellation acknowledgement. A racing late B result is reconciled against the terminal semantic identity and cannot change the receipt. A Temporal Activity failure, timeout, retry exhaustion, cancellation-delivery failure, or malformed result remains an infrastructure failure rather than a semantic `failed` state.

The smallest later durable witnesses are: successful B/C concurrency with restored B input and A-after-B order; response loss after one handler completion; Worker replacement before and during the trigger; forced Continue-As-New at the committed-but-unscheduled B/C frontier with Activities only in the successor Run; C semantic failure cancelling B while A is pending; same-activation callback-order mutation, sequential-scheduling mutation, rematching mutation, failed-receipt substitution, and replay of every Run.

No live Temporal implementation begins at the first semantic checkpoint. An unclassified inability to preserve concurrent frontier, restored context, terminal failure, or late-result refusal reopens this proposal before profile admission.

## Evidence strategy

| Claim | Lean | TypeScript | Source/profile | Temporal | Negative or mutation evidence |
|---|---|---|---|---|---|
| Eligible records are atomically claimed once | Required | Required | Later | Later | retained-record retrigger mutation |
| A → B reverses while C stays independent | Required | Required | Later | Later | A-early and C-serialization mutations |
| B receives its frozen snapshot | Required | Required | Later | Later | current-context substitution |
| Handler success advances the next frontier | Required | Required | Later | Later | missing/duplicate frontier activation |
| Semantic failure produces one typed terminal Process | Required | Required | Later | Later | zombie wait, pending-A, status, and receipt substitutions |
| Capacity refusal is whole-transition atomic | Required | Required | Later | Later | first-frontier and unlocked-frontier bounds |
| CIB compatibility | Not claimed | Not claimed | Not selected | Not claimed | timestamp-order observation only |

The first green checkpoint consists only of the complete Program/Runtime/observation representation, both independent semantic accounts, their focused validity and adversarial suites, exact cross-language invariant matrix, applicable schema/definition artifacts, and focused documentation gates. It adds no source profile, shared scenario, CIB case, live host capability, corpus row, or Product 2 behavior.

## Runtime-only inventory and layer ownership

The Program owns the closed single-effect handler bodies, trigger operation identity, exact dependency declarations, and limits. RuntimeState owns trigger/handler occurrences, occurrence dependencies, restored private context, dedicated handler effect waits, lifecycle, source-record consumption, and terminal failure. The pure semantic core and Lean independently own transition meaning; the canonical semantic observation owns the public failure discriminator.

Source later owns exact XML provenance and checked lowering. Temporal later owns durable scheduling, Activity execution, transport retries, cancellation delivery, continuation, and replay without adding BPMN facts. Publication and Product 2 own no field in this checkpoint.

## Versioning consequences

The repository's pre-release replace-in-place policy applies. The operation and Program declaration are additive, and the two optional RuntimeState collections are absent for every existing Program, but `Failed`, the status-discriminated observation, and the failed arm of the closed v1 terminal receipt widen shared strict unions. Every producer, decoder, exhaustive switch, schema, fixture, publication consumer, continuation boundary, and terminal-result consumer changes atomically; there is no v2 receipt, compatibility reader, defaulted failure, or mixed old/new runtime. Existing profiles retain exact bytes and behavior because they cannot construct the declaration or `failed` state.

The complete `what-binds` inventory requires [`implementation-status-owner:ENGINE-RUNTIME-PROOF`](../ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), [`implementation-status-owner:TEMPORAL-HOSTING`](../TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md), [Semantic Process IL](../SEMANTIC-PROCESS-IL-SPEC.md), [contract registry](../../contracts/README.md), [package guide](../../packages/semantic-core/README.md), [source map](../../packages/semantic-core/SOURCE-MAP.md), [schema coverage](../../scripts/contract-schema-coverage.test.ts), [definition artifacts](../../scripts/contract-definition-artifacts.test.ts), [commutation census](../../scripts/internal-commutation-census.test.ts), [collection removal](../../scripts/runtime-collection-removal-completeness.test.ts), [source hygiene](../../scripts/source-hygiene.test.ts), [reviewability](../../scripts/document-reviewability.test.ts), [review policy](../../scripts/independent-review-policy.test.ts), and [requirement-ledger consistency](../../scripts/requirement-ledger-consistency.test.ts).

The operation census must classify trigger creation and frontier activation as one atomic state-transforming family whose simultaneous members are not independently scheduled internal operations. Existing transition traces, replay, canonical ordering, RuntimeState validity, removal helpers, closure, and command-result consumers must either handle the new variants or carry an explicit proved no-change obligation.

### Atomic migration matrix

| Boundary | Required disposition |
|---|---|
| [TS Program](../../packages/semantic-core/src/semantic-process-contract.ts), [operation admission](../../packages/semantic-core/src/semantic-process-operation-admission.ts), and [graph admission](../../packages/semantic-core/src/semantic-process-graph-admission.ts) | Add the closed declaration; ordinary reachability stays exact. |
| [snapshot Program/state validation](../../packages/semantic-core/src/compensation-event-sub-process-snapshot-state-validation.ts), [snapshot tests](../../packages/semantic-core/test/compensation-event-sub-process-snapshot.test.ts), and [Lean snapshot declaration](../../BpmnSemantics/SemanticProcess/CompensationEventSubProcessSnapshotDeclaration.lean) | Prove no change: handler scopes remain operation/control-place-free and snapshot bytes exact. |
| [TS RuntimeState](../../packages/semantic-core/src/semantic-process-state.ts), [runtime validity](../../packages/semantic-core/src/runtime-state-well-formedness.ts), [runtime defects](../../packages/semantic-core/src/runtime-state-defect.ts), and [collection-removal guard](../../scripts/runtime-collection-removal-completeness.test.ts) | Add collections, global effect-ID uniqueness, `Failed`, tombstones, and complete live-region removal. |
| [TS command admission](../../packages/semantic-core/src/semantic-command-admission.ts) and [Lean effect completion](../../BpmnSemantics/SemanticProcess/EffectCompletion.lean) | Dispatch compensation IDs before unchanged ordinary completion; reject patches, ambiguity, incidents, and stale results. |
| [transition trace](../../packages/semantic-core/src/semantic-transition-trace.ts), [flow-node lifecycle](../../packages/semantic-core/src/flow-node-occurrence-lifecycle.ts), [E2 protocol](../../packages/temporal-adapter/protocol/src/flow-node-occurrence-publication.ts), and [Workflow projection](../../packages/temporal-adapter/workflow/src/flow-node-occurrence-publication-state.ts) | Add private trigger/handler anchors and one projection; prove the public completed/cancelled union and platform consumers unchanged. |
| [canonical contract](../../packages/semantic-core/src/contract.ts), [contract registry](../../contracts/README.md), [definition artifacts](../../scripts/contract-definition-artifacts.test.ts), and [schema coverage](../../scripts/contract-schema-coverage.test.ts) | Add exact Program/Runtime/failed observation arms to TS and Lean wires. |
| [terminal protocol](../../packages/temporal-adapter/protocol/src/contracts.ts), [receipt construction](../../packages/temporal-adapter/workflow/src/terminal-process-receipt.ts), and [terminal envelope](../../packages/temporal-adapter/workflow/src/workflow-terminal-completion.ts) | Widen v1 to failed, require control/observation equality, drain handlers, and preserve `processClosed`. |
| [continuation](../../packages/temporal-adapter/protocol/src/workflow-continuation.ts), [Workflow loop](../../packages/temporal-adapter/workflow/src/workflow-implementation.ts), [host readiness](../../packages/temporal-adapter/workflow/src/workflow-host-readiness.ts), and [effect host](../../packages/temporal-adapter/workflow/src/effect-execution-host.ts) | Carry only running unscheduled waits; add frontier scheduling and the in-flight rollover fence; failed never continues. |
| [commutation census](../../scripts/internal-commutation-census.test.ts) and [Semantic Process IL](../SEMANTIC-PROCESS-IL-SPEC.md) | Classify internal atomicity, external-result footprints, simultaneous frontier, and failure observation. |

### Owners this implementation grows

| Existing owner | Current headroom | Growth condition |
|---|---:|---|
| [TS Program](../../packages/semantic-core/src/semantic-process-contract.ts) | 208 | references only |
| [TS operation admission](../../packages/semantic-core/src/semantic-process-operation-admission.ts) | 24 | extract declaration validation first |
| [TS graph admission](../../packages/semantic-core/src/semantic-process-graph-admission.ts) | 178 | declaration delegation only |
| [TS RuntimeState](../../packages/semantic-core/src/semantic-process-state.ts) | 378 | collection/control references only |
| [TS runtime validity](../../packages/semantic-core/src/runtime-state-well-formedness.ts) | 73 | extract compensation validity first |
| [TS runtime defects](../../packages/semantic-core/src/runtime-state-defect.ts) | 762 | new defect arms only |
| [TS command admission](../../packages/semantic-core/src/semantic-command-admission.ts) | 382 | result dispatch only |
| [TS transition trace](../../packages/semantic-core/src/semantic-transition-trace.ts) | 426 | failed arm only |
| [TS lifecycle](../../packages/semantic-core/src/flow-node-occurrence-lifecycle.ts) | 105 | delegate compensation projection |
| [TS lifecycle completeness](../../packages/semantic-core/src/flow-node-occurrence-publication-external-completeness.ts) | 91 | delegate compensation oracle |
| [TS canonical contract](../../packages/semantic-core/src/contract.ts) | 338 | failed union references only |
| [TS evaluator](../../packages/semantic-core/src/semantic-process-runtime.ts) | 62 | dispatch only; extract all trigger and handler logic before growth |
| [TS internal attempt](../../packages/semantic-core/src/internal-transition-attempt.ts) | 668 | trigger-attempt delegation only |
| [Lean Program](../../BpmnSemantics/SemanticProcessContract.lean) | 93 | declaration reference only; extract the contract first if the reference cannot fit |
| [Lean RuntimeState](../../BpmnSemantics/SemanticProcess/RuntimeState.lean) | 201 | trigger collection reference only |
| [Lean effect completion](../../BpmnSemantics/SemanticProcess/EffectCompletion.lean) | 721 | compensation relation only |
| [Lean command admission](../../BpmnSemantics/SemanticProcess/CommandAdmission.lean) | 272 | result dispatch only |
| [Lean transition](../../BpmnSemantics/SemanticProcess/Transition.lean) | 23 | extract before adding the new dispatcher arm |
| [Lean internal attempt](../../BpmnSemantics/SemanticProcess/InternalOperationAttempt.lean) | 757 | trigger-attempt delegation only |
| [Lean scenario contract](../../BpmnSemantics/Scenario.lean) | 453 | failed union only |
| [Lean JSON](../../BpmnSemantics/SemanticProcessJsonMain.lean) | 244 | failed encoding only |
| [Temporal protocol](../../packages/temporal-adapter/protocol/src/contracts.ts) | 556 | failed receipt arm only |
| [terminal receipt](../../packages/temporal-adapter/workflow/src/terminal-process-receipt.ts) | 709 | failed construction only |
| [terminal envelope](../../packages/temporal-adapter/workflow/src/workflow-terminal-completion.ts) | 559 | failed validation only |
| [continuation](../../packages/temporal-adapter/protocol/src/workflow-continuation.ts) | 263 | new collections and failed refusal |
| [Workflow loop](../../packages/temporal-adapter/workflow/src/workflow-implementation.ts) | 79 | extract frontier scheduler before integration |
| [host readiness](../../packages/temporal-adapter/workflow/src/workflow-host-readiness.ts) | 526 | scheduler delegation only |
| [effect host](../../packages/temporal-adapter/workflow/src/effect-execution-host.ts) | 668 | compensation result dispatch only |

Every headroom figure is the measured nonblank-line remainder below the 800-line review target. No size exception is requested. New bounded owners should contain the compensation execution contract, trigger construction, frontier selection, handler completion, cancellation, validity, and focused tests/proofs; shared integration owners receive references or dispatch only.

## Epistemic closure and reopen conditions

Selected: root-global synchronous triggering, exact eligible-source consumption, occurrence-level dependencies, reverse dependency order, concurrent maximal frontiers, declaration-owned one-effect bodies, snapshot restoration, typed terminal Process failure, complete region cancellation, stale-result refusal, capacity, a failed v1 receipt, and future hosting obligations.

Open: source admission, shared scenario wires, Product 1 publication, targeted/asynchronous throws, general handler graphs and data, other dependencies, loops and Multi-Instance Sub-Processes, recursive compensation, Transactions/Cancel Events, failure recovery, CIB profile behavior, live refinement, whole models, corpus, Product 2, and conformance.

Reopen before implementation if review finds the fail-fast rule incompatible with BPMN lifecycle, the body union cannot widen without reinterpretation, restored context cannot reach the exact effect, the frontier cannot be hosted without observable serialization, failed Process publication collapses into infrastructure failure, or cancellation cannot drain Activities while preserving identity.

## Stage boundary

The immutable draft requires a context-cold proposal review before implementation. A green proposal verdict is the approval; any required edits must be audited by the same reviewer and recorded below.

After approval, the first implementation stage stops when the complete Program/Runtime/observation representation and independent Lean/TypeScript semantics named above are green. That checkpoint requires independent review before source, profile, shared scenario, CIB, Temporal hosting, Product 1 publication, corpus, or Product 2 work begins.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `59a2d3e1` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
