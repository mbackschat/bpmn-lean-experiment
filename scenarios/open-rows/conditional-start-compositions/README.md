# Conditional Start evaluation against submitted context

Answer-free schedules for [PC-CONDITION-02](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): a root Conditional Start evaluated against the context a start stimulus submits, with a numeric condition over several value types, a Boolean condition over a true, false, null and absent flag, several conditions in one process, the same condition on two starts, and two versions of one process. The [subscriptions semantics](../../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md#starts) and [population semantics](../../../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md#start-selection) own the meaning; these inputs only exercise it, and the retained CIB Seven `2.2.0` answer is the row's target. The profile is `cibseven-2.2.0` with no source overlay.

A Condition start stimulus carries the context as its start variables and names the Start Event it addresses, except in the two schedules that say they name none. Every other schedule then completes the User Task of its Start Event's path, an input that addresses no occurrence when the start created no instance.

## Models

| Model | What it holds |
|---|---|
| [large-order](large-order.bpmn) | The Conditional Start *Large order* with the condition `${amount >= 1000}` and no variable filter, leading to *Review the order*. |
| [large-order-v2](large-order-v2.bpmn) | The same process identifier `Process_LargeOrder` with the condition `${amount >= 500}` and the task renamed `ReviewOrderRevised`: a second version of one process key. |
| [expedited-order](expedited-order.bpmn) | The Conditional Start *Order flagged* with the condition `${expedite}` and no variable filter, leading to *Ship the order fast*. |
| [routed-orders](routed-orders.bpmn) | Two Conditional Starts, *Large order* (`${amount >= 1000}` filtered on the variable `amount`) leading to *Review the large order* and *Urgent order* (`${urgent}` filtered on the variable `urgent`) leading to *Rush the urgent order*. |
| [duplicate-conditions](duplicate-conditions.bpmn) | One process whose two Conditional Starts, *Large online order* and *Large phone order*, carry the one condition `${amount >= 1000}`. |

## Single-instance schedules

| Schedule | Model | Context submitted |
|---|---|---|
| [large-order-integer-true](large-order-integer-true.scenario.json) | large-order | `amount` as the Integer 2500. |
| [large-order-decimal-true](large-order-decimal-true.scenario.json) | large-order | `amount` as the Decimal 2500.00. |
| [large-order-text-true](large-order-text-true.scenario.json) | large-order | `amount` as the String `2500`. |
| [large-order-below-threshold](large-order-below-threshold.scenario.json) | large-order | `amount` as the Integer 10. |
| [large-order-absent](large-order-absent.scenario.json) | large-order | No variable. |
| [expedited-order-true](expedited-order-true.scenario.json) | expedited-order | `expedite` as the Boolean true. |
| [expedited-order-false](expedited-order-false.scenario.json) | expedited-order | `expedite` as the Boolean false. |
| [expedited-order-null](expedited-order-null.scenario.json) | expedited-order | `expedite` as a present null. |
| [expedited-order-absent](expedited-order-absent.scenario.json) | expedited-order | No variable. |
| [routed-large-only](routed-large-only.scenario.json) | routed-orders | `amount` 2500 and `urgent` false, naming *Large order*. |
| [routed-urgent-only](routed-urgent-only.scenario.json) | routed-orders | `amount` 10 and `urgent` true, naming *Urgent order*. |
| [routed-amount-context-only](routed-amount-context-only.scenario.json) | routed-orders | `amount` 2500 alone, naming *Large order*. |
| [routed-urgent-context-only](routed-urgent-context-only.scenario.json) | routed-orders | `urgent` true alone, naming *Urgent order*. |
| [routed-neither](routed-neither.scenario.json) | routed-orders | `amount` 10 and `urgent` false, naming no start. |
| [routed-both](routed-both.scenario.json) | routed-orders | `amount` 2500 and `urgent` true, naming no start. |
| [duplicate-conditions-start](duplicate-conditions-start.scenario.json) | duplicate-conditions | `amount` 2500, naming *Large online order*. |

## Population schedule

A closed [engine population scenario](../../../contracts/schemas/engine-population-scenario.schema.json): definitions deployed in the order listed, then the steps in order.

| Schedule | Definitions | Case it separates |
|---|---|---|
| [large-order-two-versions](large-order-two-versions.population-scenario.json) | large-order, large-order-v2 | `amount` 700 is submitted to the first version, then to the second. |

The schedules carry no expected instance, task or variable; the retained CIB evidence is the answer.
