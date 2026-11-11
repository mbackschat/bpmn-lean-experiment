# Transaction success and Error exits

This directory serves [PC-TX-01](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) (a Transaction that completes is ordinary completion) and the Error exits of compensable Sub-Processes and Transactions: an Error End Event that leaves a Transaction, and one that leaves a plain Sub-Process holding a completed compensable Task. The three models are project-authored MIT source for both the `cibseven-2.2.0` profile and, through the `-standards` schedules, the [`bpmn-2.0.2` profile](../../../profiles/bpmn-2.0.2/README.md); every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer for the `cibseven-2.2.0` ones.

## Models

| Model | Shape |
|---|---|
| [completes-while-boundary-path-runs](completes-while-boundary-path-runs.bpmn) | The Transaction `Transaction_Work` runs `UserTask_Work`. A non-interrupting `PT10S` Timer Boundary Event on it leads to `UserTask_Side`. The Transaction leads to `UserTask_Done`. |
| [error-end-in-transaction](error-end-in-transaction.bpmn) | The Sub-Process `SubProcess_Outer` holds the Transaction `Transaction_Work`, which runs `UserTask_Work` (Compensation Boundary Event, handler `UserTask_UndoWork`) and `UserTask_Check` into an Error End Event. An Error Boundary Event on `SubProcess_Outer` for that code leads to `UserTask_Caught`; `SubProcess_Outer` leads to `UserTask_Settle`. |
| [error-end-in-subprocess](error-end-in-subprocess.bpmn) | The plain Sub-Process `SubProcess_Work` runs `UserTask_Work` (Compensation Boundary Event, handler `UserTask_UndoWork`) and `UserTask_Check` into an Error End Event. An Error Boundary Event on `SubProcess_Work` leads to `UserTask_Caught`, an untargeted Intermediate Compensation throw and `UserTask_Compensated`; `SubProcess_Work` leads to `UserTask_Settle`. |

## Schedules

| Schedule | Model | Journey | Question it separates |
|---|---|---|---|
| [transaction-completes-while-boundary-path-runs](transaction-completes-while-boundary-path-runs.scenario.json), [-standards](transaction-completes-while-boundary-path-runs-standards.scenario.json) | completes-while-boundary-path-runs | The Timer fires at 10 000 ms; `UserTask_Work`, `UserTask_Done` and `UserTask_Side` complete. | Does a Transaction's success touch the path its boundary started outside it? |
| [error-end-in-transaction](error-end-in-transaction.scenario.json), [-standards](error-end-in-transaction-standards.scenario.json) | error-end-in-transaction | `UserTask_Work` and `UserTask_Check` complete (the Error is raised); `UserTask_UndoWork` and `UserTask_Settle` are attempted; then `UserTask_Caught`. | Is the compensable work inside a Transaction that an Error leaves compensated? |
| [error-end-in-subprocess](error-end-in-subprocess.scenario.json), [-standards](error-end-in-subprocess-standards.scenario.json) | error-end-in-subprocess | `UserTask_Work` and `UserTask_Check` complete; `UserTask_UndoWork` is attempted; `UserTask_Caught` completes and the throw follows; `UserTask_UndoWork` and `UserTask_Settle` are attempted; then `UserTask_Compensated`. | Is the completed compensable work of a plain Sub-Process that an Error leaves compensated at once, retained for the later throw on the boundary path, or dropped? |

The schedules carry no expected open wait, handler or Process state; the retained CIB evidence is the answer. The `-standards` schedules select no CIB oracle.
