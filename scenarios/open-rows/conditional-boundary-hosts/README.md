# Conditional boundaries on every kind of host

Answer-free schedules for [PC-CONDITION-04](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): Conditional boundaries in both modes on a Human Task, a Sub-Process, a Call Activity, an asynchronous Service Task and both Multi-Instance forms, two predicates that one write makes eligible together, handlers that repeat, a boundary that reads a variable the host's own completion or a called child's return writes, and a write local to a body that a boundary on another scope reads. Conditional events re-evaluate on variable changes, which these schedules drive with `setVariables` commands and completions. The [subscriptions semantics](../../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md) own the meaning; the retained CIB Seven `2.2.0` answer is the target. The model is project-authored MIT source for the `cibseven-2.2.0` profile with no source overlay.

## Models

| Model | What it holds |
|---|---|
| [conditional-hosts.bpmn](conditional-hosts.bpmn) | After a Parallel fork nine regions run side by side. *Level*: `Host_Level` with the non-interrupting `Warn_Level` (`${level > 5}`) to `Handle_Warn` and the interrupting `Stop_Level` (`${level > 8}`) to `Handle_Stop_Level`, normal completion to `After_Level`. *Writer*: the Human Task `Writer`, a place to write Process variables from. *Watcher*: `Watcher` with a non-interrupting `Done_Watch` (`${done == true}`) to `Handle_Done`. *Self*: `Host_Self` with an interrupting `Self_Cond` (`${closed == true}`) to `Handle_Self`. *Bodies*: the parallel Sub-Process `Bodies` over the String list `items`, each body the Human Task `Body_Task` with the body-local variable `phase` (input mapping `open`), under an interrupting `Outer_Cond` (`${phase == 'closed'}`) to `Handle_Outer`. *Call*: `Host_Call` of `Process_Child` (the Human Task `Child_Work`, whose `verdict` is mapped out to `approval`) with a non-interrupting `Call_Cond` (`${pause == true}`) to `Handle_Pause`. *Approval*: `Watcher_Call` with a non-interrupting `Approval_Cond` (`${approval == 'yes'}`) to `Handle_Approval`. *Multi-Instance task*: the parallel Human Task `Host_MiUser` over `items` with an interrupting `Halt_Mi` (`${halt == true}`) to `Handle_Halt_Mi`. *Effect*: the asynchronous Service Task `Host_Service` with a non-interrupting `Service_Cond` (`${poke == true}`) to `Handle_Poke`. |

## Schedules

| Schedule | Model | Row | Case it exercises |
|---|---|---|---|
| [level-both-eligible](level-both-eligible.scenario.json) | conditional-hosts | PC-CONDITION-04 | `level` is created as 9 on `Writer`, which makes both predicates on `Host_Level` true; the two handlers and the host are then addressed. |
| [level-repeated-handlers](level-repeated-handlers.scenario.json) | conditional-hosts | PC-CONDITION-04 | `level` is created as 6 and updated to 7; the second handler, the first, and the host complete. |
| [completion-write-reaches-sibling](completion-write-reaches-sibling.scenario.json) | conditional-hosts | PC-CONDITION-04 | `Writer` completes writing `done` as `true`; the handler of `Watcher` and `Watcher` then complete. |
| [completion-write-read-by-own-boundary](completion-write-read-by-own-boundary.scenario.json) | conditional-hosts | PC-CONDITION-04 | `Host_Self` completes writing `closed` as `true`; its handler and `After_Self` are then addressed. |
| [body-local-write-reads-another-scope](body-local-write-reads-another-scope.scenario.json) | conditional-hosts | PC-CONDITION-04 | `phase` is written as `closed` on body 1's `Body_Task`, where it is local, and then on `Writer`, at the Process level; the handler is addressed. |
| [call-return-write-reaches-watcher](call-return-write-reaches-watcher.scenario.json) | conditional-hosts | PC-CONDITION-04 | The called `Child_Work` completes with `verdict` `yes`, which the Call maps to `approval`; the watcher's handler and `Watcher_Call` then complete. |
| [call-host-condition-then-return](call-host-condition-then-return.scenario.json) | conditional-hosts | PC-CONDITION-04 | `pause` is created as `true` on `Writer` while the Call runs; the called `Child_Work`, the handler and `After_Call` complete. |
| [multi-instance-task-halt](multi-instance-task-halt.scenario.json) | conditional-hosts | PC-CONDITION-04 | `halt` is created as `true` on body 1; body 1 is then addressed and the handler completes. |
| [effect-host-condition](effect-host-condition.scenario.json) | conditional-hosts | PC-CONDITION-04 | `poke` is created as `true` on `Writer` before the effect has answered; the effect result is then delivered and the handler completes. |

## Notes for the target runners

- `items` is the String list `a, b` in every schedule; a body or inner task is addressed by activation, counted per begun occurrence.
- A write is addressed to the open Human Task occurrence whose scope it is written in: `Writer` for Process variables, `Body_Task` for the body-local `phase`.
- `Host_Service` is an asynchronous Service Task, answered by `effectResult`; the schedule that writes `poke` before the effect result tests whether the boundary is armed while the effect is pending.
- The called instance is addressed by the derived identity `call:10:Instance_1:9:Host_Call:1`.

The schedules carry no expected route, open wait, variable or Process state; the retained CIB evidence is the answer.
