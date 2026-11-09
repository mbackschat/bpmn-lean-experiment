# Signal boundaries and Event Sub-Processes

Answer-free schedules for [PC-SIGNAL-03](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): Signal boundaries and Event Sub-Processes in both interruption modes, a non-interrupting handler repeated, an interrupting receiver that cancels the region that emitted the Signal, and the lifetime of Signal subscriptions under a Multi-Instance body and a Call Activity. The Signal throw and Signal catch witnesses of PC-SIGNAL-01 are [signal-throw-literal](../signal-throw-literal/README.md). The [subscriptions semantics](../../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md) own the meaning; the retained CIB Seven `2.2.0` answer is the target. A delivery names the Signal by its `name` and the subscription it is addressed to. The model is project-authored MIT source for the `cibseven-2.2.0` profile with no source overlay.

## Models

| Model | What it holds |
|---|---|
| [signal-subscriptions.bpmn](signal-subscriptions.bpmn) | After a Parallel fork six regions run side by side. *User*: `Host_User` with the interrupting `Cancel_User` (`cancel`) to `Handle_Cancel` and the non-interrupting `Note_User` (`note`) to `Handle_Note`, normal completion to `After_User`. *Emitter*: the Sub-Process `Region` runs the Human Task `Inner`, the Intermediate Signal throw `Throw_Stop` (`stop`) and the Human Task `Inner_After`; an interrupting boundary `Stop_Region` (`stop`) on `Region` leads to `Handle_Stop`, and normal completion to `After_Region`. *Outside receiver*: the Signal catch `Catch_Stop` (`stop`) leads to `Proceed_Stop`. *Event Sub-Processes*: the Sub-Process `Region_Esp` runs the Human Task `Work_Esp` and declares a non-interrupting `ESP_Alert` (`alert`, Start Event `Start_Alert`, handler `Handle_Alert`) and an interrupting `ESP_Abort` (`abort`, Start Event `Start_Abort`, handler `Handle_Abort`). *Multi-Instance*: the parallel Sub-Process `Bodies` over the String list `items`, each body the Human Task `Inner_Body` with a non-interrupting `Ping_Body` (`ping`) to `Handle_Ping_Body`. *Call*: `Host_Call` of `Process_Child` (`Child_Work`) with an interrupting `Quit_Call` (`quit`) to `Handle_Quit`. |

## Schedules

| Schedule | Model | Row | Case it exercises |
|---|---|---|---|
| [task-note-repeated-then-cancel](task-note-repeated-then-cancel.scenario.json) | signal-subscriptions | PC-SIGNAL-03 | `note` is delivered twice, then `cancel`; the handlers complete and `note` is delivered once more. |
| [task-cancel-first](task-cancel-first.scenario.json) | signal-subscriptions | PC-SIGNAL-03 | `cancel` is delivered; `note` is then delivered and the cancellation handler completes. |
| [task-wrong-signal-name](task-wrong-signal-name.scenario.json) | signal-subscriptions | PC-SIGNAL-03 | `note` is delivered to the `cancel` boundary, then `cancel`. |
| [emitter-region-cancelled-by-its-own-throw](emitter-region-cancelled-by-its-own-throw.scenario.json) | signal-subscriptions | PC-SIGNAL-03 | `Inner` completes and the throw runs; `Inner_After`, the handler and the outside receiver's task are then addressed. |
| [region-delivery-and-throw-in-turn](region-delivery-and-throw-in-turn.scenario.json) | signal-subscriptions | PC-SIGNAL-03 | `stop` is delivered to the outside receiver, then `Inner` completes and the throw runs; the handler and `Inner_After` are addressed. |
| [event-subprocess-modes](event-subprocess-modes.scenario.json) | signal-subscriptions | PC-SIGNAL-03 | `alert` is delivered twice, then `abort`; the guarded task, then the handlers, are addressed. |
| [event-subprocess-alert-then-completion](event-subprocess-alert-then-completion.scenario.json) | signal-subscriptions | PC-SIGNAL-03 | `alert` is delivered, the guarded task completes, `abort` is delivered, then the alert handler completes. |
| [bodies-ping-isolation](bodies-ping-isolation.scenario.json) | signal-subscriptions | PC-SIGNAL-03 | `ping` is delivered to body 2, the handler completes, `ping` is delivered to body 1, body 1's task completes, `ping` is delivered to body 1 again, and body 2's task completes. |
| [call-quit-while-child-open](call-quit-while-child-open.scenario.json) | signal-subscriptions | PC-SIGNAL-03 | `quit` is delivered while the called `Child_Work` is open; `Child_Work` is then addressed and the handler completes. |
| [call-child-completes-first](call-child-completes-first.scenario.json) | signal-subscriptions | PC-SIGNAL-03 | The called `Child_Work` completes; `quit` is then delivered and `After_Call` completes. |

## Notes for the target runners

- A delivery addresses one subscription by occurrence; the throw in `Region` is not a stimulus, it happens when `Inner` completes.
- A schedule names one region's stimuli; the other regions stay open and no schedule ends the Process instance. `items` is the String list `a, b` in every schedule that starts the Multi-Instance region.
- `Start_Alert` and `Start_Abort` are Event Sub-Process starts, which the CIB runner numbers through a host that has no activity instance before the start fires; `Region_Esp` arms them at the fork, so every schedule of this model can fail as a harness failure until the runner names the declaring scope as the host.
- The called instance is addressed by the derived identity `call:10:Instance_1:9:Host_Call:1`.

The schedules carry no expected route, open wait, variable or Process state; the retained CIB evidence is the answer.
