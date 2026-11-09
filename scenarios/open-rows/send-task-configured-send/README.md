# Send Task performed by a configured handler

Answer-free schedules for [PC-AUTO-04](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): a Send Task that executes an explicitly configured outbound send with typed message data, its completion and failure, and the absence of any transport inferred from a Message Flow. The [Send Task section of the work semantics](../../../docs/kernel/semantics/WORK-SEMANTICS-SPEC.md#send-tasks) owns the meaning; the retained CIB Seven `2.2.0` answer is the target. They extend the earlier [Send Task scenarios](../../send-task/README.md). The profile is `cibseven-2.2.0` with no source overlay.

[shipping-notice.bpmn](shipping-notice.bpmn) packs an order in the User Task *Pack order*, whose form field `notice` becomes the Process variable of the same name, and sends the notice through the Send Task *SendNotice*. The Send Task binds `${bpmnLeanEffectHandler}` with `camunda:asyncBefore="true"` and passes six inputs: the recipient and correlation id from Process variables, a String `copies`, a Boolean `urgent`, the literal channel `email` and the `notice` as `body`. It declares no output, and an exact-code Error boundary (`SEND_REJECTED`) leads to the User Task *Review failed notice*.

| Schedule | Case it separates |
|---|---|
| [send-completes](send-completes.scenario.json) | The send's success result with no output, then normal completion. |
| [send-rejected](send-rejected.scenario.json) | A business failure with the boundary's code and a message, then the failure review. |
| [send-transport-failure](send-transport-failure.scenario.json) | A technical failure with `options.incidents`, one retry of generation 1, then success. |
| [send-snapshot-after-change](send-snapshot-after-change.scenario.json) | A `setVariables` command changes `notice` while the Send Task is open, then the result: the committed notice against the value read when the job runs. |
| [send-result-with-output](send-result-with-output.scenario.json) | A success result carrying an output the Send Task does not declare. |
| [send-wrong-occurrence-result](send-wrong-occurrence-result.scenario.json) | A result naming an activation that has not begun, then the correct result. |
| [send-duplicate-result](send-duplicate-result.scenario.json) | The same result delivered twice, the second one as a duplicate after completion. |

[message-flow-only.bpmn](message-flow-only.bpmn) has a Send Task with a `messageRef` and a Message Flow to an external participant and no delegate, class, expression or type.

| Schedule | Case it separates |
|---|---|
| [message-flow-only](message-flow-only.scenario.json) | The start of a Process whose Send Task declares only the Message and its Message Flow. |

Notes for the target runners:

- The Send Task is delegated work: the retained runner projects an asynchronous continuation only for a Service Task, so a Send Task wait needs its own realization.
- `message-flow-only` is a model CIB may refuse at deployment; the runner must record a refused deployment as the start's outcome.
- `send-transport-failure` is the only schedule with `options.incidents`; the other schedules run with incidents disabled.
