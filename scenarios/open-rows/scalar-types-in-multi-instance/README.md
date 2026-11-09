# Scalar types across the Service and Human command surfaces

Answer-free schedules for [PC-DATA-02](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): the same well-formed typed value offered to each command surface of one Process, a Service Task's effect result and a User Task's completion, inside a sequential Multi-Instance Sub-Process. The [data semantics](../../../docs/kernel/semantics/DATA-SEMANTICS-SPEC.md) own the value domains and the per-surface eligibility rule; the retained CIB Seven `2.2.0` answer is the target. The profile is `cibseven-2.2.0` with no source overlay.

[typed-body.bpmn](typed-body.bpmn) runs a Sub-Process *Batch* twice in sequence (a literal cardinality of two). Each body runs the Service Task *Fetch* (`${bpmnLeanEffectHandler}`, `asyncBefore`), whose input `slot` is `${loopCounter}` and whose result `result` is mapped to `fetched`, then the User Task *Review*, whose inputs publish `position` (`${loopCounter}`) and `seen` (`${fetched}`) and whose completion writes `verdict`. Every schedule completes both bodies in order; only the types of the first body's result and completion differ, so the second body is the control that shows what the first one left behind.

| Schedule | Case it separates | Row |
|---|---|---|
| [strings-only](strings-only.scenario.json) | Both bodies exchange Strings at the Service result and the Human completion. | PC-DATA-02 |
| [boolean-service-result](boolean-service-result.scenario.json) | The first body's Service result is a Boolean. | PC-DATA-02 |
| [integer-human-completion](integer-human-completion.scenario.json) | The first body's Human completion is an Integer. | PC-DATA-02 |
| [integer-service-boolean-human](integer-service-boolean-human.scenario.json) | The first body's Service result is an Integer and its Human completion a Boolean. | PC-DATA-02 |
| [null-service-decimal-human](null-service-decimal-human.scenario.json) | The first body's Service result is a present Null and its Human completion a Decimal. | PC-DATA-02 |
| [decimal-service-null-human](decimal-service-null-human.scenario.json) | The first body's Service result is a Decimal and its Human completion a present Null. | PC-DATA-02 |

The acceptance clause keeps whole-scenario support, direct command refusal and strict wire decoding apart. These schedules are the whole-scenario inputs, and each command of a schedule is also the direct command for its value; a value that is not well formed cannot appear in a schema-valid scenario, so the wire-decoding cases are not authored here.

Notes for the target runners:

- Gap: Decimal completion values.
- Gap: Decimal effect results.
- Boolean and Integer values are carried by the runner already; a Null result is the retained present-Null form.
