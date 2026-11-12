# Technical failure of a synchronous effect

Answer-free schedules for [PC-AUTO-02](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) and [PC-AUTO-04](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): a technical failure of a Service Task and of a configured Send Task that declare no asynchronous continuation, under `options.incidents`. The [work semantics](../../../docs/kernel/semantics/WORK-SEMANTICS-SPEC.md#incidents) own the kernel's meaning; the retained CIB Seven `2.2.0` answer is the target. The profile is `cibseven-2.2.0` with no source overlay. The bound Message throw's case is [message-throw-retry](../message-throw-retry/README.md).

[charge-and-receipt.bpmn](charge-and-receipt.bpmn) runs the Service Task *Charge card* and then the Send Task *Send receipt*, both binding `${bpmnLeanEffectHandler}` without `camunda:asyncBefore`, and waits in the User Task *Review order*.

| Schedule | Case it separates |
|---|---|
| [service-task-failure-then-retry](service-task-failure-then-retry.scenario.json) | A technical failure of the Service Task the start reaches, one retry of generation 1, then success of both effects. |
| [send-task-failure-then-retry](send-task-failure-then-retry.scenario.json) | The Service Task's success, then a technical failure of the Send Task, one retry of generation 1, then its success. |

Notes for the target runners:

- CIB runs both delegates inside the starting command, so each consumes its schedule's next `effectResult` for its element and the runner skips that stimulus later; a technical failure throws from the delegate and rolls the starting command back (`AbstractBpmnActivityBehavior.java:87-109`; CIB-EXT-0049).
- The kernel commits the start with the effect open and takes each result as an input of its own, so a technical failure opens an incident that the retry resolves.
