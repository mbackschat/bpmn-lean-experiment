# Conditional predicates on variable creation, update and deletion

Answer-free schedules for [PC-CONDITION-01](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): when a Conditional predicate is evaluated (at the listener's entry and on variable creation, update and deletion), how the variable-name and event filters select writes, whether a same-value update counts, which scope's variable the predicate reads, what a failing evaluation does to the write that caused it, and how an absent variable, a present null and `false` differ. Conditional events re-evaluate on variable changes, which these schedules drive with `setVariables` and `removeVariables` commands. The [subscriptions semantics](../../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md) own the meaning; the retained CIB Seven `2.2.0` answer is the target. The model is project-authored MIT source for the `cibseven-2.2.0` profile with no source overlay.

## Models

| Model | What it holds |
|---|---|
| [evaluation.bpmn](evaluation.bpmn) | After a Parallel fork two Human Tasks run. `Host` carries seven non-interrupting Conditional boundaries, each leading to its own handler Human Task `Handle_*`: `Cond_Create` (`${amount > 100}`, variable `amount`, event `create`), `Cond_Update` (the same predicate, event `update`), `Cond_Any` (`${flag == true}`, no filter), `Cond_Delete` (`${!execution.hasVariable('note')}`, variable `note`, event `delete`), `Cond_Null` (`${status == null}`, variable `status`), `Cond_False` (`${approved == false}`, variable `approved`) and `Cond_NonBoolean` (`${level}`, variable `level`). `Host_Local` declares the local variable `level2` (input mapping, value 0) and carries `Cond_Local` (`${level2 > 5}`, variable `level2`). |

## Schedules

| Schedule | Model | Row | Case it exercises |
|---|---|---|---|
| [entry-true](entry-true.scenario.json) | evaluation | PC-CONDITION-01 | `amount` is 500 at the start, so the `amount` predicates are true when `Host` begins; `Host` then completes. |
| [create-true](create-true.scenario.json) | evaluation | PC-CONDITION-01 | `amount` is created as 150 on `Host`. |
| [create-false-then-update-true](create-false-then-update-true.scenario.json) | evaluation | PC-CONDITION-01 | `amount` is created as 50, updated to 150, then updated to 150 again. |
| [delete-and-recreate](delete-and-recreate.scenario.json) | evaluation | PC-CONDITION-01 | `note` is removed from `Host`, then written again. |
| [unrelated-write-with-absent-variables](unrelated-write-with-absent-variables.scenario.json) | evaluation | PC-CONDITION-01 | `other` is created on `Host`, a write no named filter selects, while `flag`, `status` and `approved` are absent. |
| [null-and-false-values](null-and-false-values.scenario.json) | evaluation | PC-CONDITION-01 | `status` is created as a present null, `approved` as a present null and then as `false`, `flag` as `false` and then as `true`. |
| [non-boolean-result](non-boolean-result.scenario.json) | evaluation | PC-CONDITION-01 | `level` is created as the Integer 3, so the predicate `${level}` is not Boolean. |
| [nearest-visible-scope](nearest-visible-scope.scenario.json) | evaluation | PC-CONDITION-01 | `level2` is created as 9 on `Host` at the Process level, then written as 9 on `Host_Local`, which declares it locally. |

## Notes for the target runners

- Every schedule supplies the String variable `note` at the start, so that `Cond_Delete` has a variable to lose; `note` is the only variable a start supplies except where a schedule says otherwise.
- A write is addressed to the open Human Task occurrence whose scope it is written in: `Host` for Process variables, `Host_Local` for the local `level2`.
- A command that fails ends the run at it.

The schedules carry no expected route, open wait, variable or Process state; the retained CIB evidence is the answer.
