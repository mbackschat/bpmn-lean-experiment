# Escalation code written by the catcher

This directory serves [PC-ESCALATION-01](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list), whose clause says to freeze the selected code-data behavior ([propagation semantics](../../../docs/kernel/semantics/PROPAGATION-SEMANTICS-SPEC.md#open-rows)). The [code-capture model](code-capture.bpmn) is project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer. The matching cases without a code variable are in [escalation-throw-propagation](../escalation-throw-propagation/README.md).

After a Parallel fork, two Sub-Process regions each hold an Intermediate Escalation throw and a non-interrupting boundary that names `camunda:escalationCodeVariable`.

| Region | Thrower | Boundary | Variable |
|---|---|---|---|
| `Review` | `LIMIT_EXCEEDED` after `Assess` | exact `LIMIT_EXCEEDED` | `exactCode` |
| `Audit` | `UNLISTED_ESCALATION` after `Inspect` | catch-all | `anyCode` |

| Scenario | Case it exercises |
|---|---|
| [exact-code-variable](exact-code-variable.scenario.json) | An exact boundary that names a code variable. |
| [catch-all-code-variable](catch-all-code-variable.scenario.json) | A catch-all boundary that names a code variable. |

The schedules carry no expected variables; the retained CIB evidence is the answer.
