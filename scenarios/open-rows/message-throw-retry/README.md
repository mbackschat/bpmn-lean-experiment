# Retry of a bound Message throw

This directory serves [PC-MESSAGE-09](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list), whose clause says retry preserves one modeled send occurrence. The [retry model](retry-notify.bpmn) is project-authored MIT source for the `cibseven-2.2.0` profile; the schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer.

The Process starts directly in the Intermediate throw `Throw_ShippedNotice` and ends in the Message End `MessageEnd_Closed`; both carry `camunda:delegateExpression="${bpmnLeanEffectHandler}"` on their `messageEventDefinition`. The schedule reports one technical failure of the Intermediate throw, retries its incident and answers it and the Message End by success, with incidents enabled.

A technical failure needs a delegate that CIB runs as a job, and a job needs an asynchronous continuation on the throw event. The model declares none, so CIB cannot realize this schedule from it as written.

| Scenario | Case it exercises |
|---|---|
| [technical-failure-then-retry](technical-failure-then-retry.scenario.json) | A technical failure of a modeled Message throw, the retry of its incident and the success of both sends. |

The schedule carries no expected incident, retry count or Process state; the retained CIB evidence is the answer.
