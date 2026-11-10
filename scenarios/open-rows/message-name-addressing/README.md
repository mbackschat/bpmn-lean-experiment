# Message names, source identifiers and Operations

Answer-free schedules for [PC-MESSAGE-01](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): whether a Message's `name` or its source identifier addresses a Message wait in CIB Seven `2.2.0`, Message names given by an expression at a running catch and at a root start, two Messages of one name, a Message without a name, and Operations that are consistent, foreign, shared between two waits or unresolved, and whether CIB matches them. The [subscriptions semantics](../../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md) own the meaning; the retained CIB Seven `2.2.0` answer is the target. A delivery states the channel the target runner publishes for the wait (the Message identifier, and the Interface and Operation when the wait declares one). The models are project-authored MIT source for the `cibseven-2.2.0` profile with no source overlay.

## Models

| Model | What it holds |
|---|---|
| [names.bpmn](names.bpmn) | After a Parallel fork four Message catches each lead to a Human Task. `Catch_Plain` waits on `Message_Plain` (name `plain notice`). `Catch_Expr` waits on `Message_Expr` whose name is the expression `${wire}`. `Catch_Alpha` and `Catch_Beta` wait on `Message_Alpha` (name `Message_Beta`) and `Message_Beta` (name `Message_Alpha`): each Message's name is the other's identifier. |
| [twin-same-scope.bpmn](twin-same-scope.bpmn) | After a Parallel fork two catches `Catch_TwinA` and `Catch_TwinB` wait on `Message_TwinA` and `Message_TwinB`, two Messages that share the name `twin notice`, in one scope. |
| [twin-nested-scope.bpmn](twin-nested-scope.bpmn) | The same two Messages, with `Catch_TwinB` inside the Sub-Process `Region` and `Catch_TwinA` at the Process level. |
| [operation-controls.bpmn](operation-controls.bpmn) | After a Parallel fork three catches and a Sub-Process wait. `Catch_OpMatch` names `Message_Match` and `Operation_Match`, whose input Message is `Message_Match`. `Catch_OpOther` names `Message_Subject` and `Operation_Other`, whose input Message is `Message_Elsewhere`. `Catch_SameRoot` and, inside `Region`, `Catch_SameNested` name `Message_Same` with `Operation_Same1` and `Operation_Same2`, two Operations with the same input Message. |
| [unresolved-operation.bpmn](unresolved-operation.bpmn) | One catch `Catch_Dangling` names `Message_Dangling` and an `operationRef` to `Operation_Missing`, which no Interface declares. |
| [unnamed-message.bpmn](unnamed-message.bpmn) | One catch `Catch_Unnamed` names `Message_Unnamed`, a Message without a `name`. |
| [start-expression.bpmn](start-expression.bpmn) | A Process whose Message Start Event `Start_Order` names `Message_StartExpr`, whose name is the expression `${startName}`. |
| [esp-root-name.bpmn](esp-root-name.bpmn) | A None Start, the Human Task `Work` and a root non-interrupting Message Event Sub-Process `ESP_Notice` whose start `Start_Notice` waits on `Message_EspName`, whose name is the expression `${k}`. |
| [name-expressions.bpmn](name-expressions.bpmn) | A None Start and an Exclusive Gateway on the String Process variable `route`. `host-input` runs the Human Task `Host_Input`, whose input mapping declares the local `k` as `local`, with the interrupting Message boundary `Notice_Host` on `Message_HostName` (name `${k}`). `null-name` runs the Message catch `Catch_Null` on `Message_NullName` (name `${k}`) and the Human Task `Proceed_Null`. |
| [duplicate-boundary-names.bpmn](duplicate-boundary-names.bpmn) | A None Start and the Human Task `Host_Dup` with two interrupting Message boundaries `Notice_One` and `Notice_Two`, on `Message_Dup1` and `Message_Dup2`, two Messages that share the name `shared notice`. |
| [unnamed-receive.bpmn](unnamed-receive.bpmn) | A None Start and the Receive Task `Receive_Unnamed` on `Message_UnnamedReceive`, a Message without a `name`. |

## Schedules

| Schedule | Model | Row | Case it exercises |
|---|---|---|---|
| [delivery-by-source-id](delivery-by-source-id.scenario.json) | names | PC-MESSAGE-01 | `Message_Plain` is delivered to `Catch_Plain` and `Proceed_Plain` completes. |
| [swapped-names-each-own-identifier](swapped-names-each-own-identifier.scenario.json) | names | PC-MESSAGE-01 | `Message_Alpha` is delivered to `Catch_Alpha` and `Message_Beta` to `Catch_Beta`. |
| [swapped-names-other-identifier-first](swapped-names-other-identifier-first.scenario.json) | names | PC-MESSAGE-01 | `Message_Beta` is delivered to `Catch_Alpha`, then `Message_Alpha` to `Catch_Alpha`. |
| [expression-name-delivery](expression-name-delivery.scenario.json) | names | PC-MESSAGE-01 | `wire` is `alpha`; `Message_Expr` is delivered to `Catch_Expr` and `Proceed_Expr` completes. |
| [expression-name-other-message](expression-name-other-message.scenario.json) | names | PC-MESSAGE-01 | `wire` is `alpha`; `Message_Plain` is delivered to `Catch_Expr`, then `Message_Expr`. |
| [expression-name-unresolved](expression-name-unresolved.scenario.json) | names | PC-MESSAGE-01 | `wire` is never written. |
| [same-name-same-scope](same-name-same-scope.scenario.json) | twin-same-scope | PC-MESSAGE-01 | Both catches are delivered their own Message after the start. |
| [same-name-nested-scope](same-name-nested-scope.scenario.json) | twin-nested-scope | PC-MESSAGE-01 | The nested catch is delivered its Message, then the Process-level catch. |
| [operation-consistent](operation-consistent.scenario.json) | operation-controls | PC-MESSAGE-01 | `Catch_OpMatch` is delivered its own channel and `Proceed_OpMatch` completes. |
| [operation-names-another-message](operation-names-another-message.scenario.json) | operation-controls | PC-MESSAGE-01 | The input Message of `Operation_Other` is delivered to `Catch_OpOther`, then the channel of its own `Message_Subject`. |
| [same-message-two-operations](same-message-two-operations.scenario.json) | operation-controls | PC-MESSAGE-01 | The channel of the second Operation is delivered to `Catch_SameRoot`, then its own channel, then the nested wait's own channel. |
| [operation-other-channel-on-match](operation-other-channel-on-match.scenario.json) | operation-controls | PC-MESSAGE-01 | The channel of `Operation_Match` is delivered to `Catch_OpOther`, then `Catch_OpOther`'s own channel. |
| [unresolved-operation](unresolved-operation.scenario.json) | unresolved-operation | PC-MESSAGE-01 | The Message is delivered to the catch with a channel that names the missing Operation. |
| [unnamed-message](unnamed-message.scenario.json) | unnamed-message | PC-MESSAGE-01 | The Message is delivered to the catch. |
| [start-expression-name](start-expression-name.scenario.json) | start-expression | PC-MESSAGE-01 | The Message start is triggered with the name expression's Message. |
| [esp-root-name-from-start-variable](esp-root-name-from-start-variable.scenario.json) | esp-root-name | PC-MESSAGE-01 | `k` is `A` at the start; the Message `Message_EspName` is then delivered to `Start_Notice`. Separates a root listener whose name expression sees the start variables from one that sees an empty context. No evidence yet. |
| [boundary-name-from-host-input](boundary-name-from-host-input.scenario.json) | name-expressions | PC-MESSAGE-01 | `route` is `host-input` and `k` exists only as the host's local; the schedule is the start alone. Separates a boundary name resolved in the enclosing scope before the host's input mappings from one resolved after them. No evidence yet. |
| [expression-name-null](expression-name-null.scenario.json) | name-expressions | PC-MESSAGE-01 | `route` is `null-name` and `k` is a present null; the schedule is the start alone. Separates a catch whose name evaluates to null from a catch that is addressable by name. No evidence yet. |
| [boundary-same-name](boundary-same-name.scenario.json) | duplicate-boundary-names | PC-MESSAGE-01 | The schedule is the start alone. Separates two boundaries of one host whose distinct Messages share a name from the same-name rule the row decides. No evidence yet. |
| [unnamed-receive-task](unnamed-receive-task.scenario.json) | unnamed-receive | PC-MESSAGE-01 | The Message `Message_UnnamedReceive` is delivered to `Receive_Unnamed`. Separates a Receive Task whose Message has no name, which a name-addressed API cannot address, from addressing it by Message identifier. No evidence yet. |

## Notes for the target runners

- A schedule over a model CIB may refuse at deployment (`twin-same-scope`, `unresolved-operation`, `unnamed-message`, `start-expression`) carries the stimuli that would separate the readings if it is accepted; a refused deployment ends the run at it.
- A channel that differs from the one the runner publishes for the addressed wait (another Message identifier, or another Operation of the same Message) is rejected by the runner's channel equality before CIB is called, so those controls need the runner to state them as deliveries to CIB's name-addressed API.
- `wire` is the String Process variable that `Message_Expr` reads when `Catch_Expr` is reached, which is the start command.
- `unnamed-receive` carries the delivery that would separate the readings if the engine accepts the model, like `unnamed-message`; `esp-root-name-from-start-variable` carries a delivery that a start the engine rolls back never reaches, and the three other new schedules end at the start, where the name is resolved or refused.

The schedules carry no expected route, open wait, variable or Process state; the retained CIB evidence is the answer.
