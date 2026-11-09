# Error propagation out of Multi-Instance bodies

This directory serves [PC-ERROR-03](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): a business failure of one instance of a sequential Multi-Instance Service Task and of one called child of a parallel Multi-Instance Call Activity, and the cancellation of the remaining work. The [dispatch model](dispatch-batches.bpmn) is project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer.

After a Parallel fork, two branches run. The first is the sequential Multi-Instance Service Task `NotifyEach` with a loop cardinality of 3 and an exact `NOTIFY_FAILED` boundary on the host. The second is the parallel Multi-Instance Call Activity `ReviewEach` with a loop cardinality of 2 and an exact `REVIEW_REJECTED` boundary on the host; each child runs the Service Task `Assess`, answered by `effectResult`. Each boundary leads to its own Human Task.

`NotifyEach` declares no asynchronous continuation: `camunda:asyncBefore` on the Service Task element would make the Multi-Instance body, not each instance, asynchronous. CIB runs the delegate of each instance inside the command that reaches it and answers from the scenario's `effectResult` entries in order.

| Scenario | Case it exercises |
|---|---|
| [sequential-second-instance-fails](sequential-second-instance-fails.scenario.json) | The first of three instances succeeds and the second reports the business failure the host boundary names. |
| [parallel-second-child-fails](parallel-second-child-fails.scenario.json) | The second of two concurrent children reports the business failure the host boundary names, then the first child's result is addressed after that. |

The schedules carry no expected route or Process state; the retained CIB evidence is the answer.
