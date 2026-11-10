# JUEL forms separated from their bundled probes

Answer-free schedules for [PC-DATA-07](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list). Each separates one form that an earlier witness bundles with another form whose answer hides it. In [juel-core-forms](../juel-core-forms/README.md) `access-structured-results`, the equality of two List elements is `unsupported` in the kernel (`juel.integerCarrier`, [CIB-LIM-0010](../../../docs/CIB-BPMN-RELATION-REGISTER.md#cib-lim-0010-the-core-juel-level-answers-unsupported-where-cib-returns-a-value-outside-the-portable-domain)), so the start never shows the admitted access forms. In [juel-evaluation-failures](../juel-evaluation-failures/README.md), every `refused-probes` schedule is refused for the model's first refused form, the engine-context name, so no schedule shows the method refusal of its own form. The [expression semantics](../../../docs/kernel/semantics/EXPRESSION-SEMANTICS-SPEC.md#admission-at-core) own the admitted grammar and the refusal codes. The retained CIB Seven `2.2.0` answer is the target. The profile is `cibseven-2.2.0` with no source overlay.

Every model is a Start Event, the User Task *Observe*, whose input mappings hold the form and are the observation, and an End Event. Every schedule has one stimulus, the start, with the variables of the schedule it separates, `probe` left out.

| Schedule | Model | Case it separates | Row |
|---|---|---|---|
| [structured-access](structured-access.scenario.json) | [structured-access](structured-access.bpmn) | `.` and `[]` over a Map with a nested Map and a List of equal Maps: the whole Map, a nested Map, the whole List, and two List elements, without the element equality of `access-structured-results`. | PC-DATA-07, PC-DATA-05 |
| [unknown-method](unknown-method.scenario.json) | [unlisted-method](unlisted-method.bpmn) | `${word.nosuch()}`, a method no String has. | PC-DATA-07 |
| [list-mutating-method](list-mutating-method.scenario.json) | [mutating-method](mutating-method.bpmn) | `${items.add('z')}`, a List method that changes its receiver. | PC-DATA-07 |
| [reflection-through-method](reflection-through-method.scenario.json) | [reflection-method](reflection-method.bpmn) | `${word.getClass().getName()}`, a method that returns the receiver's runtime class, then a method on that class. | PC-DATA-07 |

Notes for the target runners:

- *list-mutating-method* starts with a List of Strings; the root variables show whether CIB stored the changed List.
