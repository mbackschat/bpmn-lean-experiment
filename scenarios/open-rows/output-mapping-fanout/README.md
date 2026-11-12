# Output mapping fanout, atomicity and captured inputs

Answer-free schedules for [PC-DATA-06](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): explicit multi-source and multi-target output mappings to local and enclosing targets, with atomic validation and no captured-input fallback. The [data semantics](../../../docs/kernel/semantics/DATA-SEMANTICS-SPEC.md) own the rule (an output reads the submitted values alone, never a captured input or a parent namesake; a missing, repeated or superfluous name changes nothing); the retained CIB Seven `2.2.0` answer is the target. The profile is `cibseven-2.2.0` with no source overlay.

| Model | Journey |
|---|---|
| [service-fanout](service-fanout.bpmn) | The Sub-Process *Pack* declares the local `localTarget` and copies it out as `packed`; its Service Task *Compute* (`${bpmnLeanEffectHandler}`, `asyncBefore`) captures `seed` and has seven output mappings in this order: `textOut`, `fanoutOne` and `fanoutTwo` from `textResult`, `nullOut` from `nullResult`, `pickedCity` from `structuredResult.city`, `wholeStructured` from `structuredResult`, and `localTarget` from `textResult`. The User Task *Observe* publishes every target. |
| [captured-input-fallback](captured-input-fallback.bpmn) | *Compute* captures `seed` and maps `answer` from `result` and `echoed` from the name `seed`. |
| [user-task-fanout](user-task-fanout.bpmn) | The User Task *Decide* captures `claim` and maps `finalDecision` and `decisionCopy` from `decision` and `finalNote` from `note`. |
| [user-task-captured-fallback](user-task-captured-fallback.bpmn) | *Decide* maps `finalDecision` from `decision` and `claimBack` from its captured input `claimCopy`. |

| Schedule | Model | Case it separates | Row |
|---|---|---|---|
| [distinct-and-shared-sources](distinct-and-shared-sources.scenario.json) | [service-fanout](service-fanout.bpmn) | One result with a String, a present Null and a Map: distinct sources to differently named targets, one source to three targets (one a Sub-Process local), a selected field and the whole Map. | PC-DATA-06 |
| [missing-source](missing-source.scenario.json) | [service-fanout](service-fanout.bpmn) | The result omits `nullResult`, a source the fifth output mapping names. | PC-DATA-06 |
| [extra-output](extra-output.scenario.json) | [service-fanout](service-fanout.bpmn) | The result carries a name, `unmapped`, that no output mapping names. | PC-DATA-06 |
| [late-invalid-output](late-invalid-output.scenario.json) | [service-fanout](service-fanout.bpmn) | `structuredResult` is a String, so the mapping of its field `city`, the fifth in declaration order, cannot be read after four mappings were evaluated. | PC-DATA-06 |
| [wrong-owner-result](wrong-owner-result.scenario.json) | [service-fanout](service-fanout.bpmn) | A result addressed to the second activation of *Compute*, which does not exist, then the result of the first. | PC-DATA-06 |
| [captured-input-fallback](captured-input-fallback.scenario.json) | [captured-input-fallback](captured-input-fallback.bpmn) | An output mapping reads `seed`, the name of the task's own captured input, which the result does not supply. | PC-DATA-06 |
| [completion-fanout](completion-fanout.scenario.json) | [user-task-fanout](user-task-fanout.bpmn) | A completion of a String and a present Null feeds three output mappings, two of them from one source. | PC-DATA-06 |
| [missing-completion-output](missing-completion-output.scenario.json) | [user-task-fanout](user-task-fanout.bpmn) | A completion omits `note`, a source an output mapping names, then repeats with it. | PC-DATA-06 |
| [extra-completion-value](extra-completion-value.scenario.json) | [user-task-fanout](user-task-fanout.bpmn) | A completion carries a name, `extra`, that no output mapping names, then repeats without it. | PC-DATA-06 |
| [completion-captured-fallback](completion-captured-fallback.scenario.json) | [user-task-captured-fallback](user-task-captured-fallback.bpmn) | A completion output mapping reads `claimCopy`, the task's own captured input, which the completion does not supply. | PC-DATA-06 |

Notes for the target runners:

- A command that fails inside the engine must be recorded as the command outcome rather than as a harness failure.
