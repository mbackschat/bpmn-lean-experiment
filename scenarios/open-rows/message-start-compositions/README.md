# Root Message Start compositions

Answer-free schedules for [PC-MESSAGE-02](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): several distinct root Message Starts in one process, a None Start beside a Message Start, a Message Start that carries a payload, the same Message on two starts, and a Message Start addressed to each of two versions of one process. The [subscriptions semantics](../../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md#starts) and [population semantics](../../../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md#start-selection) own the meaning; these inputs only exercise it, and the retained CIB Seven `2.2.0` answer is the row's target. They extend the single registered [Message Start Event scenario](../../message-start-event/README.md). The profile is `cibseven-2.2.0` with no source overlay.

A Message start stimulus names its Start Event and the Message it triggers; a Message that belongs to no Interface is addressed as a direct Message, the payload-bearing model through its Interface Operation.

## Models

| Model | What it holds |
|---|---|
| [order-intake](order-intake.bpmn) | One process with two Message Starts, *Order placed* (`order-placed`) leading to *Pick the order* and *Order amended* (`order-amended`) leading to *Revise the order*, each to its own End. |
| [request-intake](request-intake.bpmn) | One process with a None Start *Request entered by hand* leading to *Handle the manual request* and a Message Start *Request received* (`request-received`) leading to *Handle the message request*. |
| [shipment-start](shipment-start.bpmn) | A Message Start *Shipment announced* (`shipment-announced`, through the Interface *Carrier*) with one Data Output associated to the Process Property `Property_ManifestReference`, leading to *Check the manifest*. |
| [duplicate-message-starts](duplicate-message-starts.bpmn) | One process whose two Message Starts, *Order placed online* and *Order placed by phone*, reference the one Message `order-placed`. |

## Single-instance schedules

| Schedule | Model | Case it separates |
|---|---|---|
| [order-placed-start](order-placed-start.scenario.json) | order-intake | *Order placed* is triggered and *Pick the order* completes. |
| [order-amended-start](order-amended-start.scenario.json) | order-intake | *Order amended* is triggered and *Revise the order* completes. |
| [request-none-start](request-none-start.scenario.json) | request-intake | A plain start with no trigger, then *Handle the manual request* completes. |
| [request-message-start](request-message-start.scenario.json) | request-intake | *Request received* is triggered and *Handle the message request* completes. |
| [request-none-trigger-names-message-start](request-none-trigger-names-message-start.scenario.json) | request-intake | A start with no trigger that names the Message Start *Request received*. |
| [shipment-payload-string](shipment-payload-string.scenario.json) | shipment-start | The trigger carries one String payload. |
| [shipment-payload-map](shipment-payload-map.scenario.json) | shipment-start | The trigger carries a Map with a String, an Integer and a present Null. |
| [shipment-payload-absent](shipment-payload-absent.scenario.json) | shipment-start | The trigger carries no payload. |
| [duplicate-message-starts-start](duplicate-message-starts-start.scenario.json) | duplicate-message-starts | The shared Message triggers the first of the two starts. |
| [kernel-start-payload-outside-domain](kernel-start-payload-outside-domain.scenario.json) | shipment-start | Kernel-only twin: the trigger carries a payload nested five Lists deep, outside the value domain. |

The population witnesses of these rows, which need more than one instance or definition, are in [message-start-population](../message-start-population/README.md).

The schedules carry no expected instance, task or variable; the retained CIB evidence is the answer. The `kernel-` schedules are kernel-only twins of kernel unit tests whose branch no CIB schedule reaches: their provenance names no CIB revision (`not-applicable`), so no CIB run takes them, and the differential compares the Lean kernel with the TypeScript kernel on them.
