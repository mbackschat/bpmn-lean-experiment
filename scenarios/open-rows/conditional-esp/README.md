# Conditional Event Sub-Processes

Answer-free schedules for [PC-CONDITION-05](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): interrupting and non-interrupting Conditional Event Sub-Processes at the Process level, inside a Sub-Process and inside a called Process, a listener that fires repeatedly, one command that creates handlers in two scopes, a listener whose scope has ended, and a handler whose own start writes the variable that triggers it again, bounded by its predicate. Conditional events re-evaluate on variable changes, which these schedules drive with `setVariables` commands. The [subscriptions semantics](../../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md) own the meaning; the retained CIB Seven `2.2.0` answer is the target. The model is project-authored MIT source for the `cibseven-2.2.0` profile with no source overlay.

## Models

| Model | What it holds |
|---|---|
| [conditional-handlers.bpmn](conditional-handlers.bpmn) | After a Parallel fork two regions run: `Work` then `Finish`, and the Sub-Process `Region` over the Human Task `Inner`. The Process declares a non-interrupting Conditional Event Sub-Process `ESP_Alert` (`${level > 5}`, variable `level`, handler `Handle_Alert`), an interrupting `ESP_Stop` (`${stop == true}`, handler `Handle_Stop`) and a non-interrupting `ESP_Cycle` (`${cycle > 0 && cycle < 3}`, variable `cycle`) runs the asynchronous Service Task `Write_Cycle`, whose output mapping writes the Process variable `cycle` from the effect's `cycleNext`. `Region` declares a non-interrupting `ESP_RegionAlert` (`${regionLevel > 5}`, handler `Handle_RegionAlert`). A start is addressed by its Start Event. |
| [chain-handlers.bpmn](chain-handlers.bpmn) | The Human Tasks `Work` and `Finish` in sequence, with a non-interrupting Conditional Event Sub-Process `ESP_Chain` (`${chain > 0 && chain < 4}`, variable `chain`, Start Event `Start_Chain`) whose handler `Handle_Chain` is a Human Task whose input mapping `step` evaluates `${execution.setVariable('chain', chain + 1)}`, so each handler start writes `chain`. |
| [called-handlers.bpmn](called-handlers.bpmn) | After a Parallel fork the Call `Call_Child` of `Process_ConditionalChild` (followed by `After_Call`) runs beside the Human Task `Work_Parent`. `Process_ConditionalChild` runs the Human Task `Child_Work` and declares a non-interrupting Conditional Event Sub-Process `ESP_Child` (`${childLevel > 5}`, variable `childLevel`, handler `Child_Alert`). |

## Schedules

| Schedule | Model | Row | Case it exercises |
|---|---|---|---|
| [process-alert-repeats](process-alert-repeats.scenario.json) | conditional-handlers | PC-CONDITION-05 | `level` is created as 6 and updated to 7 on `Work`; the second handler and the first complete, then `Work` and `Finish`. |
| [process-stop-interrupts](process-stop-interrupts.scenario.json) | conditional-handlers | PC-CONDITION-05 | `stop` is created as `true` on `Work`; `Work` is then addressed and the handler completes. |
| [one-command-two-scopes](one-command-two-scopes.scenario.json) | conditional-handlers | PC-CONDITION-05 | One command writes `level` and `regionLevel` as 6 together; both handlers complete. |
| [region-ended-before-write](region-ended-before-write.scenario.json) | conditional-handlers | PC-CONDITION-05 | `Inner` completes, ending `Region`; `regionLevel` is then created as 9 on `Work`, and `Finish` is addressed. |
| [handler-writes-bounded-chain](handler-writes-bounded-chain.scenario.json) | chain-handlers | PC-CONDITION-05 | `chain` is created as 1 on `Work`; the three chain handlers are addressed in turn. |
| [handler-writes-through-effect-result](handler-writes-through-effect-result.scenario.json) | conditional-handlers | PC-CONDITION-05 | `cycle` is created as 1 on `Work`; the first handler's effect answers with `cycleNext` 2 and the second's with 3; a third effect result is then addressed. |
| [called-instance-has-its-own-scope](called-instance-has-its-own-scope.scenario.json) | called-handlers | PC-CONDITION-05 | `childLevel` is created as 9 on `Work_Parent` in the caller, then on the called `Child_Work`; the child's handler and `Child_Work` complete. |

## Notes for the target runners

- Every schedule addresses or depends on an Event Sub-Process start, which the CIB runner numbers through a host that has no activity instance before the start fires; the projection can fail as a harness failure until the runner names the declaring scope as the host.
- `handler-writes-bounded-chain` relies on an input mapping whose JUEL expression writes `chain` when a handler starts; the predicate `chain > 0 && chain < 4` ends the cascade after three handlers if every write re-triggers, so the schedule terminates in the engine whatever the scheduling. `handler-writes-through-effect-result` has no automatic write: each write is the output mapping of an effect result, and the predicate `cycle > 0 && cycle < 3` stops the sequence.
- A write is addressed to the open Human Task occurrence whose scope it is written in: `Work` for Process variables, `Work_Parent` and `Child_Work` of the called instance in the caller and the child. The called instance is addressed by the derived identity `call:10:Instance_1:10:Call_Child:1`.

The schedules carry no expected route, open wait, variable or Process state; the retained CIB evidence is the answer.
