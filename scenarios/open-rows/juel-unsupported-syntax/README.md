# JUEL syntax outside the subset

Answer-free schedules for [PC-DATA-07](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): "an expression outside the subset is refused at admission". Each model declares one input mapping on its User Task *Observe* whose expression is not valid at the pinned JUEL grammar level (EL 2.2 method invocations, no lambda, assignment or collection literals, per the [evaluation decision](../../../docs/kernel/ARCHITECTURE-SPEC.md#runtime-state-and-step)); the expression text is the only difference between the models. The retained CIB Seven `2.2.0` answer is the target, and a refused deployment is the answer a deployment-time parse failure gives. The profile is `cibseven-2.2.0` with no source overlay.

Every schedule has one stimulus, the start with `a = 7`; a model that is refused at deployment is never started.

| Schedule | Model | Case it separates | Row |
|---|---|---|---|
| [trailing-operator](trailing-operator.scenario.json) | [trailing-operator](trailing-operator.bpmn) | An operator with no right operand. | PC-DATA-07 |
| [unclosed-delimiter](unclosed-delimiter.scenario.json) | [unclosed-delimiter](unclosed-delimiter.bpmn) | An expression opened with `${` and never closed. | PC-DATA-07 |
| [assignment](assignment.scenario.json) | [assignment](assignment.bpmn) | An assignment inside an expression. | PC-DATA-07 |
| [lambda](lambda.scenario.json) | [lambda](lambda.bpmn) | A lambda expression applied to a variable. | PC-DATA-07 |
| [collection-literal](collection-literal.scenario.json) | [collection-literal](collection-literal.bpmn) | A collection literal. | PC-DATA-07 |

Notes for the target runners:

- A refused deployment must be recorded as the scenario's outcome rather than as a harness failure.
