# User Task assignment and form metadata in compositions

Answer-free schedules for [PC-HUM-02](../../../docs/PRACTICAL-CIB7-COVERAGE-TARGET.md#delivery-task-list): the passive assignment and form metadata of a User Task through rollover, a new activation, scope, called and Multi-Instance ownership, and the metadata forms the row refuses. The [work semantics](../../../docs/kernel/semantics/WORK-SEMANTICS-SPEC.md) own the meaning; the retained CIB Seven `2.2.0` answer, which publishes each open task's metadata beside its occurrence, is the target. They extend [User Task metadata](../../user-task-assignment-form-metadata/README.md) and its [parallel composition](../../parallel-user-task-metadata-composition/README.md). The profile is `cibseven-2.2.0` with no source overlay.

The metadata-bearing tasks draw on the fields [the traceability map](../../../docs/kernel/ROW-TRACEABILITY-MAP.md) lists for the row: assignee, candidate users and groups, form key, due and follow-up dates (literal ISO instants in UTC), priority and typed form fields. Each task declares a different subset, so the published values distinguish which task identity they follow.

[case-triage.bpmn](case-triage.bpmn) holds the metadata-bearing User Task *Triage* in a rework loop (a JUEL condition on `route`), the Sub-Process *Intake* with its own metadata-bearing task *Collect*, and the metadata-free User Task *Confirm*.

| Schedule | Case it separates |
|---|---|
| [triage-rollover-scope-and-free](triage-rollover-scope-and-free.scenario.json) | A first *Triage* activation completed with `rework`, a second activation with its metadata, the scoped task with different metadata and the metadata-free task. |

[case-called.bpmn](case-called.bpmn) and [case-body.bpmn](case-body.bpmn) place a metadata-bearing task in a called Process and in a parallel Multi-Instance body with a cardinality of two.

| Schedule | Case it separates |
|---|---|
| [called-task-metadata](called-task-metadata.scenario.json) | The called task addressed by its derived called-instance identity, then the caller's metadata-free task. |
| [body-metadata](body-metadata.scenario.json) | Two simultaneous bodies of one metadata-bearing task, completed out of order. |

The remaining models are the forms the row says fail:

| Schedule | Model | Case it separates |
|---|---|---|
| [untyped-form-field](untyped-form-field.scenario.json) | [untyped-form-field.bpmn](untyped-form-field.bpmn) | Partial metadata: a form field that declares an id and no type. |
| [writable-handler-key](writable-handler-key.scenario.json) | [handler-key-collision.bpmn](handler-key-collision.bpmn) | A writable form field named `bpmnLeanEffectHandler`, the delegate token of a later Service Task, submitted by the task completion. |
| [task-metadata-condition](task-metadata-condition.scenario.json) | [metadata-control.bpmn](metadata-control.bpmn) | A Sequence Flow condition that reads the task's assignee through the engine-context name `task`. |
| [undeclared-handler-key](undeclared-handler-key.scenario.json) | [handler-key-undeclared.bpmn](handler-key-undeclared.bpmn) | The same completion as `writable-handler-key` on a task that declares no such field: the token's name arrives only as an undeclared submitted value. |

Notes for the target runners:

- `untyped-form-field` is a model CIB may refuse at deployment; the runner must record a refused deployment as the start's outcome.
- `writable-handler-key`, `undeclared-handler-key` and `task-metadata-condition` have an engine step that can fail inside the completing command; the runner must record it as the command outcome rather than as a harness failure.
- The called occurrence is addressed by the derived called-instance identity (`call:<byte length>:<caller>:<byte length>:<Call element>:<activation>`).
- Every submitted value is a String or a Boolean, and the Multi-Instance body is counted rather than collection-driven.
