# Exclusive choices and nonsynchronizing merges

Answer-free schedules for [PC-CF-02](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list), and for the Exclusive Gateway part of [PC-BASIC-03](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) (identifier renaming and candidate order). The [flow semantics](../../../docs/kernel/semantics/FLOW-SEMANTICS-SPEC.md#exclusive-gateway) own the meaning; these inputs only exercise it, and the retained CIB Seven `2.2.0` answer is the row's target. The profile is `cibseven-2.2.0` with no source overlay; conditions are JUEL over start variables of three types. The Service Task binds `${bpmnLeanEffectHandler}` with `camunda:asyncBefore="true"`, so its effect waits for an `effectResult` stimulus.

## Models

| Model | What it holds |
|---|---|
| [claim-routing](claim-routing.bpmn) | The Choice *Route claim* with three conditioned candidates in declaration order (`${fraud}`, `${amount > 1000}`, `${severity == 'severe'}`) and a default, leading to a User Task, a Service Task, a Manual Task and a plain Task, which merge on a converging Exclusive Gateway before *Close claim*. |
| [claim-routing-reversed](claim-routing-reversed.bpmn) | The same source with the three candidate flows declared in the reverse order; nothing else differs. |
| [claim-routing-renamed](claim-routing-renamed.bpmn) | The same source with every element, flow, process and definitions identifier renamed; names, variables and the handler binding are kept. |
| [fork-merge](fork-merge.bpmn) | A Parallel fork into two User Tasks that both flow into one converging Exclusive Gateway before *Send documents*. |
| [unconditioned-flows](unconditioned-flows.bpmn) | Two diverging Exclusive Gateways without a default, each with one conditioned and one unconditioned flow: the unconditioned flow is declared last at *Route by urgency* and first at *Route by gift*. |
| [default-with-unconditioned](default-with-unconditioned.bpmn) | A Choice with a default flow, a conditioned flow and a further unconditioned non-default flow. |
| [two-unconditioned-flows](two-unconditioned-flows.bpmn) | A Choice whose two outgoing flows are both unconditioned, with no default. |
| [single-conditioned-flow](single-conditioned-flow.bpmn) | A Choice with exactly one outgoing flow, which is conditioned. |
| [no-default-split](no-default-split.bpmn) | A Choice whose two flows are both conditioned (`severity` high or low) and which has no default. |

## Schedules

| Schedule | Model | Case it separates |
|---|---|---|
| [fraud-and-large-true](claim-routing-fraud-and-large-true.scenario.json) | claim-routing | The first and the second candidate conditions both hold. |
| [large-and-severe-true](claim-routing-large-and-severe-true.scenario.json) | claim-routing | The second and the third candidate conditions both hold; the Service Task's effect is answered. |
| [severe-only](claim-routing-severe-only.scenario.json) | claim-routing | Only the third candidate holds, which leads to the Manual Task. |
| [default-only](claim-routing-default-only.scenario.json) | claim-routing | No candidate holds. |
| [fraud-and-large-true](claim-routing-reversed-fraud-and-large-true.scenario.json) | claim-routing-reversed | The inputs of the original schedule with the same name, on the reversed source. |
| [large-and-severe-true](claim-routing-reversed-large-and-severe-true.scenario.json) | claim-routing-reversed | The inputs of the original schedule with the same name, on the reversed source. |
| [large-and-severe-true](claim-routing-renamed-large-and-severe-true.scenario.json) | claim-routing-renamed | The original schedule of that name addressed through the renamed identifiers. |
| [interleaved](fork-merge-interleaved.scenario.json) | fork-merge | One branch completes and its continuation is completed before the other branch completes. |
| [batched](fork-merge-batched.scenario.json) | fork-merge | Both branches complete before either continuation is completed. |
| [condition-true](unconditioned-flows-condition-true.scenario.json) | unconditioned-flows | Both conditions hold. |
| [condition-false](unconditioned-flows-condition-false.scenario.json) | unconditioned-flows | Both conditions fail. |
| [start](default-with-unconditioned-start.scenario.json) | default-with-unconditioned | The start alone, which is where CIB meets the deployment. |
| [start](two-unconditioned-flows-start.scenario.json) | two-unconditioned-flows | The start alone, which is where CIB meets the deployment. |
| [start](single-conditioned-flow-start.scenario.json) | single-conditioned-flow | The start alone, which is where CIB meets the deployment. |
| [no-candidate-true](no-default-split-no-candidate-true.scenario.json) | no-default-split | The severity matches neither candidate. |
| [one-candidate-true](no-default-split-one-candidate-true.scenario.json) | no-default-split | The severity matches the second candidate. |

## Kernel restrictions these inputs reconcile

The unconditioned-flow and single-condition models are the witnesses for the kernel restrictions `gateway.exclusive.unconditionedFlow` and `gateway.exclusive.singleConditionWithoutDefault` of the [flow semantics restrictions](../../../docs/kernel/semantics/FLOW-SEMANTICS-SPEC.md#restrictions), so that CIB's answer to each shape is fixed before the row decides whether to keep refusing it. Schedules that start a model CIB may refuse at deployment carry the `start` stimulus only.

The schedules carry no expected route or state; the retained CIB evidence is the answer.
