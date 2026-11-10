# Event-definition reference forms

Answer-free schedules for [PC-BASIC-04](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list), limited to what CIB can answer about event-definition references: a Message or Signal reference that does not resolve, a QName form of a Message reference, and a catching Event with more than one definition. Preserved inert notation and the diagnostics of the frozen cohort belong to the `bpmn-source` reader and have no CIB counterpart here. The retained CIB Seven `2.2.0` answer is the row's target. The profile is `cibseven-2.2.0` with no source overlay.

Every model is one catching Event *Await* between a None Start and the User Task *Proceed*, declaring one Message `reply` (or one Signal `present`).

## Models

| Model | What it holds |
|---|---|
| [typo-message-ref](typo-message-ref.bpmn) | *Await* refers to the Message `Message_Rply`, which no declaration carries; the declared Message is `Message_Reply`. |
| [typo-message-ref-renamed](typo-message-ref-renamed.bpmn) | The same source with every identifier renamed consistently, the declared Message included; the reference `Message_Rply` is unchanged. |
| [message-ref-qname](message-ref-qname.bpmn) | *Await* refers to `tns:Message_Reply`, with `tns` bound to the model's own target namespace. |
| [message-ref-foreign-prefix](message-ref-foreign-prefix.bpmn) | *Await* refers to `other:Message_Reply`, with `other` bound to a different namespace. |
| [multiple-event-definitions](multiple-event-definitions.bpmn) | *Await* carries a Message definition and a Timer definition (`PT10S`). |
| [parallel-multiple](parallel-multiple.bpmn) | The same two definitions with `parallelMultiple="true"`. |
| [dangling-signal-ref](dangling-signal-ref.bpmn) | *Await* refers to the Signal `Signal_Missing`; the declared Signal is `Signal_Present`. |

## Schedules

| Schedule | Model | Case it separates |
|---|---|---|
| [start](typo-message-ref-start.scenario.json) | typo-message-ref | The start alone, which is where CIB meets the deployment. |
| [start](typo-message-ref-renamed-start.scenario.json) | typo-message-ref-renamed | The start alone, which is where CIB meets the deployment. |
| [message-delivered](message-ref-qname-message-delivered.scenario.json) | message-ref-qname | The Message is delivered to *Await*, then *Proceed* is completed. |
| [start](message-ref-foreign-prefix-start.scenario.json) | message-ref-foreign-prefix | The start alone, which is where CIB meets the deployment. |
| [message-then-timer](multiple-event-definitions-message-then-timer.scenario.json) | multiple-event-definitions | The Message is delivered, then the Timer is fired at 10000, then *Proceed* is completed. |
| [message-then-timer](parallel-multiple-message-then-timer.scenario.json) | parallel-multiple | The same stimuli as the schedule of that name on multiple-event-definitions. |
| [start](dangling-signal-ref-start.scenario.json) | dangling-signal-ref | The start alone, which is where CIB meets the deployment. |

The kernel reader binds `message-ref-qname`'s reference, whose prefix the Definitions bind to their own target namespace, refuses a reference that names no element or names another namespace at source level as `source.reference`, and reads the two definitions and `parallelMultiple` into the IL, where admission refuses them as `event.multipleDefinitions` and `event.parallelMultiple` ([flow semantics](../../../docs/kernel/semantics/FLOW-SEMANTICS-SPEC.md#interchange-forms-and-diagnostics-pc-basic-04)). The schedules fix what CIB answers for the same sources.

The schedules carry no expected state; the retained CIB evidence is the answer.
