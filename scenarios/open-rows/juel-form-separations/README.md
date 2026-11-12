# JUEL forms separated from their bundled probes

Answer-free schedules for [PC-DATA-07](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list). Each separates one form that an earlier witness bundles with another form whose answer hides it. In [juel-core-forms](../juel-core-forms/README.md) `access-structured-results`, the equality of two List elements is `unsupported` in the kernel (`juel.integerCarrier`, [CIB-LIM-0010](../../../docs/CIB-BPMN-RELATION-REGISTER.md#cib-lim-0010-the-core-juel-level-answers-unsupported-where-cib-returns-a-value-outside-the-portable-domain-or-reaches-a-java-surface-the-kernel-does-not-decide)), so the start never shows the admitted access forms. In [juel-evaluation-failures](../juel-evaluation-failures/README.md), every `refused-probes` schedule is refused for the model's first refused form, its division (`expression.juel.division`), so no schedule shows the refusal of its own form, a method refusal or an engine-context name. The [expression semantics](../../../docs/kernel/semantics/EXPRESSION-SEMANTICS-SPEC.md#admission-at-core) own the admitted grammar and the refusal codes. The retained CIB Seven `2.2.0` answer is the target. The profile is `cibseven-2.2.0` with no source overlay.

Every model is a Start Event, the User Task *Observe*, whose input mappings hold the form and are the observation, and an End Event. Every schedule has one stimulus, the start, with the variables of the schedule it separates, `probe` left out.

| Schedule | Model | Case it separates | Row |
|---|---|---|---|
| [structured-access](structured-access.scenario.json) | [structured-access](structured-access.bpmn) | `.` and `[]` over a Map with a nested Map and a List of equal Maps: the whole Map, a nested Map, the whole List, and two List elements, without the element equality of `access-structured-results`. | PC-DATA-07, PC-DATA-05 |
| [unknown-method](unknown-method.scenario.json) | [unlisted-method](unlisted-method.bpmn) | `${word.nosuch()}`, a method no String has. | PC-DATA-07 |
| [list-mutating-method](list-mutating-method.scenario.json) | [mutating-method](mutating-method.bpmn) | `${items.add('z')}`, a List method that changes its receiver. | PC-DATA-07 |
| [reflection-through-method](reflection-through-method.scenario.json) | [reflection-method](reflection-method.bpmn) | `${word.getClass().getName()}`, a method that returns the receiver's runtime class, then a method on that class. | PC-DATA-07 |
| [execution-read](execution-read.scenario.json) | [execution-read](execution-read.bpmn) | `${execution.activityId}`, an attribute of the engine's execution object. | PC-DATA-07 |
| [execution-mutation](execution-mutation.scenario.json) | [execution-mutation](execution-mutation.bpmn) | `${execution.setVariable('leaked', 'yes')}`, a variable write through the execution object. | PC-DATA-07 |
| [authenticated-user-name](authenticated-user-name.scenario.json) | [authenticated-user](authenticated-user.bpmn) | `${authenticatedUserId == null}`, the engine's authenticated user name. | PC-DATA-07 |

Notes for the target runners:

- *list-mutating-method* starts with a List of Strings; the root variables show whether CIB stored the changed List.
- *execution-mutation* starts with no variables; the root variables show whether CIB wrote `leaked`.
