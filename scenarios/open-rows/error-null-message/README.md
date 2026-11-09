# Catch variables when the Error carries no message

This directory serves [PC-ERROR-01](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list), whose catch code and message variables the [propagation semantics](../../../docs/kernel/semantics/PROPAGATION-SEMANTICS-SPEC.md#finding-the-catcher) define. [error-catch-variables](../error-catch-variables/README.md) fixes both variables for an Error that carries a message; these schedules fix the message variable when there is none. Both models are project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer.

In both models the boundary names `camunda:errorCodeVariable` and `camunda:errorMessageVariable` and leads to a Human Task, so the variables are read from the Process state while that task is open.

| Model | Thrower | Boundary | Variables |
|---|---|---|---|
| [scan-label](scan-label.bpmn) | async Service Task `ScanLabel`, answered by `effectResult` | catch-all | `scanCode` and `scanMessage`, then Human Task `ReviewScan` |
| [weigh-parcel](weigh-parcel.bpmn) | Error End `WEIGH_FAILED` after Human Task `Place`, inside the embedded Sub-Process `Weigh`; the `Error` declaration has no `camunda:errorMessage` | exact `WEIGH_FAILED` on `Weigh` | `weighCode` and `weighMessage`, then Human Task `ReviewWeigh` |

| Scenario | Model | Case it separates |
|---|---|---|
| [effect-without-message](effect-without-message.scenario.json) | scan-label | A business failure with a code and without a `message`, so the message variable is read when the failure supplies no message. |
| [error-end-without-message](error-end-without-message.scenario.json) | weigh-parcel | An Error End whose declaration has no message, caught by the boundary of its enclosing Sub-Process. |

The schedules carry no expected variables; the retained CIB evidence is the answer.
