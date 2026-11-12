# Conditional predicates on variable creation, update and deletion

Answer-free schedules for [PC-CONDITION-01](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): when a Conditional predicate is evaluated (at the listener's entry and on variable creation, update and deletion), how the variable-name and event filters select writes, whether a same-value update counts, which scope's variable the predicate reads, what a failing evaluation does to the write that caused it, and how an absent variable, a present null and `false` differ. Conditional events re-evaluate on variable changes, which these schedules drive with `setVariables` and `removeVariables` commands. The [subscriptions semantics](../../../docs/kernel/semantics/SUBSCRIPTIONS-SEMANTICS-SPEC.md) own the meaning; the retained CIB Seven `2.2.0` answer is the target. The model is project-authored MIT source for the `cibseven-2.2.0` profile with no source overlay.

## Models

| Model | What it holds |
|---|---|
| [evaluation.bpmn](evaluation.bpmn) | After a Parallel fork two Human Tasks run. `Host` carries seven non-interrupting Conditional boundaries, each leading to its own handler Human Task `Handle_*`: `Cond_Create` (`${amount > 100}`, variable `amount`, event `create`), `Cond_Update` (the same predicate, event `update`), `Cond_Any` (`${flag == true}`, no filter), `Cond_Delete` (`${!execution.hasVariable('note')}`, variable `note`, event `delete`), `Cond_Null` (`${status == null}`, variable `status`), `Cond_False` (`${approved == false}`, variable `approved`) and `Cond_NonBoolean` (`${level}`, variable `level`). `Host_Local` declares the local variable `level2` (input mapping, value 0) and carries `Cond_Local` (`${level2 > 5}`, variable `level2`). |
| [evaluation-portable.bpmn](evaluation-portable.bpmn) | `evaluation.bpmn` with `Cond_Delete`'s predicate replaced by `${phase == 'cleanup'}` (still variable `note`, event `delete`). The original predicate names `execution`, which the kernel's JUEL levels refuse at admission, so the kernel answers every schedule of `evaluation.bpmn` with a whole-model refusal; this model keeps the other seven boundaries byte-identical and lets the kernel answer them. |
| [edge-each-write.bpmn](edge-each-write.bpmn) | A None Start and the Human Task `Host` with one non-interrupting Conditional boundary `Cond_Level` (`${level > 100}`, no variable filter) to the Human Task `Handle_Level`. |
| [edge-each-write-standards.bpmn](edge-each-write-standards.bpmn) | The same shape for the `bpmn-2.0.2` profile: the Definitions declare the Simple Boolean language, the Process declares the property `level`, and the predicate is `stringEquals(level,"high")`. It carries no `camunda:` attribute. |
| [write-order.bpmn](write-order.bpmn) | After a Parallel fork the Human Task `Work` runs beside the Sub-Process `Region`, which holds the Conditional catch `Catch_Level` (`${level > 5}`, variable `level`), the Task `Mark_Catch` (output `winner` is `catch`) and the Human Task `Hold_Catch`. The Process declares a non-interrupting Conditional Event Sub-Process `ESP_Level` with the same predicate and filter, whose Task `Mark_Esp` writes `winner` as `listener` before the Human Task `Hold_Esp`. |
| [shadowed-filter.bpmn](shadowed-filter.bpmn) | After a Parallel fork the Human Tasks `Host` and `Host_Local` run side by side. `Host_Local` declares the local `level2` (input mapping, value 0) and carries the non-interrupting Conditional boundary `Cond_Shadow` (`${level > 5}`, variable `level2`) to the Human Task `Handle_Shadow`. |
| [short-circuit.bpmn](short-circuit.bpmn) | A None Start, the Conditional catch `Catch_Short` (`${b == 2 || a == 1}`, no filter) and the Human Task `Proceed_Short`. |

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
| [portable-entry-true](portable-entry-true.scenario.json) | evaluation-portable | PC-CONDITION-01 | As `entry-true`. |
| [portable-create-true](portable-create-true.scenario.json) | evaluation-portable | PC-CONDITION-01 | As `create-true`. |
| [portable-create-false-then-update-true](portable-create-false-then-update-true.scenario.json) | evaluation-portable | PC-CONDITION-01 | As `create-false-then-update-true`. |
| [portable-delete-and-recreate](portable-delete-and-recreate.scenario.json) | evaluation-portable | PC-CONDITION-01 | `phase` is created as `cleanup` on `Host`, a write `Cond_Delete`'s filters do not select; `note` is then removed, which the filters select, and written again, which they do not. |
| [portable-unrelated-write-with-absent-variables](portable-unrelated-write-with-absent-variables.scenario.json) | evaluation-portable | PC-CONDITION-01 | As `unrelated-write-with-absent-variables`. |
| [portable-null-and-false-values](portable-null-and-false-values.scenario.json) | evaluation-portable | PC-CONDITION-01 | As `null-and-false-values`. |
| [portable-non-boolean-result](portable-non-boolean-result.scenario.json) | evaluation-portable | PC-CONDITION-01 | As `non-boolean-result`. |
| [portable-nearest-visible-scope](portable-nearest-visible-scope.scenario.json) | evaluation-portable | PC-CONDITION-01 | As `nearest-visible-scope`. |
| [edge-versus-each-write](edge-versus-each-write.scenario.json) | edge-each-write | PC-CONDITION-04 | `level` is written as 150, 150, 50 and 150 on `Host`. Separates a boundary that fires on every write that finds the predicate true (three firings) from one that fires when the predicate becomes true (two). |
| [edge-versus-each-write-standards](edge-versus-each-write-standards.scenario.json) | edge-each-write-standards | PC-CONDITION-04 | The `bpmn-2.0.2` profile with `level` written as `high`, `high`, `low` and `high` on `Host`. Separates the same two readings under the standards profile. No CIB evidence: CIB cannot read Simple Boolean. |
| [two-items-one-write-order](two-items-one-write-order.scenario.json) | write-order | PC-CONDITION-03 | `winner` is `none` at the start; `level` is created as 9 on `Work`, a write both the region's catch and the Process-level listener read. The last writer of `winner` shows which path ran last. Separates the outermost item first from the reverse order. |
| [filter-on-shadowed-name](filter-on-shadowed-name.scenario.json) | shadowed-filter | PC-CONDITION-04 | `level` is 1 at the start; one command writes `level` as 9 and `level2` as 1 on `Host`, then `level2` is written as 2 on `Host_Local`, which declares it locally. Separates a write offered to every item of the owner scope's subtree by name from one withheld where the name is shadowed. |
| [short-circuit-absent](short-circuit-absent.scenario.json) | short-circuit | PC-CONDITION-01 | `a` is never written; `b` is written as 2 on the catch, which then completes `Proceed_Short`. Separates an absent variable the predicate does not reach from one that makes the predicate fail. |

## Notes for the target runners

- Every schedule supplies the String variable `note` at the start, so that `Cond_Delete` has a variable to lose; `note` is the only variable a start supplies except where a schedule says otherwise.
- A write is addressed to the open Human Task occurrence whose scope it is written in: `Host` for Process variables, `Host_Local` for the local `level2`.
- A command that fails ends the run at it.
- The schedules of the five models above supply no `note`; `edge-versus-each-write-standards` is the only schedule here for a profile other than `cibseven-2.2.0` and carries no CIB provenance.

The schedules carry no expected route, open wait, variable or Process state; the retained CIB evidence is the answer.
