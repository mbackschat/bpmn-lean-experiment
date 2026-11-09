# Failing, retried and duplicated compensation handler effects

This directory serves [PC-COMPENSATION-04](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) (business and technical failure of handlers, cancellation, the continuation waiting for every required handler, stale and repeated handler results) and the handler-failure disposition of [PC-COMPENSATION-01](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list). The [failing-handlers model](failing-handlers.bpmn) is project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer. Transport-level lost responses belong to the Temporal host; here a lost response is the same result delivered again.

## Model

After a Parallel fork the Human Tasks `UserTask_Book1` and `UserTask_Book2` each have a Compensation Boundary Event whose handler is a Service Task (`ServiceTask_Release1`, `ServiceTask_Release2`; the runner's delegate binding, asynchronous before, answered by `effectResult`). They converge on a Parallel join, an untargeted Intermediate throw and `UserTask_After`. An interrupting Error Event Sub-Process for `RELEASE_FAILED` runs `UserTask_Recover`. Every schedule completes both Human Tasks first, so both handlers are the subject.

## Schedules

| Schedule | Journey |
|---|---|
| [both-succeed-reversed](both-succeed-reversed.scenario.json) | Release 2 succeeds, `UserTask_After` is attempted, Release 1 succeeds, `UserTask_After` is attempted again. |
| [one-fails-caught](one-fails-caught.scenario.json) | Release 1 fails with `RELEASE_FAILED`, Release 2 is then answered successfully, and `UserTask_Recover` completes. |
| [one-fails-uncaught](one-fails-uncaught.scenario.json) | Release 1 fails with `OTHER_FAILURE`, which no handler of the Process catches, Release 2 succeeds, and `UserTask_After` is attempted. |
| [late-failure-after-success](late-failure-after-success.scenario.json) | Release 1 succeeds, Release 2 then fails with `RELEASE_FAILED`, and `UserTask_Recover` completes. |
| [technical-failure-retried](technical-failure-retried.scenario.json) | With incidents enabled and not cancellable, Release 1 fails technically, its incident is retried, Release 1 and Release 2 then succeed, and `UserTask_After` completes. |
| [technical-failure-cancelled](technical-failure-cancelled.scenario.json) | With incidents enabled and cancellable, Release 1 fails technically and its incident cancels the Process; Release 2 is answered afterwards. |
| [duplicate-results](duplicate-results.scenario.json) | Release 1 succeeds twice, Release 2 succeeds twice, then `UserTask_After` is completed twice. |

The schedules carry no expected failure disposition, handler state or Process state; the retained CIB evidence is the answer.
