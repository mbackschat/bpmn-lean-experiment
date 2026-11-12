# Reusable named Service handlers

Answer-free schedules for [PC-AUTO-01](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): named Service handlers with typed captured inputs and explicit results across root, scoped, repeated and called bodies, with a second independently named handler, and a handler no host registers. The [work](../../../docs/kernel/semantics/WORK-SEMANTICS-SPEC.md) and [data](../../../docs/kernel/semantics/DATA-SEMANTICS-SPEC.md) semantics own the meaning; the retained CIB Seven `2.2.0` answer is the target. They extend [service-task-effect](../../service-task-effect/README.md), [mapped-success-service-task](../../mapped-success-service-task/README.md) and [serial-business-task-composition](../../serial-business-task-composition/README.md). The profile is `cibseven-2.2.0` with no source overlay, so every handler is one of the delegate tokens the CIB runner registers.

[order-handlers.bpmn](order-handlers.bpmn) prices an order in the root with `${bpmnLeanEffectHandler}` and, in the Sub-Process *Pack*, labels it with the same handler and seals it with the independently named `${mappedSuccessHandler}`. *Price* captures four inputs (two Strings, a Boolean and a present Null) and returns one String result; *Seal* is synchronous, so CIB runs it inside the command that completes *Label* and consumes the scenario's own `effectResult` for it.

| Schedule | Case it separates |
|---|---|
| [typed-inputs-and-results](typed-inputs-and-results.scenario.json) | Captured String, Boolean and present Null inputs, and one result for each of the three Service Tasks, the second handler's included. |
| [captured-inputs-after-change](captured-inputs-after-change.scenario.json) | A `setVariables` command changes `quantity` while *Price* is open, then *Price* completes: the input snapshot against the value read when the job runs. |

The other models bind the same handler in the remaining bodies:

| Schedule | Model | Case it separates |
|---|---|---|
| [sequential-body-effects](sequential-body-effects.scenario.json) | [item-handlers.bpmn](item-handlers.bpmn) | One effect per body of a sequential Multi-Instance Sub-Process with a cardinality of two, each addressed by its own activation. |
| [called-effect](called-effect.scenario.json) | [called-handlers.bpmn](called-handlers.bpmn) | An effect in a called Process, addressed by the derived called-instance identity, with the result mapped back through `camunda:out`. |
| [unknown-delegate](unknown-delegate.scenario.json) | [unknown-handler.bpmn](unknown-handler.bpmn) | A Service Task whose delegate token `${noSuchHandler}` no registered handler carries. |

Notes for the target runners:

- In `unknown-delegate` the kernel refuses the deployment (`work.service.unboundImplementation`), while CIB deploys the model and fails the job when it resolves the token ([CIB-LIM-0051](../../../docs/CIB-BPMN-RELATION-REGISTER.md#cib-lim-0051--cib-deploys-a-service-task-whose-implementation-no-binding-matches)); the CIB runner projects the wait at an effect whose delegate token it does not know.
- Per-instance effects of a Multi-Instance Service Task are not authored: the kernel reader refuses the `asyncBefore` attribute on the loop element, and `asyncBefore` on the Service Task itself places one job before the whole body.
- "Occurrence keys survive recovery" is a host property with no schedule here.
- No Integer, Decimal or collection value appears: the [scenario value contract](../../../scripts/scenario-variable-value-contract.ts) admits them only for registered process ids, so the typed-input witnesses carry Strings, a Boolean and a present Null.
