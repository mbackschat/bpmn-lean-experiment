# JUEL evaluation failures and refused capabilities

Answer-free schedules for [PC-DATA-07](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) (the forms the read-only binding refuses: a bean, `execution`, mutation, an unlisted method, missing context) and for the evaluator-failure and type-error cases of [PC-DATA-09](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list). The [JUEL decision](../../../docs/JUEL-EVALUATION-ARCHITECTURE-DECISION.md) lists what is refused at every level, the [evaluation decision](../../../docs/kernel/ARCHITECTURE-SPEC.md#runtime-state-and-step) owns the levels, and the [data semantics](../../../docs/kernel/semantics/DATA-SEMANTICS-SPEC.md) own the mapping rule. The retained CIB Seven `2.2.0` answer is the target. The profile is `cibseven-2.2.0` with no source overlay.

Two models hold the probes, each with the same shape: one User Task per probe behind an Exclusive Gateway whose JUEL conditions test the start variable `probe`, all branches merging before the End Event. Each probe task has one input mapping, `value`, holding the probe's expression. Every schedule has one stimulus, the start with its `probe` and the few variables its expression reads.

[failure-probes.bpmn](failure-probes.bpmn) holds the probes whose expressions the kernel admits, so the evaluation failures happen at run time: missing-variable, empty-of-missing, text-in-arithmetic, modulo-by-zero, integer-as-boolean, unknown-property, index-out-of-range, non-integer-index, index-on-text and bean-reference. A probe whose expression CIB refuses to evaluate fails inside the starting command, so no later stimulus exists; a probe that CIB evaluates leaves the task open with `value` as its observation, and the root variables show any variable the expression wrote.

[refused-probes.bpmn](refused-probes.bpmn) holds the probes whose expressions the kernel refuses at admission, so the model is refused as a whole and the schedules observe that refusal: authenticated-user-name, execution-read, execution-mutation, list-mutating-method, reflection-through-method and unknown-method. They live apart because one refused expression would otherwise hide the evaluable probes behind the same refusal.

Three probes give CIB a value the canonical result cannot hold (a Long beyond 2^53−1, a negative Long, a Double), so the CIB runner could not record them where CIB stores them. [held-results.bpmn](held-results.bpmn) holds integer-overflow and negative-result each in the input `value` of a Sub-Process, whose locals the CIB runner does not project, and the task inside publishes the composite text `value=${value}`, the exact Java rendering. The kernel still evaluates the out-of-domain result at the Sub-Process input. The integer-overflow and negative-result tasks of failure-probes and the division-by-zero task of refused-probes stay in those models, unselected, so that their retained evidence stays bound. [division-probe.bpmn](division-probe.bpmn) holds division-by-zero alone as the text `quotient=${a / zero}`, which the kernel refuses at admission (`/`) and CIB renders as text.

| Schedule | Model | Case it separates | Row |
|---|---|---|---|
| [missing-variable](missing-variable.scenario.json) | [failure-probes](failure-probes.bpmn) | A name no binding declares as the whole expression. | PC-DATA-07, PC-DATA-09 |
| [empty-of-missing](empty-of-missing.scenario.json) | [failure-probes](failure-probes.bpmn) | `empty` applied to a name no binding declares. | PC-DATA-07, PC-DATA-09 |
| [text-in-arithmetic](text-in-arithmetic.scenario.json) | [failure-probes](failure-probes.bpmn) | Non-numeric text as an arithmetic operand. | PC-DATA-09 |
| [modulo-by-zero](modulo-by-zero.scenario.json) | [failure-probes](failure-probes.bpmn) | `%` with a zero divisor over Integers. | PC-DATA-09 |
| [division-by-zero](division-by-zero.scenario.json) | [division-probe](division-probe.bpmn) | `/` with a zero divisor over Integers. | PC-DATA-09 |
| [integer-overflow](integer-overflow.scenario.json) | [held-results](held-results.bpmn) | A sum one above the largest safe Integer. | PC-DATA-02, PC-DATA-09 |
| [negative-result](negative-result.scenario.json) | [held-results](held-results.bpmn) | A difference below zero, where the portable Integer domain starts at zero. | PC-DATA-02, PC-DATA-09 |
| [integer-as-boolean](integer-as-boolean.scenario.json) | [failure-probes](failure-probes.bpmn) | An Integer as a Boolean operand. | PC-DATA-09 |
| [unknown-property](unknown-property.scenario.json) | [failure-probes](failure-probes.bpmn) | A property no String has. | PC-DATA-07, PC-DATA-09 |
| [unknown-method](unknown-method.scenario.json) | [refused-probes](refused-probes.bpmn) | A method no String has. | PC-DATA-07, PC-DATA-09 |
| [index-out-of-range](index-out-of-range.scenario.json) | [failure-probes](failure-probes.bpmn) | A List index past the last element. | PC-DATA-09 |
| [non-integer-index](non-integer-index.scenario.json) | [failure-probes](failure-probes.bpmn) | A List index that is not numeric text. | PC-DATA-09 |
| [index-on-text](index-on-text.scenario.json) | [failure-probes](failure-probes.bpmn) | An index applied to a String. | PC-DATA-07, PC-DATA-09 |
| [bean-reference](bean-reference.scenario.json) | [failure-probes](failure-probes.bpmn) | A registered bean named in an expression, compared with null. | PC-DATA-07 |
| [execution-read](execution-read.scenario.json) | [refused-probes](refused-probes.bpmn) | The engine's `execution` object read through one property. | PC-DATA-07 |
| [execution-mutation](execution-mutation.scenario.json) | [refused-probes](refused-probes.bpmn) | A call on `execution` that writes a Process variable. | PC-DATA-07 |
| [list-mutating-method](list-mutating-method.scenario.json) | [refused-probes](refused-probes.bpmn) | A List method that changes its receiver. | PC-DATA-07 |
| [reflection-through-method](reflection-through-method.scenario.json) | [refused-probes](refused-probes.bpmn) | A method that returns the receiver's runtime class, then a method on that class. | PC-DATA-07 |
| [authenticated-user-name](authenticated-user-name.scenario.json) | [refused-probes](refused-probes.bpmn) | The engine-context name `authenticatedUserId`, compared with null. | PC-DATA-07 |

Notes for the target runners:

- Gap: List start values.
- A probe step that fails inside the starting command must be recorded as the command outcome rather than as a harness failure.
- `bean-reference` names a bean the runner registers for delegate expressions.
