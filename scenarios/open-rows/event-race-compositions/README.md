# Event-Based Gateway races and their refusals

Answer-free schedules for [PC-CF-05](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): Event-Based Gateway races over Message and Timer arms, repeated and scoped, a race on one Parallel branch beside a Receive Task (the Event-Based within Parallel cell of [PC-CF-08](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list)), the identifier-renaming part of [PC-BASIC-03](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list), and the refusals the row owns. The [flow semantics](../../../docs/kernel/semantics/FLOW-SEMANTICS-SPEC.md#event-based-gateway) own the meaning; these inputs only exercise it, and the retained CIB Seven `2.2.0` answer is the row's target. The profile is `cibseven-2.2.0` with no source overlay. A race arm is addressed by its catch Event and the activation of the gateway occurrence that armed it. Timers are literal durations, so a firing carries the deadline that the arming at logical time zero fixes (`PT10S` as 10000, `PT5S` as 5000, `PT1H` as 3600000); no schedule advances the clock before a firing.

## Models

| Model | What it holds |
|---|---|
| [reply-race](reply-race.bpmn) | An Exclusive merge, then the Event-Based Gateway *Await reply* over the Message catch *Reply received* (`reply`) and the Timer catch *Reply overdue* (`PT10S`). The Message arm leads through *Process reply* to a Choice that may return to the merge (`${again == 'yes'}`); the Timer arm leads to *Chase customer*. |
| [reply-race-renamed](reply-race-renamed.bpmn) | The same source with every identifier renamed, the Message identifier included; the Message name `reply`, the labels and the variable names are kept. |
| [parallel-race](parallel-race.bpmn) | A Parallel fork over a branch with the race *Await carrier* (Message `pickup`, Timer `PT1H`), whose arms continue through *Load parcel* or *Reassign carrier* into an Exclusive merge, and the Receive Task *Await payment* (Message `payment`); one join before *Close order*. |
| [scoped-race](scoped-race.bpmn) | An Exclusive merge, then the Sub-Process *Attempt*, whose body holds a race over the Message catch *Delivered* (`delivered`) and the Timer catch *Delivery overdue* (`PT5S`). The Timer arm leads to *Record failure*, which sets `retry`; a Choice after the Sub-Process may return to the merge. |
| [receive-arm](receive-arm.bpmn) | An Event-Based Gateway whose first arm is a Receive Task and whose second is a Timer catch. |
| [instantiating-with-start](instantiating-with-start.bpmn) | A None Start leading to an Event-Based Gateway marked `instantiate="true"` over a Message catch and a Timer catch. |
| [parallel-with-start](parallel-with-start.bpmn) | A None Start leading to an Event-Based Gateway marked `instantiate="true"` and `eventGatewayType="Parallel"` over two Message catches. |
| [instantiating-no-start](instantiating-no-start.bpmn) | An Event-Based Gateway marked `instantiate="true"` with no incoming flow, no Start Event and two Message catches. |

## Schedules

| Schedule | Model | Case it separates |
|---|---|---|
| [message-wins-late-timer](reply-race-message-wins-late-timer.scenario.json) | reply-race | The Message arm is delivered, then the Timer arm is fired. |
| [timer-wins-late-message](reply-race-timer-wins-late-message.scenario.json) | reply-race | The Timer arm is fired, then the Message arm is delivered. |
| [repeated-previous-race-identity](reply-race-repeated-previous-race-identity.scenario.json) | reply-race | The Message arm is delivered in the first race and the review sends the work around again; the first race's Message and Timer identities are then used while the second race is open, then the second race's Timer is fired and its Message arm is delivered afterwards. |
| [repeated-previous-race-identity](reply-race-renamed-repeated-previous-race-identity.scenario.json) | reply-race-renamed | The original schedule of that name addressed through the renamed identifiers. |
| [message-then-payment-late-timer](parallel-race-message-then-payment-late-timer.scenario.json) | parallel-race | The Message arm is delivered and its task completed, then the Timer is fired, then the Receive Task is delivered. |
| [payment-then-timer-late-message](parallel-race-payment-then-timer-late-message.scenario.json) | parallel-race | The Receive Task is delivered first, then the Timer arm is fired and the Message arm is delivered afterwards. |
| [retry-then-delivered](scoped-race-retry-then-delivered.scenario.json) | scoped-race | The first attempt's Timer is fired and its failure task completes with `retry` true; the Message arm is then delivered through the first attempt's identity and through the second attempt's. |
| [delivered-then-late-timer](scoped-race-delivered-then-late-timer.scenario.json) | scoped-race | The Message arm is delivered, then the Timer arm is fired. |
| [start](receive-arm-start.scenario.json) | receive-arm | The start alone, which is where CIB meets the deployment. |
| [message-wins](instantiating-with-start-message-wins.scenario.json) | instantiating-with-start | The Message arm is delivered and its task completes. |
| [both-messages](parallel-with-start-both-messages.scenario.json) | parallel-with-start | Both Message arms are delivered in turn, then the first arm's task completes. |
| [start](instantiating-no-start-start.scenario.json) | instantiating-no-start | The start alone, which is where CIB meets the deployment. |

## Kernel restrictions these inputs reconcile

[receive-arm](receive-arm.bpmn) is the witness for `gateway.eventBased.receiveArm`, and the three instantiating and Parallel models for `reader.eventBasedGatewayInstantiate` ([flow semantics restrictions](../../../docs/kernel/semantics/FLOW-SEMANTICS-SPEC.md#restrictions) and [open rows](../../../docs/kernel/semantics/FLOW-SEMANTICS-SPEC.md#open-rows)), so that CIB's answer to each shape is fixed before the row decides whether to keep refusing it. A schedule over a model CIB may refuse carries `start` alone, or the deliveries that would separate its two readings.

The schedules carry no expected winner or state; the retained CIB evidence is the answer.
