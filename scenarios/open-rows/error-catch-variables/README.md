# Error code and message written by the catcher

This directory serves [PC-ERROR-01](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list), whose open decision is the catch code and message variables ([propagation semantics](../../../docs/kernel/semantics/PROPAGATION-SEMANTICS-SPEC.md#open-rows)). The [shipment model](inspect-shipment.bpmn) is project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer.

After a Parallel fork, two branches each end in a boundary that names `camunda:errorCodeVariable` and `camunda:errorMessageVariable`.

| Branch | Thrower | Boundary | Message source |
|---|---|---|---|
| `ScanLabel` | Service Task answered by `effectResult` | catch-all, variables `scanCode` and `scanMessage` | the optional `message` of the business failure |
| `Weigh` | Error End `WEIGH_FAILED` after Human Task `Place` | exact `WEIGH_FAILED`, variables `weighCode` and `weighMessage` | `camunda:errorMessage` on the `Error` declaration |

| Scenario | Case it exercises |
|---|---|
| [effect-code-and-message](effect-code-and-message.scenario.json) | A business failure with a code and a message caught by a catch-all that names both variables. |
| [error-end-code-and-message](error-end-code-and-message.scenario.json) | An Error End whose `Error` declaration carries a message, caught by an exact boundary that names both variables. |

The schedules carry no expected variables; the retained CIB evidence is the answer.
