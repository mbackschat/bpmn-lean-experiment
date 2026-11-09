# Signal throws with expression-derived names

This directory serves [PC-SIGNAL-01](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): an Intermediate Signal throw whose `<signal name>` is the expression `${alertName}`, a receiver with a literal name, and the evaluation of the name when it is unbound or changed. The [restock model](restock-alerts.bpmn) is project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer.

After a Parallel fork, `Count` leads into the Intermediate throw of `${alertName}`, while the other branch waits in an Intermediate Signal catch for the literal name `low-stock` and then runs `Reorder`.

| Scenario | Case it exercises |
|---|---|
| [derived-name-matches](derived-name-matches.scenario.json) | `alertName` is `low-stock` throughout. |
| [derived-name-differs](derived-name-differs.scenario.json) | `alertName` is `overstock` throughout. |
| [name-changes-before-throw](name-changes-before-throw.scenario.json) | `alertName` is `low-stock` at the start and is set to `overstock` while `Count` is open. |
| [unbound-name](unbound-name.scenario.json) | The start gives no `alertName`. |

The schedules carry no expected route, error or Process state; the retained CIB evidence is the answer.
