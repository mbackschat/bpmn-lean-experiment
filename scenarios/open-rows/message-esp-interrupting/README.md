# Interrupting Message Event Sub-Processes

Answer-free schedules for [PC-MESSAGE-06](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): an interrupting Message Event Sub-Process at the Process level and inside a Sub-Process, the ordinary work it cancels, the parent context its handler reads, a payload written to a Property, and what the handler's completion does to the cancelled work's continuation. The [subscriptions semantics](../../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md) own the meaning; the retained CIB Seven `2.2.0` answer is the target. The model is project-authored MIT source for the `cibseven-2.2.0` profile with no source overlay.

## Models

| Model | What it holds |
|---|---|
| [interrupting-handlers.bpmn](interrupting-handlers.bpmn) | The Process runs the Human Task `Work`, the Sub-Process `Region` over the Human Task `Inner`, and the Human Task `Finish`. The Process declares an interrupting Message Event Sub-Process `ESP_Cancel` (Message `cancelOrder`, Start Event `Start_Cancel` writing a payload into Property `Property_Reason`) whose handler is the Human Task `Cancel_Handler`, which reads the Process variable `orderRef` through an input mapping. `Region` declares an interrupting `ESP_RegionAbort` (Message `abortRegion`, Start Event `Start_RegionAbort` writing Property `Property_AbortNote`) with the handler `Abort_Handler`. |

## Schedules

| Schedule | Model | Row | Case it exercises |
|---|---|---|---|
| [process-cancel-while-work-open](process-cancel-while-work-open.scenario.json) | interrupting-handlers | PC-MESSAGE-06 | `cancelOrder` is delivered with a payload while `Work` is open; `Work` is then addressed, the handler completes, and `Finish` is addressed. |
| [process-cancel-without-payload](process-cancel-without-payload.scenario.json) | interrupting-handlers | PC-MESSAGE-06 | `cancelOrder` is delivered with no payload, then with one. |
| [process-cancel-inside-region](process-cancel-inside-region.scenario.json) | interrupting-handlers | PC-MESSAGE-06 | `Work` completes and `Region` starts; `cancelOrder` is delivered while `Inner` is open; `Inner` is addressed and the handler completes. |
| [region-abort-while-inner-open](region-abort-while-inner-open.scenario.json) | interrupting-handlers | PC-MESSAGE-06 | `Work` completes; `abortRegion` is delivered with a payload while `Inner` is open; `Inner` is addressed, the handler completes, and `Finish` completes. |
| [region-completes-first](region-completes-first.scenario.json) | interrupting-handlers | PC-MESSAGE-06 | `Work` and `Inner` complete; `abortRegion` is then delivered and `Finish` completes. |

## Notes for the target runners

- Every schedule addresses an Event Sub-Process start, which the CIB runner numbers through a host that has no activity instance before the start fires.
- A schedule that delivers a payload uses a `deliver` payload, which the CIB runner does not send because CIB's Message carries only variables; the retained CIB evidence is the answer.
- `orderRef` is the String Process variable the start supplies; the handler's input mapping publishes it as `orderSeen`.

The schedules carry no expected route, open wait, variable or Process state; the retained CIB evidence is the answer.
