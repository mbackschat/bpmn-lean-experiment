# Multi-Instance completion failures

Neutral inputs for the completion-condition failure forms of the [Multi-Instance level](../../../docs/kernel/semantics/EXPRESSION-SEMANTICS-SPEC.md#multi-instance-level), for [PC-DATA-08](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list), [PC-DATA-09](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) and PC-MI-09. They are answer-free: the CIB Seven `2.2.0` evidence run supplies every expected result, and no schedule states one. Every schedule but the standards one uses the `cibseven-2.2.0` profile.

Each CIB model loops over two items. Its completion condition is `${nrOfCompletedInstances < failAt ? false : label}`, a String where CIB requires a Boolean (`MultiInstanceActivityBehavior:157-162`), or `${nrOfCompletedInstances < failAt ? false : missing}`, whose evaluation fails because no `missing` variable exists. With `failAt = 1` the condition fails on the first, nonfinal completion; with `failAt = 2` only on the final one, where [CIB-INT-0009](../../../docs/CIB-BPMN-RELATION-REGISTER.md#cib-int-0009--on-the-final-multi-instance-completion-sequential-tests-exhaustion-first-and-parallel-tests-the-condition-first) decides whether the condition runs: a parallel body tests it, a sequential one tests exhaustion first. A Service Task model reaches the condition through an effect result (the job fails, [CIB-EXT-0026](../../../docs/CIB-BPMN-RELATION-REGISTER.md#cib-ext-0026--a-continuation-failure-after-an-effect-result-fails-the-job)); a User Task model through a task completion, which rolls back. Every body is followed by the close task `UserTask_Close`.

The Service Task models are those of [multi-instance-expression-results](../multi-instance-expression-results/README.md) with the neutral delegate-expression effect handler, `camunda:asyncBefore="true"` on the loop, and the CIB-INT-0014 binding (`loopDataInputRef` `DataInput_Recipients`, item `recipient`). The User Task models bind `DataInput_Items` and the item `item` the same way and submit the output data item `DataOutput_Result`.

## Models

| Model | Body | Mode | Condition tail |
|---|---|---|---|
| [service-parallel-not-boolean](service-parallel-not-boolean.bpmn) | Service Task | parallel | `label` |
| [service-sequential-not-boolean](service-sequential-not-boolean.bpmn) | Service Task | sequential | `label` |
| [service-parallel-failing](service-parallel-failing.bpmn) | Service Task | parallel | `missing` |
| [service-sequential-failing](service-sequential-failing.bpmn) | Service Task | sequential | `missing` |
| [user-parallel-not-boolean](user-parallel-not-boolean.bpmn) | User Task | parallel | `label` |
| [user-sequential-not-boolean](user-sequential-not-boolean.bpmn) | User Task | sequential | `label` |
| [user-parallel-failing](user-parallel-failing.bpmn) | User Task | parallel | `missing` |
| [user-sequential-failing](user-sequential-failing.bpmn) | User Task | sequential | `missing` |
| [standards-reads-item](standards-reads-item.bpmn) | User Task | parallel | the Simple Boolean `isPresent(DataInput_Item)`, under the `bpmn-2.0.2` profile and the Data Association binding |

## Schedules

Each CIB model has two schedules, `<model>-nonfinal` (`failAt = 1`) and `<model>-final` (`failAt = 2`). Each starts with the two items and `label = "x"`, completes body 1, then body 2, then the close task.

| Schedule | Case it separates | Row |
|---|---|---|
| [service-parallel-not-boolean-nonfinal](service-parallel-not-boolean-nonfinal.scenario.json), [service-parallel-not-boolean-final](service-parallel-not-boolean-final.scenario.json) | a non-Boolean condition after an effect result, parallel | PC-DATA-09, PC-MI-09 |
| [service-sequential-not-boolean-nonfinal](service-sequential-not-boolean-nonfinal.scenario.json), [service-sequential-not-boolean-final](service-sequential-not-boolean-final.scenario.json) | the same, sequential | PC-DATA-09, PC-MI-09 |
| [service-parallel-failing-nonfinal](service-parallel-failing-nonfinal.scenario.json), [service-parallel-failing-final](service-parallel-failing-final.scenario.json) | a failing condition after an effect result, parallel | PC-DATA-08, PC-MI-09 |
| [service-sequential-failing-nonfinal](service-sequential-failing-nonfinal.scenario.json), [service-sequential-failing-final](service-sequential-failing-final.scenario.json) | the same, sequential | PC-DATA-08, PC-MI-09 |
| [user-parallel-not-boolean-nonfinal](user-parallel-not-boolean-nonfinal.scenario.json), [user-parallel-not-boolean-final](user-parallel-not-boolean-final.scenario.json) | a non-Boolean condition after a task completion, parallel | PC-DATA-09, PC-MI-09 |
| [user-sequential-not-boolean-nonfinal](user-sequential-not-boolean-nonfinal.scenario.json), [user-sequential-not-boolean-final](user-sequential-not-boolean-final.scenario.json) | the same, sequential | PC-DATA-09, PC-MI-09 |
| [user-parallel-failing-nonfinal](user-parallel-failing-nonfinal.scenario.json), [user-parallel-failing-final](user-parallel-failing-final.scenario.json) | a failing condition after a task completion, parallel | PC-DATA-08, PC-MI-09 |
| [user-sequential-failing-nonfinal](user-sequential-failing-nonfinal.scenario.json), [user-sequential-failing-final](user-sequential-failing-final.scenario.json) | the same, sequential | PC-DATA-08, PC-MI-09 |
| [standards-reads-item](standards-reads-item.scenario.json) | the condition reads the item of the instance that completed (BPMN 2.0.2 §13.3.7), so it holds on the first completion and the second task completion is a discriminator | PC-DATA-08, PC-MI-09 |

Notes for the target runners: under the `bpmn-2.0.2` profile the standards schedule's expected result is the standards reading, which the kernel answers; CIB, which reads no Simple Boolean, answers it as it reads the text.
