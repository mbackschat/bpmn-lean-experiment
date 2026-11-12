# Escalation boundaries on Sub-Process, Call and User Task hosts

This directory serves [PC-ESCALATION-02](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): interrupting and non-interrupting Escalation boundaries on the host kinds CIB accepts, the admission of several distinct codes on one host, the repeated firing of one boundary, and the hosts that take no Escalation boundary: the kernel refuses `boundary.escalation.host` for an Escalation boundary on any host but a User Task, an embedded Sub-Process or Transaction, or a Call Activity; the schedules over the refused hosts end at the deployment, where CIB's answer is the evidence. The [delivery model](project-delivery.bpmn) is project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer. Declaration conflicts are in [escalation-boundary-conflicts](../escalation-boundary-conflicts/README.md), Multi-Instance hosts in [escalation-multi-instance](../escalation-multi-instance/README.md).

After a Parallel fork, five branches run side by side. Every catcher leads to its own Human Task.

| Host | Thrower | Boundaries |
|---|---|---|
| Sub-Process `Build` | Intermediate throw `SLIP` after `Compile` | interrupting, exact `SLIP` |
| Sub-Process `Test` | after `Run`, three Intermediate throws in a row: `FLAKY`, `SLOW`, `FLAKY` | non-interrupting exact `FLAKY` and non-interrupting exact `SLOW` |
| Call Activity `Deploy` | the called Process throws `ROLLBACK` after `Release` | interrupting, exact `ROLLBACK` |
| Call Activity `Smoke` | the called Process throws `WARN` after `Probe` | non-interrupting, exact `WARN` |
| User Task `Approve` | none: no stimulus realizes `TaskService.handleEscalation` | non-interrupting, exact `HELP` |

Four further models each hold one interrupting Escalation boundary `SLIP` that leads to the User Task `Handle`, and no other Escalation.

| Model | Host | What it holds |
|---|---|---|
| [service-task-host](service-task-host.bpmn) | Service Task `Dispatch` | the boundary `Boundary_Dispatch_Slip`; the Service Task uses the neutral delegate-expression effect handler, asynchronous before |
| [manual-task-host](manual-task-host.bpmn) | manual Task `Pack` | the boundary `Boundary_Pack_Slip` |
| [task-host](task-host.bpmn) | untyped Task `Tidy` | the boundary `Boundary_Tidy_Slip` |
| [transaction-host](transaction-host.bpmn) | Transaction `Book` | inside it the User Task `Reserve` and the Intermediate throw `Raise_Slip` of `SLIP`; the boundary `Boundary_Book_Slip` on the Transaction |

| Scenario | Case it exercises |
|---|---|
| [subprocess-interrupting](subprocess-interrupting.scenario.json) | The interrupting boundary of a Sub-Process host. |
| [subprocess-non-interrupting-repeated-distinct-codes](subprocess-non-interrupting-repeated-distinct-codes.scenario.json) | Two distinct codes on one host and the same code thrown twice. |
| [call-interrupting](call-interrupting.scenario.json) | The interrupting boundary of a Call host, raised inside the called instance. |
| [call-non-interrupting](call-non-interrupting.scenario.json) | The non-interrupting boundary of a Call host, raised inside the called instance. |
| [user-task-host-declared](user-task-host-declared.scenario.json) | A User Task host with a boundary that is declared and never raised: only the host's normal completion. |
| [service-task-host](service-task-host.scenario.json) | The start alone. Separates a deployment that refuses an Escalation boundary on a Service Task from one that accepts it. |
| [manual-task-host](manual-task-host.scenario.json) | The start alone, on a manual Task. |
| [task-host](task-host.scenario.json) | The start alone, on an untyped Task. |
| [transaction-host](transaction-host.scenario.json) | A Transaction host whose body throws `SLIP` after `Reserve` completes: the control for the three refusals, which a Transaction host should be accepted and route to `Handle`. |

The schedules carry no expected route or Process state; the retained CIB evidence is the answer.
