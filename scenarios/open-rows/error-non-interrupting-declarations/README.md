# Non-interrupting Error declarations

This directory serves [PC-ERROR-02](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list), whose clause says a non-interrupting Error Event Sub-Process (ESP) rejects, and the matching Error boundary question of [PC-ERROR-01](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list). Both models are project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer.

| Scenario | Model | Case it exercises |
|---|---|---|
| [boundary-failure](boundary-failure.scenario.json) | [non-interrupting-boundary](non-interrupting-boundary.bpmn) | A Service Task with an exact Error boundary declared `cancelActivity="false"` whose effect reports the business failure the boundary names. |
| [boundary-failure-then-substitute](boundary-failure-then-substitute.scenario.json) | [non-interrupting-boundary](non-interrupting-boundary.bpmn) | The same failure, then `FindSubstitute` completes, which separates a still-running instance from an interrupting reading. |
| [event-subprocess-deployment](event-subprocess-deployment.scenario.json) | [non-interrupting-event-subprocess](non-interrupting-event-subprocess.bpmn) | An Error ESP declared with `isInterrupting="false"`, deployed and started; its thrower never runs. |

The ESP model is a deployment-time case: the schedule contains only the start. The schedules carry no expected acceptance, route or Process state; the retained CIB evidence is the answer.
