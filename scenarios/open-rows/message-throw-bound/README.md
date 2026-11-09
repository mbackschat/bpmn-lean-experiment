# Bound Message throws

This directory serves [PC-MESSAGE-09](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): a modeled Intermediate Throw Message Event and Message End Event bound to a delegated effect that is answered like a Service Task by a typed success or business failure. The [notification model](notify-customer.bpmn) is project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer.

The Human Task `Pack` leads into the Sub-Process `Notification`, whose body is the Intermediate throw `Throw_ShippedNotice` and then the Message End `MessageEnd_Closed`. Both carry `camunda:delegateExpression="${bpmnLeanEffectHandler}"` on their `messageEventDefinition` and no asynchronous continuation, so CIB runs each delegate inside the command that reaches it and answers from the scenario's `effectResult` entries for that element in order. An exact `SEND_REFUSED` boundary on `Notification` leads to the Human Task `HandleRefusal`; normal completion leads to the Human Task `Archive`.

| Scenario | Case it exercises |
|---|---|
| [both-sends-succeed](both-sends-succeed.scenario.json) | Both sends answered by success, then the Human Task after the Sub-Process. |
| [intermediate-send-refused](intermediate-send-refused.scenario.json) | The Intermediate throw answered by the business failure code the boundary names. |
| [end-send-refused](end-send-refused.scenario.json) | The Intermediate throw succeeds and the Message End is answered by that business failure code. |

The schedules carry no expected route or Process state; the retained CIB evidence is the answer.
