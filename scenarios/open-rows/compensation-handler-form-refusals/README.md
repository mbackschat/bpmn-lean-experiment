# Unusual compensation handler placements

This directory serves [PC-COMPENSATION-04](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) (the finite handler grammar) and [PC-COMPENSATION-05](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) (Compensation Event Sub-Process placement and precedence against a boundary handler). Each model places compensation handlers in a way that the parser source of CIB Seven names explicitly; each is project-authored MIT source for the `cibseven-2.2.0` profile and each schedule is answer-free: the retained CIB answer decides whether the definition is admitted. Every schedule is the start only.

| Schedule and model | Handler form |
|---|---|
| [esp-at-process-level](esp-at-process-level.scenario.json), [model](esp-at-process-level.bpmn) | A Compensation Event Sub-Process directly in the Process. |
| [esp-and-boundary-same-scope](esp-and-boundary-same-scope.scenario.json), [model](esp-and-boundary-same-scope.bpmn) | A Sub-Process that has a Compensation Boundary Event with an associated handler and also contains a Compensation Event Sub-Process. |
| [two-esps-same-scope](two-esps-same-scope.scenario.json), [model](two-esps-same-scope.bpmn) | Two Compensation Event Sub-Processes in one Sub-Process. |
| [two-compensation-boundaries](two-compensation-boundaries.scenario.json), [model](two-compensation-boundaries.bpmn) | Two Compensation Boundary Events on one Human Task, each with its own handler. |
| [association-to-ordinary-activity](association-to-ordinary-activity.scenario.json), [model](association-to-ordinary-activity.bpmn) | A Compensation Boundary Event associated with a Human Task that is not marked `isForCompensation`. |
| [handler-with-sequence-flow](handler-with-sequence-flow.scenario.json), [model](handler-with-sequence-flow.bpmn) | A compensation Human Task with an outgoing Sequence Flow to another task. |

The schedules carry no expected deployment outcome; the retained CIB evidence is the answer. Handler forms with ordinary placement are in [compensation-handler-bodies](../compensation-handler-bodies/README.md) and [compensation-event-subprocess-nesting](../compensation-event-subprocess-nesting/README.md).
