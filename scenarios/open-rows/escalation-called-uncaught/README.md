# An uncaught Escalation inside a called instance

This directory serves [PC-ESCALATION-01](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) and [PC-ESCALATION-03](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): an Escalation that no catcher takes, raised inside a called instance whose Call Activity maps an output ([leaving a called instance](../../../docs/kernel/semantics/PROPAGATION-SEMANTICS-SPEC.md#leaving-a-called-instance-pc-escalation-03-pc-error-03)). The [slot-booking model](slot-booking.bpmn) is project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer.

The Call Activity `Book` runs `Process_ReserveSlot` and maps `slot` out as `bookedSlot`; its normal return leads to `Confirm`. The callee runs `Reserve`, an Intermediate throw `SLOW` and `Settle`. No boundary or Event Sub-Process catches `SLOW`. The called instance is addressed by the kernel's derived called-instance identifier.

| Scenario | Case it exercises |
|---|---|
| [uncaught-in-called-instance](uncaught-in-called-instance.scenario.json) | `Reserve` sets `slot` to `A1`, then the uncaught throw leaves the callee running in `Settle`. |
| [uncaught-then-normal-return](uncaught-then-normal-return.scenario.json) | The same, then `Settle` sets `slot` to `A2` and the Call returns normally. |

The schedules carry no expected mapped variable or Process state; the retained CIB evidence is the answer.
