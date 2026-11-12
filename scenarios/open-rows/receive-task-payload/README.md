# A Receive Task's payload written through its Data Output

Answer-free schedules for [PC-HUM-03](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): a Message Receive Task inside a Sub-Process whose one Data Output's association writes the delivered payload into the Sub-Process's Property, which the next Human Task reads through its Data Input; and a payload-free delivery to that task. The [work semantics](../../../docs/kernel/semantics/WORK-SEMANTICS-SPEC.md#receive-tasks) own the meaning; the retained CIB Seven `2.2.0` answer is the target. The model is project-authored MIT source for the `cibseven-2.2.0` profile with no source overlay.

## Models

| Model | What it holds |
|---|---|
| [receive-payload.bpmn](receive-payload.bpmn) | A None Start, the Sub-Process `Region` declaring Property `Property_Note` (`ItemDefinition_Note`, `xsd:string`), and a None End. `Region` runs the Receive Task `Await_Note` on the Message `note` (`Message_Note`, of the same ItemDefinition), whose Data Output `DataOutput_Await_Note` is associated to `Property_Note`, then the Human Task `Inspect_Note`, whose Data Input `DataInput_Inspect_Note` reads `Property_Note`. |

## Schedules

| Schedule | Model | Row | Case it exercises |
|---|---|---|---|
| [into-scope](into-scope.scenario.json) | receive-payload | PC-HUM-03 | `Await_Note` is delivered the String payload `checked`; `Inspect_Note` then completes. |
| [payload-required](payload-required.scenario.json) | receive-payload | PC-HUM-03 | `Await_Note` is delivered with no payload, then with the String payload `checked`; `Inspect_Note` then completes. |

## Notes for the target runners

- Every schedule with a `payload` uses a `deliver` payload, which the CIB runner does not realize: CIB's Message carries only variables.
