# Interchange reference forms

Answer-free schedules for [PC-BASIC-04](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): an Event naming a root-level EventDefinition through `eventDefinitionRef`, an instantiating Receive Task, and an Error End Event whose `errorRef` must resolve to the one boundary of its Error among two. The retained CIB Seven `2.2.0` answer is the row's target. The profile is `cibseven-2.2.0` with no source overlay.

## Models

| Model | What it holds |
|---|---|
| [event-definition-ref-catch](event-definition-ref-catch.bpmn) | The catch Event *Await*, between a None Start and the User Task *Proceed*, carries no inline definition and names the root-level Timer definition `Timer_Shared` (`PT10S`). |
| [event-definition-ref-start](event-definition-ref-start.bpmn) | The Start Event *Started*, before the User Task *Proceed*, carries no inline definition and names the root-level Message definition `Message_Shared` of the Message `reply`. |
| [instantiating-receive-task](instantiating-receive-task.bpmn) | A None Start before the User Task *Proceed*, beside the Receive Task *Await* for the Message `reply` with `instantiate="true"` and no incoming flow. |
| [error-ref-resolution](error-ref-resolution.bpmn) | The Sub-Process *Attempt* runs the User Task *Work* and ends at an Error End Event naming `Error_Failure` (code `FAILURE`); *Attempt* carries a boundary for `Error_Other` (code `OTHER`) before one for `Error_Failure`, leading to *Handle Other* and *Handle Failure*. |

## Schedules

| Schedule | Model | Case it separates |
|---|---|---|
| [timer-then-proceed](event-definition-ref-catch-timer-then-proceed.scenario.json) | event-definition-ref-catch | The start, *Await*'s Timer fired at 10000, then *Proceed* completed: whether the referenced Timer arms. |
| [none-start](event-definition-ref-start-none-start.scenario.json) | event-definition-ref-start | A plain start, then *Proceed* completed: whether *Started* runs as a None Start. |
| [message-start](event-definition-ref-start-message-start.scenario.json) | event-definition-ref-start | A start by the Message `reply` at *Started*, then *Proceed* completed: whether the referenced Message starts the process. |
| [message-start](instantiating-receive-task-message-start.scenario.json) | instantiating-receive-task | A start by the Message `reply`: whether *Await* instantiates the process. |
| [none-start-then-deliver](instantiating-receive-task-none-start-then-deliver.scenario.json) | instantiating-receive-task | A plain start, the Message delivered to *Await*, then *Proceed* completed: whether *Await* waits without an incoming token. |
| [work-fails](error-ref-resolution-work-fails.scenario.json) | error-ref-resolution | The start, *Work* completed, then *Handle Failure* completed: which boundary the thrown Error reaches. |

The kernel reader refuses both `eventDefinitionRef` models as `reader.eventDefinitionRef`, and admission refuses the instantiating Receive Task as `work.receive.instantiate` ([flow semantics](../../../docs/kernel/semantics/FLOW-SEMANTICS-SPEC.md#interchange-forms-and-diagnostics-pc-basic-04)); the kernel runs `error-ref-resolution`. The schedules fix what CIB answers for the same sources.

The schedules carry no expected state; the retained CIB evidence is the answer.
