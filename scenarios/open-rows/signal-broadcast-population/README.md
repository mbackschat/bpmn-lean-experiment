# Signal broadcast populations

Answer-free population schedules for [PC-SIGNAL-02](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) (Signal root starts and intermediate catches reached by one broadcast) and [PC-SIGNAL-04](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) (the whole eligible population, one unit of commitment per receiver, superseded versions, receivers that no longer wait, cascades through thrown Signals, replay of a command). The [subscriptions semantics](../../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md#starts) and the [population semantics](../../../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md) own the meaning; these inputs only exercise it. Each is a closed [engine population scenario](../../../contracts/schemas/engine-population-scenario.schema.json): the definitions deploy in the order listed (or at their `deploy` step), then the steps run in order at their logical times.

A `broadcast` step addresses every eligible receiver by a Signal name (the `cibseven-2.2.0` schedules) or by the `signalRef` of the Signal element (the `bpmn-2.0.2` schedules), carries no business key and, here, no variables. A thrown Signal is not a step: it happens when the instance reaches the throw. The started instances' identities are derived by the engine, so no schedule addresses one of them.

The CIB schedules run under `cibseven-2.2.0` with no source overlay; their CIB answer comes from the CIB runner's population mode in the hosted lane and is retained beside each schedule. The kernel-only schedules run under `bpmn-2.0.2`, whose provenance names no CIB revision: they probe meanings that CIB has no counterpart for (the standards reading of a duplicate Signal Start, the linearization of two receivers of one State, an explicit discovery order, the command ledger).

## Models

| Model | What it holds |
|---|---|
| [shift-awaiting](shift-awaiting.bpmn) | A None Start *Till opened*, the Intermediate Signal catch *Shift closed* (`shift-closed`) and the User Task *Reconcile the till*. |
| [shift-signals-v2](shift-signals-v2.bpmn) | The process `Process_ShiftSignals` of [shift-signals](../signal-start-compositions/shift-signals.bpmn) with *Close the register* renamed *Close the till*: a second version of one process key. |
| [handover-sender](handover-sender.bpmn) | A None Start, the User Task *Prepare the handover*, an Intermediate Signal throw of `handover-requested` whose `camunda:in` copies no variable and sets the literal business key `handover-42`, and the User Task *Await the acceptance*. |
| [cascade-emitter](cascade-emitter.bpmn) | A None Start, the User Task *Dispatch the batch*, an Intermediate throw of `signal-one`, an Intermediate catch of `signal-two` and the User Task *Wrap up the batch*. |
| [cascade-relay](cascade-relay.bpmn) | A None Start, an Intermediate catch of `signal-one`, an Intermediate throw of `signal-two` and the User Task *Acknowledge the relay*. |
| [cascade-fork-emitter](cascade-fork-emitter.bpmn) | A None Start, the User Task *Dispatch the batch* and a Parallel fork whose first branch throws `signal-one` and ends and whose second branch reaches an Intermediate catch of `signal-two` and the User Task *Wrap up the batch*. |
| [own-start-throw](own-start-throw.bpmn) | A None Start *Sync started by hand* and a Signal Start *Sync requested* (`sync-requested`) into the User Task *Prepare the sync*, an Intermediate throw of `sync-requested` and the User Task *Finish the sync*. |
| [guarded-work](guarded-work.bpmn) | The User Task *Do the work* with an interrupting Signal boundary (`stop`) to *Handle the stop*, and the Event Sub-Process *AlertWatch* with a non-interrupting Signal start (`alert`) to *Handle the alert*. |
| [arm-order](arm-order.bpmn) | A None Start into an Event-Based Gateway whose two arms, *First arm* and *Second arm*, catch the one Signal `Signal_Go` and lead to their own User Tasks. |
| [echo-relay](echo-relay.bpmn) | A None Start into the catch *Echo heard* of the Signal `echo` (`Signal_Echo`), whose throw *Echo answered* leads back to the catch: two instances relay one Signal forever. |
| [confirmation-signal-relay](confirmation-signal-relay.bpmn) | A None Start, the Message catch *Await confirmation* (`order-confirmed`) and an End Event throwing `shift-closed`. |
| [failing-shift-catch](failing-shift-catch.bpmn) | A None Start *Till opened* and the Intermediate Signal catch *Shift closed* (`shift-closed`) into the Exclusive Gateway *Choose the audit*, whose flow to *Audit in depth* reads `${auditLevel > 1}` over a variable no step supplies and whose default flow leads to *Check routinely*. |

The schedules also bind five models of [signal-start-compositions](../signal-start-compositions/README.md):

- [shift-signals](../signal-start-compositions/shift-signals.bpmn): two Signal Starts, `shift-opened` and `shift-closed`.
- [failing-signal-start](../signal-start-compositions/failing-signal-start.bpmn): the Signal Start `shift-closed` into an Exclusive Gateway that reads the unset variable `auditLevel`.
- [approval-race](../signal-start-compositions/approval-race.bpmn): an Event-Based Gateway over the Signals `approved` and `rejected` and a Timer.
- [handover-relay](../signal-start-compositions/handover-relay.bpmn): the Signal Start `handover-requested` into the catch `handover-accepted`.
- [duplicate-signal-starts](../signal-start-compositions/duplicate-signal-starts.bpmn): two Signal Starts of one process on the one Signal `shift-opened`.

## Population schedules

| Schedule | Definitions | Target | Case it separates |
|---|---|---|---|
| [broadcast-two-definitions-starts-and-catches](broadcast-two-definitions-starts-and-catches.population-scenario.json) | shift-awaiting, shift-signals | CIB | Two instances wait at the catch; `shift-closed` is broadcast, then `shift-opened`, then one waiting instance's task completes. |
| [broadcast-start-fails-catch-still-delivered](broadcast-start-fails-catch-still-delivered.population-scenario.json) | shift-awaiting, failing-signal-start | CIB | One instance waits at the catch while `shift-closed` is broadcast to a definition whose Signal Start reads a variable no broadcast supplies. |
| [broadcast-superseded-version-not-started](broadcast-superseded-version-not-started.population-scenario.json) | shift-signals, shift-signals-v2 | CIB | Two versions of one process are deployed ten milliseconds apart, then `shift-closed` is broadcast. |
| [broadcast-expired-receiver-unchanged](broadcast-expired-receiver-unchanged.population-scenario.json) | approval-race | CIB | `approved` is broadcast to a waiting Event-Based Gateway, then `rejected`, which names an arm of the same gateway. |
| [thrown-signal-starts-other-definition-with-business-key](thrown-signal-starts-other-definition-with-business-key.population-scenario.json) | handover-relay, handover-sender | CIB | A modeled throw with the literal business key `handover-42` names the Signal Start of another definition. |
| [emitter-first-cascade](emitter-first-cascade.population-scenario.json) | cascade-emitter, cascade-relay | CIB | The emitter throws `signal-one` and then reaches a catch of `signal-two`; the relay's catch of `signal-one` throws `signal-two`. |
| [sibling-branch-cascade](sibling-branch-cascade.population-scenario.json) | cascade-fork-emitter, cascade-relay | CIB | The emitter's first branch throws `signal-one` while its second branch has yet to reach the catch of `signal-two`; the relay's catch of `signal-one` throws `signal-two`. |
| [own-start-catches-own-throw](own-start-catches-own-throw.population-scenario.json) | own-start-throw | CIB | An instance started by hand throws the Signal that its own root Signal Start also catches. |
| [broadcast-catch-continuation-fails](broadcast-catch-continuation-fails.population-scenario.json) | failing-shift-catch | CIB | One instance waits at the catch and `shift-closed` is broadcast; the catch's continuation reads the unset `auditLevel`. The kernel answers a fan-out whose one entry is the catch's `failed rolledBack unknown-variable`, the instance still waiting; CIB is predicted to roll the whole broadcast back with the instance still waiting, as it did for the failing Signal Start of [broadcast-start-fails-catch-still-delivered](broadcast-start-fails-catch-still-delivered.population-scenario.json), since `SignalEventReceivedCmd` runs every receiver in the one command. |
| [broadcast-standards-duplicate-starts-two-instances](broadcast-standards-duplicate-starts-two-instances.population-scenario.json) | duplicate-signal-starts | kernel-only, `bpmn-2.0.2` | One broadcast addressed by `signalRef` names two root Signal Starts of one process. |
| [broadcast-boundary-and-esp-standards](broadcast-boundary-and-esp-standards.population-scenario.json) | guarded-work | kernel-only, `bpmn-2.0.2` | `Signal_Alert` is broadcast twice to a non-interrupting Event Sub-Process start, then `Signal_Stop` to an interrupting boundary of the running task. |
| [broadcast-within-state-order](broadcast-within-state-order.population-scenario.json) | arm-order | kernel-only, `bpmn-2.0.2` | One broadcast names both arms of one Event-Based Gateway, in the defined linearization. |
| [broadcast-explicit-order](broadcast-explicit-order.population-scenario.json) | arm-order | kernel-only, `bpmn-2.0.2` | The same broadcast with an explicit `order` that names the second arm first. |
| [broadcast-replay](broadcast-replay.population-scenario.json) | shift-signals | kernel-only, `bpmn-2.0.2` | One broadcast, the identical broadcast again, then the same `commandId` addressing the other Signal. |
| [broadcast-replay-later-time](broadcast-replay-later-time.population-scenario.json) | shift-signals | kernel-only, `bpmn-2.0.2` | One broadcast at 0 and the identical broadcast at 60,000 ms. |
| [kernel-cascade-bound](kernel-cascade-bound.population-scenario.json) | echo-relay | kernel-only, `bpmn-2.0.2` | Two echo instances wait and `Signal_Echo` is broadcast: the cascade never settles and the bound stops it. |
| [kernel-start-order-and-variables](kernel-start-order-and-variables.population-scenario.json) | duplicate-signal-starts | kernel-only, `bpmn-2.0.2` | An `order` naming the two root Signal starts in reverse, an `order` naming one of them, then a broadcast carrying a variable where the Signal carries no data. |
| [kernel-targeted-delivery-standards](kernel-targeted-delivery-standards.population-scenario.json) | shift-awaiting | kernel-only, `bpmn-2.0.2` | A caller's Signal delivery to the waiting catch, then a broadcast to it. |
| [kernel-publication-cascade](kernel-publication-cascade.population-scenario.json) | shift-awaiting, confirmation-signal-relay | kernel-only, `cibseven-2.2.0` | A publication delivered to the relay's catch, whose step throws the `shift-closed` the other instance waits for. |

The schedules carry no expected deployment, instance, task, variable or fan-out entry. The `kernel-` schedules are kernel-only twins of kernel unit tests whose branch no CIB schedule reaches: their provenance names no CIB revision (`not-applicable`), so no CIB run takes them, and the differential compares the Lean kernel with the TypeScript kernel on them.
