# Root Timer Start forms and identities

Answer-free schedules for [PC-TIMER-04](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): root Timer Start delivery for a duration, a date and a cycle, the identity of the Start Event a timer reaches, and the definition-version and replayed-occurrence cases that need more than one instance or definition. The [subscriptions semantics](../../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md#starts) and [population semantics](../../../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md#start-selection) own the meaning; these inputs only exercise it, and the retained CIB Seven `2.2.0` answer is the row's target. They extend the single registered [Timer Start Event scenario](../../timer-start-event/README.md). The profile is `cibseven-2.2.0` with no source overlay.

Logical time zero is the Unix epoch `1970-01-01T00:00:00Z`, and every model is deployed at logical time zero, so a Timer Start's due time is fixed by its literal: `PT1H` is 3,600,000 ms, `PT2H` is 7,200,000 ms, the date `1970-01-01T02:00:00Z` is 7,200,000 ms, and the first occurrence of the cycle `R/PT1H` is one period after deployment, 3,600,000 ms. A Timer start stimulus names its Start Event and carries the due time it fires at; the User Task of the started instance is then completed.

## Models

| Model | What it holds |
|---|---|
| [duration-start](duration-start.bpmn) | The Timer Start *An hour after deployment* (`timeDuration` `PT1H`) leading to the User Task *Review the batch* and an End. |
| [date-start](date-start.bpmn) | The Timer Start *On the batch date* (`timeDate` `1970-01-01T02:00:00Z`, UTC) leading to *Review the batch*. |
| [cycle-start](cycle-start.bpmn) | The Timer Start *Every hour* (`timeCycle` `R/PT1H`) leading to *Review the batch*. |
| [timer-and-message-start](timer-and-message-start.bpmn) | One process with the Timer Start *An hour after deployment* (`PT1H`) leading to *Handle the timed batch* and the Message Start *Batch announced* (message `batch-ready`) leading to *Handle the announced batch*. |
| [two-timer-starts](two-timer-starts.bpmn) | One process with two Timer Starts, *Morning run* (`PT1H`) and *Evening run* (`PT2H`), each leading to its own User Task. |

## Single-instance schedules

| Schedule | Model | Case it separates |
|---|---|---|
| [duration-start-fires](duration-start-fires.scenario.json) | duration-start | The duration Start fires at its due time and its task completes. |
| [date-start-fires](date-start-fires.scenario.json) | date-start | The date Start fires at its date and its task completes. |
| [cycle-start-fires](cycle-start-fires.scenario.json) | cycle-start | The cycle Start fires at its first occurrence and its task completes. |
| [duration-start-before-deadline](duration-start-before-deadline.scenario.json) | duration-start | The duration Start is fired at half of its due time. |
| [timer-and-message-timer-path](timer-and-message-timer-path.scenario.json) | timer-and-message-start | The Timer Start fires and the task of its own path completes. |
| [timer-and-message-message-path](timer-and-message-message-path.scenario.json) | timer-and-message-start | The Message Start is triggered and the task of its own path completes. |
| [timer-trigger-names-message-start](timer-trigger-names-message-start.scenario.json) | timer-and-message-start | A timer trigger at the Timer Start's due time names the Message Start. |
| [two-timer-starts-first](two-timer-starts-first.scenario.json) | two-timer-starts | The first of two Timer Starts fires at its due time and its task completes. |

The population witnesses of these rows, which need more than one instance or definition, are in [timer-start-population](../timer-start-population/README.md).

The schedules carry no expected instance, task or version; the retained CIB evidence is the answer.
