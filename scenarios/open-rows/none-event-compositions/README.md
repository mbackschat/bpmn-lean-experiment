# None Start, None Throw and None End compositions

Answer-free schedules for [PC-BASIC-01](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): Start Events with several outgoing flows, an Intermediate None Throw, concurrent None Ends, root-versus-child completion, and the root and Sub-Process start combinations the row refuses. The [flow semantics](../../../docs/kernel/semantics/FLOW-SEMANTICS-SPEC.md#arrival-and-leaving) and [propagation semantics](../../../docs/kernel/semantics/PROPAGATION-SEMANTICS-SPEC.md) own the meaning; these inputs only exercise it, and the retained CIB Seven `2.2.0` answer is the row's target. The profile is `cibseven-2.2.0` with no source overlay.

## Models

| Model | What it holds |
|---|---|
| [start-split](start-split.bpmn) | A None Start with two outgoing flows, to the User Task *Prepare* and to *Notify*. *Prepare* is followed by a None Throw *Prepared* and the Sub-Process *Execute*, whose own Start has two outgoing flows to *Step one* and *Step two*, each to its own None End. *Prepare* and *Notify* each end in a None End of the process. |
| [two-none-starts](two-none-starts.bpmn) | A process with two None Start Events, each leading to its own User Task and End. |
| [subprocess-two-starts](subprocess-two-starts.bpmn) | A Sub-Process with two None Start Events, each leading to its own User Task and End. |
| [none-and-timer-starts](none-and-timer-starts.bpmn) | A process with a None Start Event and a Timer Start Event (`timeDate`, UTC), each leading to its own User Task and End. |

## Schedules

| Schedule | Model | Case it separates |
|---|---|---|
| [prepare-first](start-split-prepare-first.scenario.json) | start-split | *Prepare* and *Step one* complete before *Notify* and *Step two*. |
| [notify-first](start-split-notify-first.scenario.json) | start-split | *Notify* completes first, then *Prepare*, then the Sub-Process's tasks in reverse order. |
| [start](two-none-starts-start.scenario.json) | two-none-starts | The start alone, which is where CIB meets the deployment. |
| [start](subprocess-two-starts-start.scenario.json) | subprocess-two-starts | The start alone, which is where CIB meets the deployment. |
| [start](none-and-timer-starts-start.scenario.json) | none-and-timer-starts | The start alone, which is where CIB meets the deployment. |

The three refusal models are the witnesses for the "unsupported root/start combinations" clause of the row; the [coverage target](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md) states the pinned CIB account of start combinations.

The schedules carry no expected state; the retained CIB evidence is the answer.
