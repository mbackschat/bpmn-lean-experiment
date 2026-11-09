# Error Event Sub-Process recovery of a region

This directory serves [PC-ERROR-02](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): what an interrupting Error Event Sub-Process (ESP) does to the ordinary work of its region and to the context of the enclosing scopes. Both models are project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer.

The Process variable `orderRef` is supplied at the start of every schedule.

The [region model](region-recovery.bpmn) declares the local `regionNote` on the Sub-Process `Region` through an input mapping. `Region` forks into the Human Task `OrdinaryWork` and the Human Task `TriggerFailure`, which ends in an Error End `REGION_FAILED`. An interrupting ESP for that code runs the Human Task `Recover`. After the Sub-Process the Human Task `AfterRegion` follows.

The [process model](process-recovery.bpmn) forks the Process itself into `OrdinaryWork` and `TriggerFailure`, which ends in an Error End `PROCESS_FAILED`, with an interrupting ESP at Process level that runs `Recover`.

| Scenario | Model | Case it exercises |
|---|---|---|
| [recover-and-continue](recover-and-continue.scenario.json) | region | The failure while the ordinary work is open, then completion of the handler and of the Human Task after the region. |
| [stale-ordinary-after-recovery](stale-ordinary-after-recovery.scenario.json) | region | A completion of the ordinary work addressed after the handler took over. |
| [process-level-recovery](process-level-recovery.scenario.json) | process | The failure while the ordinary work is open under an ESP of the Process, then completion of the handler. |

The schedules carry no expected route, variable or Process state; the retained CIB evidence is the answer.
