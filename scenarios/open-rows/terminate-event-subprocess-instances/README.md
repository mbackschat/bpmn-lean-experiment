# Terminate End inside non-interrupting Event Sub-Process instances

This directory serves [PC-TERMINATE-02](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): a Terminate End inside one of several live instances of a non-interrupting Event Sub-Process, the other instance, the ordinary work of the host and outside work. The [dock model](dock.bpmn) is project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer.

After a Parallel fork, the root runs the Human Task `Outside` and the Sub-Process `Bay`, followed by the Human Task `AfterBay`. `Bay` forks into the Human Task `Unload` and the Human Task `Raise`, which leads through two Intermediate Escalation throws `DELAY` in a row. `Bay` declares a non-interrupting Escalation Event Sub-Process for `DELAY`; each instance forks into the Human Task `Cut`, which leads to a Terminate End, and the Human Task `Keep`. Handler instances are numbered in the order the throws start them.

| Schedule | Case it exercises |
|---|---|
| [first-handler-instance-terminates](first-handler-instance-terminates.scenario.json) | `Raise` starts two instances, `Cut` of the first completes, `Keep` of the first is addressed afterwards, then the second instance's `Keep` and `Cut`, `Unload`, `AfterBay` and `Outside` complete. |
| [second-handler-instance-ordinary-first](second-handler-instance-ordinary-first.scenario.json) | `Unload` completes before `Raise`, `Cut` of the second instance completes, its `Keep` and `AfterBay` are addressed, then the first instance's `Keep` and `Cut` and `AfterBay` complete. |

The schedules carry no expected open wait, handler count or Process state; the retained CIB evidence is the answer.
