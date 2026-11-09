# Business failure from automation into the Error path

Answer-free schedules for [PC-AUTO-02](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list), the typed business failure of a Service Task and the Error path it selects. The [work](../../../docs/kernel/semantics/WORK-SEMANTICS-SPEC.md) and [propagation](../../../docs/kernel/semantics/PROPAGATION-SEMANTICS-SPEC.md) semantics own the meaning; these inputs only exercise it, and the retained CIB Seven `2.2.0` answer is the row's target. Both models bind `${bpmnLeanEffectHandler}` with `camunda:asyncBefore="true"`, so each effect waits for an `effectResult` stimulus; the profile is `cibseven-2.2.0` with no source overlay.

[error-route.bpmn](error-route.bpmn) validates an invoice in the Service Task *Validate*, whose output parameter maps the local `result` to the Process variable `verdict`. An exact-code Error boundary (`INVALID`) leads to the User Task *Fix invoice*; the normal flow leads to the User Task *Approve invoice*. The same source therefore receives a success and a business failure.

| Schedule | Case it separates |
|---|---|
| [route-success](route-success.scenario.json) | The success result of *Validate* with a result value, then normal continuation. |
| [route-rejected-with-payload](route-rejected-with-payload.scenario.json) | A business failure with the matching code, a message and an output patch naming the success output `result`. |
| [route-rejected-without-payload](route-rejected-without-payload.scenario.json) | The same failure with an empty output patch, so the declared output mapping has no local result to read. |
| [route-rejected-unmatched-code](route-rejected-unmatched-code.scenario.json) | A failure whose code no boundary on the source matches. |

[error-scope.bpmn](error-scope.bpmn) screens an applicant in the Sub-Process *Screening*, whose Service Task *Check* has its own Error boundary (`CHECK_FAILED`), while the Sub-Process has a boundary of its own (`SCREENING_FAILED`). After *Screening* the Service Task *Decide* runs outside it.

| Schedule | Case it separates |
|---|---|
| [scope-inner-handler](scope-inner-handler.scenario.json) | A failure with the code of the boundary on the raising Service Task. |
| [scope-ancestor-handler](scope-ancestor-handler.scenario.json) | A failure with the code only the enclosing Sub-Process's boundary matches. |
| [scope-unmatched-code](scope-unmatched-code.scenario.json) | A failure with a code neither the Service Task nor its Sub-Process matches. |
| [scope-non-ancestor-after-completion](scope-non-ancestor-after-completion.scenario.json) | *Check* completes, then *Decide* fails with the code of the Sub-Process boundary, which is no longer an ancestor of the raising Service Task. |

Runner realization: `route-rejected-without-payload` and the unmatched-code schedules have an engine step that can fail inside the command; the CIB runner must record such a step as its command outcome rather than as a harness failure.
