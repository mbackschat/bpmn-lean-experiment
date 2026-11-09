# Outcome of an Error no handler catches

This directory serves [PC-ERROR-01](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): the defined outcome of a typed business failure whose code no boundary names, when the failing Service Task sits on the root path of the Process. [error-unhandled](../error-unhandled/README.md) already separates the unmatched failure inside a Sub-Process and the uncaught Error End; these schedules fix what CIB Seven `2.2.0` does at the root, where the instance state, the output mapping of the thrower and the other running paths could each be affected. The three models are project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer.

Every model has the async Service Task `Reserve`, a delegated effect answered by an `effectResult` stimulus, with one exact `STOCK_FROZEN` boundary that leads to the Human Task `ReleaseStock`. Every schedule fails `Reserve` with the code `OUT_OF_STOCK`, which the boundary does not name, so no handler matches.

| Model | Shape | Output mapping of `Reserve` |
|---|---|---|
| [single-path-plain](single-path-plain.bpmn) | `Reserve` is the only path of the root Process | none |
| [single-path-mapped](single-path-mapped.bpmn) | `Reserve` is the only path of the root Process | `reservation` from the local `result` |
| [fork-mapped](fork-mapped.bpmn) | a Parallel fork runs `Reserve` beside the Human Task `Audit` | `reservation` from the local `result` |

| Scenario | Model | Case it separates |
|---|---|---|
| [root-without-outputs](root-without-outputs.scenario.json) | single-path-plain | The unmatched failure on the only root path with no output mapping, so only the Process state it leaves is observed. |
| [root-last-path-with-outputs](root-last-path-with-outputs.scenario.json) | single-path-mapped | The same failure with an output mapping and an output patch that supplies `result`, so the mapping can read its source while the failure ends the last running path. |
| [parallel-root-branch-with-outputs](parallel-root-branch-with-outputs.scenario.json) | fork-mapped | The failure with an output mapping while `Audit` is open on the other branch, then completion of `Audit`, which bounds whether ending the throwing path ends the instance. |

The pair `root-without-outputs` and `root-last-path-with-outputs` differs only in the output mapping and its patch; the pair `root-last-path-with-outputs` and `parallel-root-branch-with-outputs` differs only in the sibling branch.

The schedules carry no expected outcome, route or Process state; the retained CIB evidence is the answer. A failure inside the command is a command outcome of the schedule, not a harness failure.
