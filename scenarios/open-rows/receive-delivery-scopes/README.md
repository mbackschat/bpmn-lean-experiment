# Where a Receive Task delivery's variables install

Answer-free schedule for [PC-HUM-03](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) (probe P5): a delivery's own variables reaching a Receive Task inside an embedded Sub-Process that holds a local of the same name, inside a called instance that received the name through `camunda:in`, and in a parallel Multi-Instance instance. The [work semantics](../../../docs/kernel/semantics/WORK-SEMANTICS-SPEC.md#receive-tasks) own the kernel's meaning, under `DeliveryVariables.installs` ([CIB-EXT-0025](../../../docs/CIB-BPMN-RELATION-REGISTER.md#cib-ext-0025--message-correlation-by-api-criteria-and-delivered-variables)); the retained CIB Seven `2.2.0` answer is the target. The model is project-authored MIT source for the `cibseven-2.2.0` profile with no source overlay.

## Models

| Model | What it holds |
|---|---|
| [receive-delivery-scopes.bpmn](receive-delivery-scopes.bpmn) | After a Parallel fork three branches run: the Sub-Process `Embedded`, whose `camunda:inputParameter` makes `note` a local `embedded-local`, over the Receive Task `ReceiveEmbedded` (`Embedded`); the Call Activity `CallReceiver`, which passes `note` through `camunda:in` to `Process_P5Called` and its Receive Task `ReceiveCalled` (`Called`); and the Receive Task `ReceiveEach` (`Each`), parallel Multi-Instance with cardinality 2. |

## Schedules

| Schedule | Model | Row | Case it exercises |
|---|---|---|---|
| [variables-per-scope](variables-per-scope.scenario.json) | receive-delivery-scopes | PC-HUM-03 | The process starts with `note = "root"`; each Receive Task is then delivered `note` and a fresh name no scope holds, the Multi-Instance task in its first instance. |

## Notes for the target runners

- The called instance's Receive Task is addressed by the called instance's identifier, which the kernel derives from the Call's activation.
