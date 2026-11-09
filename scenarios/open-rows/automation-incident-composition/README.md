# Technical failure, retry and incident composition

Answer-free schedules for [PC-AUTO-03](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): technical failure, incident Retry and Cancel in mixed human and automated work, in a Sub-Process, in a called instance, after a repeated activation and in a sequential Multi-Instance Sub-Process. The [work semantics](../../../docs/kernel/semantics/WORK-SEMANTICS-SPEC.md#incidents) own the meaning; the retained CIB Seven `2.2.0` answer is the target. They extend [service-task-incident](../../service-task-incident/README.md) and [service-task-incident-cancellation](../../service-task-incident-cancellation/README.md). The profile is `cibseven-2.2.0` with no source overlay, and every schedule sets `options.incidents` with `cancellable: true`, so the retry and root-cancellation commands are published beside each other.

[fulfilment.bpmn](fulfilment.bpmn) takes an order in the User Task *Take order*, charges the customer in the Service Task *Charge* (which carries an exact-code Error boundary `PAYMENT_DECLINED`), reserves and dispatches stock in the Sub-Process *Ship* and closes the order in the User Task *Close order*, which can return to *Take order* through a JUEL condition on `again`. Every Service Task binds `${bpmnLeanEffectHandler}` with `camunda:asyncBefore="true"`.

| Schedule | Case it separates |
|---|---|
| [fulfilment-mixed-retry-then-success](fulfilment-mixed-retry-then-success.scenario.json) | A failure after a human step, one retry of generation 1, then the rest of the order through the Sub-Process and its close. |
| [fulfilment-results-and-retries-during-incident](fulfilment-results-and-retries-during-incident.scenario.json) | While the incident is open: a success result, a business failure with the boundary's code and a retry of generation 2 are submitted before the retry of generation 1. |
| [fulfilment-repeated-incident](fulfilment-repeated-incident.scenario.json) | A second technical failure after the first retry, retried as generation 2. |
| [fulfilment-scoped-incident-cancel](fulfilment-scoped-incident-cancel.scenario.json) | A failure inside the Sub-Process, root cancellation, then a success result for the cancelled occurrence. |
| [fulfilment-later-activation-incident](fulfilment-later-activation-incident.scenario.json) | A first activation of *Charge* completes, the order repeats, and the second activation of *Charge* fails and is retried as generation 1. |

[batch-incidents.bpmn](batch-incidents.bpmn) runs the Service Task *Fetch* in each body of a sequential Multi-Instance Sub-Process with a cardinality of two; the asynchronous continuation is on the Service Task inside the body.

| Schedule | Case it separates |
|---|---|
| [batch-sequential-body-incidents](batch-sequential-body-incidents.scenario.json) | A failure and retry in the first body, then a failure and retry in the second body, whose activation is new. |

[called-incident.bpmn](called-incident.bpmn) calls a reusable fulfilment Process whose Service Task *Dispatch* is asynchronous.

| Schedule | Case it separates |
|---|---|
| [called-incident-retry](called-incident-retry.scenario.json) | A failure inside the called instance, addressed by its derived called-instance identity, retried as generation 1, then the caller's next task. |
| [called-incident-cancel](called-incident-cancel.scenario.json) | The same failure, then root cancellation submitted for the called occurrence's incident. |

Notes for the target runners:

- The called occurrence is addressed by the derived called-instance identity (`call:<byte length>:<caller>:<byte length>:<Call element>:<activation>`); the retained runner's root cancellation deletes the root instance.
- Parallel Multi-Instance bodies with simultaneous asynchronous continuations of one element are not authored: the retained runner cannot number two such waits, and the kernel reader refuses the per-instance `asyncBefore` attribute (see [handler reuse](../automation-handler-reuse/README.md)).
- Replacement and replay of the incident and result ledger are host properties with no schedule here.
