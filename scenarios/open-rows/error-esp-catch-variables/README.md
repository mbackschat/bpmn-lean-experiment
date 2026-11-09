# Catch variables of an Error Event Sub-Process and of shadowed names

This directory serves [PC-ERROR-01](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list), whose open decision is the catch code and message variables ([propagation semantics](../../../docs/kernel/semantics/PROPAGATION-SEMANTICS-SPEC.md#open-rows)): where an Error Event Sub-Process (ESP) writes `camunda:errorCodeVariable` and `camunda:errorMessageVariable`, how long they live, and what a same-named variable of the catching Sub-Process does to them. [error-catch-variables](../error-catch-variables/README.md) covers the boundary with no shadowing name. The four models are project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer.

Both variables are `failCode` and `failMessage` in every model. The Process state lists the variables of the root, so what remains at the root after the catch is read from it.

| Model | Catcher | Thrower | What the model holds open |
|---|---|---|---|
| [root-handler](root-handler.bpmn) | interrupting ESP at the root, variables on its start | Error End `INTAKE_FAILED` after Human Task `Trigger` | a Parallel fork keeps the Human Task `MainWork` beside `Trigger`; the ESP runs Human Task `Handle` |
| [region-handler](region-handler.bpmn) | interrupting ESP inside the Sub-Process `Region`, variables on its start | the same Error End inside `Region` | `Region` is one branch of a Parallel fork, so `MainWork` outside it stays open after the handler ends |
| [local-shadow](local-shadow.bpmn) | exact boundary on the Sub-Process `Region` | async Service Task `Screen` inside `Region`, answered by `effectResult` | `Region` declares a local `failCode` through an input mapping; the Human Task `Recover` follows the boundary, `Continue` follows `Region` |
| [output-shadow](output-shadow.bpmn) | exact boundary on the Sub-Process `Region` | the same Service Task | `Region` maps the output `failCode`; the Human Task `Recover` follows the boundary, `Continue` follows `Region` |

The `Error` declaration of the two ESP models carries `camunda:errorMessage`, so both variables have a value.

| Scenario | Model | Case it separates |
|---|---|---|
| [root-handler](root-handler.scenario.json) | root-handler | The Error End while `MainWork` is open: the variables while `Handle` runs, then completion of `Handle`, then completion of `MainWork`, which shows whether the interrupting handler took it. |
| [region-handler](region-handler.scenario.json) | region-handler | The same failure inside `Region`: the variables while `Handle` runs and whether they remain at the root after the handler ends and `MainWork` is still open. |
| [local-shadow-caught](local-shadow-caught.scenario.json) | local-shadow | A business failure with a code and a message caught by the boundary of `Region`, whose local `failCode` has the name of the code variable. |
| [output-shadow-caught](output-shadow-caught.scenario.json) | output-shadow | The same failure where `Region` maps an output with the name of the code variable. |
| [output-shadow-completed](output-shadow-completed.scenario.json) | output-shadow | The control: `Screen` succeeds, `Region` completes normally and its output mapping runs, so the mapping is shown to write `failCode` at the root when no Error is caught. |

The schedules carry no expected variables, route or Process state; the retained CIB evidence is the answer.
