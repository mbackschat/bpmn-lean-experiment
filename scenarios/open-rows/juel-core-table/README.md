# JUEL core witness table

Answer-free schedules for [PC-DATA-07](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) that complete the witness table of the [expression semantics](../../../docs/kernel/semantics/EXPRESSION-SEMANTICS-SPEC.md#oracle-plan-and-witness-table): the value forms, kernel limits, failures, plain-text condition, Call source expressions and refused forms that [juel-core-forms](../juel-core-forms/README.md) does not cover. The retained CIB Seven `2.2.0` answer is the target. The profile is `cibseven-2.2.0` with no source overlay.

[value-forms.bpmn](value-forms.bpmn) has the shape Start Event, User Task *Observe*, End Event; the task's input mappings are the observation, one input per form, and the schedule has one stimulus, the start.

[kernel-limits.bpmn](kernel-limits.bpmn) and [failure-probes.bpmn](failure-probes.bpmn) hold one User Task per probe behind an Exclusive Gateway whose JUEL conditions test the start variable `probe`; each task has one input `value` holding the form, and all branches merge before the End Event. The probe instance is `Probe_1`. The first model holds forms that evaluate, the second forms that fail to evaluate.

[plain-text-condition.bpmn](plain-text-condition.bpmn) routes an Exclusive Gateway to the User Tasks *Yes* and *No*; the condition of the flow to *Yes* is the plain text `true` with no `${`, the condition of the flow to *No* is `${false}`. The schedule starts with no variables.

[call-source-expression.bpmn](call-source-expression.bpmn) is a probe model of two Call Activities of the Process *Peek*, whose one User Task publishes the input `seen` it received from `x`. One Call maps a source expression in, the other maps `seed` in and a source expression out. The called task of *call-source-expression-out* is addressed as `call:7:Probe_1:36:CallActivity_CallSourceExpressionOut:1`.

[computed-method.bpmn](computed-method.bpmn), [collection-parameter.bpmn](collection-parameter.bpmn), [counter-outside-multi-instance.bpmn](counter-outside-multi-instance.bpmn) and [decimal-against-double.bpmn](decimal-against-double.bpmn) each have the shape of *value-forms* and hold one form the core level refuses, with the start variables of the probe models minus `probe`.

| Schedule | Model | Case it separates | Row |
|---|---|---|---|
| [value-forms](value-forms.scenario.json) | [value-forms](value-forms.bpmn) | An escaped backslash and an escaped delimiter in text, Long overflow wrap-around, a Decimal against Integer operands in `*`, `+` and `>`, `length()` compared and used as an operand, `replace` with a multi-character and an absent target. | PC-DATA-07 |
| [integer-class-contains](integer-class-contains.scenario.json) | [kernel-limits](kernel-limits.bpmn) | `contains` of a List of Integer given the Integer result of `length()`. | PC-DATA-07 |
| [integer-class-equals](integer-class-equals.scenario.json) | [kernel-limits](kernel-limits.bpmn) | `equals` of an Integer variable given an Integer literal. | PC-DATA-07 |
| [decimal-noncanonical-result](decimal-noncanonical-result.scenario.json) | [kernel-limits](kernel-limits.bpmn) | A Decimal product whose result scale is not the canonical one. | PC-DATA-07 |
| [text-double-operand](text-double-operand.scenario.json) | [kernel-limits](kernel-limits.bpmn) | Numeric text with a fraction as an arithmetic operand, so that the sum is a Double. | PC-DATA-07 |
| [string-over-limit](string-over-limit.scenario.json) | [kernel-limits](kernel-limits.bpmn) | A String result longer than 1,000 characters, from two 600-character operands. | PC-DATA-07 |
| [string-bean-property](string-bean-property.scenario.json) | [kernel-limits](kernel-limits.bpmn) | A bean-style property of a String value, `word['empty']`; `word.empty` is a syntax error, since `empty` is a keyword. | PC-DATA-07 |
| [text-exponent-failure](text-exponent-failure.scenario.json) | [failure-probes](failure-probes.bpmn) | Non-numeric text in arithmetic with an Integer. | PC-DATA-07, PC-DATA-09 |
| [boolean-against-list](boolean-against-list.scenario.json) | [failure-probes](failure-probes.bpmn) | A relational comparison of a Boolean with a List. | PC-DATA-07, PC-DATA-09 |
| [plain-text-condition](plain-text-condition.scenario.json) | [plain-text-condition](plain-text-condition.bpmn) | A sequence-flow condition that is plain text without `${`, beside a `${false}` condition. | PC-DATA-08 |
| [call-source-expression-in](call-source-expression-in.scenario.json) | [call-source-expression](call-source-expression.bpmn) | A Call input whose source expression names no binding; the called task shows what it received. | PC-DATA-07, PC-DATA-09 |
| [call-source-expression-out](call-source-expression-out.scenario.json) | [call-source-expression](call-source-expression.bpmn) | A Call output whose source expression names no binding of the called Process when it returns. | PC-DATA-07, PC-DATA-09 |
| [computed-method](computed-method.scenario.json) | [computed-method](computed-method.bpmn) | A method named by a computed index, `list['size']()`. | PC-DATA-07 |
| [collection-parameter](collection-parameter.scenario.json) | [collection-parameter](collection-parameter.bpmn) | An input parameter holding a list of a literal and an expression. | PC-DATA-07 |
| [counter-outside-multi-instance](counter-outside-multi-instance.scenario.json) | [counter-outside-multi-instance](counter-outside-multi-instance.bpmn) | `loopCounter` read by a task outside any multi-instance. | PC-DATA-07 |
| [decimal-against-double](decimal-against-double.scenario.json) | [decimal-against-double](decimal-against-double.bpmn) | A Decimal compared for equality and order with Double literals. | PC-DATA-07 |

Notes for the target runners:

- Gap: Decimal start values need the runner's Decimal projection.
- Gap: List start values need the runner's List projection.
- *call-source-expression-in* ends with the called task open; its observation is the published input `seen` of the called instance.
