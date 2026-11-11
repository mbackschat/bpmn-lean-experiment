# Conditional Start evaluation against submitted context

Answer-free schedules for [PC-CONDITION-02](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): a root Conditional Start evaluated against the context a start stimulus submits, with a numeric condition over several value types, a Boolean condition over a true, false, null and absent flag, several conditions in one process, the same condition on two starts, and two versions of one process. The [subscriptions semantics](../../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md#starts) and [population semantics](../../../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md#start-selection) own the meaning; these inputs only exercise it, and the retained CIB Seven `2.2.0` answer is the row's target. The profile is `cibseven-2.2.0` with no source overlay.

A Condition start stimulus carries the context as its start variables and names the Start Event it addresses, except in the two schedules that say they name none. Every other schedule then completes the User Task of its Start Event's path, an input that addresses no occurrence when the start created no instance.

## Models

| Model | What it holds |
|---|---|
| [large-order](large-order.bpmn) | The Conditional Start *Large order* with the condition `${amount >= 1000}` and no variable filter, leading to *Review the order*. |
| [expedited-order](expedited-order.bpmn) | The Conditional Start *Order flagged* with the condition `${expedite}` and no variable filter, leading to *Ship the order fast*. |
| [routed-orders](routed-orders.bpmn) | Two Conditional Starts, *Large order* (`${amount >= 1000}` filtered on the variable `amount`) leading to *Review the large order* and *Urgent order* (`${urgent}` filtered on the variable `urgent`) leading to *Rush the urgent order*. |
| [duplicate-conditions](duplicate-conditions.bpmn) | One process whose two Conditional Starts, *Large online order* and *Large phone order*, carry the one condition `${amount >= 1000}`. |
| [layout-only-conditions](layout-only-conditions.bpmn) | As duplicate-conditions, the second condition written `${amount>=1000}`. |
| [lexeme-differing-conditions](lexeme-differing-conditions.bpmn) | As duplicate-conditions, the second condition written `${amount >= 01000}`. |
| [operator-differing-conditions](operator-differing-conditions.bpmn) | As duplicate-conditions, the second condition written `${amount > 1000}`. |

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
| [layout-only-conditions-start](layout-only-conditions-start.scenario.json) | layout-only-conditions | `amount` 2500, naming *Large online order*; kernel-only. |
| [lexeme-differing-conditions-start](lexeme-differing-conditions-start.scenario.json) | lexeme-differing-conditions | `amount` 2500, naming *Large online order*; kernel-only. |
| [operator-differing-conditions-start](operator-differing-conditions-start.scenario.json) | operator-differing-conditions | `amount` 2500, naming *Large online order*; kernel-only. |

The population witnesses of this directory are held outside the repository with the M8 track: the CIB runner realizes no population scenario and the kernel's population runner refuses an inadmissible definition, so they have no comparable result yet.

The schedules carry no expected instance, task or variable; the retained CIB evidence is the answer.
