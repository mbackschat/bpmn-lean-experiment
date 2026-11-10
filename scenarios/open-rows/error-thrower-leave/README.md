# Output order when a raising Service Task leaves

This directory serves [PC-ERROR-03](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): the order in which a Service Task whose business Error a catcher outside it takes, or no catcher takes, writes its output parameters against the catcher's code variable, the host's output parameters and a called root's output pass ([CIB-EXT-0016](../../../docs/CIB-BPMN-RELATION-REGISTER.md#cib-ext-0016--cib7-220-caught-business-error-output-mapping), [CIB-EXT-0028](../../../docs/CIB-BPMN-RELATION-REGISTER.md#cib-ext-0028--an-error-catcher-writes-the-caught-code-and-message-to-named-variables), [CIB-EXT-0034](../../../docs/CIB-BPMN-RELATION-REGISTER.md#cib-ext-0034--call-outputs-pass-when-a-raised-error-or-escalation-reaches-the-called-root)). The seven models are project-authored MIT source for the `cibseven-2.2.0` profile; every schedule is answer-free and CIB Seven `2.2.0` supplies the retained answer.

Every Service Task is answered by `effectResult` and reports the business failure with the output `result` `rejected`. Six models declare the Error `PACK_FAILED` and a Sub-Process `Pack` around the failing Service Task `Label`; the seventh nests a Call over a called Process.

| Model | Catcher | Output parameters | What the model holds open |
|---|---|---|---|
| [ancestor-shares-task-output](ancestor-shares-task-output.bpmn) | exact `PACK_FAILED` boundary on `Pack`, code variable `label`, leading to the Human Task `Observe` | `Label` writes `label` `mapped`; `Pack` writes `hostSeen` from `${label}` | the catch variable, the task's output and a host output that reads the variable share one name |
| [ancestor-shares-host-output](ancestor-shares-host-output.bpmn) | the same boundary | `Label` and `Pack` both write `label`, `mapped` and `host` | two outputs and the catch variable write one name |
| [ancestor-read-by-task-output](ancestor-read-by-task-output.bpmn) | the same boundary | `Label` writes `seen` from `${label}`; `Pack` writes nothing | an output of the failing task reads the ancestor's catch variable |
| [event-scope-local-read](event-scope-local-read.bpmn) | the same boundary | as the previous model, and `Pack` declares the input parameter `label` `host` | the event scope holds a local of the catch variable's name |
| [intermediate-local-hides-caught](intermediate-local-hides-caught.bpmn) | the same boundary on `Pack` | `Label` sits in the Sub-Process `Inner` inside `Pack`, which declares the input parameter `label` `inner`; `Label` writes `seen` from `${label}` | a scope between the task and the event scope holds a local of the catch variable's name |
| [esp-shares-task-output](esp-shares-task-output.bpmn) | interrupting Error Event Sub-Process inside `Pack`, code variable `label`, running the Human Task `Handle` | `Label` writes `label` `mapped`; no boundary and no host output | the Event Sub-Process path, which runs no host outputs |
| [uncaught-beside-child-path](uncaught-beside-child-path.bpmn) | none | the Call `Check` maps `seed` in as `verdict` and `verdict` out as `checkVerdict`; the called Process's Service Task `Assess` writes `verdict` from `${result}` | the called root holds the Human Task `Hold` beside `Assess`, so the failure ends only one path |

| Scenario | Model | Case it separates |
|---|---|---|
| [ancestor-shares-task-output](ancestor-shares-task-output.scenario.json) | ancestor-shares-task-output | `Label` fails with `PACK_FAILED`: whether the catch variable is written before the task's output, and which value the host's output reads. |
| [ancestor-shares-host-output](ancestor-shares-host-output.scenario.json) | ancestor-shares-host-output | The same failure with both outputs naming `label`: the host's output order against the task's. |
| [ancestor-read-by-task-output](ancestor-read-by-task-output.scenario.json) | ancestor-read-by-task-output | The same failure: whether an output of the failing task can read the ancestor's catch variable. |
| [event-scope-local-read](event-scope-local-read.scenario.json) | event-scope-local-read | The same failure: whether the caught value lands in the event scope's local, which the task's output then reads. |
| [intermediate-local-hides-caught](intermediate-local-hides-caught.scenario.json) | intermediate-local-hides-caught | The same failure: whether an intermediate scope's local shadows the caught value for the task's output. |
| [esp-shares-task-output](esp-shares-task-output.scenario.json) | esp-shares-task-output | The same failure caught by the Event Sub-Process: the catch variable against the task's output, and the open `Handle`. |
| [uncaught-beside-child-path](uncaught-beside-child-path.scenario.json) | uncaught-beside-child-path | The caller starts with `seed` `pending`; `Assess` fails with the code `OTHER`, which no catcher names, then `Hold` completes: the order of the Call's output pass against the task's output, and the second pass at the later normal return. |

Called instances are addressed by the kernel's derived identifier. The schedules carry no expected variables, route or Process state; the retained CIB evidence is the answer.
