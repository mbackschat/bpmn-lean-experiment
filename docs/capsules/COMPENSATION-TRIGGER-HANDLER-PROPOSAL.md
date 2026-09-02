# Compensation trigger and handler proposal

## Status

Lifecycle: draft
Review: pending

## Prior review

Cold review rejected `21f83fa9`: the handler join was prose, failure had no Process lifecycle or receipt, Continue-As-New carried an already scheduled Activity, and the migration inventory omitted decisive owners. Review target `59a2d3e1` accepted the material redesign with required edits; the same reviewer approved corrections `af15fa2f` and `f1a7db62` with every original finding closed.

The post-approval checkpoint-boundary review accepted `540e0b2d` with required edits; the same reviewer approved corrections `e4dd8430` and `010a686c`, closing preservation of `notStarted`, Product 2 failed-value rejection, and the live-hosting exclusion without changing the selected semantic account.

Implementation preflight then exposed one representation defect before either semantic evaluator was written: trigger creation consumes a promoted Event Sub-Process snapshot, but the approved `pending` handler arm had nowhere to retain it when that subject was not in the first maximal frontier. The fixed B/C witness concealed the defect because its Event Sub-Process handler starts immediately, while the admitted acyclic declaration also permits an Event Sub-Process predecessor that starts only after its successor completes. This amendment places the already-selected frozen context in the exact pending handler that owns the consumed subject. Cold review accepted target `5b45b845` with required edits to complete the four-collection continuation inventory and make pending-context capacity, continuation, and cancellation evidence explicit; implementation remains stopped until the same reviewer audits those corrections.

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

Excluded are targeted/asynchronous throws, Compensation End Events, Transactions/Cancel Events, implicit or recursive compensation, active/unsuccessful work, loops, Multi-Instance Sub-Processes, general handler graphs/data, boundary context, other dependency sources, failure recovery, CIB, Product 2 persistence/API/UI/journey support for failed Processes, and general conformance.

## Program contract

The Program gains one `triggerCompensation` operation and one optional `compensationExecution` declaration. Reaching the operation's input consumes no token until the complete trigger transition has passed Program, RuntimeState, dependency, and capacity checks.

```ts
const CompensationSingleEffectOperation =
  "urn:bpmn-lean:effect-operation:compensation-single-effect-v1" as const;

type CompensationSingleEffectDescriptor = Readonly<{
  protocol: typeof EffectProtocol.Activity;
  operation: typeof CompensationSingleEffectOperation;
}>;

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
  descriptor: CompensationSingleEffectDescriptor;
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

The declaration-owned `singleEffect` is neither an ordinary operation nor a control place. Its descriptor is the exact `EffectProtocol.Activity` and `CompensationSingleEffectOperation` pair above; the implementation adds that operation literal to the shared `EffectOperation` catalog but no existing profile admits it. Snapshot handler scopes stay operation/control-place-free. Arbitrary handler flow must add a body-union arm and graph admission without reinterpreting `singleEffect`.

Validation requires agreement with retention targets, snapshot pairs, trigger origin, handler/effect identities, the exact compensation descriptor, input disposition, canonical order, uniqueness, and acyclicity. Boundary bodies require `empty` and equal handler/effect elements; B requires `restoredProcessBinding` with nonempty distinct source and argument names and a distinct effect element owned only by its handler scope. Declared elements are unavailable to ordinary operations.

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
  | Readonly<{
      lifecycle: "pending";
      restoredContext: CompensationParentContextSnapshot | null;
    }>
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
  descriptor: CompensationSingleEffectDescriptor;
  arguments: readonly [] | readonly [VariableBinding];
}>;

type CompensationEffectTransportMaterial = Readonly<{
  definition: SemanticProcessIdentity;
  triggerId: OccurrenceId;
  handlerId: OccurrenceId;
  effectId: EffectOccurrenceId;
  descriptor: CompensationSingleEffectDescriptor;
  arguments: readonly [] | readonly [VariableBinding];
}>;

type CompensationSingleEffectResult =
  | Readonly<{
      kind: EffectExecutionResultKind.Success;
      localPatch: readonly [];
    }>
  | Readonly<{
      kind: EffectExecutionResultKind.BpmnError;
      code: string;
      message: string | null;
      localPatch: readonly [];
    }>;

type CompensationHandlerFailure = Readonly<{
  kind: "compensationHandlerFailure";
  triggerId: OccurrenceId;
  handlerId: OccurrenceId;
  effectId: EffectOccurrenceId;
  code: string;
  message: string | null;
}>;

type FailedControl = Readonly<{
  kind: ControlStateKind.Failed;
  instanceId: string;
  failure: CompensationHandlerFailure;
}>;

type StateObservationFields = Readonly<{
  kind: CanonicalObservationKind.State;
  instanceId: string;
  activeWaits: readonly ActiveWait[];
  openUserTasks: readonly OpenUserTask[];
  openMessageSubscriptions: readonly OpenMessageSubscription[];
  openTimers: readonly OpenTimer[];
  openEffects: readonly OpenEffect[];
  openIncidents: readonly OpenEffectIncident[];
  openMultiInstances?: readonly OpenMultiInstance[];
  variables: readonly VariableBinding[];
  enabledInteractions: readonly EnabledInteraction[];
  logicalTimeMs: number;
}>;

type ExistingStateObservation = StateObservationFields & Readonly<{
  status:
    | ProcessStatus.NotStarted
    | ProcessStatus.Running
    | ProcessStatus.Completed
    | ProcessStatus.Cancelled;
  failure?: never;
}>;

type FailedStateObservation = StateObservationFields & Readonly<{
  status: ProcessStatus.Failed;
  failure: CompensationHandlerFailure;
  activeWaits: readonly [];
  openUserTasks: readonly [];
  openMessageSubscriptions: readonly [];
  openTimers: readonly [];
  openEffects: readonly [];
  openIncidents: readonly [];
  openMultiInstances?: readonly [];
  enabledInteractions: readonly [];
}>;

type StateObservation =
  | ExistingStateObservation
  | FailedStateObservation;

type FailedProcessReceipt = Readonly<{
  format: typeof processTerminalReceiptFormatV1;
  definition: SemanticProcessIdentity;
  processId: string;
  processInstanceId: string;
  finalState: FailedStateObservation;
}>;

type TerminalProcessReceipt =
  | CompletedProcessReceipt
  | CancelledProcessReceipt
  | FailedProcessReceipt;
```

`ControlStateKind` and `ProcessStatus` gain `Failed`; `ControlState` adds exactly `FailedControl` while its existing instanced arm remains byte-identical. `StateObservation` becomes the union above: `notStarted`, `running`, `completed`, and `cancelled` forbid `failure` and retain exact bytes, while `failed` requires it and every public wait, incident, interaction, and optional Multi-Instance collection is empty. Presence of `openMultiInstances` remains the existing Program-owned rule. The scenario schema and [observation-contract suite](../../packages/semantic-core/test/sequential-multi-instance-observation-contract.test.ts) retain an explicit old-byte `notStarted` witness. V1 adds the exact `FailedProcessReceipt` arm above. It is terminal, accepts no command or continuation, and is not Workflow failure.

The pending and compensating arms both own `restoredContext`. It is `null` for every boundary handler and the exact consumed promoted snapshot for every Event Sub-Process handler. Frontier activation carries that value unchanged from `pending` to `compensating`; it does not read the current Process binding, reconstruct a snapshot, or retain a second source record. Every terminal handler arm drops the context. Keeping the value on the handler is smaller than a trigger-level selected-snapshot collection: the handler already owns the exact consumed subject, while another collection would duplicate that join and add independent ordering, uniqueness, capacity, validation, cancellation, and continuation obligations.

Each trigger has an identity distinct from its throw Event, owns the withheld token, and contains canonical handlers and occurrence dependencies. Each handler identifies one consumed retention or snapshot. Restored context exists while an Event Sub-Process handler is pending or compensating, while `effectId` exists only while any handler compensates.

Trigger creation atomically removes every eligible root-owned retention or promoted snapshot into sole trigger ownership, preventing retrigger.

Declared source collections remain present when empty, and trigger tombstones survive Process termination. Success releases one output token. Failure releases none, changes root control to `failed`, retains failure/tombstones, and permits no token, wait, incident, live scope, restored frame, or Activity-local binding.

Trigger, handler, Activity, effect, and existing Process counters are separate and monotonic; cancellation never reuses identity.

## Trigger selection and dependency order

`COMPH-TRIGGER-01`: The throw selects exactly unclaimed eligible root-owned retentions and promoted snapshots. Invalid ownership, provisional state, duplication, undeclared handlers, ambiguous dependency lifting, cycles, or capacity excess refuses before mutation.

`COMPH-ORDER-01`: The forward dependency graph must be acyclic. A pending subject is maximal when none of its uncompensated forward successors remains `pending` or `compensating`. One transition starts the complete canonical set of maximal pending subjects; canonical order governs representation only, while all members become `compensating` together.

For A → B with independent C, the initial frontier is B and C. If B succeeds first, A starts even while C remains active. If C succeeds first, A remains pending until B succeeds. No evaluator iteration order, completion chronology, Temporal task order, or Event History order may add an edge or serialize C.

`COMPH-CONSUME-01`: Trigger creation consumes the input token and eligible source records atomically only after it has constructed a valid complete trigger and its first frontier. Every consumed promoted snapshot moves into the exact selected Event Sub-Process handler even when that handler is pending; no source record or second trigger-level snapshot copy remains. A zero-subject global throw is a successful no-op that moves the token directly to the output and creates no retained trigger.

## Snapshot restoration and handler execution

`COMPH-RESTORE-01`: Trigger creation copies each selected Event Sub-Process subject's promoted completion-time frames into handler-private restored context before consuming the source record. Starting that handler, whether in the first or a later frontier, carries the exact stored frames unchanged and reads them even if the enclosing root's current Process bindings differ. It never reconstructs context from Task I/O, public observation, current scope bindings, or host history.

B derives exactly one argument from the restored Process frame: its binding name equals the declaration's `argumentName` and its value is the frozen value at `sourceName`. A and C use `arguments: []` and claim no boundary-data visibility. Any missing source, duplicate or extra argument, wrong binding name, or non-compensation descriptor is invalid before the wait is created. Compensation waits project as existing `OpenEffect`/`CompleteEffect` transport but remain separate. IDs are globally unique. Admission searches both collections, refuses ambiguity, dispatches compensation first, and otherwise preserves ordinary completion.

The Activity request uses the ordinary `EffectRequest` envelope, but its validator narrows it to the exact compensation descriptor and the zero-or-one argument contract above. Its existing `effect-transport-sha256:` key prefix hashes a compensation-specific canonical tuple containing definition identity, complete trigger ID, handler ID, effect ID, descriptor, and arguments. An exact retry therefore repeats the same key and request. The testkit Worker registry has one explicit compensation-operation implementation and may return only `CompensationSingleEffectResult`; the production bounded Worker wrapper remains generic and must prove no change. Semantic completion revalidates the descriptor, arguments, and mandatory `localPatch: []`; `success` invokes `COMPH-SUCCEED-01`, `bpmnError` invokes `COMPH-FAIL-01`, and incident or technical-failure commands reject these IDs.

`COMPH-SUCCEED-01`: A successful exact handler effect removes its wait and private restored context, changes that subject from `compensating` to `compensated`, and atomically starts the newly maximal complete frontier. When every subject is `compensated`, the trigger becomes successful, releases the withheld output token once, and retains only terminal lifecycle tombstones until root disposal.

`COMPH-LIFECYCLE-01`: `SemanticFlowNodeOccurrenceAnchorKind` adds `CompensationTrigger = "compensationTrigger"` and `CompensationHandler = "compensationHandler"`; their exact private arms are `{ kind: CompensationTrigger; id: OccurrenceId }` and `{ kind: CompensationHandler; id: OccurrenceId }`. Trigger creation starts the throw plus every frontier handler and, for B only, its distinct body effect in one transition batch. Success ends them `completed`. Failure and sibling termination retain exact internal `failed`/`terminated` tombstones but end their public occurrences with the existing coarse `cancelled` terminal; Process failure supplies the public discriminator. Pending handlers never start. Compensation waits bypass ordinary `awaitEffect` lifecycle projection, preventing duplicate occurrences. Handler success emits no control token; only trigger success emits the throw output.

An exact handler carries no BPMN Error route. Its `CompleteEffect` result with kind `bpmnError` is therefore interpreted as the compensation Activity throwing an uncaught exception and invokes `COMPH-FAIL-01`. Temporal Activity failure, retry, timeout, cancellation acknowledgement, and response loss remain transport facts and never directly select this semantic outcome.

## Failure and nested cancellation

`COMPH-FAIL-01`: The first admitted compensation `bpmnError` changes its active handler to `failed`, changes every other `pending` or `compensating` handler in the same trigger to `terminated`, preserves already `compensated` handlers, removes all handler and remaining root live regions, records the exact failure in control, and changes the Process to terminal `failed`. No continuation token is emitted and no later handler starts.

The deciding `CompleteEffect` returns `CommandOutcome.Committed`: `failed` is its committed semantic successor, not `CommandOutcome.SemanticFailure` or a host exception.

This fail-fast interpretation prevents continued independent work, abandoned work, zombie waits, or a nonterminal dead end. Recovery requires a later explicit arm; this Process is never completed, cancelled, running, or host-failed.

`COMPH-CANCEL-01`: Handler-region cancellation removes active effect waits, Activity-local bindings, pending or active restored frames, handler-owned Task/Message/Timer waits, incidents, and nested scopes if later admitted, while preserving terminal lifecycle records and monotonic counters. The first checkpoint's adversarial case has B and C active, C fail, B's nested effect wait disappear, B become `terminated`, and pending A become `terminated` with its restored Event Sub-Process context removed.

`COMPH-STALE-01`: A late completion or failure report for a cancelled handler-owned effect is rejected by exact occurrence identity and leaves the terminal trigger byte-identical. Host cancellation acknowledgement cannot reopen the handler or change semantic failure order.

## Capacity and atomicity

The declaration bounds simultaneous triggers, total subjects, and canonical UTF-8 bytes of the ordered `(compensationTriggers, compensationHandlerEffectWaits)` pair. Bounds are positive safe integers; bytes are at most 65,536. The complete RuntimeState limit remains secondary.

`COMPH-CAPACITY-01`: Trigger creation preflights the complete trigger, occurrence identities, every pending and active restored context, first-frontier waits, lifecycle records, and prospective canonical bytes before consuming the input token or retention records. Because trigger creation is a refusable internal operation reached only inside one enclosing stimulus evaluation, refusal returns that stimulus as `CommandOutcome.Rejected` with the exact pre-command RuntimeState and empty transition trace, lifecycle, and publication. It is not `RolledBack`, `SemanticFailure`, or a partially admitted command.

`COMPH-CAPACITY-02`: A successful handler completion that would start another frontier preflights the complete successor before consuming the current effect wait. Refusal returns the enclosing `CompleteEffect` as `CommandOutcome.Rejected` with the exact pre-command RuntimeState and empty transition trace, lifecycle, and publication; it consumes neither the effect wait nor the handler result and exposes no speculative `compensated` lifecycle. It is not the committed handler-failure outcome, `RolledBack`, or `SemanticFailure`.

## Separating witnesses

The positive witness completes A, embedded Sub-Process B, and C, mutates the current root variable after B's snapshot, then reaches the global throw. B and C arm together; B's effect input proves snapshot restoration. B completion permits A while C may remain active. All three successes produce exactly one continuation token and empty source retention collections.

The order mutation serializes C behind B and must fail because it removes a legal independent active handler. The reverse-order mutation starts A with B and must fail because it violates A → B. The restoration mutation reads the root's newer value and must fail. The consumption mutation leaves a claimed source record and must fail by enabling retrigger.

A separate delayed-restoration witness makes the Event Sub-Process subject a non-maximal predecessor. Trigger creation must empty the promoted-snapshot source collection while retaining the exact frozen frames on that pending handler; the strict runtime reader and Workflow continuation must preserve that exact context; after its successor completes, activation must carry those same frames into the effect argument despite a newer current Process value. A sibling failure while the handler remains pending must terminalize it and remove its context. Dropping the pending context, losing it across continuation, retaining it after sibling failure, leaving the promoted source record in place, or reconstructing from current state must each fail.

The failure witness reports C's exception from the B/C frontier and observes C `failed`, B/A `terminated`, no B wait/context or continuation, exact failed Process observation and v1 receipt. Late B completion rejects byte-preservingly before hosting and resolves `processClosed` after closure.

The capacity witness sets the exact bound one unit below the prospective first frontier and requires whole-transition refusal. The bound accounts for the complete pending Event Sub-Process context; a mutation that omits those bytes must fail. A second witness permits trigger creation but makes A's unlocked frontier exceed its prospective bound, requiring the `CompleteEffect` command to reject byte-preservingly.

## Lean assurance lane

The first checkpoint is a proved lane. Lean defines the declarative trigger, frontier, success, failure, cancellation, and refusal relations separately from executable evaluators, then checks evaluator soundness for every constructor-producing arm.

Required results are acyclic-frontier existence for the finite exact graph, maximal-frontier correctness, A-after-B safety, independent B/C simultaneous enablement, immediate and delayed successful restoration, pending-context preservation until activation, pending-context disposal on sibling failure, single continuation, source-record consumption, typed terminal Process failure, complete root/handler-region cancellation, stale-result preservation, capacity atomicity including pending-context bytes, observation agreement, and RuntimeState validity preservation.

Checked non-laws reject preserved source retentions, chronology order, universal serialization, surviving failed waits, and surviving cancelled context. No general topological completeness or fixture-derived Lean/TS correspondence is claimed.

## Temporal hosting and refinement preflight

Durable ingress is ordinary internal arrival at the throw operation; no public command triggers compensation. A dedicated frontier scheduler owns a state only when one trigger has compensation handler waits and no ordinary Timer, effect, Message, User Task, incident, or second trigger wait is live. Host admission rejects every other coexistence shape for this capsule before Workflow creation.

At a committed frontier the main loop first evaluates the existing rollover fence. If rollover is required, it carries the complete semantic waits before scheduling any Activity; the successor Run schedules them. Otherwise the scheduler creates every frontier Activity and its hidden cancellation scope before observing any completion, retains those promises across loop iterations, and reports each content-bound result through ordinary `CompleteEffect`. Callbacks from one Workflow activation are enqueued in canonical effect-identity order, making raw promise callback order non-semantic. Once the first frontier Activity is scheduled, Continue-As-New is forbidden until every scheduled result or cancellation acknowledgement has been reconciled and the scheduler owns no in-flight Activity. Temporal cannot transfer an Activity between Runs, so no witness or implementation may claim rollover with an already scheduled Activity.

The trigger, handler lifecycles, consumed-record fact, occurrence dependencies, restored frames, and effect identities survive Worker replacement, replay, and the pre-schedule continuation boundary. Activity attempts and retries remain transport state and never create a handler occurrence or change dependency order.

When C reports `bpmnError`, the Workflow first commits and publishes semantic `failed`, then requests cancellation of B's Activity with `WAIT_CANCELLATION_COMPLETED` and drains accepted handlers. That SDK mode resolves when B ends successfully, unsuccessfully, or as cancelled, so receipt readiness requires B's final Activity resolution rather than a cancellation-labelled acknowledgement: the Workflow returns the failed v1 receipt only after every scheduled handler Activity has reached one of those resolutions and no in-flight Activity remains. A racing successful or unsuccessful B result is reconciled against the terminal semantic identity and cannot change the receipt. A Temporal Activity failure, timeout, retry exhaustion, cancellation-delivery failure, or malformed result remains an infrastructure failure rather than a semantic `failed` state.

The smallest later durable witnesses are: successful B/C concurrency with restored B input and A-after-B order; response loss after one handler completion; Worker replacement before and during the trigger; forced Continue-As-New at the committed-but-unscheduled B/C frontier with Activities only in the successor Run; C semantic failure cancelling B while A is pending; same-activation callback-order mutation, sequential-scheduling mutation, rematching mutation, failed-receipt substitution, and replay of every Run.

No live Temporal implementation begins at the first semantic checkpoint. An unclassified inability to preserve concurrent frontier, restored context, terminal failure, or late-result refusal reopens this proposal before profile admission.

## Evidence strategy

| Claim | Lean | TypeScript | Source/profile | Temporal | Negative or mutation evidence |
|---|---|---|---|---|---|
| Eligible records are atomically claimed once | Required | Required | Later | Later | retained-record retrigger mutation |
| A → B reverses while C stays independent | Required | Required | Later | Later | A-early and C-serialization mutations |
| B retains and receives its frozen snapshot whether initially active or pending | Required | Required | Later | Strict continuation required | pending-context loss, omitted-byte accounting, continuation loss, sibling-failure survivor, retained-source, and current-context substitutions |
| Handler success advances the next frontier | Required | Required | Later | Later | missing/duplicate frontier activation |
| Semantic failure produces one typed terminal Process | Required | Required | Later | Later | zombie wait, pending-A, status, and receipt substitutions |
| Capacity refusal is whole-transition atomic | Required | Required | Later | Later | first-frontier and unlocked-frontier bounds |
| CIB compatibility | Not claimed | Not claimed | Not selected | Not claimed | timestamp-order observation only |

The first green checkpoint consists only of the complete Program/Runtime/observation representation, both independent semantic accounts, their focused validity and adversarial suites, exact cross-language invariant matrix, strict continuation round-trip of one populated pending Event Sub-Process handler, applicable schema/definition artifacts, and focused documentation gates. It adds no source profile, shared scenario, CIB case, live host capability, corpus row, or Product 2 persistence/API/UI/journey support; Product 2 changes only by locking the explicit failed-value ingress rejection below.

## Runtime-only inventory and layer ownership

The Program owns the closed single-effect handler bodies, trigger operation identity, exact dependency declarations, and limits. RuntimeState owns trigger/handler occurrences, occurrence dependencies, restored private context, dedicated handler effect waits, lifecycle, source-record consumption, and terminal failure. The pure semantic core and Lean independently own transition meaning; the canonical semantic observation owns the public failure discriminator.

Source later owns exact XML provenance and checked lowering. Temporal later owns durable scheduling, Activity execution, transport retries, cancellation delivery, continuation, and replay without adding BPMN facts. Publication and Product 1 add no new semantic field but preserve and terminally classify the exact widened value. Product 2 deliberately keeps its existing three-status execution-publication contract and rejects `failed`, with or without a `failure` field, at the strict decoder before applying or persisting the rejected page; local reconciliation writes its existing `Gap` marker but does not call `applyPage`, while shared recovery returns `DecoderDivergence` without producing an apply callback. Product 2 storage constraints, persisted projection, terminal recovery classification, API, UI, and journeys remain unchanged until capability closure.

## Versioning consequences

The repository's pre-release replace-in-place policy applies. The operation and Program declaration are additive, and the two optional RuntimeState collections are absent for every existing Program, but `Failed`, the status-discriminated observation, and the failed arm of the closed v1 terminal receipt widen shared strict unions. Every in-scope producer, decoder, exhaustive switch, schema, fixture, publication consumer, continuation boundary, and terminal-result consumer changes atomically, while Product 2's deliberately narrower ingress rejects the new arm atomically before rejected-page application or persistence; there is no v2 receipt, compatibility reader, defaulted failure, or mixed old/new runtime. Existing profiles retain exact bytes and behavior because they cannot construct the declaration or `failed` state.

The complete `what-binds` inventory requires [`implementation-status-owner:ENGINE-RUNTIME-PROOF`](../ENGINE-RUNTIME-AND-PROOF-IMPLEMENTATION-MAP.md), [`implementation-status-owner:TEMPORAL-HOSTING`](../TEMPORAL-HOSTING-IMPLEMENTATION-MAP.md), [`implementation-status-owner:BPM-PLATFORM`](../BPM-PLATFORM-IMPLEMENTATION-MAP.md), [Semantic Process IL](../SEMANTIC-PROCESS-IL-SPEC.md), [contract registry](../../contracts/README.md), [package guide](../../packages/semantic-core/README.md), [source map](../../packages/semantic-core/SOURCE-MAP.md), [schema coverage](../../scripts/contract-schema-coverage.test.ts), [definition artifacts](../../scripts/contract-definition-artifacts.test.ts), [commutation census](../../scripts/internal-commutation-census.test.ts), [collection removal](../../scripts/runtime-collection-removal-completeness.test.ts), [source hygiene](../../scripts/source-hygiene.test.ts), [reviewability](../../scripts/document-reviewability.test.ts), [review policy](../../scripts/independent-review-policy.test.ts), and [requirement-ledger consistency](../../scripts/requirement-ledger-consistency.test.ts).

The operation census must classify trigger creation and frontier activation as one atomic state-transforming family whose simultaneous members are not independently scheduled internal operations. Existing transition traces, replay, canonical ordering, RuntimeState validity, removal helpers, closure, and command-result consumers must either handle the new variants or carry an explicit proved no-change obligation.

### Atomic migration matrix

| Boundary | Required disposition |
|---|---|
| [shared effect values](../../packages/semantic-core/src/semantic-value-contract.ts), [TS Program](../../packages/semantic-core/src/semantic-process-contract.ts), [operation admission](../../packages/semantic-core/src/semantic-process-operation-admission.ts), and [graph admission](../../packages/semantic-core/src/semantic-process-graph-admission.ts) | Add the exact compensation operation literal and closed declaration; admit only the exact descriptor/input pairing while ordinary reachability and existing profile descriptors stay exact. |
| [snapshot Program/state validation](../../packages/semantic-core/src/compensation-event-sub-process-snapshot-state-validation.ts), [snapshot tests](../../packages/semantic-core/test/compensation-event-sub-process-snapshot.test.ts), and [Lean snapshot declaration](../../BpmnSemantics/SemanticProcess/CompensationEventSubProcessSnapshotDeclaration.lean) | Prove no change: handler scopes remain operation/control-place-free and snapshot bytes exact. |
| [TS RuntimeState](../../packages/semantic-core/src/semantic-process-state.ts), [runtime validity](../../packages/semantic-core/src/runtime-state-well-formedness.ts), [runtime defects](../../packages/semantic-core/src/runtime-state-defect.ts), and [collection-removal guard](../../scripts/runtime-collection-removal-completeness.test.ts) | Add collections, global effect-ID uniqueness, `Failed`, tombstones, and complete live-region removal. |
| [TS evaluator](../../packages/semantic-core/src/semantic-process-runtime.ts), [scenario observation producer](../../packages/semantic-core/src/scenario.ts), [control-position projection](../../packages/semantic-core/src/control-position-projection.ts), and [snapshot control-state validator](../../packages/semantic-core/src/compensation-event-sub-process-snapshot-state-validation.ts) | Handle `Failed` in every current exhaustive control switch and terminal-empty predicate; failed is sound, non-resumable, terminal, observable, and has no control positions, while snapshot state refuses failed roots as a capture source. |
| [TS command admission](../../packages/semantic-core/src/semantic-command-admission.ts), [TS transition trace](../../packages/semantic-core/src/semantic-transition-trace.ts), and [Lean effect completion](../../BpmnSemantics/SemanticProcess/EffectCompletion.lean) | Dispatch compensation IDs before unchanged ordinary completion; require the exact result union, reject patches, ambiguity, incidents, and stale results, and map both capacity refusals to whole-command `Rejected` with no trace. |
| [effect request contract](../../packages/temporal-adapter/protocol/src/effect-contract.ts), [effect Activity result decoder](../../packages/temporal-adapter/protocol/src/effect-activity-result.ts), [content-bound transport](../../packages/temporal-adapter/protocol/src/effect-transport.ts), [testkit Worker registry](../../packages/temporal-adapter/testkit/src/effect-probe.ts), [effect mutation workflows](../../packages/temporal-adapter/testkit/src/effect-bypass-mutation-workflows.ts), and [bounded production Worker](../../packages/temporal-adapter/worker/src/bounded-effect-activities.ts) | Add the compensation request/result narrowing, definition/trigger/handler/effect-bound key material, and one registered test implementation; prove the generic envelope, capacity wrapper, technical-failure arm, and mutations for existing operations unchanged. |
| [semantic effect-result validator](../../packages/semantic-core/src/stimulus.ts), [command-identity canonicalizer](../../packages/temporal-adapter/protocol/src/command-identity.ts), [effect Activity capacity](../../packages/temporal-adapter/protocol/src/effect-activity-capacity.ts), [runner effect plan](../../packages/temporal-adapter/runner/src/host-interaction-plan.ts), [configured runner effects](../../packages/temporal-adapter/runner/src/host-effect-activities.ts), and [evaluation runner effects](../../packages/temporal-adapter/runner/src/evaluation-effect-activities.ts) | Prove no change: compensation success and `bpmnError` remain strict existing `EffectExecutionResult` arms, their generic validation and command encoding remain exact, compensation dispatch alone narrows the patch to empty, capacity still measures the same request/result envelopes, configured execution stays exact-descriptor-generic, and the incident-only evaluation simulator does not admit the compensation operation. |
| [flow-node lifecycle](../../packages/semantic-core/src/flow-node-occurrence-lifecycle.ts), [boundary-start pairing](../../packages/semantic-core/src/flow-node-occurrence-boundary-starts.ts), [open-set projection](../../packages/semantic-core/src/flow-node-occurrence-open-set.ts), [retained pairing](../../packages/semantic-core/src/flow-node-occurrence-retained-pairing.ts), [publication completeness](../../packages/semantic-core/src/flow-node-occurrence-publication-completeness.ts), [external completeness](../../packages/semantic-core/src/flow-node-occurrence-publication-external-completeness.ts), and [internal publication templates](../../packages/semantic-core/src/internal-publication-template.ts) | Add the two exact private anchor arms and compensation projection; audit every anchor consumer, change only the exhaustive consumers that receive those arms, and prove existing wait/scope/call/transition pairing and public completed/cancelled terminals unchanged. |
| [E2 protocol](../../packages/temporal-adapter/protocol/src/flow-node-occurrence-publication.ts), [publication segments](../../packages/temporal-adapter/protocol/src/workflow-publication-segments.ts), and [Workflow projection](../../packages/temporal-adapter/workflow/src/flow-node-occurrence-publication-state.ts) | Accept the projected compensation lifecycle units without exposing private anchors; preserve exact public occurrence bytes and platform consumers. |
| [canonical contract](../../packages/semantic-core/src/contract.ts), [TS observation producer](../../packages/semantic-core/src/scenario.ts), [Lean wire contract](../../BpmnSemantics/Scenario.lean), [Lean observation consumer](../../BpmnSemantics/SemanticProcess/Scenario.lean), [Lean JSON](../../BpmnSemantics/SemanticProcessJsonMain.lean), [observation-contract suite](../../packages/semantic-core/test/sequential-multi-instance-observation-contract.test.ts), [contract registry](../../contracts/README.md), [definition artifacts](../../scripts/contract-definition-artifacts.test.ts), and [schema coverage](../../scripts/contract-schema-coverage.test.ts) | Add the exact failed control, observation, and receipt fields to both languages; update every producer/encoder/decoder, preserve existing observation bytes, and retain explicit `notStarted` schema/decoder admission. |
| [publication validator](../../packages/temporal-adapter/protocol/src/semantic-publication-validation.ts), [receipt validators](../../packages/temporal-adapter/protocol/src/lifecycle-results.ts), and [incident-operation protocol](../../packages/temporal-adapter/protocol/src/incident-operation.ts) | Add `Failed` to the strict allowlists and discriminated validators, require the typed failure only on failed state/receipt, require every terminal collection empty, and expose failed as terminal with no incident operation. |
| [terminal protocol](../../packages/temporal-adapter/protocol/src/contracts.ts), [receipt construction](../../packages/temporal-adapter/workflow/src/terminal-process-receipt.ts), [terminal envelope](../../packages/temporal-adapter/workflow/src/workflow-terminal-completion.ts), and [terminal-result decoder](../../packages/temporal-adapter/protocol/src/workflow-terminal-result.ts) | Widen v1 to failed, require control/observation/failure equality, drain handlers before the envelope, preserve `processClosed`, and keep the legacy completed/cancelled decoder exact. |
| [Workflow-chain decoder](../../packages/temporal-adapter/protocol/src/workflow-chain.ts), [correlation delivery decoder](../../packages/temporal-adapter/protocol/src/correlation-target-delivery.ts), [Workflow command recovery](../../packages/temporal-adapter/workflow/src/workflow-command-recovery.ts), [chain capacity](../../packages/temporal-adapter/workflow/src/workflow-chain-capacity.ts), and [chain recovery client](../../packages/temporal-adapter/client/src/workflow-chain-recovery-client.ts) | Propagate the widened terminal union generically or record a proved no-change; no component may reconstruct, erase, or translate the failed discriminator. |
| [process operations client](../../packages/temporal-adapter/client/src/process-operations-client.ts) and [incident query handler](../../packages/temporal-adapter/workflow/src/incident-operations-query-handler.ts) | Add the failed exhaustive status case as terminal, corroborate the failed receipt, and return no live incidents; completed/cancelled behavior stays byte-identical. |
| [product interaction driver](../../packages/temporal-adapter/runner/src/host-interaction-driver.ts), [runnable Product 1 result](../../packages/temporal-adapter/runner/cli/runnable-mvp.ts), and [runnable command exit](../../packages/temporal-adapter/runner/cli/runnable-mvp-command.ts) | Treat `ProcessStatus.Failed` as terminal before interaction selection; add exact `ProcessFailed` event and `Failed` result arms carrying `FailedProcessReceipt`; and return a distinct `ProcessFailed = 4` exit code rather than looping, throwing infrastructure failure, reporting success, or conflating it with admission or execution refusal. |
| [Product 2 execution-publication contract](../../platform/contracts/src/execution-publications.ts), [strict decoder](../../platform/contracts/src/execution-publication-semantic-value-decoders.ts), [contract suite](../../platform/contracts/test/execution-publication-contract.test.ts), [local reconciliation](../../platform/modules/operate/src/execution-publication-reconciliation-service.ts), and [shared recovery](../../platform/modules/operate/src/postgresql-execution-recovery-step.ts) | Keep the existing three-status Product 2 contract and database representation exact; reject `failed` before applying or persisting the rejected page, preserve the local `Gap` marker write and shared `DecoderDivergence`, prove no `applyPage`, `replaceFromPages`, apply callback, or failed-value persistence occurs, and defer persistence, recovery classification, API, UI, and journey support to capability closure. |
| [continuation](../../packages/temporal-adapter/protocol/src/workflow-continuation.ts) | Structurally decode and declaration-validate every present `compensationActivityRetentions`, `compensationParentContextRetentions`, `compensationTriggers`, and `compensationHandlerEffectWaits` collection, preserving absence for old Programs; require a valid running unscheduled state, reject `Failed`, and round-trip one populated pending Event Sub-Process handler with its exact context without constructing, scheduling, or executing a handler. |
| [host admission](../../packages/temporal-adapter/protocol/src/host-admission.ts) and its [typed refusal test](../../packages/temporal-adapter/testkit/test/host-admission.test.ts) | Preserve the exact `compensationSchedulerUnavailable` rejection for every Program containing `triggerCompensation`, mechanically proving that the checkpoint cannot start a live compensation host. |
| [Workflow loop](../../packages/temporal-adapter/workflow/src/workflow-implementation.ts), [host readiness](../../packages/temporal-adapter/workflow/src/workflow-host-readiness.ts), [effect host](../../packages/temporal-adapter/workflow/src/effect-execution-host.ts), and [effect Activity selection](../../packages/temporal-adapter/workflow/src/effect-activities.ts) | Deferred until checkpoint approval: add compensation key construction, result dispatch, frontier scheduling, `WAIT_CANCELLATION_COMPLETED`, the in-flight rollover fence, and receipt readiness only after final resolution of every scheduled Activity. |
| [commutation census](../../scripts/internal-commutation-census.test.ts) and [Semantic Process IL](../SEMANTIC-PROCESS-IL-SPEC.md) | Classify internal atomicity, external-result footprints, simultaneous frontier, and failure observation. |

### Owners this implementation grows

| Existing owner | Current headroom | Growth condition |
|---|---:|---|
| [shared effect values](../../packages/semantic-core/src/semantic-value-contract.ts) | 703 | one operation literal and exact descriptor type only |
| [TS Program](../../packages/semantic-core/src/semantic-process-contract.ts) | 197 | references only |
| [TS operation admission](../../packages/semantic-core/src/semantic-process-operation-admission.ts) | 15 | extract declaration validation first |
| [TS graph admission](../../packages/semantic-core/src/semantic-process-graph-admission.ts) | 169 | declaration delegation only |
| [TS RuntimeState](../../packages/semantic-core/src/semantic-process-state.ts) | 378 | collection/control references only |
| [TS runtime validity](../../packages/semantic-core/src/runtime-state-well-formedness.ts) | 72 | extract compensation validity first |
| [TS runtime defects](../../packages/semantic-core/src/runtime-state-defect.ts) | 762 | new defect arms only |
| [TS command admission](../../packages/semantic-core/src/semantic-command-admission.ts) | 382 | result dispatch only |
| [TS transition trace](../../packages/semantic-core/src/semantic-transition-trace.ts) | 426 | failed arm only |
| [TS lifecycle](../../packages/semantic-core/src/flow-node-occurrence-lifecycle.ts) | 103 | delegate compensation projection |
| [TS lifecycle completeness](../../packages/semantic-core/src/flow-node-occurrence-publication-external-completeness.ts) | 91 | delegate compensation oracle |
| [TS canonical contract](../../packages/semantic-core/src/contract.ts) | 338 | failed union references only |
| [TS evaluator](../../packages/semantic-core/src/semantic-process-runtime.ts) | 60 | dispatch only; extract all trigger and handler logic before growth |
| [TS observation producer](../../packages/semantic-core/src/scenario.ts) | 185 | failed projection and exhaustive switch only |
| [TS control-position projection](../../packages/semantic-core/src/control-position-projection.ts) | 384 | failed terminal-empty arm only |
| [TS internal attempt](../../packages/semantic-core/src/internal-transition-attempt.ts) | 668 | trigger-attempt delegation only |
| [Lean Program](../../BpmnSemantics/SemanticProcessContract.lean) | 54 | declaration reference only; extract the contract first if the reference cannot fit |
| [Lean RuntimeState](../../BpmnSemantics/SemanticProcess/RuntimeState.lean) | 201 | trigger collection reference only |
| [Lean effect completion](../../BpmnSemantics/SemanticProcess/EffectCompletion.lean) | 721 | compensation relation only |
| [Lean command admission](../../BpmnSemantics/SemanticProcess/CommandAdmission.lean) | 272 | result dispatch only |
| [Lean transition](../../BpmnSemantics/SemanticProcess/Transition.lean) | 20 | extract before adding the new dispatcher arm |
| [Lean internal attempt](../../BpmnSemantics/SemanticProcess/InternalOperationAttempt.lean) | 757 | trigger-attempt delegation only |
| [Lean scenario contract](../../BpmnSemantics/Scenario.lean) | 453 | failed union only |
| [Lean observation consumer](../../BpmnSemantics/SemanticProcess/Scenario.lean) | 244 | failed projection and agreement only |
| [Lean JSON](../../BpmnSemantics/SemanticProcessJsonMain.lean) | 244 | failed encoding only |
| [Temporal protocol](../../packages/temporal-adapter/protocol/src/contracts.ts) | 555 | failed receipt arm only |
| [effect transport](../../packages/temporal-adapter/protocol/src/effect-transport.ts) | 655 | compensation key material and canonical tuple only |
| [receipt validators](../../packages/temporal-adapter/protocol/src/lifecycle-results.ts) | 495 | failed receipt decoder only |
| [publication validator](../../packages/temporal-adapter/protocol/src/semantic-publication-validation.ts) | 97 | failed discriminator only; extract state validation before other growth |
| [testkit Worker registry](../../packages/temporal-adapter/testkit/src/effect-probe.ts) | 554 | one exact operation and result registration only |
| [process operations client](../../packages/temporal-adapter/client/src/process-operations-client.ts) | 602 | failed terminal case only |
| [product interaction driver](../../packages/temporal-adapter/runner/src/host-interaction-driver.ts) | 398 | failed terminal predicate only |
| [runnable Product 1 result](../../packages/temporal-adapter/runner/cli/runnable-mvp.ts) | 423 | failed receipt event/result arms only |
| [runnable command exit](../../packages/temporal-adapter/runner/cli/runnable-mvp-command.ts) | 696 | one distinct failed-Process exit arm only |
| [terminal receipt](../../packages/temporal-adapter/workflow/src/terminal-process-receipt.ts) | 709 | failed construction only |
| [terminal envelope](../../packages/temporal-adapter/workflow/src/workflow-terminal-completion.ts) | 559 | failed validation only |
| [incident query handler](../../packages/temporal-adapter/workflow/src/incident-operations-query-handler.ts) | 581 | failed terminal projection only |
| [continuation](../../packages/temporal-adapter/protocol/src/workflow-continuation.ts) | 263 | new collections and failed refusal |
| [Workflow loop](../../packages/temporal-adapter/workflow/src/workflow-implementation.ts) | 79 | extract frontier scheduler before integration |
| [host readiness](../../packages/temporal-adapter/workflow/src/workflow-host-readiness.ts) | 526 | scheduler delegation only |
| [effect host](../../packages/temporal-adapter/workflow/src/effect-execution-host.ts) | 668 | compensation result dispatch only |

Every headroom figure is the measured nonblank-line remainder below the 800-line review target. No size exception is requested. New bounded owners should contain the compensation execution contract, trigger construction, frontier selection, handler completion, cancellation, validity, and focused tests/proofs; shared integration owners receive references or dispatch only.

## Epistemic closure and reopen conditions

Selected: root-global synchronous triggering, exact eligible-source consumption, occurrence-level dependencies, reverse dependency order, concurrent maximal frontiers, declaration-owned one-effect bodies, snapshot restoration, typed terminal Process failure, complete region cancellation, stale-result refusal, capacity, a failed v1 receipt, and future hosting obligations.

Open: source admission, shared scenario wires, Product 1 compensation capability, targeted/asynchronous throws, general handler graphs and data, other dependencies, loops and Multi-Instance Sub-Processes, recursive compensation, Transactions/Cancel Events, failure recovery, CIB profile behavior, live refinement, whole models, corpus, Product 2 persistence/API/UI/journey support, and conformance.

Reopen before implementation if review finds the fail-fast rule incompatible with BPMN lifecycle, the body union cannot widen without reinterpretation, restored context cannot reach the exact effect, the frontier cannot be hosted without observable serialization, failed Process publication collapses into infrastructure failure, or cancellation cannot drain Activities while preserving identity.

## Stage boundary

The earlier proposal target and its correction audits remain immutable evidence for the unchanged account they reviewed. The pending-handler snapshot-ownership amendment changes the Runtime representation needed to realize that account and therefore reopens proposal review before implementation resumes.

After approval, the first implementation stage stops when the complete Program/Runtime/observation/receipt representation, its mandatory strict-reader and terminal-value propagation, and the independent Lean/TypeScript semantics named above are green. Temporal and Product 1 may only decode, preserve, reject continuation of, or terminally classify the exact widened value; Product 2 must strictly reject failed ingress before rejected-page application or persistence and must not expose it. The checkpoint must not admit the compensation profile, schedule or execute a handler, or publish a compensation capability. Independent review is required before source, profile, shared scenario, CIB, live Temporal hosting, Product 1 compensation capability, corpus, or Product 2 persistence/API/UI/journey work begins.

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `5b45b845c5890b89188c2e0bf024946237021106` | `not-recorded` | `pending` | `not-applicable` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
