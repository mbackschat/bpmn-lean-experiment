# Conflicting Escalation handler declarations

This directory serves [PC-ESCALATION-02](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) and [PC-ESCALATION-03](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list), whose clauses say duplicate and catch-all conflicting declarations reject. Each model is project-authored MIT source for the `cibseven-2.2.0` profile and declares two handlers of one Sub-Process host `Host`, whose body is the Human Task `Work`; every schedule is answer-free, contains only the start, and CIB Seven `2.2.0` supplies the retained answer. The case is deployment-time: the thrower is absent.

| Scenario | Model | Declarations on `Host` |
|---|---|---|
| [boundary-duplicate-code-deployment](boundary-duplicate-code-deployment.scenario.json) | [boundary-duplicate-code](boundary-duplicate-code.bpmn) | two boundaries with the code `OVERRUN`, one interrupting and one non-interrupting |
| [boundary-catch-all-with-exact-deployment](boundary-catch-all-with-exact-deployment.scenario.json) | [boundary-catch-all-with-exact](boundary-catch-all-with-exact.bpmn) | one exact `OVERRUN` boundary and one catch-all boundary, both non-interrupting |
| [boundary-two-catch-alls-deployment](boundary-two-catch-alls-deployment.scenario.json) | [boundary-two-catch-alls](boundary-two-catch-alls.bpmn) | two catch-all boundaries, both non-interrupting |
| [event-subprocess-duplicate-code-deployment](event-subprocess-duplicate-code-deployment.scenario.json) | [event-subprocess-duplicate-code](event-subprocess-duplicate-code.bpmn) | two Event Sub-Processes with the code `OVERRUN`, one interrupting and one non-interrupting |
| [event-subprocess-catch-all-with-exact-deployment](event-subprocess-catch-all-with-exact-deployment.scenario.json) | [event-subprocess-catch-all-with-exact](event-subprocess-catch-all-with-exact.bpmn) | one exact `OVERRUN` Event Sub-Process and one catch-all Event Sub-Process, both non-interrupting |

The distinct-code case and an Event Sub-Process beside a boundary of the same host are admitted shapes of [escalation-boundary-hosts](../escalation-boundary-hosts/README.md) and [escalation-event-subprocess-modes](../escalation-event-subprocess-modes/README.md). The schedules carry no expected acceptance; the retained CIB evidence is the answer.
