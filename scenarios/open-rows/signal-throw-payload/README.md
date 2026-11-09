# Signal throws with payload

This directory serves [PC-SIGNAL-01](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): the typed payload mapping of an Intermediate Signal throw and a throw that no receiver has yet armed. The [handover model](handover-signals.bpmn) is project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer.

The Process variables `urgent` (a Boolean) and `customer` (a String) are supplied at the start; `note` is never set. After a Parallel fork, `Prepare` leads into the Intermediate throw `handover`, whose `camunda:in` mappings copy `urgent`, `customer` and `note` to `handoverUrgent`, `handoverCustomer` and `handoverNote` and write the expression `${urgent ? 'priority' : 'routine'}` to `handoverLane`. The other branch runs `Warmup`, waits in an Intermediate Signal catch for `handover` and then runs `Receive`.

| Scenario | Case it exercises |
|---|---|
| [payload-delivered](payload-delivered.scenario.json) | The receiver armed before the throw, so the payload reaches it. |
| [throw-before-receiver-armed](throw-before-receiver-armed.scenario.json) | The throw before the receiver arms, then the receiver arming. |

The schedules carry no expected variables, route or Process state; the retained CIB evidence is the answer.
