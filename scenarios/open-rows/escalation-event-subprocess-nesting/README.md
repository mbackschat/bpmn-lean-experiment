# Escalation Event Sub-Process nesting and rethrow

This directory serves [PC-ESCALATION-03](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): propagation through nested Event Sub-Processes (ESP) and an Escalation thrown from inside the ESP that caught it. The [relay model](relay-chain.bpmn) is project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer. Modes and precedence are in [escalation-event-subprocess-modes](../escalation-event-subprocess-modes/README.md).

After a Parallel fork, two regions run side by side. Every handler is non-interrupting.

| Region | Ordinary work | Handlers |
|---|---|---|
| `Outer` ⊃ `Inner` | `Dig`, Intermediate throw `DEEP`, `Surface`, inside `Inner` | ESP exact `SHALLOW` in `Inner`; ESP exact `DEEP` in `Outer` |
| `Wrapper` ⊃ `Core` | `Work`, Intermediate throw `RAW`, `Done`, inside `Core` | ESP exact `RAW` in `Core`, which throws `RAW` again and then waits in `Handled`; exact `RAW` boundary on `Wrapper` |

| Scenario | Case it exercises |
|---|---|
| [nested-handler-skips-wrong-code](nested-handler-skips-wrong-code.scenario.json) | A code the inner ESP does not name and the outer ESP does. |
| [rethrow-reaches-wrapper-boundary](rethrow-reaches-wrapper-boundary.scenario.json) | `Work` raises `RAW`, the ESP in `Core` catches it and throws `RAW` again from directly inside itself. |

The schedules carry no expected route or Process state; the retained CIB evidence is the answer.
