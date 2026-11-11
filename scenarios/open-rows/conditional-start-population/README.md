# Conditional Start evaluation populations

Answer-free population schedules for [PC-CONDITION-02](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): an `evaluateConditions` command that evaluates the Conditional root starts of one definition, or of every current deployment, against the submitted variables, with several true starts, several definitions, exact versions, no Conditional Start in scope and a start whose condition fails beside one that holds. The [subscriptions semantics](../../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md#starts) and the [population semantics](../../../docs/kernel/semantics/POPULATION-SEMANTICS-SPEC.md#start-selection) own the meaning; these inputs only exercise it. Each is a closed [engine population scenario](../../../contracts/schemas/engine-population-scenario.schema.json): the definitions deploy at 0 in the order listed, or at their `deploy` step, then the steps run in order at their logical times.

An `evaluateConditions` step carries the submitted variables, optionally one definition selected by process key or deployment ordinal, and no start Event: every Conditional start in scope is evaluated. The started instances' identities are derived by the engine, so no schedule addresses one of them.

The CIB schedules run under `cibseven-2.2.0` with no source overlay; their CIB answer comes from the CIB runner's population mode in the hosted lane and is retained beside each schedule. [standards-conditional-start-refused](standards-conditional-start-refused.population-scenario.json) is kernel-only under `bpmn-2.0.2`, whose provenance names no CIB revision. [evaluate-replay-later-time](evaluate-replay-later-time.population-scenario.json) is kernel-only under `cibseven-2.2.0`, the profile that admits a Conditional start, and names no CIB revision either: CIB keeps no command ledger, so a retained CIB answer to it would say nothing about the kernel's contract. It stands for the refusal fixture of the row, which belongs under `packages/kernel/test/fixtures` and is outside this directory.

## Models

| Model | What it holds |
|---|---|
| [large-order-v2](large-order-v2.bpmn) | The process `Process_LargeOrder` of [large-order](../conditional-start-compositions/large-order.bpmn) with the condition `${amount >= 500}` and the task renamed *ReviewOrderRevised*: a second version of one process key. |
| [conditional-echo-trigger](conditional-echo-trigger.bpmn) | The Conditional Start *Large order* (`${amount >= 1000}`) into an End Event that throws the Signal `echo`. |
| [failing-large-order](failing-large-order.bpmn) | The Conditional Start *Large order* (`${amount >= 1000}`) into the Exclusive Gateway *Choose the audit*, whose flow to *Audit in depth* reads `${auditLevel > 1}` over a variable no step supplies and whose default flow leads to *Check routinely*. |

The schedules also bind five models of other directories:

- [large-order](../conditional-start-compositions/large-order.bpmn): the Conditional Start *Large order* (`${amount >= 1000}`).
- [expedited-order](../conditional-start-compositions/expedited-order.bpmn): the Conditional Start *Order flagged* (`${expedite}`).
- [routed-orders](../conditional-start-compositions/routed-orders.bpmn): two Conditional Starts, *Large order* (`${amount >= 1000}`, filtered on `amount`) and *Urgent order* (`${urgent}`, filtered on `urgent`).
- [order-intake](../message-start-compositions/order-intake.bpmn): two Message Starts and no Conditional Start.
- [echo-relay](../signal-broadcast-population/echo-relay.bpmn): a catch of the Signal `echo` that throws `echo` and waits again.

## Population schedules

| Schedule | Definitions | Target | Case it separates |
|---|---|---|---|
| [routed-both-two-instances](routed-both-two-instances.population-scenario.json) | routed-orders | CIB | One evaluation over `amount` 2500 and `urgent` true, naming no definition. |
| [two-definitions-one-request](two-definitions-one-request.population-scenario.json) | large-order, expedited-order | CIB | One evaluation over `amount` 2500 and `expedite` true reaches two definitions. |
| [exact-old-version](exact-old-version.population-scenario.json) | large-order, large-order-v2 | CIB | Two versions with the thresholds 1000 and 500 are deployed; `amount` 700 is evaluated against the current deployments and against deployment 1, and `amount` 2500 against deployment 1. |
| [no-conditional-start-in-scope](no-conditional-start-in-scope.population-scenario.json) | order-intake | CIB | An evaluation over a population whose only definition has Message Starts. |
| [one-start-fails-others-start](one-start-fails-others-start.population-scenario.json) | routed-orders | CIB | `amount` 2500 and `urgent` as a present null: the first start's condition holds and the second's reads a null. |
| [start-continuation-fails](start-continuation-fails.population-scenario.json) | failing-large-order | CIB | One evaluation over `amount` 2500: the start's condition holds and its continuation reads the unset `auditLevel`. The kernel answers a fan-out whose one entry is the start's `failed rolledBack unknown-variable`, starting nothing; CIB rolls the evaluation back with no instance, since `EvaluateStartConditionCmd` starts the instance inside the command (CIB-INT-0033). |
| [standards-conditional-start-refused](standards-conditional-start-refused.population-scenario.json) | large-order | kernel-only, `bpmn-2.0.2` | The standards profile deploys a Conditional Start and is asked to evaluate it. |
| [evaluate-replay-later-time](evaluate-replay-later-time.population-scenario.json) | routed-orders | kernel-only, `cibseven-2.2.0` | One evaluation over `amount` 2500 and `urgent` true at 0, then the identical step at 60,000 ms. |
| [kernel-cascade-bound](kernel-cascade-bound.population-scenario.json) | conditional-echo-trigger, echo-relay, large-order | kernel-only, `cibseven-2.2.0` | Two echo instances wait; `amount` 2500 starts the trigger, whose `echo` the two instances relay until the cascade bound stops the fan-out before the later start of *large-order*. |
| [kernel-order-scope-and-filter](kernel-order-scope-and-filter.population-scenario.json) | routed-orders, large-order | kernel-only, `cibseven-2.2.0` | An explicit `order` naming the three starts in reverse, an `order` naming one of them, a selector naming no deployment, and `amount` alone, which the start filtered on `urgent` does not see. |

The schedules carry no expected deployment, instance, task or resolution.
