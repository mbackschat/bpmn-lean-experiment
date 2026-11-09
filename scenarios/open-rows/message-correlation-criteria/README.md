# Message correlation by API criteria

Answer-free schedules for [PC-MESSAGE-08](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): a delivery that names a waiting Message catch together with typed correlation criteria over Process variables, the business key, the Process instance and a Multi-Instance local variable, with compound criteria, a present null against an absent variable, a value of the wrong type, a payload that travels with the criteria, two catches of one Message under the same criteria, and the same criteria on a model that also carries modeled correlation key metadata. The [population semantics](../../../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md#message-key-correlation) own the meaning, including the [CIB relation](../../../docs/CIB-BPMN-RELATION-REGISTER.md#cib-ext-0025--message-correlation-by-api-criteria-and-delivered-variables) that selects CIB's API criteria and the [classified limitation](../../../docs/CIB-BPMN-RELATION-REGISTER.md#cib-lim-0002-modeled-bpmn-key-and-context-correlation-is-not-executed) of modeled keys; these inputs only exercise it, and the retained CIB Seven `2.2.0` answer is the row's target. They extend the [Message key-correlation population scenarios](../../message-key-correlation/README.md), which cover the modeled key over several instances of one and of two definitions. The profile is `cibseven-2.2.0` with no source overlay.

A correlation is the list of matches a delivery states against the target occurrence: a Process variable, a local variable, the business key or the Process instance, each with the typed value it must hold. Every schedule here is a single instance; the scenario contract states a `publish` step only by modeled key and String payload, so correlation by criteria across several instances is not stated here.

## Models

| Model | What it holds |
|---|---|
| [order-confirmation](order-confirmation.bpmn) | A None Start, the Message catch *Await confirmation* (`order-confirmed`) and the User Task *Fulfil the order*. The start supplies `orderId` `A-1`, `region` `north`, `note` as a present null and `ticket` as the Integer 41; `remark` is never set. |
| [confirmation-payload](confirmation-payload.bpmn) | The same shape with the catch reached through the Interface *Warehouse* and one Data Output associated to the Process Property `Property_ConfirmationReference`. |
| [parallel-confirmations](parallel-confirmations.bpmn) | A Parallel fork into two Message catches of the one Message `order-confirmed`, *Await confirmation of part A* and *Await confirmation of part B*, each followed by its own User Task and joined before the End. |
| [item-confirmations](item-confirmations.bpmn) | A parallel Multi-Instance Sub-Process of cardinality two whose body is a Message catch *Await item confirmation* (`item-confirmed`) and the User Task *Pack the item*. |
| [message-key-correlation process](../../message-key-correlation/process.bpmn) | The existing settlement model with its modeled correlation key, bound by path from [modeled-key-api-criterion](modeled-key-api-criterion.scenario.json). |

## Schedules

| Schedule | Model | Case it separates |
|---|---|---|
| [unique-compound](unique-compound.scenario.json) | order-confirmation | One delivery whose two criteria both equal their variables. |
| [compound-partial-mismatch](compound-partial-mismatch.scenario.json) | order-confirmation | A delivery whose `region` criterion differs from the variable, then the delivery whose two criteria both equal their variables. |
| [null-versus-absent](null-versus-absent.scenario.json) | order-confirmation | A null criterion on the never-set `remark`, then on the present-null `note`. |
| [type-mismatch](type-mismatch.scenario.json) | order-confirmation | `ticket` stated as the String `41`, then as the Integer 41. |
| [business-key](business-key.scenario.json) | order-confirmation | Started under the business key `ORD-7`: a delivery under `ORD-9`, then under `ORD-7`. |
| [process-instance](process-instance.scenario.json) | order-confirmation | A delivery naming Process instance `Instance_2`, then `Instance_1`. |
| [payload-with-matching-criterion](payload-with-matching-criterion.scenario.json) | confirmation-payload | One criterion that equals its variable, with a String payload. |
| [payload-with-mismatching-criterion](payload-with-mismatching-criterion.scenario.json) | confirmation-payload | A String payload under a criterion for another order, then under the criterion for this order. |
| [ambiguous-same-instance](ambiguous-same-instance.scenario.json) | parallel-confirmations | The criterion `orderId` `A-1`, which equals the instance's variable, delivered to each of the two catches of the one Message. |
| [local-variable-body-counter](local-variable-body-counter.scenario.json) | item-confirmations | `loopCounter` stated as 1, then as 0, at the first body's catch. |
| [modeled-key-api-criterion](modeled-key-api-criterion.scenario.json) | message-key-correlation process | A String payload at the first catch, then a criterion on the Process variable `Property_SettlementReference` at the second. |

The schedules carry no expected match, variable or Process state; the retained CIB evidence is the answer.
