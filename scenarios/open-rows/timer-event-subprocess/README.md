# Timer Event Sub-Processes

Answer-free schedules for [PC-TIMER-07](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): interrupting and non-interrupting Timer Event Sub-Processes with duration, date and cycle values, several distinct handlers beside one another, overlapping handlers of a repeated start, interruption of ordinary work, and what the parent's completion does to dormant listeners. The [subscriptions semantics](../../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md) own the meaning; the retained CIB Seven `2.2.0` answer is the target. The model is project-authored MIT source for the `cibseven-2.2.0` profile with no source overlay.

## Models

| Model | What it holds |
|---|---|
| [timer-handlers.bpmn](timer-handlers.bpmn) | The Process runs the Human Task `Work`, the Sub-Process `Region` over the Human Task `Inner`, and the Human Task `Finish`. The Process declares a non-interrupting Event Sub-Process `ESP_Reminder` (cycle `R3/PT10S`, handler `Remind`), a non-interrupting `ESP_Dated` (date `1970-01-01T00:00:12Z`, handler `Dated_Note`) and an interrupting `ESP_Abort` (`PT25S`, handler `Abort_Handler`). `Region` declares a non-interrupting `ESP_Region` (`PT7S`, handler `Note_Region`). A Timer start is addressed by its Start Event. |

## Schedules

| Schedule | Model | Row | Case it exercises |
|---|---|---|---|
| [cycle-handlers-overlap-past-the-ordinary-path](cycle-handlers-overlap-past-the-ordinary-path.scenario.json) | timer-handlers | PC-TIMER-07 | `Start_Reminder` fires at 10,000; the ordinary path runs to the end of `Finish`; a second reminder is fired at 20,000; the handlers complete in order and a third reminder is attempted at 30,000. |
| [interrupting-start-cancels-work](interrupting-start-cancels-work.scenario.json) | timer-handlers | PC-TIMER-07 | `Start_Abort` fires at 25,000 while `Work` is open; `Work` is then addressed, `Start_Reminder` is fired at 10,000, and the handler completes. |
| [dated-start-beside-ordinary-work](dated-start-beside-ordinary-work.scenario.json) | timer-handlers | PC-TIMER-07 | `Start_Dated` fires at 12,000; its handler, `Work`, `Inner` and `Finish` complete. |
| [nested-listener-ends-with-its-region](nested-listener-ends-with-its-region.scenario.json) | timer-handlers | PC-TIMER-07 | `Work` completes and enters `Region`; `Start_Region_Note` fires at 7,000; `Inner` and the handler complete, closing `Region`; the same Timer is fired again and `Finish` completes. |

## Notes for the target runners

- Every schedule uses an Event Sub-Process start, which the CIB runner numbers through a host that has no activity instance before the start fires; the projection can fail as a harness failure until the runner names the declaring scope as the host.
- `Start_Reminder` successors use the kernel's numbering (activation 2 for the second period); the CIB runner numbers an attached subscription by its host's activation.
- `ESP_Region` is armed when `Region` is entered, which is the command that completes `Work`.

The schedules carry no expected route, open wait, variable or Process state; the retained CIB evidence is the answer.
