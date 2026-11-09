# Boundary Event on an Event Sub-Process

This directory holds the witness for the reconciliation refusal `scope.eventSubProcess.boundary` (a Boundary Event attached to an Event Sub-Process, BPMN 2.0.2 §13.5.4), which the [scopes semantics](../../../docs/kernel/semantics/SCOPES-SEMANTICS-SPEC.md#restrictions) state as a restriction that no row lifts. The [parcel alerts model](parcel-alerts.bpmn) is project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer, including whether the engine accepts the deployment.

After a Parallel fork, the root runs the Human Task `Ordinary` and the Human Task `Raise`, which leads to an Intermediate Escalation throw `DAMAGE`. The root declares a non-interrupting Escalation Event Sub-Process `Handler_Damage` for `DAMAGE` whose body is the Human Task `Inspect`. An interrupting `PT1H` Timer Boundary Event `Boundary_Handler_Timeout` is attached to that Event Sub-Process and leads to the Human Task `TooSlow`.

| Schedule | Case it exercises |
|---|---|
| [deployment-and-ordinary-work](deployment-and-ordinary-work.scenario.json) | Deployment of the model, then `Ordinary` and `Raise` complete. |
| [handler-then-boundary-timer](handler-then-boundary-timer.scenario.json) | `Raise` starts the handler, the boundary Timer is fired at its deadline, then `Inspect` and `Ordinary` complete. |

The schedules carry no expected admission, route or Process state; the retained CIB evidence is the answer.
