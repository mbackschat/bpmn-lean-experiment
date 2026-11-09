# Error rethrown from an Error Event Sub-Process

This directory serves [PC-ERROR-02](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): an Error End inside an interrupting Error Event Sub-Process (ESP), thrown with the handler's own code and with another code, and whether the handler that is running or already disposed takes part in the search for its catcher. The [relay model](relay-and-wrap.bpmn) is project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer.

The Sub-Process `Core` runs the Service Task `Work`, answered by `effectResult`, and holds two interrupting ESPs: `Handler_Core_Raw` catches `RAW_FAILURE` and, after the Human Task `Translate_Raw`, ends in an Error End with the same code; `Handler_Core_Other` catches `OTHER_FAILURE` and, after `Translate_Other`, ends in an Error End `WRAPPED_FAILURE`. The enclosing Sub-Process `Wrapper` has an exact boundary for each of `RAW_FAILURE` and `WRAPPED_FAILURE`, each leading to its own Human Task.

| Scenario | Case it exercises |
|---|---|
| [same-code-rethrow](same-code-rethrow.scenario.json) | `Work` fails with `RAW_FAILURE`, the handler's translation completes, and the handler ends in the same code. |
| [different-code-rethrow](different-code-rethrow.scenario.json) | `Work` fails with `OTHER_FAILURE`, the handler's translation completes, and the handler ends in another code. |

The schedules carry no expected route or Process state; the retained CIB evidence is the answer.
