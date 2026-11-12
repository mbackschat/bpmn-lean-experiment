# Retry of a bound Message throw

This directory serves [PC-MESSAGE-09](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list), whose clause says retry preserves one modeled send occurrence. The [retry model](retry-notify.bpmn) is project-authored MIT source for the `cibseven-2.2.0` profile; the schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer.

The Process starts directly in the Intermediate throw `Throw_ShippedNotice` and ends in the Message End `MessageEnd_Closed`; both carry `camunda:delegateExpression="${bpmnLeanEffectHandler}"` on their `messageEventDefinition`. The schedule reports one technical failure of the Intermediate throw, retries its incident and answers it and the Message End by success, with incidents enabled.

The model declares no asynchronous continuation, so CIB runs the throw's delegate inside the starting command: the delegate consumes the schedule's technical failure and throws, which rolls the starting command back (`AbstractBpmnActivityBehavior.java:87-109`), while the kernel commits the start with the effect open and opens an incident on the failure. The [synchronous effect failure](../synchronous-effect-failure/README.md) schedules cover a Service Task and a Send Task the same way.

| Scenario | Case it exercises |
|---|---|
| [technical-failure-then-retry](technical-failure-then-retry.scenario.json) | A technical failure of a modeled Message throw, the retry of its incident and the success of both sends. |

The schedule carries no expected incident, retry count or Process state; the retained CIB evidence is the answer.
