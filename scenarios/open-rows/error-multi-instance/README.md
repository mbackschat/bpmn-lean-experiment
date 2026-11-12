# Error propagation out of Multi-Instance bodies

This directory serves [PC-ERROR-03](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): a business failure of one instance of a sequential Multi-Instance Service Task and of one called child of a parallel Multi-Instance Call Activity, the cancellation of the remaining work, and the error data the host boundary writes. The [dispatch model](dispatch-batches.bpmn) and the [error-data model](review-error-data.bpmn) are project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer.

After a Parallel fork, two branches run. The first is the sequential Multi-Instance Service Task `NotifyEach` with a loop cardinality of 3 and an exact `NOTIFY_FAILED` boundary on the host. The second is the parallel Multi-Instance Call Activity `ReviewEach` with a loop cardinality of 2 and an exact `REVIEW_REJECTED` boundary on the host; each child runs the Service Task `Assess`, answered by `effectResult`. Each boundary leads to its own Human Task.

The [error-data model](review-error-data.bpmn) runs only a parallel Multi-Instance Call Activity `ReviewEach` of the same shape, whose exact `REVIEW_REJECTED` host boundary names `camunda:errorCodeVariable` `rejectedCode` and `camunda:errorMessageVariable` `rejectedMessage` and leads to the Human Task `ResolveReview`. The outputs of a failing instance's Call on the Error path are witnessed by [sequential-child-error and parallel-child-error](../multi-instance-call-activity/README.md); a Multi-Instance Activity's own `camunda:outputParameter` is a CIB deployment error (`BpmnParse.java:4855-4857`), so no other inner Activity output exists to witness.

`NotifyEach` declares no asynchronous continuation: `camunda:asyncBefore` on the Service Task element would make the Multi-Instance body, not each instance, asynchronous. CIB runs the delegate of each instance inside the command that reaches it and answers from the scenario's `effectResult` entries in order.

| Scenario | Case it exercises |
|---|---|
| [sequential-second-instance-fails](sequential-second-instance-fails.scenario.json) | The first of three instances succeeds and the second reports the business failure the host boundary names. |
| [parallel-second-child-fails](parallel-second-child-fails.scenario.json) | The three `NotifyEach` instances succeed, the second of two concurrent children reports the business failure the host boundary names, then the first child's result is addressed after that. |
| [parallel-error-data-to-host-boundary](parallel-error-data-to-host-boundary.scenario.json) | On the error-data model, the second of two concurrent children reports `REVIEW_REJECTED` with a message, then the Human Task the boundary leads to is completed: where the code and message variables land and that the first child is cancelled. |

The schedules carry no expected route or Process state; the retained CIB evidence is the answer.
