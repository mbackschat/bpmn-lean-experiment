# Non-interrupting Message boundaries with repeated delivery

Answer-free schedules for [PC-MESSAGE-05](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): non-interrupting Message boundaries on a Human Task, an embedded Sub-Process and a Receive Task, delivered more than once with the handlers overlapping, two addresses on one host, and what the host's completion does to later delivery and to handlers already started. The [repeatable subscriptions](../../repeatable-event-subscriptions/README.md) hold the single-address Human Task case. The [subscriptions semantics](../../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md) own the meaning; the retained CIB Seven `2.2.0` answer is the target. The model is project-authored MIT source for the `cibseven-2.2.0` profile with no source overlay.

## Models

| Model | What it holds |
|---|---|
| [repeated-boundaries.bpmn](repeated-boundaries.bpmn) | After a Parallel fork three regions run side by side. *User*: `Host_User` with the non-interrupting boundaries `Ping_User` (`ping`) to `Handler_User` and `Note_User` (`note`) to `Handler_Note`, normal completion to `After_User`. *Scope*: the Sub-Process `Host_Scope` over the concurrent Human Tasks `Scope_A` and `Scope_B` with `Ping_Scope` (`pingScope`) to `Handler_Scope`, normal completion to `After_Scope`. *Receive*: `Host_Receive` on `documents` with `Ping_Receive` (`pingReceive`) to `Handler_Receive`. |

## Schedules

| Schedule | Model | Row | Case it exercises |
|---|---|---|---|
| [user-two-deliveries-overlap](user-two-deliveries-overlap.scenario.json) | repeated-boundaries | PC-MESSAGE-05 | `ping` is delivered twice; the second handler completes, then the first, then the host; `ping` is delivered once more. |
| [user-host-completes-first](user-host-completes-first.scenario.json) | repeated-boundaries | PC-MESSAGE-05 | `ping` is delivered, the host completes, `ping` is delivered again, then the handler and `After_User` complete. |
| [user-two-addresses](user-two-addresses.scenario.json) | repeated-boundaries | PC-MESSAGE-05 | `ping` and `note` are delivered; both handlers and the host complete. |
| [scope-delivery-then-scope-completes](scope-delivery-then-scope-completes.scenario.json) | repeated-boundaries | PC-MESSAGE-05 | `pingScope` is delivered; both inner tasks complete, closing the Sub-Process; `pingScope` is delivered again; the handler and `After_Scope` complete. |
| [receive-repeated-then-message](receive-repeated-then-message.scenario.json) | repeated-boundaries | PC-MESSAGE-05 | `pingReceive` is delivered twice, the Receive Task's own Message is delivered, `pingReceive` is delivered again, and the handlers complete. |

## Notes for the target runners

- A non-interrupting Message boundary keeps its identity after a delivery, so every delivery names the boundary's first activation; a handler is addressed by the activation of its Human Task, counted per begun occurrence.
- A schedule names one region's stimuli; the other regions stay open and no schedule ends the Process instance.

The schedules carry no expected route, open wait, variable or Process state; the retained CIB evidence is the answer.
