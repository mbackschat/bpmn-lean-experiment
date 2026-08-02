# Event-Based Gateway Message/Timer race proposal

## Status

**Owner-approved on 2026-08-02 after the isolated same-effort sub-agent review of `dd80bdc` and same-reviewer correction audit `acff781`; the first semantic checkpoint is implemented and must pass its mandatory isolated review before scenario, differential, or durable Temporal scheduling work begins.**

## Independent cold-review receipt

| Stage | Review target | Isolation | Verdict | Correction audit |
|---|---|---|---|---|
| Proposal | `dd80bdc` | `fork-turns-none` | `approve-with-required-edits` | `acff781` |
| Semantic checkpoint | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |
| Closure | `not-applicable` | `not-applicable` | `not-reached` | `not-applicable` |

This receipt follows the [independent cold-review gate](../TESTING-SPEC.md#independent-cold-review-gate). The context-cold same-effort sub-agent review of `dd80bdc` required the Temporal activation-barrier and wrong-ingress corrections in `acff781`; the same reviewer passed that correction audit without a material redesign.

## Exact question

Should the project admit one non-instantiating Exclusive Event-Based Gateway whose two configured catches are the already-supported operation-addressed payload-free Message event and exact `PT1S` Timer event, so that both waits arm atomically, the first matching explicit stimulus selects one branch, and the losing wait is withdrawn before the next public observation?

The recommended answer is yes. The smallest complete design adds one typed heterogeneous race operation and one hidden occurrence-owned race record while reusing the existing Message and Timer wait identities, stimuli, projections, and winner continuations. It does not model an Event-Based Gateway as an ordinary token split and does not select a portable tie-break for simultaneous physical events.

## Normative and compatibility basis

BPMN 2.0.2 Clause 10.6.6 defines the Event-Based Gateway as a deferred event decision. It requires at least two conditionless outgoing Sequence Flows whose targets are configured Intermediate Catch Events or Receive Tasks, prohibits another incoming Flow on a configured target, and says that the first triggered Event wins while every remaining configured path becomes invalid. The selected Message and Timer catches are both permitted target kinds; this profile deliberately excludes Receive Tasks and every other permitted trigger family.

Clause 10.5.4 states that an Intermediate Catch Event retains control until its trigger occurs and then continues. For the selected targets, trigger occurrence therefore completes the configured Event. Clause 13.4.4 consequently gives the same winner in its formulation: the choice is deferred until one subsequent configured Task or Event completes, the first completion activates exactly one outgoing branch, and every other branch is withdrawn. Table 13.4 identifies Deferred Choice (WCP-16) and states that the Event-Based Gateway throws no exception.

The machine-readable account agrees with that bounded source distinction. CMOF `EventBasedGateway` extends `Gateway`, gives `instantiate` the default `false`, and types `eventGatewayType` with the exact literals `Parallel` and `Exclusive`. CMOF does not declare an `eventGatewayType` default; Table 10.127 and `Semantic.xsd` declare `Exclusive`. `Semantic.xsd` also declares `instantiate="false"`. The inherited `gatewayDirection` default is `Unspecified` and the exact literals are `Unspecified`, `Converging`, `Diverging`, and `Mixed`.

The issue-disposition audit consulted every applicable issue reference already registered in the local project sources. `BPMN2-168` remains relevant only to the inherited exact Timer-duration normalization, and the nearby `BPMN21-429` ordering warning reinforces that declaration order is not a portable branch selector. No Event-Based-Gateway-specific disposition is mirrored or recorded locally, so this proposal invents none and adopts none. The official live issue view is not a pinned local input; its applicable dispositions must be rechecked and recorded before closure.

This is a vendor-neutral BPMN account. Pinned CIB Seven tests provide feasibility precedents for Signal-versus-Timer winner directions, loser removal, and one three-trigger Message win, but they do not execute this exact operation-addressed Message plus exact `PT1S` pair. `CIB-AGR-0004` expressly excludes competing Events and cancellation. No new Event-Based-Gateway CIB relationship, target, or evidence lane is selected. The profile may retain `CIB-AGR-0001` and `CIB-OP-0001` only for the already-implemented User Task interaction boundary.

## Exact source profile

The admitted document contains exactly one self-contained `Definitions`, one private Process with explicit `isExecutable="true"`, one Interface containing one Operation, and one Message referenced by that Operation. The Process contains:

- one None Start Event;
- one Event-Based Gateway with one incoming and two outgoing Sequence Flows;
- one operation-addressed payload-free Intermediate Catch Message Event configured by one Gateway output;
- one Intermediate Catch Timer Event with one contained `timeDuration` expression whose exact body is `PT1S`, configured by the other Gateway output;
- two distinct User Tasks, one directly after each catch;
- two distinct None End Events, one directly after each User Task; and
- no other Flow Node, root definition, or executable definition.

The Event-Based Gateway is non-instantiating and Exclusive. `instantiate` may be omitted or use an XSD-valid false lexical value; true values are rejected. `eventGatewayType` may be omitted or use exact `Exclusive`; `Parallel` is rejected. `gatewayDirection` may be omitted, use exact `Unspecified`, or use exact `Diverging` matching the admitted arity; `Converging`, `Mixed`, and case-invalid forms are rejected. The two outgoing configuration Flows are conditionless and no default Flow exists.

Both configured catches reuse their existing strict source profiles. The Message Event has exactly one contained Message Event Definition with the admitted Operation and Message references and no payload/data surface. The Timer Event has exactly one contained Timer Event Definition and exact `PT1S` duration. Neither catch has another incoming Flow, `parallelMultiple`, referenced Event Definitions, attached Event, data association, or extension element.

All Flow Nodes and Sequence Flows belong to the root definition scope. Every reference resolves; both branches are acyclic, reachable, and co-reachable; and each configured catch leads only through its own User Task to its own End Event. There is no cross-branch Flow, merge, loop, nested scope, boundary Event, or alternate entry or exit.

XML declaration order and incoming/outgoing reference order are non-semantic. Reordering the Gateway, catches, branches, root Interface, Operation, and Message while preserving references must produce the same checked graph and Semantic Process program after normalizing only the source-bound digest. The Message-versus-Timer field distinction is typed and must never be inferred from candidate array order.

## Semantic rules

### `EBG-ARM-01` — atomically arm the complete configuration

When one owner-matching token reaches the Event-Based Gateway operation, consume exactly that token and atomically create one ordinary Message wait, one ordinary Timer wait with deadline `logicalTimeMs + 1000`, and one hidden race occurrence containing both complete wait identities. No branch output token exists while the race is armed, and no stable or externally interruptible half-armed state exists.

### `EBG-WIN-01` — commit the first admitted matching trigger

The race winner is the first matching Message-delivery or Timer-firing stimulus in the explicit semantic input order. One successful stimulus atomically removes the race occurrence, removes both member waits, and produces exactly one owner-matching token on the winner's output. A Message winner leaves logical time unchanged; a Timer winner sets logical time to the admitted deadline.

Source declaration order, configuration-field order, operation order, array order, JavaScript Promise order, and evaluator search order do not select the winner. BPMN defines no portable physical-simultaneity tie-break, and this profile adds none: answer-free scenarios supply a strict stimulus order, while the Temporal adapter must either expose one durable readiness order to the semantic loop or fail closed for a coalesced dual-ready host activation.

### `EBG-WITHDRAW-01` — remove every loser before observation

The winning state replacement removes the losing wait before internal closure and canonical projection. After Message victory there is no open Timer, and after Timer victory there is no open Message subscription. Exactly the winner-specific User Task becomes active after closure; the losing branch never receives a control token.

### `EBG-REFUSE-01` — preserve state for non-winning ingress

A wrong occurrence identity, wrong Message channel, wrong Timer deadline, or otherwise non-matching stimulus is rejected with exact state preservation and does not disarm, postpone, or rearm the race. After one winner commits, the losing stimulus is stale and is likewise rejected with exact state preservation. Existing exact-duplicate and identity-conflict handling remains an adapter command-ledger concern and does not create a second semantic commitment.

### `EBG-OBSERVE-01` — project the existing wait and interaction surfaces

The armed stable state exposes exactly one Message `activeWait`, one Timer `activeWait`, one complete `openMessageSubscriptions` entry, one `openTimers` entry at deadline `1000`, and one enabled `deliverMessage` interaction. It exposes no User Task or effect and keeps logical time `0`. After victory it exposes only the selected User Task wait and completion interaction, with both race waits absent. Terminal completion exposes the existing empty completed state.

## Checked graph and Semantic Process contract

The checked graph adds one closed Event-Based Gateway node variant with derived `Diverging` direction. The ordinary checked Message Event, Timer Event, User Task, End Event, and Sequence Flow variants remain unchanged. Checked admission binds the Gateway to exactly one Message configuration Flow and one Timer configuration Flow, rejects conditions, requires each Flow to target its corresponding catch, and requires those catches to have no alternate incoming Flow.

The Semantic Process contract adds one reusable operation whose named arms make candidate order unrepresentable:

```ts
type AwaitEventRaceOperation = DeepReadonly<
  OperationBase & {
    kind: "awaitEventRace";
    input: string;
    message: {
      configurationOrigin: BpmnSequenceFlowOrigin;
      elementId: string;
      channel: Extract<MessageChannel, { kind: "operationMessage" }>;
      output: string;
    };
    timer: {
      configurationOrigin: BpmnSequenceFlowOrigin;
      elementId: string;
      durationMs: 1000;
      output: string;
    };
  }
>;
```

`origin.elementId` is the Event-Based Gateway. `input` is its incoming Flow. Each `configurationOrigin` is one Gateway-to-catch Flow, while each arm's `output` is the corresponding catch Event's outgoing Flow. Checked-definition binding requires all six identities and both wait definitions to match that exact topology. Swapping configuration origins, event identities, channels, or outputs while retaining the same sets must fail checked-definition binding and Lean lowering equality.

The two Gateway-to-catch Sequence Flows configure the deferred choice; they are not token-carrying control places in this IL. Lowering therefore replaces the current universal Sequence-Flow-to-control-place preservation statement with a disjoint complete classification: every checked Sequence Flow identity appears exactly once either as one `ControlPlace.origin` or as one `awaitEventRace` arm's `configurationOrigin`. No ghost place is retained merely to satisfy the old theorem. All other admitted Sequence Flows remain one-to-one control places.

Standalone program admission requires nonempty and pairwise appropriate operation, Gateway, catch, Flow, channel, and output identities; distinct configuration origins, catch identities, and outputs; exact operation-addressed Message and `1000` millisecond Timer arms; and canonical operation/control-place ordering. The exact profile admits one `awaitEventRace`, no separate `awaitMessage` or `awaitTimer` operation for its configured catches, two `awaitUserTask` operations, two `reachNoneEnd` operations, one `initiate`, and one root `completeScope`.

Lean independently lowers the checked graph and requires exact equality with the received program. The TypeScript source compiler and semantic core remain separate transcriptions of the reviewed account.

## Runtime-only race occurrence

The runtime adds one hidden collection and one monotonic activation-counter family:

```ts
type EventRace = DeepReadonly<{
  id: OccurrenceId;
  owner: ScopeOccurrenceId;
  messageSubscriptionId: MessageSubscriptionId;
  timerOccurrenceId: TimerOccurrenceId;
}>;
```

The race ID uses the Event-Based Gateway element ID and its activation count. Arming also increments the existing Message and Timer activation counters and creates member identities from those counters. The race collection is canonically ordered by Process instance, Gateway element, activation, and owner scope. Even though the admitted acyclic profile permits one live race, equality and replay never depend on insertion order.

The record is derived only by `awaitEventRace`, belongs to one live scope occurrence, refers to exactly one live Message wait and one live Timer wait with the same owner, and is removed only by a matching winner or existing owner-scope interruption. A live record blocks scope quiescence independently of its member waits. Scope interruption removes the record and both member waits while retaining all monotonic activation counters. A synthetic otherwise-quiescent state with one record must remain non-quiescent, and a record without both members is invalid rather than a resumption surface.

The race record and activation counter are not BPMN source objects and are not projected into canonical observation. They preserve the event-race ownership and occurrence identity that separate wait arrays otherwise erase.

## Closure, enabledness, laws, and witnesses

Start closure is exactly two internal steps: `initiate` and `awaitEventRace`. Closure under limit `2` succeeds below `semanticProcessClosureLimit = 8`, while the same start under limit `1` reports closure-bound exhaustion and publishes no stable state. Each winning external stimulus enables exactly one selected `awaitUserTask`, so winner closure is one step. Completing that task closes through exactly `reachNoneEnd` and root `completeScope`, two internal steps.

No newly reachable multiple-enabled internal state exists. The armed state has no internal transition and is resumable through its two public waits. The winner state has exactly one internal User Task activation, and the stable continuation has exactly one public User Task interaction. A hidden race record alone remains non-resumable and non-quiescent.

The Lean lane requires a declarative arming relation and a declarative two-constructor winner relation distinct from the evaluator; soundness for every successful executable arming and winner transition; a quantified exact-membership/ownership law; a quantified exclusivity law proving that one winner removes both waits and makes the sibling stimulus ineligible; and exact state-preservation laws for wrong and stale identities. Existing standalone Message and Timer relations remain valid and must not acquire race behavior without explicit premises.

The answer-free scenario family uses one definition and two strict schedules:

| Case | First matching stimulus | Armed stable state | Required winner state | Required loser check |
|---|---|---|---|---|
| Message wins | exact Message delivery before deadline | Message subscription plus Timer deadline `1000` | only Message-path User Task; logical time `0` | stale exact Timer firing rejects and preserves that state |
| Timer wins | exact Timer firing at deadline `1000` before Message delivery | Message subscription plus Timer deadline `1000` | only Timer-path User Task; logical time `1000` | stale exact Message delivery rejects and preserves that state |

Both schedules then complete their selected User Task and reach the same empty completed wait, task, subscription, Timer, effect, variable, and interaction surfaces. Canonical logical time intentionally remains `0` after Message victory and `1000` after Timer victory. A declaration-order-permuted source must preserve each schedule's complete observation trace. A candidate-order implementation, a partial arming implementation, a winner that leaves its sibling, and a second-winner implementation all diverge at the approved public observation or command-outcome boundary.

Finite fixtures establish only these bounded traces. They do not establish fairness, liveness, physical-event ordering, a simultaneous-trigger tie-break, arbitrary candidate count, or general Event semantics.

## Temporal hosting and refinement preflight

The capsule adds no new public ingress or stimulus kind. Message delivery remains the existing validated Signal plus content-bound result ledger; Timer firing remains the existing deterministic stimulus derived from one durable Timer; User Task completion remains the existing Update; and all semantic mutation remains in the single Workflow loop. No Activity, Child Workflow, external effect, retry policy, Continue-As-New, or public cancellation command is added.

The current Workflow cannot host this profile correctly because it directly awaits the only Timer and therefore postpones a Message already accepted during that await until after Timer firing. The replacement scheduler must keep one durable Timer promise alive in its own cancellable scope while independently accepting queued ingress. A wrong or unrelated stimulus delivered in an activation without Timer readiness is sent through the semantic core without canceling or restarting that Timer. Only a committed Message winner whose core state removes the Timer cancels the durable Timer; a Timer winner applies the exact existing `fireTimer` stimulus and lets the core remove the Message loser.

Semantic admission and host-capability admission remain separate. `awaitEventRace` is neither a passive operation, an ordinary token split, nor an uncoordinated host-driven wait. The exhaustive operation-kind classifier adds a `managedEventRace` class, admits this one exact Message/Timer scheduler, and continues rejecting arbitrary token-split-plus-Timer/effect programs as `concurrentHostDrivenWaits`. A program combining the managed race with another Timer, effect, token split, or race must be rejected before Workflow start, and a mutation omitting `awaitEventRace` from the classifier must fail that guard.

The state relation pairs the immutable admitted program and complete core state, including the hidden race record, with one Workflow-local durable Timer handle, an adapter-only activation-tagged readiness accumulator, and the existing accepted-stimulus and result ledgers. The Timer handle is derived only from the committed Timer member. The accumulator contains callbacks not yet submitted to the core, is rebuilt deterministically under replay, and is cleared only after one closed activation batch is classified. Timer scheduling, cancellation, Signal transport, Workflow Tasks, and Worker absence are refinement steps; only the semantic core decides whether a separately ready stimulus wins, rejects, or leaves state unchanged. Canonical Query continues to project only the core observation.

The adapter maps separately delivered readiness into the existing explicit stimulus order and must never inspect source/candidate order to choose. Pinned Temporal Core source sorts Signal and Update activation jobs before ordinary jobs such as Timer firing, so raw activation-job or Promise order is not a safe proxy for first physical occurrence. If any well-formed Message Signal callback and the configured Timer callback become ready in one coalesced Workflow activation, this first profile defines no portable ordering, even when the Signal would later prove wrong or stale in the semantic core. The scheduler must detect that batch and fail closed before calling the core with either callback, using a typed `BpmnEventRaceOrderingUnavailable` adapter `ApplicationFailure`, not a semantic command outcome. Semantic rejection and unchanged-Timer guarantees are claimed only for wrong or stale Signals delivered in a batch without Timer readiness.

The detector is a two-phase protocol; a tag without its barrier is invalid. Signal handlers synchronously accumulate readiness, Timer-promise continuations synchronously accumulate readiness, and neither callback independently advances the semantic core. Each callback carries the deterministic adapter-only activation tag visible through `workflowInfo().historyLength`. After the scheduler is woken it crosses one explicit Promise-microtask turn before inspecting that tag. This job-drain barrier is permitted only because the pinned TypeScript SDK enables `ProcessWorkflowActivationJobsAsSingleBatch`, processes every activation job synchronously before flushing Workflow microtasks, and therefore queues the Timer continuation before the scheduler's post-barrier continuation when both jobs share one activation. The tag groups the callbacks; the barrier closes the group before classification. Neither enters semantic state, stimulus identity, canonical observation, or replay comparison.

A focused SDK-level activation witness must seed Signal and Timer jobs into one activation and prove that both are accumulated before core advancement, that the typed failure occurs under ordinary execution, Worker replacement, and replay, and that removing either the barrier or the SDK single-batch premise makes the witness fail. A distinct activation witness must prove that one separately ready callback still reaches the core without waiting for the other. If the pinned SDK behavior or the one-turn barrier is not stable in either witness, implementation stops for a reviewed redesign rather than selecting a priority silently.

The smallest live refinement evidence uses three disposable histories. In the Message history, the armed Query is exact, a Message Signal is accepted while the Worker is stopped and before the Timer is due, a replacement Worker commits Message victory, the host Timer is canceled, only the Message-path User Task remains, and completion returns one terminal receipt. In the Timer history, the Timer fires while the Worker is stopped with no competing Signal ready, a replacement Worker commits Timer victory, a later Message Signal is durably resolved as rejected, only the Timer-path User Task remains, and completion returns one terminal receipt. In the wrong-ingress history, a well-formed wrong-channel or wrong-occurrence Signal arrives in its own activation while the race remains armed: the core rejects it, exact Query remains unchanged, the one original Timer subsequently fires at its original deadline, and only the Timer-path User Task remains. All three histories replay in the same gate.

The Message-winner history requires Timer started plus canceled and no Timer fired. The Timer-winner history requires Timer started plus fired and no Timer cancellation. The wrong-ingress history requires exactly one Timer started, no Timer cancellation or replacement before its eventual firing, semantic rejection of the Signal, and no deadline drift. None of the three histories may contain Activity, Child Workflow, effect, or Workflow-cancellation events. Removing the cancellation, processing a loser, bypassing core selection, coalescing a fixed priority, canceling or replacing the Timer after wrong ingress, or retaining either semantic wait must be detected by exact Query, command outcome, history, or replay evidence.

Message command deduplication, exact duplicate recovery, identity conflict, handler draining, and terminal receipt reuse the current lifecycle contract. Timer wakeup has one deterministic content-bound command identity. Temporal retry and Worker replacement do not create additional semantic triggers.

## Evidence and layer ownership

| Rule | Normative/profile review | Lean | CIB Seven | Independent TypeScript | Temporal refinement | Negative or mutation guard |
|---|---|---|---|---|---|---|
| `EBG-ARM-01` | Clauses 10.6.6 and 13.4.4; exact two-catch profile | arming relation, evaluator soundness, exact members and activation counters | deliberately absent | atomic wait/record creation | exact armed Query and one durable Timer | partial-arm, missing-member, and configuration-origin mutations |
| `EBG-WIN-01` | first configured trigger/completion wins; WCP-16 | two winner constructors, soundness, quantified exact-winner law | deliberately absent | both explicit stimulus orders | both winner histories and replay | fixed-priority and core-bypass mutations |
| `EBG-WITHDRAW-01` | every other branch is withdrawn | exact sibling removal and no second winner | deliberately absent | both loser removals | Timer cancellation or subscription removal before Query | retained-loser and cancellation-removal mutations |
| `EBG-REFUSE-01` | non-triggering and already-withdrawn candidates select no path | wrong/stale exact state-preservation laws | deliberately absent | wrong and stale occurrence/channel/deadline cases | separately delivered wrong Signal preserves the armed Query and original Timer; late Signal recovery; no late Timer after cancellation | Timer-cancel/restart-on-wrong-ingress, association-erasure, and second-winner mutations |
| `EBG-OBSERVE-01` | bounded public consequence | exact armed, selected, and terminal observations | deliberately absent | independent canonical projection | Query, terminal receipt, exact history, replay | omitted wait/subscription/timer and future-command projection guards |

All five rules belong to the vendor-neutral BPMN/profile layer. CIB source tests only calibrated feasibility and ordered this work; they are not another semantic lane. No A12 model, identity, handler, or adoption fact enters the account.

## Required, optional, and excluded surface

Required are the exact source profile; `awaitEventRace`; complete configuration-flow preservation; one hidden race collection and activation counter; unchanged public stimuli and observation schema; two answer-free winner schedules; both stale-loser laws; Lean relation/evaluator soundness and useful quantified laws; independent TypeScript behavior; split-aware and race-aware host admission; the two-phase activation tag plus pinned-SDK job-drain barrier; Worker replacement in both winner directions; exact Timer cancellation/firing and wrong-ingress continuity histories; replay; and meaningful association, loser, ordering, barrier, Timer-restart, and bypass mutations.

Optional only after this capsule closes is a separately registered CIB Seven agreement probe over an exact project-owned Message-plus-`PT1S` fixture. If approved, ordinary CIB behavioral probe construction should use the pinned Java Model API builder and public subscription, job, task, and Process queries. Literal XML remains appropriate for project source-admission and declaration-order tests because omission/defaulting, exact references, and lexical rejection are discriminators.

Excluded are Process-start instantiation; Parallel Event Gateway; Receive Task configurations; Signal, Conditional, and Multiple triggers; more than two alternatives; multiple incoming Gateway Flows; additional incoming catch Flows; conditions and default Flows; Message payload, correlation, Collaboration, and Message Flow; dates, cycles, other durations, and repetition; nested or repeated races; loops and Multi-Instance; Boundary Events and Event Sub-Processes; general scope or host cancellation; a portable physical-simultaneity or same-activation tie-break; every coalesced well-formed Signal-plus-Timer batch beyond fail-closed detection, including a wrong or stale Signal; CIB Event-Based-Gateway compatibility; A12 adoption; BPMN conformance; and production Event History compatibility.

## Versioning, common-mode risk, and closure boundary

This is a pre-release additive semantic family but still replaces one current representation atomically across checked nodes, `CheckedNodeKind`, Semantic Process operations, runtime state, activation counters, Lean and TypeScript decoders, checked/program schemas, source admission, lowering, structural/profile/definition-binding validation, exhaustive switches, scope quiescence/interruption, host admission, Workflow scheduling, artifact registries, differential catalogs, tests, and owner documents. No optional mode bag, legacy reader, compatibility switch, format counter, Workflow patch, migration function, retained history fixture, or fallback constructor is permitted.

The conditional semantic-checkpoint review is mandatory because the capsule changes checked source, IL, runtime state, external winner behavior, scope cleanup, host concurrency/cancellation, and proof boundaries. The checkpoint must close before profile/scenario/differential/Temporal evidence advances.

The largest common-mode risk is shared source-to-lowering association: Lean, TypeScript, and Temporal could agree on the same swapped configuration Flow, catch identity, or winner output. Independent Lean lowering, exact checked-definition binding, the disjoint Sequence-Flow classification theorem, declaration-order permutation, association swaps, and opposite winner schedules are mandatory. The second risk is host ordering: a Workflow implementation could silently turn SDK activation-job priority into BPMN choice or inspect the accumulator before the activation is closed. Dual-ready fail-closed detection, the pinned-SDK job-drain witness, barrier-removal and priority mutations, and separated winner histories guard that risk. The third is closed-enumeration erosion in host admission, quiescence, and interruption; exhaustive switches plus synthetic record-only guards make it visible.

The exact claim, if implemented and closed, is one occurrence-owned operation-addressed Message-versus-exact-`PT1S` deferred choice with atomic arming, one committed winner, complete loser withdrawal, stale-loser refusal, canonical observation, and bounded Temporal refinement for separately ordered trigger readiness, including Timer continuity across a separately delivered wrong Signal. The nearest unsupported claim is an Event-Based Gateway whose configured triggers, or one configured trigger plus wrong Signal ingress, become jointly ready in one host activation and still receive a semantic outcome rather than the declared adapter failure. General trigger sets, instantiation, Receive Tasks, repetition, nesting, physical simultaneity, and general cancellation remain further outside.

Closure requires the epistemic review and commit-bounded cost record defined by the [capsule policy](README.md#required-capsule-structure). The nearest recorded comparator is the structured Inclusive Gateway capsule because both add one checked Gateway family, one new semantic operation family, one hidden occurrence-owned record, scope cleanup, host-admission changes, standards-only differential cases, and Temporal replay. Event-Based Gateway additionally changes durable Timer scheduling and cancellation, so any higher measured cost must be stated rather than explained away as syntax reuse.

## Owner decision requested

After independent proposal review, approve or reject these choices together:

1. the exact non-instantiating Exclusive Event-Based Gateway with one operation-addressed Message catch, one exact `PT1S` Timer catch, two distinct User Task continuations, and two distinct End Events;
2. rules `EBG-ARM-01` through `EBG-OBSERVE-01`, including explicit stimulus order, atomic winner/withdrawal, stale-loser preservation, and no portable simultaneous-trigger tie-break;
3. one typed `awaitEventRace` operation, configuration-flow origins in place of ghost control places, and one hidden fully identified race occurrence;
4. the exact Temporal scheduler, host-admission, cancellation, Worker-replacement, dual-ready fail-closed, and replay boundary;
5. standards-first Lean/TypeScript/Temporal evidence with no Event-Based-Gateway CIB relationship or target in the first capsule; and
6. the exclusions, conditional semantic checkpoint, atomic pre-release replacement, and cost comparison above.

Implementation may begin only after the isolated same-effort proposal review is approved, every required correction passes the same-reviewer audit without material redesign, and explicit owner approval is recorded in this Status section.
