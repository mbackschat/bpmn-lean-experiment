# Conditional outflow on Simple Boolean

Answer-free schedules for [PC-CF-07](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list), [PC-CF-04](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) and [PC-CF-02](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) in the [Simple Boolean language](../../../docs/SIMPLE-BOOLEAN-EXPRESSION-DECISION.md): an Activity's conditioned, plain and default outgoing flows, an Inclusive split that may select nothing, and an Exclusive Gateway's sole unconditioned flow. The [flow semantics](../../../docs/kernel/semantics/FLOW-SEMANTICS-SPEC.md) own the meaning. CIB Seven cannot evaluate this language, so these schedules check the Lean and TypeScript kernels against each other on the paths the JUEL witnesses of [activity-split-merge](../activity-split-merge/README.md), [inclusive-join-compositions](../inclusive-join-compositions/README.md) and [exclusive-choice-compositions](../exclusive-choice-compositions/README.md) reach only once the JUEL core level lands. The profile is `bpmn-2.0.2`; every condition reads a start variable.

## Models

| Model | What it holds |
|---|---|
| [activity-outflow](activity-outflow.bpmn) | The Task *Check* with two conditioned outgoing flows and no default, to the User Tasks *Expedite* and *Escalate*. |
| [activity-default](activity-default.bpmn) | The Task *Check* with a conditioned flow to *Expedite*, a conditioned flow to *Notify* and a default flow to *Standard handling*. |
| [inclusive-without-default](inclusive-without-default.bpmn) | An Inclusive split whose two flows are conditioned, with no default, to *Check credit* and *Check fraud*, joined by an Inclusive Gateway. |
| [exclusive-sole-unconditioned](exclusive-sole-unconditioned.bpmn) | A Parallel fork into two Exclusive Gateways, each with one conditioned and one unconditioned flow: declared last at *Plain flow declared last*, first at *Plain flow declared first*. |

## Schedules

| Schedule | Model | Case it separates |
|---|---|---|
| [both-hold](activity-outflow-both-hold.scenario.json) | activity-outflow | Both conditions hold, so both follow-up tasks open. |
| [one-holds](activity-outflow-one-holds.scenario.json) | activity-outflow | One condition holds. |
| [none-holds](activity-outflow-none-holds.scenario.json) | activity-outflow | Neither condition holds and there is no default. |
| [conditioned-and-plain](activity-default-conditioned-and-plain.scenario.json) | activity-default | Both conditions hold, so the default is not taken. |
| [default-only](activity-default-default-only.scenario.json) | activity-default | Neither condition holds. |
| [none-selected](inclusive-without-default-none-selected.scenario.json) | inclusive-without-default | Neither condition holds. |
| [one-selected](inclusive-without-default-one-selected.scenario.json) | inclusive-without-default | One condition holds and the join passes its one arrival. |
| [condition-holds](exclusive-sole-unconditioned-condition-holds.scenario.json) | exclusive-sole-unconditioned | The condition holds at both gateways. |

The schedules carry no expected route or state.
