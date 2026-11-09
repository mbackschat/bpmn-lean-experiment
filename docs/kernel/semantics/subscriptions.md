# Subscriptions semantics

`Kernel.Feature.Subscriptions` ([Lean](../../../Kernel/Feature/Subscriptions.lean)) owns the waits an Event trigger opens: intermediate catch Events, Boundary Events, Event Sub-Process starts, Event-Based Gateway arms and the selection and arrival of a root start. It dispatches on the guarded types `Trigger` and `TimerSchedule`. A Timer or Message trigger opens one item that holds a reservation (`State.openSubscription`); the triggers [propagation](propagation.md) delivers (Error, Escalation, Compensation, Cancel) open nothing and are found through `catches`. `Kernel.Admission.Subscriptions` ([Lean](../../../Kernel/Admission/Subscriptions.lean)) admits the triggers; `Kernel.Timer` ([Lean](../../../Kernel/IL/Timer.lean)) owns the Timer lexeme grammar.

## Interpretation

### Timers

- A Timer duration is an exact ISO 8601 duration `PT[nH][nM][nS]`: non-negative integer components in that order, each at most once, at least one present, totalling 1 ms to `PT87660H` (315,576,000,000 ms, ten Julian years); hours, minutes and seconds have a fixed length, so the wait is `3,600,000·H + 60,000·M + 1,000·S` ms (BPMN 2.0.2 §10.5.5, Table 10.101; [TED basis][ted-normative], `TED-PARSE-01` and `TED-BOUND-01` in [TED rules][ted-rules]). The mapping is not injective (`PT90M` and `PT1H30M` agree), and `PT1S` stays 1000 ms. Zero, fractional, nominal, dated-interval, date and bounded-repetition forms are conforming BPMN the profile refuses, not malformed models ([TED admission][ted-admission], [ICT source][ict-source]).
- A cycle is the unbounded repetition `R/<duration>` of an admitted duration, and only an attached subscription (a boundary or an Event Sub-Process start) may carry one, since only an attached subscription can fire again ([RES surface][res-surface]). Its first deadline is one period after arming (CIB-INT-0008); each later deadline is one period after the deadline it fired at, never after the firing's logical time (`Subscriptions.afterFiring`).
- A reached Timer becomes one runtime occurrence `(process instance, element, activation)` with a logical deadline equal to the arming logical time plus its milliseconds; the first activation is 1 ([ICT time][ict-time], `TIMER-WAIT-01` and `TED-DEADLINE-01`). The wait is a semantic mechanism, "wait for a relative deadline", not an opcode per Event class; it carries no catching, attachment, interruption or calendar flag ([ICT IL][ict-il]). Arming advances no logical time.
- A firing names the occurrence and its deadline; it commits only if the occurrence is open and the named time equals its deadline, and is otherwise rejected with the state unchanged (`TIMER-FIRE-01`, `TIMER-REFUSE-01`). A firing is a typed semantic input, never a caller interaction; host Run IDs, timer sequences and physical timestamps are no part of it ([ICT time][ict-time], [ICT claim][ict-claim]).
- The old account advanced logical time to the deadline on firing and began every instance at logical time 0 ([ICT rules][ict-rules], [ICT time][ict-time]). The kernel advances the clock to the input's own logical time, which defaults to the deadline and may be later when a host wakes late, and rejects a time before the clock (`Step.advanceClock`, `Step.inputHead`) (kernel differs; reported).

### Messages

- A Message trigger is addressed by its operation channel: the Message, Interface and Operation the Event Definition's `messageRef` and `operationRef` resolve, where the Operation's input Message is that Message (BPMN 2.0.2 §8.4.11, §8.5, §10.5.5, Table 10.99; [ICM basis][icm-normative], [ABMSG basis][abmsg-normative]). A reached catch retains its token until the trigger occurs (§10.5.4).
- An uncorrelated delivery addresses the exact open subscription by its full occurrence identity and repeats its channel; it commits only when that subscription is open and the channel equals the subscribed one, and then consumes the subscription once (`MSG-WAIT-01`, `MSG-DELIVER-01`, `MSG-REFUSE-01` in [ICM rules][icm-rules]). The full identity performs the correlation; the channel equalities establish definition consistency. Direct addressing is a profile restriction, not the general meaning of BPMN correlation ([ICM claim][icm-claim], [ICM source][icm-source], [ABMSG selection][abmsg-select]); key correlation is the [population](population.md)'s route.
- A delivery before the subscription exists is rejected, not buffered (`unknown-message-subscription`). BPMN leaves pre-wait persistence unsettled (OMG BPMN2-223); this is a profile choice, not a claim that BPMN loses such Messages ([ABMSG basis][abmsg-normative]).
- Payload. A catch Event owns its data interface directly, not through an `InputOutputSpecification`. The trigger fills the Event's Data Output and the output association moves it into scope; the two effects are one committed step in that order (§10.5.1, Table 10.82; [MPC account][mpc-normative], [MPC contract][mpc-contract]). A subscription whose Event declares outputs requires a payload: a payload-free delivery to it is refused with the state unchanged (`message-payload-required`), and a payload to a payload-free subscription is refused (`message-payload-not-accepted`). This is account P1 of the payload capsule, stated for subscriptions that declare a required output, not as the general meaning of a payload-free delivery ([MPC accounts][mpc-accounts]). An omitted payload and a delivered `null` are not aliases ([ICM payload][icm-payload]).
- A payload-declaring subscription publishes `deliverPayloadMessage`, a payload-free one `deliverMessage`, so a caller learns structurally whether a payload is required ([MPC contract][mpc-contract], [`Publish.interactions`](../../../Kernel/Publish.lean)).

### Boundaries

- A Boundary Event's subscription arms atomically with its host's activation: with the Activity's work for an Activity host, with the child scope occurrence on entry for a Sub-Process host, before the child's first token moves (`ABTIMER-ARM-01`, `ABMSG-ARM-01`, `NBTIMER-ARM-01`, `SPTIMER-ARM-01`). BPMN starts a catch's wait when a token reaches it and a Boundary Event is never reached, so arming on host activation is a project interpretation ([SPT basis][spt-normative], [NBT rules][nbt-rules]); arming on the child's first wait was rejected because it makes the deadline depend on the child's topology ([SPT account][spt-account], [SPT decisions][spt-owner]). A Multi-Instance Activity's boundaries arm on its body (see [multi-instance](multi-instance.md)).
- The subscription belongs to the host occurrence, not to a token: it is no sibling wait, and a boundary Timer is never a standalone Timer wait ([ABT account][abt-account], [NBT account][nbt-account]). The host's completion withdraws it in the same step (`Subscriptions.leave`, `ABTIMER-COMPLETE-01`, `ABMSG-COMPLETE-01`); a Sub-Process host completes, and so withdraws it, at quiescence, not when its last token is consumed (`SPTIMER-QUIESCE-01`, [SPT account][spt-account]).
- `cancelActivity` decides interruption. The XSD and CMOF default is `true`, so an omitted attribute is interrupting; Clause 13.5.3's "if the attribute is not set" reads as "not set to `true`" (OMG BPMN21-227) ([ABT basis][abt-normative], [ABMSG basis][abmsg-normative], [NBT basis][nbt-normative]). Every lexeme naming *false* (`false`, `0`) is non-interrupting; `1` is refused at the source because the pinned parser inverts it ([ABT source][abt-source], [NBT source][nbt-source], [NBT decisions][nbt-owner]). The IL carries the resolved Boolean `Boundary.interrupting`.
- An interrupting boundary follows §13.5.3's order as one atomic step: consume the trigger occurrence, cancel the host occurrence and all its live runtime state while preserving activation counters, then follow the boundary's outgoing flows in the host's scope; nothing leaves on the host's normal flow (`ABTIMER-INTERRUPT-01`, `ABMSG-INTERRUPT-01`, `Subscriptions.fireBoundary`). §10.5.6's later cancellation point ("after … Sequence Flow from the boundary Event is followed") is indistinguishable at the observation boundary because the step is atomic ([SPT basis][spt-normative]).
- On a Sub-Process host, cancellation terminates every non-final runtime owner of the child scope occurrence and its descendants, waiting tasks included. §13.3.2's prose excludes `Ready` and `Active` nested Activities from termination; Figure 13.2 and §13.5.3's "is then cancelled", applied through §13.3.4, resolve that conflict as "all non-final nested work is terminated" (`SPTIMER-INTERRUPT-01`, [SPT basis][spt-normative], [SPT rules][spt-rules]). Regional cancellation is the [scopes](scopes.md) feature's.
- A non-interrupting boundary leaves its host running: the trigger's occurrence begins and leaves on the boundary flows in parallel with the host, which keeps its occurrence, waits, variables and counters (§10.5.6; `NBTIMER-SPAWN-01`). The host completes independently before or after the firing; completion after a duration firing finds no Timer and is no refusal (`NBTIMER-COMPLETE-01`). The enclosing scope completes only when both paths are done (§13.2; `NBTIMER-QUIESCE-01`). A duration Timer fires at most once per activation; a cycle repeats (see Repetition).
- After either victory the losing input is rejected with the state unchanged, as are wrong identities, a pre-due firing and a wrong deadline (`ABTIMER-REFUSE-01`, `ABMSG-REFUSE-01`, `NBTIMER-REFUSE-01`, `SPTIMER-REFUSE-01`; [ABT rules][abt-rules], [ABMSG rules][abmsg-rules], [SPT rules][spt-rules]).
- The Event-Based Gateway's arms are subscriptions attached to the gateway's occurrence; the arm that fires completes the gateway, which disarms the others (`Subscriptions.armGateway`, `fireCatch`; see [flow](flow.md)).

### Repetition

- Each arrival at a normal-flow catch opens a fresh wait with a fresh activation; firing consumes only that wait ([RES scope][res-scope], [RES basis][res-normative]).
- A non-interrupting Message boundary stays open with the same identity after a delivery, so each further delivery starts a further handler path while earlier ones continue; a non-interrupting cycle Timer opens its successor occurrence with a fresh activation one period after the deadline it fired at (Table 10.91: concurrent handler instances; `Subscriptions.afterFiring`; [RES surface][res-surface]). A non-interrupting Message Event Sub-Process start repeats the same way.
- The host's normal completion withdraws future triggers without cancelling handler paths already started; cancelling a region removes every wait inside it and nothing outside ([RES surface][res-surface]).
- An interrupting cycle has no second firing to give and is refused (`timer.interruptingCycle`).

### Starts

- Each Start Event is independent; triggering one creates a new instance and puts one token on each outgoing flow (BPMN 2.0.2 §10.5.2, Table 10.84; [MST basis][mst-normative], [TST basis][tst-normative]). `isInterrupting` belongs to Event Sub-Process starts only.
- A triggered root start is no delivery to a subscription and no manual start: before it fires no instance, token, subscription or open Timer exists, and erasing its Event identity would let the wrong trigger instantiate the process ([MST selection][mst-select], [MST account][mst-account], [TST contract][tst-contract], [TST account][tst-account]). The start input names its trigger kind and, for a Message, the exact channel; a trigger that fires no start, or a start of another kind, is rejected as `no-start-event` (`MSTART-TRIGGER-01`, `MSTART-REFUSE-01`, `TSTART-TRIGGER-01`, `TSTART-REFUSE-01`; [`Subscriptions.selectStart`](../../../Kernel/Feature/Subscriptions.lean)). Selection among several starts is stated in [population](population.md#start-selection).
- A triggered start opens no subscription and changes no variable unless its trigger carries data (`MSTART-FLOW-01`, `TSTART-FLOW-01`); downstream, a Message or Timer start is observably the same as a None start apart from identities (`MSTART-OBSERVE-01`, `TSTART-OBSERVE-01`; [MST rules][mst-rules], [TST rules][tst-rules]).
- A Timer start fires on one host-resolved occurrence; the deadline origin, schedule identity, catch-up and overlap are host and product policy, not BPMN state ([TST basis][tst-normative], `TSTART-SCHEDULE-01`). The started instance takes the occurrence's logical time.
- Event Sub-Process starts are passive subscriptions armed when their scope occurrence is entered, before the scope's start moves; they keep no scope alive and go when it completes (`Subscriptions.armScope`; see [scopes](scopes.md)).

### Publication

- An open Message subscription publishes its occurrence identity and channel in `openMessageSubscriptions` and one enabled delivery interaction; an open Timer publishes its occurrence identity and logical deadline in `openTimers` and enables no interaction (`MSG-OBSERVE-01`, `TIMER-OBSERVE-01`; [ICM rules][icm-rules], [ICT rules][ict-rules]). An armed boundary publishes its host and its subscription separately, never an open Boundary Event occurrence; after either victory the published follow-on work tells the route apart (`ABMSG-OBSERVE-01`, `ABTIMER-OBSERVE-01`, `NBTIMER-OBSERVE-01`, `SPTIMER-OBSERVE-01`). `activeWaits` orders User Task, Message, Timer, then effect, then element identifier ([`Publish`](../../../Kernel/Publish.lean)).

## CIB relations

| Register entry | Role in the kernel |
|---|---|
| [CIB-AGR-0004](../../CIB-BPMN-RELATION-REGISTER.md#cib-agr-0004--literal-pt1s-intermediate-catch-timer-lifecycle) | Agreement witnessed for the `PT1S` Intermediate Catch Timer lifecycle. |
| [CIB-AGR-0021](../../CIB-BPMN-RELATION-REGISTER.md#cib-agr-0021--exact-intermediate-catch-timer-durations) | Agreement on exact `PT[nH][nM][nS]` durations at the Intermediate Catch Timer ([TED basis][ted-normative]); the kernel's one grammar serves every Timer site. |
| [CIB-LIM-0003](../../CIB-BPMN-RELATION-REGISTER.md#cib-lim-0003-zero-fractional-nominal-interval-and-over-maximum-durations-are-refused) | Classified limitation: durations CIB accepts that the profile refuses (`timer.duration`). |
| [CIB-INT-0008](../../CIB-BPMN-RELATION-REGISTER.md#cib-int-0008--a-repeating-timer-without-a-start-date-first-fires-one-period-after-arming) | Interpretation the kernel applies to every cycle in every profile; no `ProfileOptions` field selects another first firing. |
| [CIB-OP-0005](../../CIB-BPMN-RELATION-REGISTER.md#cib-op-0005--cib-message-subscription-mapped-to-project-semantic-subscription-identity) | Operational mapping of CIB's Message subscription to the project's occurrence identity. |
| [CIB-AGR-0001](../../CIB-BPMN-RELATION-REGISTER.md#cib-agr-0001--sequential-process-and-user-task-lifecycle), [CIB-OP-0001](../../CIB-BPMN-RELATION-REGISTER.md#cib-op-0001--cib-host-task-identity-mapped-to-project-semantic-task-identity) | Reused only for the User Task work around a subscription; no evidence for Message, boundary, start or repetition behavior ([ICM CIB][icm-cib], [MST CIB][mst-cib], [RES basis][res-normative]). |

The boundary, Message start, Timer start and payload accounts select no CIB relation: BPMN resolves each, and an engine-specific observation would have been a stop condition ([ABMSG CIB][abmsg-cib], [ABT CIB][abt-cib], [NBT CIB][nbt-cib], [SPT CIB][spt-cib], [MPC CIB][mpc-cib], [TST CIB][tst-cib], [MST decisions][mst-decisions]). `ProfileOptions.timerZone` is refused (`profile.timerZone`).

## Restrictions

| Refusal code | Refused | Reason or owning row |
|---|---|---|
| `timer.duration` | a duration outside the exact grammar or not a literal | PC-TIMER-01, PC-TIMER-03 ([CIB-LIM-0003](../../CIB-BPMN-RELATION-REGISTER.md#cib-lim-0003-zero-fractional-nominal-interval-and-over-maximum-durations-are-refused)) |
| `timer.date` | `timeDate` | PC-TIMER-01 (calendar and zone account) |
| `timer.cycle` | a cycle other than literal `R/<duration>` | PC-TIMER-02 |
| `timer.cycleNotAttached` | a cycle on a catch Event or a root start | PC-TIMER-04, PC-TIMER-05 |
| `timer.cron` | the CIB Cron dialect | PC-TIMER-02 |
| `timer.interruptingCycle` | a cycle on an interrupting boundary or Event Sub-Process start | no second firing to give |
| `profile.timerZone` | a process time zone | PC-TIMER-01 |
| `message.nameExpression` | a Message name given by an expression | PC-MESSAGE-01 |
| `message.correlation` | correlation on a boundary or start | PC-MESSAGE-08 (see [population](population.md)) |
| `start.message.outputs` | a root Message start that writes its payload | PC-MESSAGE-02 |
| `scope.eventSubProcess.interruptingMessage` | an interrupting Message Event Sub-Process | PC-MESSAGE-06 (see [scopes](scopes.md)) |
| `event.outputs` | outputs on a non-Message trigger | only a Message carries data |
| `event.catch.signal`, `boundary.signal`, `start.signal` | Signal catches, boundaries and starts | PC-SIGNAL-02, PC-SIGNAL-03 |
| `event.catch.condition`, `boundary.condition`, `start.condition` | Conditional catches, boundaries and starts | PC-CONDITION-02, PC-CONDITION-03, PC-CONDITION-04 |
| `event.catch.error`, `event.catch.escalation`, `event.catch.compensation`, `event.catch.cancel` | an intermediate catch of a propagated trigger | BPMN gives none a normal-flow catch |
| `start.error`, `start.escalation`, `start.compensation` | a root start of a propagated trigger | such a start is an Event Sub-Process start |
| `start.cancel` | a Cancel start | BPMN defines none |
| `event.error.codeVariable`, `event.error.messageVariable`, `event.escalation.codeVariable` | CIB catch variables | see [propagation](propagation.md) |
| `gateway.eventBased.receiveArm` | a Receive Task arm on an Event-Based Gateway | see [flow](flow.md) |
| `timer-not-due`, `unknown-timer`, `logical-time-backward` (`rejected`) | an early, wrong or backward firing | the firing rules above |
| `unknown-message-subscription`, `message-channel-mismatch`, `message-correlation-mismatch`, `message-payload-required`, `message-payload-not-accepted` (`rejected`) | a delivery to no open subscription, on another channel, with other criteria or with the wrong payload presence | the delivery rules above |
| `no-start-event`, `instance-already-started` (`rejected`) | a start input that fires no start, or one to a started instance | the start rules above |
| `timer-duration`, `timer-date`, `timer-cycle`, `timer-cron`, `message-name-expression`, `message-correlation-keys`, `event-catch-signal`, `event-catch-condition`, `event-catch-error` (dynamic-only `unsupported`) | the same forms reaching the runtime | guards behind the admission codes |

Superseded first-profile restrictions: the boundary, catch and start profiles each fixed one diagram class with one host User Task or one-child Sub-Process, one Boundary Event, exact flow and node counts, the `PT1S` lexeme, one admitted `cancelActivity` spelling per profile and empty task submissions; the Message profiles admitted no payload except one scalar into one Process Property, and the repeatable-subscription profile allowed at most one Boundary Event and one Timer per definition, fork-forest control flow and a burst bound of eight internal operations ([ABMSG source][abmsg-source], [ABMSG scope][abmsg-scope], [ABT source][abt-source], [ABT scope][abt-scope], [NBT scope][nbt-scope], [SPT source][spt-source], [SPT scope][spt-scope], [ICM source][icm-source], [ICM scope][icm-scope], [ICT exclusions][ict-excl], [MPC scope][mpc-scope], [MST source][mst-source], [MST scope][mst-scope], [TST source][tst-source], [TST scope][tst-scope], [TED scope][ted-scope], [TED contract][ted-contract], [RES surface][res-surface]). The kernel admits a boundary of any admitted trigger, in either interruption mode, on any Activity or Sub-Process host, several per host, any admitted duration at every Timer site, and payload outputs on catches, boundaries and Event Sub-Process starts; its admission codes above are the restrictions.

## Open rows

| Row | Decision owed or not yet implemented |
|---|---|
| PC-TIMER-01 | Absolute dates, zones and logical-time conversion; zero, past, fractional and nominal deadlines. |
| PC-TIMER-02 | Finite and dated repetition, Cron, and their last-fire and drift rules. |
| PC-TIMER-03 | Data-derived Timer expressions: evaluation point, failure and whether a later write changes an armed deadline. |
| PC-TIMER-04 | Root Timer start schedules bound to an exact definition version (see [population](population.md)); the engine-published Timer start capability ([TST scheduling][tst-schedule]). |
| PC-TIMER-05 to PC-TIMER-08 | Whole-model acceptance of what the kernel arms: catches in cycles, several boundaries per host on every host kind, Timer Event Sub-Processes, and lifetimes across nested, called, Multi-Instance and Transaction owners. |
| PC-MESSAGE-01 | Message-name addressing beside the Operation channel, expression-derived names. |
| PC-MESSAGE-03 to PC-MESSAGE-05 | Payload catches in branches and nested work; interrupting and repeated non-interrupting Message boundaries on every host, with acceptance. |
| PC-MESSAGE-06, PC-MESSAGE-07 | Interrupting Message Event Sub-Processes (refused); non-interrupting ones under every parent. |
| PC-MESSAGE-09 | Modeled Message throws and Message End (`throw.message`, see [propagation](propagation.md)). |
| PC-SIGNAL-01 to PC-SIGNAL-04 | Every Signal trigger. |
| PC-CONDITION-01 to PC-CONDITION-05 | Every Conditional trigger. |

## Sources

[abmsg-select]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/ACTIVITY-BOUNDARY-MESSAGE-SPEC.md#selection-basis
[abmsg-normative]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/ACTIVITY-BOUNDARY-MESSAGE-SPEC.md#normative-basis-and-interpretation
[abmsg-source]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/ACTIVITY-BOUNDARY-MESSAGE-SPEC.md#selected-source-profile
[abmsg-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/ACTIVITY-BOUNDARY-MESSAGE-SPEC.md#stable-semantic-rules
[abmsg-cib]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/ACTIVITY-BOUNDARY-MESSAGE-SPEC.md#cib-classification
[abmsg-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/ACTIVITY-BOUNDARY-MESSAGE-SPEC.md#required-optional-and-excluded-scope
[abt-normative]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/ACTIVITY-BOUNDARY-TIMER-SPEC.md#normative-basis
[abt-account]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/ACTIVITY-BOUNDARY-TIMER-SPEC.md#selected-account-and-the-competing-accounts-it-rejects
[abt-source]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/ACTIVITY-BOUNDARY-TIMER-SPEC.md#exact-source-profile
[abt-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/ACTIVITY-BOUNDARY-TIMER-SPEC.md#proposed-semantic-rules
[abt-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/ACTIVITY-BOUNDARY-TIMER-SPEC.md#required-optional-and-excluded
[abt-cib]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/ACTIVITY-BOUNDARY-TIMER-SPEC.md#cib-relationship
[icm-claim]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/INTERMEDIATE-CATCH-MESSAGE-SPEC.md#exact-claim
[icm-normative]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/INTERMEDIATE-CATCH-MESSAGE-SPEC.md#normative-basis
[icm-source]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/INTERMEDIATE-CATCH-MESSAGE-SPEC.md#selected-source-profile
[icm-payload]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/INTERMEDIATE-CATCH-MESSAGE-SPEC.md#payload-boundary
[icm-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/INTERMEDIATE-CATCH-MESSAGE-SPEC.md#stable-semantic-rules
[icm-cib]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/INTERMEDIATE-CATCH-MESSAGE-SPEC.md#cib-seven-classification
[icm-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/INTERMEDIATE-CATCH-MESSAGE-SPEC.md#maintained-optional-and-excluded
[ict-claim]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/INTERMEDIATE-CATCH-TIMER-SPEC.md#claim-boundary
[ict-source]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/INTERMEDIATE-CATCH-TIMER-SPEC.md#source-profile
[ict-il]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/INTERMEDIATE-CATCH-TIMER-SPEC.md#semantic-process-il
[ict-time]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/INTERMEDIATE-CATCH-TIMER-SPEC.md#semantic-time-and-timer-identity
[ict-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/INTERMEDIATE-CATCH-TIMER-SPEC.md#stable-semantic-rules
[ict-excl]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/INTERMEDIATE-CATCH-TIMER-SPEC.md#exclusions
[mpc-normative]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/MESSAGE-PAYLOAD-CATCH-MEDIATION-SPEC.md#normative-account-and-selected-interpretation
[mpc-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/MESSAGE-PAYLOAD-CATCH-MEDIATION-SPEC.md#required-optional-and-excluded
[mpc-accounts]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/MESSAGE-PAYLOAD-CATCH-MEDIATION-SPEC.md#competing-accounts-and-the-account-this-proposal-selects
[mpc-contract]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/MESSAGE-PAYLOAD-CATCH-MEDIATION-SPEC.md#runtime-command-stable-state-and-observation-contract
[mpc-cib]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/MESSAGE-PAYLOAD-CATCH-MEDIATION-SPEC.md#cib-seven-relationship-boundary
[mst-select]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/MESSAGE-START-EVENT-SPEC.md#selection-basis
[mst-normative]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/MESSAGE-START-EVENT-SPEC.md#normative-basis
[mst-account]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/MESSAGE-START-EVENT-SPEC.md#selected-account-and-rejected-alternatives
[mst-source]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/MESSAGE-START-EVENT-SPEC.md#exact-source-profile
[mst-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/MESSAGE-START-EVENT-SPEC.md#stable-semantic-rules
[mst-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/MESSAGE-START-EVENT-SPEC.md#required-optional-and-excluded
[mst-cib]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/MESSAGE-START-EVENT-SPEC.md#cib-relationship
[mst-decisions]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/MESSAGE-START-EVENT-SPEC.md#approved-decisions
[nbt-normative]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/NON-INTERRUPTING-BOUNDARY-TIMER-SPEC.md#normative-basis
[nbt-account]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/NON-INTERRUPTING-BOUNDARY-TIMER-SPEC.md#selected-account-and-the-competing-accounts-it-rejects
[nbt-source]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/NON-INTERRUPTING-BOUNDARY-TIMER-SPEC.md#exact-source-profile
[nbt-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/NON-INTERRUPTING-BOUNDARY-TIMER-SPEC.md#proposed-semantic-rules
[nbt-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/NON-INTERRUPTING-BOUNDARY-TIMER-SPEC.md#required-optional-and-excluded
[nbt-cib]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/NON-INTERRUPTING-BOUNDARY-TIMER-SPEC.md#cib-relationship
[nbt-owner]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/NON-INTERRUPTING-BOUNDARY-TIMER-SPEC.md#owner-decisions-required
[res-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/REPEATABLE-EVENT-SUBSCRIPTIONS-SPEC.md#scope-and-boundary
[res-normative]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/REPEATABLE-EVENT-SUBSCRIPTIONS-SPEC.md#normative-basis-and-compatibility
[res-surface]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/REPEATABLE-EVENT-SUBSCRIPTIONS-SPEC.md#required-surface-and-source-admission
[spt-normative]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SUBPROCESS-BOUNDARY-TIMER-SPEC.md#normative-basis
[spt-account]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SUBPROCESS-BOUNDARY-TIMER-SPEC.md#selected-account-and-the-competing-accounts-it-rejects
[spt-source]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SUBPROCESS-BOUNDARY-TIMER-SPEC.md#exact-source-profile
[spt-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SUBPROCESS-BOUNDARY-TIMER-SPEC.md#proposed-semantic-rules
[spt-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SUBPROCESS-BOUNDARY-TIMER-SPEC.md#required-optional-and-excluded
[spt-cib]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SUBPROCESS-BOUNDARY-TIMER-SPEC.md#cib-relationship
[spt-owner]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/SUBPROCESS-BOUNDARY-TIMER-SPEC.md#owner-decisions
[ted-normative]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/TIMER-EXACT-DURATIONS-PROPOSAL.md#normative-basis-and-cib-classification
[ted-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/TIMER-EXACT-DURATIONS-PROPOSAL.md#required-optional-and-excluded-scope
[ted-contract]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/TIMER-EXACT-DURATIONS-PROPOSAL.md#profile-and-public-contract
[ted-admission]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/TIMER-EXACT-DURATIONS-PROPOSAL.md#admission
[ted-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/TIMER-EXACT-DURATIONS-PROPOSAL.md#stable-rules
[tst-contract]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/TIMER-START-EVENT-SPEC.md#contract
[tst-normative]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/TIMER-START-EVENT-SPEC.md#normative-basis
[tst-account]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/TIMER-START-EVENT-SPEC.md#selected-account-and-rejected-alternatives
[tst-source]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/TIMER-START-EVENT-SPEC.md#exact-source-profile
[tst-rules]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/TIMER-START-EVENT-SPEC.md#stable-semantic-rules
[tst-schedule]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/TIMER-START-EVENT-SPEC.md#definition-scheduling-boundary
[tst-scope]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/TIMER-START-EVENT-SPEC.md#required-optional-and-excluded
[tst-cib]: https://github.com/mbackschat/bpmn-lean-experiment/blob/38e4ba63/docs/capsules/TIMER-START-EVENT-SPEC.md#cib-relationship
