# Condition expressions at gateways

Answer-free schedules for the branch half of [PC-DATA-08](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) (first-match routing, defined type rules, non-Boolean and evaluation-error outcomes explicit), the condition half of [PC-DATA-07](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) (the complete approved context reaches the evaluator) and the wrong-result-type and missing-source cases of [PC-DATA-09](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list). The core level of the [evaluation decision](../../../docs/kernel/ARCHITECTURE-SPEC.md#runtime-state-and-step) owns the subset, the [data semantics](../../../docs/kernel/semantics/DATA-SEMANTICS-SPEC.md) own the context rule. The retained CIB Seven `2.2.0` answer is the target. The profile is `cibseven-2.2.0` with no source overlay. The Multi-Instance collection, cardinality and completion-condition sides of PC-DATA-08 are witnessed by [multi-instance-expressions](../multi-instance-expressions/README.md), [multi-instance-user-task](../multi-instance-user-task/README.md) and [expression-cardinality-and-collections](../expression-cardinality-and-collections/README.md).

Each model is a Start Event, a gateway whose Sequence Flows carry JUEL conditions, and one User Task and End Event per branch, so that the observation is the set of open User Tasks.

| Model | Gateway | Conditions |
|---|---|---|
| [first-match](first-match.bpmn) | Exclusive, with a default | `${amount > 1000}`, `${region == 'EU' and amount > 100}`, `${amount > 10}` in that declaration order |
| [flag-condition](flag-condition.bpmn) | Exclusive, with a default | `${flag}` |
| [lazy-condition-order](lazy-condition-order.bpmn) | Exclusive, with a default | `${flag}`, then `${missing}`, a name no schedule declares |
| [text-flag-forms](text-flag-forms.bpmn) | Inclusive, with a default | `${flag == 'true'}`, `${not flag}`, `${flag and true}`, `${!flag}` |
| [late-context](late-context.bpmn) | Exclusive, with a default, after the User Task *Collect* | `${amount > limit}` |

| Schedule | Model | Case it separates | Row |
|---|---|---|---|
| [first-match-all-true](first-match-all-true.scenario.json) | [first-match](first-match.bpmn) | Three conditions all test true; the declaration order picks one. | PC-DATA-08, PC-DATA-07 |
| [first-match-second-and-third-true](first-match-second-and-third-true.scenario.json) | [first-match](first-match.bpmn) | The first condition tests false and the second and third test true. | PC-DATA-08 |
| [first-match-third-only](first-match-third-only.scenario.json) | [first-match](first-match.bpmn) | Only the third condition tests true. | PC-DATA-08 |
| [first-match-none-true](first-match-none-true.scenario.json) | [first-match](first-match.bpmn) | No condition tests true; the default flow is the only candidate. | PC-DATA-08 |
| [flag-boolean-true](flag-boolean-true.scenario.json) | [flag-condition](flag-condition.bpmn) | The condition is the variable alone, a Boolean true. | PC-DATA-08, PC-DATA-09 |
| [flag-boolean-false](flag-boolean-false.scenario.json) | [flag-condition](flag-condition.bpmn) | The condition is the variable alone, a Boolean false. | PC-DATA-08, PC-DATA-09 |
| [flag-text-true](flag-text-true.scenario.json) | [flag-condition](flag-condition.bpmn) | The condition is the variable alone, the String `true`. | PC-DATA-08, PC-DATA-09 |
| [flag-text-other](flag-text-other.scenario.json) | [flag-condition](flag-condition.bpmn) | The condition is the variable alone, the String `maybe`. | PC-DATA-08, PC-DATA-09 |
| [flag-integer](flag-integer.scenario.json) | [flag-condition](flag-condition.bpmn) | The condition is the variable alone, the Integer 1. | PC-DATA-08, PC-DATA-09 |
| [flag-present-null](flag-present-null.scenario.json) | [flag-condition](flag-condition.bpmn) | The condition is the variable alone, a present Null. | PC-DATA-08, PC-DATA-09 |
| [flag-absent](flag-absent.scenario.json) | [flag-condition](flag-condition.bpmn) | The condition is the variable alone, and no binding declares it. | PC-DATA-08, PC-DATA-09 |
| [text-flag](text-flag.scenario.json) | [text-flag-forms](text-flag-forms.bpmn) | Four condition forms over the String `true` at an Inclusive Gateway, which tests every flow. | PC-DATA-08, PC-DATA-09 |
| [boolean-flag](boolean-flag.scenario.json) | [text-flag-forms](text-flag-forms.bpmn) | The same four forms over the Boolean true. | PC-DATA-08, PC-DATA-09 |
| [true-before-broken](true-before-broken.scenario.json) | [lazy-condition-order](lazy-condition-order.bpmn) | A true condition is declared before a condition that names an undeclared variable. | PC-DATA-08, PC-DATA-09 |
| [false-reaches-broken](false-reaches-broken.scenario.json) | [lazy-condition-order](lazy-condition-order.bpmn) | A false condition is declared before a condition that names an undeclared variable. | PC-DATA-08, PC-DATA-09 |
| [context-written-after-start](context-written-after-start.scenario.json) | [late-context](late-context.bpmn) | The condition reads `limit`, written by a `setVariables` command on the open task, and `amount`, written by the completion; neither binding existed at the start. | PC-DATA-07 |
| [context-below-limit](context-below-limit.scenario.json) | [late-context](late-context.bpmn) | The same journey with an `amount` below the `limit`. | PC-DATA-07 |

Notes for the target runners:

- A gateway step that fails inside a command must be recorded as the command outcome rather than as a harness failure.
- The schedules with a `setVariables` stimulus address the open User Task *Collect*.
