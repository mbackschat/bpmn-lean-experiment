# Escalation throw, matching and ancestor propagation

This directory serves [PC-ESCALATION-01](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): Intermediate and End Escalation throws caught by a boundary, exact-code and catch-all matching, and the search through enclosing Sub-Processes. The [support model](support-case.bpmn) is project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer. Code variables are in [escalation-code-variable](../escalation-code-variable/README.md), the uncaught case in [escalation-uncaught](../escalation-uncaught/README.md).

After a Parallel fork, three Sub-Process regions run side by side. Every catcher is a non-interrupting boundary leading to its own Human Task, so the route taken is the open Human Task beside the thrower's continuation.

| Region | Thrower | Catcher |
|---|---|---|
| `Review` | Intermediate throw `LIMIT_EXCEEDED` after `Assess` | exact `LIMIT_EXCEEDED` boundary on `Review` |
| `Audit` | Intermediate throw `UNLISTED_ESCALATION` after `Inspect` | catch-all boundary on `Audit` |
| `Program` ⊃ `Phase` | Escalation End `PHASE_SLIPPED` after `Work` | exact `PHASE_CANCELLED` boundary on `Phase`; exact `PHASE_SLIPPED` boundary on `Program` |

| Scenario | Case it exercises |
|---|---|
| [exact-code](exact-code.scenario.json) | An Intermediate throw whose code an exact boundary of the enclosing host names. |
| [catch-all](catch-all.scenario.json) | An Intermediate throw whose code no exact boundary names, under a catch-all boundary. |
| [ancestor-skips-wrong-code](ancestor-skips-wrong-code.scenario.json) | An Escalation End inside a nested Sub-Process whose own boundary names another code and whose enclosing Sub-Process names this one. |

The schedules carry no expected route or Process state; the retained CIB evidence is the answer.
