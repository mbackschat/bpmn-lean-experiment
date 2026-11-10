# An Error rethrown from a Sub-Process nested in its handler

This directory serves [PC-ERROR-02](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): a rethrow raised deeper than directly inside the Event Sub-Process (ESP) that caught it ([propagation semantics](../../../docs/kernel/semantics/PROPAGATION-SEMANTICS-SPEC.md#pc-error-02-rethrow-from-an-event-sub-process)). The [nested-rethrow model](nested-rethrow.bpmn) is project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer. The rethrow from directly inside the handler is in [error-event-subprocess-rethrow](../error-event-subprocess-rethrow/README.md).

The Sub-Process `Wrap` runs `Work` and an Error End `RAW`, and carries an interrupting exact `RAW` boundary leading to `Recover`. Its interrupting exact `RAW` ESP runs the embedded Sub-Process `Translate`, whose `Inspect` leads to a second Error End `RAW`.

| Scenario | Case it exercises |
|---|---|
| [rethrow-from-nested-sub-process](rethrow-from-nested-sub-process.scenario.json) | `Work` raises `RAW`, the ESP catches it, and `Inspect` raises `RAW` again from inside `Translate`. |

The schedule carries no expected route or Process state; the retained CIB evidence is the answer.
