# Parallel fork and join compositions

Answer-free schedules for [PC-CF-03](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): Parallel fork and join composition with human and automated branches, nested regions, separate body Ends, and the join population when tokens arrive through one incoming flow. The [flow semantics](../../../docs/kernel/semantics/FLOW-SEMANTICS-SPEC.md#parallel-gateway) own the meaning; these inputs only exercise it, and the retained CIB Seven `2.2.0` answer is the row's target. The profile is `cibseven-2.2.0` with no source overlay. The Service Task binds `${bpmnLeanEffectHandler}` with `camunda:asyncBefore="true"`, so its effect waits for an `effectResult` stimulus.

## Models

| Model | What it holds |
|---|---|
| [order-fulfilment](order-fulfilment.bpmn) | A fork into the User Task *Pick items* and the Service Task *Charge card*; the latter leads into a second fork over the User Tasks *Check sanctions* and *Check address*. The inner join feeds the outer join before *Ship order*. Every task completion writes its own Process name. |
| [body-ends](body-ends.bpmn) | A fork into the Sub-Process *Pack* and the User Task *Notify customer*. *Pack* forks over *Label parcel* and *Seal parcel*, each to its own None End with no join; *Dispatch* follows the Sub-Process, and *Notify customer* ends in its own None End. |
| [duplicate-arrival-join](duplicate-arrival-join.bpmn) | A fork into three User Tasks. The first two flow into one converging Exclusive Gateway whose flow reaches the join; the third reaches the join on its own flow. The join therefore has two incoming flows and three possible arrivals. |
| [three-way-join](three-way-join.bpmn) | A fork into three User Tasks, each on its own incoming flow of one join. |

## Schedules

| Schedule | Model | Case it separates |
|---|---|---|
| [pick-first](order-fulfilment-pick-first.scenario.json) | order-fulfilment | The human branch completes before the automated branch and both inner checks. |
| [checks-first-reversed](order-fulfilment-checks-first-reversed.scenario.json) | order-fulfilment | The inner checks complete in reverse declaration order, and the inner join is passed before the human branch completes. |
| [pick-between-checks](order-fulfilment-pick-between-checks.scenario.json) | order-fulfilment | The human branch completes between the two inner checks. |
| [label-then-seal](body-ends-label-then-seal.scenario.json) | body-ends | One body End is reached, then the unjoined root branch completes, then the other body End is reached. |
| [seal-then-label](body-ends-seal-then-label.scenario.json) | body-ends | The body Ends are reached in the other order, with the root branch completing last. |
| [left-pair-first](duplicate-arrival-join-left-pair-first.scenario.json) | duplicate-arrival-join | Both tokens of the merged pair complete before the third task does. |
| [right-first](duplicate-arrival-join-right-first.scenario.json) | duplicate-arrival-join | The third task completes first, then one task of the merged pair, then the continuation, then the other task of the pair. |
| [reverse-order](three-way-join-reverse-order.scenario.json) | three-way-join | The three branches complete in reverse declaration order. |

[duplicate-arrival-join](duplicate-arrival-join.bpmn) is the input of the separating witness of [CIB-DEV-0001](../../../docs/CIB-BPMN-RELATION-REGISTER.md#cib-dev-0001--parallel-join-activates-from-duplicate-arrivals-through-one-incoming-flow): left-pair-first offers two arrivals on one incoming flow before any on the other, while in right-first the right arrival comes first, so both readings activate the join at the same step.

The schedules carry no expected state; the retained CIB evidence is the answer.
