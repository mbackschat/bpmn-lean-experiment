# Where an Escalation catch writes its code variable

This directory serves [PC-ESCALATION-01](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list) and [PC-ESCALATION-03](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): which scope an Escalation catch writes its `camunda:escalationCodeVariable` from, and whether an interrupted host's output parameters read it ([propagation semantics](../../../docs/kernel/semantics/PROPAGATION-SEMANTICS-SPEC.md#pc-escalation-01-an-escalation-no-catcher-takes-lets-its-thrower-continue)). The [write-origin model](write-origin.bpmn) is project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer. The matching cases without a host local are in [escalation-code-variable](../escalation-code-variable/README.md).

After a Parallel fork, four Sub-Process regions each run `Assess`, an Intermediate Escalation throw of their own code and `Finish`. Every catcher names the code variable `code`.

| Region | Local `code` | Catcher | Output parameter |
|---|---|---|---|
| `HostNonInterrupting` | `inner` | non-interrupting boundary `CODE_A` | `hostCodeA` from `${code}` |
| `HostInterrupting` | `inner` | interrupting boundary `CODE_B` | `seenB` from `${code}` |
| `HostWithHandler` | `inner` | non-interrupting Event Sub-Process `CODE_C` | `hostCodeC` from `${code}` |
| `HostMapped` | none | interrupting boundary `CODE_D` | `seenD` from `${code}` |

| Scenario | Case it exercises |
|---|---|
| [non-interrupting-boundary-host-local](non-interrupting-boundary-host-local.scenario.json) | The non-interrupting boundary's write beside the host's local, then the host's normal completion mapping that local. |
| [interrupting-boundary-host-local](interrupting-boundary-host-local.scenario.json) | The interrupting boundary's write beside the host's local, read by the interrupted host's output parameter. |
| [event-subprocess-host-local](event-subprocess-host-local.scenario.json) | The Event Sub-Process's write beside its enclosing Sub-Process's local, then that Sub-Process's completion. |
| [interrupted-outputs-read-code](interrupted-outputs-read-code.scenario.json) | The interrupting boundary's write with no local, read by the interrupted host's output parameter. |

The schedules carry no expected variables or Process state; the retained CIB evidence is the answer.
