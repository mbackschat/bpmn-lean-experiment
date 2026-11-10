# An Escalation caught at a called root that holds another path

This directory serves [PC-ESCALATION-03](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): an Escalation thrown directly at the root of a called instance while another path runs there, caught by the Call's own boundary, with a Call that maps an output ([leaving a called instance](../../../docs/kernel/semantics/PROPAGATION-SEMANTICS-SPEC.md#leaving-a-called-instance-pc-escalation-03-pc-error-03)). The kernel refuses this run as `raise-caught-at-busy-called-root`; the [busy-booking model](busy-booking.bpmn) is project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer.

The Call Activity `Book` runs `Process_ReserveWithWait` and maps `slot` out as `bookedSlot`; its interrupting exact `SLOW` boundary leads to `Handle`. The child forks into `Reserve`, an Intermediate throw `SLOW` and `Settle` on one path, and `Wait` on the other. The called instance is addressed by the kernel's derived called-instance identifier.

| Scenario | Case it exercises |
|---|---|
| [caught-at-busy-called-root](caught-at-busy-called-root.scenario.json) | `Reserve` sets `slot`, then the throw runs at the called root while `Wait` stands there. |

The schedule carries no expected route, mapped variable or Process state; the retained CIB evidence is the answer.
