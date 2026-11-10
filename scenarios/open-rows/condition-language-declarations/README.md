# Expression language declarations on conditions

Answer-free schedules for [PC-DATA-07](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list), which owns "an expression with no named language: accepted only under a profile selecting CIB's default language", and for its language-mismatch case. Every model is the same Process, a Start Event, an Exclusive Gateway whose one conditional flow tests the Boolean variable `flag`, and a User Task per branch; the models differ only in how the condition declares its language. The [evaluation decision](../../../docs/kernel/ARCHITECTURE-SPEC.md#runtime-state-and-step) owns the selected evaluator and the [data semantics](../../../docs/kernel/semantics/DATA-SEMANTICS-SPEC.md) list the open decision for an expression with no named language. The retained CIB Seven `2.2.0` answer is the target. The profile is `cibseven-2.2.0` with no source overlay.

Every schedule has one stimulus, the start with `flag = true`.

| Schedule | Model | Case it separates | Row |
|---|---|---|---|
| [formal-no-language](formal-no-language.scenario.json) | [formal-no-language](formal-no-language.bpmn) | A condition typed `tFormalExpression` with no `language` attribute and no default declared on the definitions. | PC-DATA-07 |
| [plain-no-language](plain-no-language.scenario.json) | [plain-no-language](plain-no-language.bpmn) | A condition with neither `xsi:type` nor `language`. | PC-DATA-07 |
| [explicit-texpression](explicit-texpression.scenario.json) | [explicit-texpression](explicit-texpression.bpmn) | The same condition typed `xsi:type="tExpression"`, which CIB refuses at deployment (`BpmnParse.java:4404-4407`). | PC-DATA-07 |
| [definitions-xpath-default](definitions-xpath-default.scenario.json) | [definitions-xpath-default](definitions-xpath-default.bpmn) | The same condition as *formal-no-language* under definitions that declare the BPMN default `expressionLanguage`, the XPath URI. | PC-DATA-07 |
| [named-juel](named-juel.scenario.json) | [named-juel](named-juel.bpmn) | A condition that names its language `juel`. | PC-DATA-07 |
| [named-javascript](named-javascript.scenario.json) | [named-javascript](named-javascript.bpmn) | A condition that names the language `javascript`, with a JavaScript body. | PC-DATA-07 |

Notes for the target runners:

- Gap: a condition that names a non-JUEL language: the runner records its model as a harness failure; the case is kept because PC-DATA-07 owns the language mismatch.
- `definitions-xpath-default` only declares the BPMN default language; no XPath expression exists in it.
