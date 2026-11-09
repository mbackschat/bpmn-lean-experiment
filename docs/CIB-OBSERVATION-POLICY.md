# CIB observation policy

## Status

Implemented procedure. This policy owns canonical CIB observation fidelity and its complete schema-field classification; it introduces no semantic or compatibility claim. Gate selection remains in [TESTING-SPEC.md](TESTING-SPEC.md), and the CIB execution procedure is in [the semantic verification policy](SEMANTIC-VERIFICATION-POLICY.md#current-cib-gate).

## Canonical CIB observation fidelity

This table classifies every field of `canonical-result.schema.json#/$defs/state` at schema depth, whether required or optional: each `$ref` is followed and each `oneOf` arm is expanded, so one path covers every wait kind that carries it. `engine-observed` means the raw producer value comes from pinned CIB deployment/runtime/history state; `adapter-derived` means a deterministic projection transforms retained engine facts; `adapter-decided` means project/profile policy supplies the value without a corresponding CIB semantic fact; and `not-claimed` means the field belongs to the project wire contract but the CIB lane makes no fidelity claim for it. A parent and child may differ because a composite collection or identity can mix observed, derived, decided, and unclaimed components, and a path written by several wait kinds takes the weakest class among them.

The CIB runner fills the state in `CibSevenStateProjector` (status, logical time, root variables) and `CibSevenOpenWaitProjector` (open waits, with `CibSevenOccurrences` supplying occurrence identity), and each basis cell names the method that writes the field. A field the runner writes only at the kernel's default, a fixed empty list or null, is `not-claimed`: CIB exposes no fact for it. The runner projects the root scope's variables only, so `scopes` is `not-claimed` throughout. Rule-level fidelity remains in the owning CIB-backed capsules rather than this canonical field table. The recursive portable value members (`businessValue`) are not expanded: the `value[].value` row of each value carrier classifies every nested List or Map member, and the guard stops descending at that definition.

| Canonical field path | Fidelity | Exact basis |
|---|---|---|
| `kind` | `not-claimed` | Canonical wire discriminator `state`, written by the `ScenarioProtocol.CanonicalObservation` type info |
| `instanceId` | `not-claimed` | Scenario-supplied root identity, carried from `start.instanceId()` as `stableRootId` into `CibSevenStateProjector.observe`, never a generated CIB Process-instance ID |
| `status` | `adapter-derived` | `CibSevenStateProjector.status`: `running` while the root is in the runtime query, `completed` from historic state `COMPLETED` or `INTERNALLY_TERMINATED`, `cancelled` from `EXTERNALLY_TERMINATED`; `failed` is never projected and any other historic state throws |
| `logicalTimeMs` | `adapter-derived` | `CibSevenStateProjector.observe`: the controlled engine clock (`ClockUtil.getCurrentTime`) minus the fixed logical epoch |
| `variables` | `adapter-derived` | `CibSevenStateProjector.rootVariables` reads the historic Process-variable instances of the root scope, so they stay observable after the instance ends; `observe` projects each through `ScenarioVariableValueProjection.project` and sorts by name with `WireStrings.compare` |
| `variables[].name` | `engine-observed` | Historic Process-variable name (`CibSevenStateProjector.rootVariables`) |
| `variables[].value` | `adapter-derived` | `ScenarioVariableValueProjection.project` tags the raw host value |
| `variables[].value.kind` | `adapter-derived` | `string`, `boolean`, `integer`, `stringList` or `null` selected from the host carrier by `ScenarioVariableValueProjection.project`, without text coercion |
| `variables[].value.value` | `engine-observed` | Exact host String, Boolean, integer or String-list members when the value is not null (`ScenarioVariableValueProjection.requireHostStringList` for a list) |
| `variables[].value.coefficient` | `not-claimed` | Portable Decimal part; `ScenarioVariableValueProjection.project` selects no Decimal arm |
| `variables[].value.scale` | `not-claimed` | Portable Decimal part; `ScenarioVariableValueProjection.project` selects no Decimal arm |
| `variables[].value.value[].name` | `not-claimed` | Portable Map entry; `ScenarioVariableValueProjection.project` selects no Map arm |
| `variables[].value.value[].value` | `not-claimed` | Recursive portable List or Map member; `ScenarioVariableValueProjection.project` selects neither arm, and the members of a String list are classified at `value.value` |
| `scopes` | `not-claimed` | kernel-only: the CIB runner projects the instance root only; the comparator compares scopes between the kernels |
| `scopes[].scope` | `not-claimed` | kernel-only: the CIB runner projects the instance root only; the comparator compares scopes between the kernels |
| `scopes[].scope.processInstanceId` | `not-claimed` | kernel-only: the CIB runner projects the instance root only; the comparator compares scopes between the kernels |
| `scopes[].scope.role` | `not-claimed` | kernel-only: the CIB runner projects the instance root only; the comparator compares scopes between the kernels |
| `scopes[].scope.elementId` | `not-claimed` | kernel-only: the CIB runner projects the instance root only; the comparator compares scopes between the kernels |
| `scopes[].scope.activation` | `not-claimed` | kernel-only: the CIB runner projects the instance root only; the comparator compares scopes between the kernels |
| `scopes[].variables` | `not-claimed` | kernel-only: the CIB runner projects the instance root only; the comparator compares scopes between the kernels |
| `scopes[].variables[].name` | `not-claimed` | kernel-only: the CIB runner projects the instance root only; the comparator compares scopes between the kernels |
| `scopes[].variables[].value` | `not-claimed` | kernel-only: the CIB runner projects the instance root only; the comparator compares scopes between the kernels |
| `scopes[].variables[].value.kind` | `not-claimed` | kernel-only: the CIB runner projects the instance root only; the comparator compares scopes between the kernels |
| `scopes[].variables[].value.value` | `not-claimed` | kernel-only: the CIB runner projects the instance root only; the comparator compares scopes between the kernels |
| `scopes[].variables[].value.coefficient` | `not-claimed` | kernel-only: the CIB runner projects the instance root only; the comparator compares scopes between the kernels |
| `scopes[].variables[].value.scale` | `not-claimed` | kernel-only: the CIB runner projects the instance root only; the comparator compares scopes between the kernels |
| `scopes[].variables[].value.value[].name` | `not-claimed` | kernel-only: the CIB runner projects the instance root only; the comparator compares scopes between the kernels |
| `scopes[].variables[].value.value[].value` | `not-claimed` | kernel-only: the CIB runner projects the instance root only; the comparator compares scopes between the kernels |
| `openWaits` | `adapter-derived` | `CibSevenOpenWaitProjector.project` merges the tasks, event subscriptions, addressless Receive Tasks and jobs of the running root and of every running called instance (`CibSevenOccurrences.running`) and sorts them by `WAIT_ORDER`; an ended instance has none |
| `openWaits[].id` | `adapter-derived` | `CibSevenOpenWaitProjector.wait` composes the instance's stable identity, the element ID and the activation |
| `openWaits[].id.processInstanceId` | `not-claimed` | Root: the scenario-supplied identity, no CIB fact. Called instance: `CibSevenOccurrences.calledInstanceId` over the caller's identity, the historic Call Activity ID found through `getCalledProcessInstanceId` and its activation, which is adapter-derived |
| `openWaits[].id.elementId` | `engine-observed` | `Task.getTaskDefinitionKey`, `EventSubscription.getActivityId`, `JobDefinition.getActivityId`, or the ID of the addressless Receive Task found in the activity-instance tree |
| `openWaits[].id.activation` | `adapter-derived` | `CibSevenOccurrences.activation`, `ordinal` and `pendingActivation`: the position among the element's historic activity instances in occurrence order; a subscription without an activity instance takes its host's activation, else 1; a pending asynchronous continuation takes the begun count plus one |
| `openWaits[].definition` | `adapter-derived` | `CibSevenOccurrences.running` and `collect`: null in the root instance, a `DefinitionRef` for a called instance |
| `openWaits[].definition.key` | `engine-observed` | `ProcessDefinition.getKey` of the called instance's definition |
| `openWaits[].definition.version` | `not-claimed` | `CibSevenOccurrences.collect` writes null; the runner publishes only the called definition key |
| `openWaits[].definition.versionTag` | `not-claimed` | `CibSevenOccurrences.collect` writes null; the runner publishes only the called definition key |
| `openWaits[].definition.deployment` | `not-claimed` | `CibSevenOccurrences.collect` writes null; the runner publishes only the called definition key |
| `openWaits[].definition.tenant` | `not-claimed` | `CibSevenOccurrences.collect` writes null; the runner publishes only the called definition key |
| `openWaits[].definition.sourceSha256` | `not-claimed` | `CibSevenOccurrences.collect` writes null; the runner publishes only the called definition key |
| `openWaits[].input` | `adapter-decided` | `OpenWait.input` returns the constant of the detail class (command, deliver, timerFire, effectResult; null for a conditional wait): project command vocabulary, no CIB fact |
| `openWaits[].detail` | `adapter-derived` | The kind-tagged detail built by `CibSevenOpenWaitProjector.projectTasks`, `projectSubscriptions`, `projectAddressless`, `projectJobs` and `projectEffect` from the engine collection that holds the wait |
| `openWaits[].detail.kind` | `adapter-derived` | Selected by the engine collection: task query to `userTask`; subscription event type to `message`, `signal` or `conditional`; addressless Receive Task to `message`; `TimerEntity` job to `timer`; Service Task job to `effect`, or `incident` when one public incident references the job |
| `openWaits[].detail.name` | `engine-observed` | `Task.getName` for a User Task, including null; `EventSubscription.getEventName` for a Signal (`CibSevenOpenWaitProjector.userTaskDetail`, `projectSubscriptions`) |
| `openWaits[].detail.assignee` | `engine-observed` | `Task.getAssignee` (`CibSevenOpenWaitProjector.userTaskDetail`) |
| `openWaits[].detail.candidateUsers` | `adapter-derived` | `userId` of the task's public identity links of type `candidate`, nulls dropped (`CibSevenOpenWaitProjector.userTaskDetail`) |
| `openWaits[].detail.candidateGroups` | `adapter-derived` | `groupId` of the task's public identity links of type `candidate`, nulls dropped (`CibSevenOpenWaitProjector.userTaskDetail`) |
| `openWaits[].detail.formKey` | `engine-observed` | `Task.getFormKey`, loaded by `initializeFormKeys` (`CibSevenOpenWaitProjector.userTaskDetail`) |
| `openWaits[].detail.formFields` | `adapter-derived` | The fields of `FormService.getTaskFormData` mapped one to one (`CibSevenOpenWaitProjector.projectTasks`, `userTaskDetail`) |
| `openWaits[].detail.formFields[].key` | `engine-observed` | Public Form Service field `getId` |
| `openWaits[].detail.formFields[].type` | `engine-observed` | Public Form Service field `getTypeName`, unchanged |
| `openWaits[].detail.dueDate` | `adapter-derived` | `Task.getDueDate` formatted as an ISO-8601 instant, null when absent (`CibSevenOpenWaitProjector.instant`) |
| `openWaits[].detail.followUpDate` | `adapter-derived` | `Task.getFollowUpDate` formatted as an ISO-8601 instant, null when absent (`CibSevenOpenWaitProjector.instant`) |
| `openWaits[].detail.priority` | `adapter-derived` | `Task.getPriority`, published only where the deployed model declares `camunda:priority`, else null (`CibSevenOpenWaitProjector.userTaskDetail`) |
| `openWaits[].detail.inputs` | `adapter-derived` | The local variables of the task's execution (`RuntimeService.getVariablesLocal`) named by the deployed model's `camunda:inputParameter` declarations, sorted by name (`CibSevenOpenWaitProjector.inputs`) |
| `openWaits[].detail.inputs[].name` | `engine-observed` | Local-variable name, kept where a declared `CamundaInputParameter` names it |
| `openWaits[].detail.inputs[].value` | `adapter-derived` | `ScenarioVariableValueProjection.project` tags the raw host value |
| `openWaits[].detail.inputs[].value.kind` | `adapter-derived` | `string`, `boolean`, `integer`, `stringList` or `null` selected from the host carrier by `ScenarioVariableValueProjection.project`, without text coercion |
| `openWaits[].detail.inputs[].value.value` | `engine-observed` | Exact host value of the execution's local variable, absent for null |
| `openWaits[].detail.inputs[].value.coefficient` | `not-claimed` | Portable Decimal part; `ScenarioVariableValueProjection.project` selects no Decimal arm |
| `openWaits[].detail.inputs[].value.scale` | `not-claimed` | Portable Decimal part; `ScenarioVariableValueProjection.project` selects no Decimal arm |
| `openWaits[].detail.inputs[].value.value[].name` | `not-claimed` | Portable Map entry; `ScenarioVariableValueProjection.project` selects no Map arm |
| `openWaits[].detail.inputs[].value.value[].value` | `not-claimed` | Recursive portable List or Map member; `ScenarioVariableValueProjection.project` selects neither arm, and the members of a String list are classified at `value.value` |
| `openWaits[].detail.channel` | `adapter-decided` | `CibSevenOpenWaitProjector.channel` selects the arm from the Operation or Message reference of the deployed Receive Task or Message Catch Event, and `projectAddressless` stamps the unspecified arm (`CIB-OP-0011`): read from the deployed model; CIB's subscription API exposes only the event name (`CIB-OP-0005`) |
| `openWaits[].detail.channel.kind` | `adapter-decided` | `CibSevenOpenWaitProjector.channel`: `operationMessage` for an Operation reference, `directMessage` for a Message reference, `unspecifiedMessage` for an addressless Receive Task |
| `openWaits[].detail.channel.interfaceId` | `adapter-decided` | Interface ID of the referenced Operation, absent from the other arms: read from the deployed model; CIB's subscription API exposes only the event name (`CIB-OP-0005`) |
| `openWaits[].detail.channel.interfaceOperationId` | `adapter-decided` | ID of the referenced Operation, absent from the other arms: read from the deployed model; CIB's subscription API exposes only the event name (`CIB-OP-0005`) |
| `openWaits[].detail.channel.messageId` | `adapter-decided` | ID of the referenced Message, else the Operation's in-Message, absent from the unspecified arm: read from the deployed model; CIB's subscription API exposes only the event name (`CIB-OP-0005`) |
| `openWaits[].detail.payload` | `adapter-decided` | Message: `CibSevenOpenWaitProjector.writesPayload` is true when the catching element declares a data output association in the deployed model; Signal and addressless Receive Task: constant `false`; no CIB fact in any arm |
| `openWaits[].detail.criteria` | `not-claimed` | The runner writes the empty list; CIB's subscription exposes no correlation criteria |
| `openWaits[].detail.variableName` | `adapter-derived` | `camunda:variableName` of the deployed model's conditional event definition (`CibSevenOpenWaitProjector.conditionalDetail`) |
| `openWaits[].detail.variableEvents` | `adapter-derived` | `camunda:variableEvents` list of the deployed model's conditional event definition (`CibSevenOpenWaitProjector.conditionalDetail`) |
| `openWaits[].detail.lastValue` | `not-claimed` | The runner writes null; CIB exposes no last evaluated condition value |
| `openWaits[].detail.deadlineMs` | `adapter-derived` | `Job.getDuedate` minus the fixed logical epoch (`CibSevenOpenWaitProjector.projectJobs`) |
| `openWaits[].detail.recurrence` | `adapter-derived` | `CibSevenOpenWaitProjector.recurrence` over `TimerEntity.getRepeat`; null when the timer does not repeat |
| `openWaits[].detail.recurrence.periodMs` | `adapter-derived` | Period of an ISO `R[n]/[start/]period` repeat expression parsed to milliseconds, null for cron (`CibSevenOpenWaitProjector.recurrence`) |
| `openWaits[].detail.recurrence.cron` | `engine-observed` | The raw repeat expression when it is not an ISO repeat (`CibSevenOpenWaitProjector.recurrence`) |
| `openWaits[].detail.recurrence.remaining` | `adapter-derived` | Count `n` of an ISO `R<n>/...` repeat expression, null when absent or for cron (`CibSevenOpenWaitProjector.recurrence`) |
| `openWaits[].detail.protocol` | `adapter-decided` | `CibSevenScriptedEffect.EFFECT_PROTOCOL`, written after `CibSevenOpenWaitProjector.projectEffect` checks the Service Task's implementation against `SOURCE_PROTOCOL` and its delegate bean against `HANDLER_BEANS` |
| `openWaits[].detail.operation` | `adapter-decided` | `CibSevenScriptedEffect.EFFECT_OPERATION`, written by `CibSevenOpenWaitProjector.projectEffect` under the same check |
| `openWaits[].detail.arguments` | `not-claimed` | The runner writes the empty list: the asynchronous continuation runs its input mappings only when the job executes, so CIB exposes no argument while the effect waits |
| `openWaits[].detail.arguments[].name` | `not-claimed` | `arguments` is always empty: the asynchronous continuation runs its input mappings only when the job executes, so CIB exposes no argument while the effect waits (`CibSevenOpenWaitProjector.projectEffect`) |
| `openWaits[].detail.arguments[].value` | `not-claimed` | `arguments` is always empty: the asynchronous continuation runs its input mappings only when the job executes, so CIB exposes no argument while the effect waits (`CibSevenOpenWaitProjector.projectEffect`) |
| `openWaits[].detail.arguments[].value.kind` | `not-claimed` | `arguments` is always empty: the asynchronous continuation runs its input mappings only when the job executes, so CIB exposes no argument while the effect waits (`CibSevenOpenWaitProjector.projectEffect`) |
| `openWaits[].detail.arguments[].value.value` | `not-claimed` | `arguments` is always empty: the asynchronous continuation runs its input mappings only when the job executes, so CIB exposes no argument while the effect waits (`CibSevenOpenWaitProjector.projectEffect`) |
| `openWaits[].detail.arguments[].value.coefficient` | `not-claimed` | `arguments` is always empty: the asynchronous continuation runs its input mappings only when the job executes, so CIB exposes no argument while the effect waits (`CibSevenOpenWaitProjector.projectEffect`) |
| `openWaits[].detail.arguments[].value.scale` | `not-claimed` | `arguments` is always empty: the asynchronous continuation runs its input mappings only when the job executes, so CIB exposes no argument while the effect waits (`CibSevenOpenWaitProjector.projectEffect`) |
| `openWaits[].detail.arguments[].value.value[].name` | `not-claimed` | `arguments` is always empty: the asynchronous continuation runs its input mappings only when the job executes, so CIB exposes no argument while the effect waits (`CibSevenOpenWaitProjector.projectEffect`) |
| `openWaits[].detail.arguments[].value.value[].value` | `not-claimed` | `arguments` is always empty: the asynchronous continuation runs its input mappings only when the job executes, so CIB exposes no argument while the effect waits (`CibSevenOpenWaitProjector.projectEffect`) |
| `openWaits[].detail.failures` | `adapter-derived` | `CibSevenOpenWaitProjector.projectEffect` counts the distinct public failed-job incidents seen for the job in this scenario (`incidentsByJob`); only an incident present at an observation counts |
| `openWaits[].detail.send` | `not-claimed` | The runner writes null: a Service Task effect carries no Send descriptor |
| `openWaits[].detail.send.recipient` | `not-claimed` | `send` is always null: a Service Task effect carries no Send descriptor (`CibSevenOpenWaitProjector.projectEffect`) |
| `openWaits[].detail.send.correlation` | `not-claimed` | `send` is always null: a Service Task effect carries no Send descriptor (`CibSevenOpenWaitProjector.projectEffect`) |
| `openWaits[].detail.send.correlation[].name` | `not-claimed` | `send` is always null: a Service Task effect carries no Send descriptor (`CibSevenOpenWaitProjector.projectEffect`) |
| `openWaits[].detail.send.correlation[].value` | `not-claimed` | `send` is always null: a Service Task effect carries no Send descriptor (`CibSevenOpenWaitProjector.projectEffect`) |
| `openWaits[].detail.send.correlation[].value.kind` | `not-claimed` | `send` is always null: a Service Task effect carries no Send descriptor (`CibSevenOpenWaitProjector.projectEffect`) |
| `openWaits[].detail.send.correlation[].value.value` | `not-claimed` | `send` is always null: a Service Task effect carries no Send descriptor (`CibSevenOpenWaitProjector.projectEffect`) |
| `openWaits[].detail.send.correlation[].value.coefficient` | `not-claimed` | `send` is always null: a Service Task effect carries no Send descriptor (`CibSevenOpenWaitProjector.projectEffect`) |
| `openWaits[].detail.send.correlation[].value.scale` | `not-claimed` | `send` is always null: a Service Task effect carries no Send descriptor (`CibSevenOpenWaitProjector.projectEffect`) |
| `openWaits[].detail.send.correlation[].value.value[].name` | `not-claimed` | `send` is always null: a Service Task effect carries no Send descriptor (`CibSevenOpenWaitProjector.projectEffect`) |
| `openWaits[].detail.send.correlation[].value.value[].value` | `not-claimed` | `send` is always null: a Service Task effect carries no Send descriptor (`CibSevenOpenWaitProjector.projectEffect`) |
| `openWaits[].detail.effect` | `adapter-decided` | An incident wait nests the same neutral effect intent as the effect wait it replaces (`CibSevenOpenWaitProjector.projectEffect`) |
| `openWaits[].detail.effect.protocol` | `adapter-decided` | `CibSevenScriptedEffect.EFFECT_PROTOCOL`, written after `CibSevenOpenWaitProjector.projectEffect` checks the Service Task's implementation against `SOURCE_PROTOCOL` and its delegate bean against `HANDLER_BEANS` |
| `openWaits[].detail.effect.operation` | `adapter-decided` | `CibSevenScriptedEffect.EFFECT_OPERATION`, written by `CibSevenOpenWaitProjector.projectEffect` under the same check |
| `openWaits[].detail.effect.arguments` | `not-claimed` | The runner writes the empty list: the asynchronous continuation runs its input mappings only when the job executes, so CIB exposes no argument while the effect waits |
| `openWaits[].detail.effect.arguments[].name` | `not-claimed` | `arguments` is always empty: the asynchronous continuation runs its input mappings only when the job executes, so CIB exposes no argument while the effect waits (`CibSevenOpenWaitProjector.projectEffect`) |
| `openWaits[].detail.effect.arguments[].value` | `not-claimed` | `arguments` is always empty: the asynchronous continuation runs its input mappings only when the job executes, so CIB exposes no argument while the effect waits (`CibSevenOpenWaitProjector.projectEffect`) |
| `openWaits[].detail.effect.arguments[].value.kind` | `not-claimed` | `arguments` is always empty: the asynchronous continuation runs its input mappings only when the job executes, so CIB exposes no argument while the effect waits (`CibSevenOpenWaitProjector.projectEffect`) |
| `openWaits[].detail.effect.arguments[].value.value` | `not-claimed` | `arguments` is always empty: the asynchronous continuation runs its input mappings only when the job executes, so CIB exposes no argument while the effect waits (`CibSevenOpenWaitProjector.projectEffect`) |
| `openWaits[].detail.effect.arguments[].value.coefficient` | `not-claimed` | `arguments` is always empty: the asynchronous continuation runs its input mappings only when the job executes, so CIB exposes no argument while the effect waits (`CibSevenOpenWaitProjector.projectEffect`) |
| `openWaits[].detail.effect.arguments[].value.scale` | `not-claimed` | `arguments` is always empty: the asynchronous continuation runs its input mappings only when the job executes, so CIB exposes no argument while the effect waits (`CibSevenOpenWaitProjector.projectEffect`) |
| `openWaits[].detail.effect.arguments[].value.value[].name` | `not-claimed` | `arguments` is always empty: the asynchronous continuation runs its input mappings only when the job executes, so CIB exposes no argument while the effect waits (`CibSevenOpenWaitProjector.projectEffect`) |
| `openWaits[].detail.effect.arguments[].value.value[].value` | `not-claimed` | `arguments` is always empty: the asynchronous continuation runs its input mappings only when the job executes, so CIB exposes no argument while the effect waits (`CibSevenOpenWaitProjector.projectEffect`) |
| `openWaits[].detail.effect.failures` | `adapter-derived` | `CibSevenOpenWaitProjector.projectEffect` counts the distinct public failed-job incidents seen for the job in this scenario (`incidentsByJob`); only an incident present at an observation counts |
| `openWaits[].detail.effect.send` | `not-claimed` | The runner writes null: a Service Task effect carries no Send descriptor |
| `openWaits[].detail.effect.send.recipient` | `not-claimed` | `send` is always null: a Service Task effect carries no Send descriptor (`CibSevenOpenWaitProjector.projectEffect`) |
| `openWaits[].detail.effect.send.correlation` | `not-claimed` | `send` is always null: a Service Task effect carries no Send descriptor (`CibSevenOpenWaitProjector.projectEffect`) |
| `openWaits[].detail.effect.send.correlation[].name` | `not-claimed` | `send` is always null: a Service Task effect carries no Send descriptor (`CibSevenOpenWaitProjector.projectEffect`) |
| `openWaits[].detail.effect.send.correlation[].value` | `not-claimed` | `send` is always null: a Service Task effect carries no Send descriptor (`CibSevenOpenWaitProjector.projectEffect`) |
| `openWaits[].detail.effect.send.correlation[].value.kind` | `not-claimed` | `send` is always null: a Service Task effect carries no Send descriptor (`CibSevenOpenWaitProjector.projectEffect`) |
| `openWaits[].detail.effect.send.correlation[].value.value` | `not-claimed` | `send` is always null: a Service Task effect carries no Send descriptor (`CibSevenOpenWaitProjector.projectEffect`) |
| `openWaits[].detail.effect.send.correlation[].value.coefficient` | `not-claimed` | `send` is always null: a Service Task effect carries no Send descriptor (`CibSevenOpenWaitProjector.projectEffect`) |
| `openWaits[].detail.effect.send.correlation[].value.scale` | `not-claimed` | `send` is always null: a Service Task effect carries no Send descriptor (`CibSevenOpenWaitProjector.projectEffect`) |
| `openWaits[].detail.effect.send.correlation[].value.value[].name` | `not-claimed` | `send` is always null: a Service Task effect carries no Send descriptor (`CibSevenOpenWaitProjector.projectEffect`) |
| `openWaits[].detail.effect.send.correlation[].value.value[].value` | `not-claimed` | `send` is always null: a Service Task effect carries no Send descriptor (`CibSevenOpenWaitProjector.projectEffect`) |
| `openWaits[].detail.generation` | `adapter-derived` | The count of distinct public failed-job incidents seen for the job in this scenario (`CibSevenOpenWaitProjector.projectEffect`), not an engine field |
| `openWaits[].detail.cancellable` | `adapter-decided` | The scenario's declared `incidents.cancellable` option (`ScenarioProtocol.Options.incidentsCancellable`), passed through by `CibSevenOpenWaitProjector.projectEffect`; no CIB fact |
| `failure` | `not-claimed` | `CibSevenStateProjector.observe` passes a null failure, and `status` never projects `failed` |
| `failure.code` | `not-claimed` | Instance-failure code; `CibSevenStateProjector.observe` passes a null failure, and `status` never projects `failed` |
| `failure.message` | `not-claimed` | Instance-failure message; `CibSevenStateProjector.observe` passes a null failure, and `status` never projects `failed` |
| `failure.occurrence` | `not-claimed` | Failing occurrence; `CibSevenStateProjector.observe` passes a null failure, and `status` never projects `failed` |
| `failure.occurrence.processInstanceId` | `not-claimed` | Failing occurrence; `CibSevenStateProjector.observe` passes a null failure, and `status` never projects `failed` |
| `failure.occurrence.elementId` | `not-claimed` | Failing occurrence; `CibSevenStateProjector.observe` passes a null failure, and `status` never projects `failed` |
| `failure.occurrence.activation` | `not-claimed` | Failing occurrence; `CibSevenStateProjector.observe` passes a null failure, and `status` never projects `failed` |
| `failure.related` | `not-claimed` | Related occurrences of the failure; `CibSevenStateProjector.observe` passes a null failure, and `status` never projects `failed` |
| `failure.related[].name` | `not-claimed` | Related-occurrence name; `CibSevenStateProjector.observe` passes a null failure, and `status` never projects `failed` |
| `failure.related[].occurrence` | `not-claimed` | Related occurrence; `CibSevenStateProjector.observe` passes a null failure, and `status` never projects `failed` |
| `failure.related[].occurrence.processInstanceId` | `not-claimed` | Related occurrence; `CibSevenStateProjector.observe` passes a null failure, and `status` never projects `failed` |
| `failure.related[].occurrence.elementId` | `not-claimed` | Related occurrence; `CibSevenStateProjector.observe` passes a null failure, and `status` never projects `failed` |
| `failure.related[].occurrence.activation` | `not-claimed` | Related occurrence; `CibSevenStateProjector.observe` passes a null failure, and `status` never projects `failed` |

Retained `stateQueries` bind canonical status, logical time, and the root scope's Process-variable projection to raw public runtime/history queries and the controlled engine clock; `CibSevenStateProjector.rootVariables` reads every root-scope variable from history rather than a name set derived from commands. The task, Message-subscription, timer, effect and incident job snapshots retain the raw rows from which `CibSevenOpenWaitProjector` projects `openWaits`. No TypeScript consumer reads these snapshots: the runner's projector owns the projection, and the hosted lane reproduces every retained result from them.

Neutral projection does not increase source-binding independence. Lean independently recomputes and checks neutral checked-graph-to-program lowering. The raw Camunda binding to neutral protocol/operation translation is performed by the shared source/profile projection and rechecked by the CIB raw-binding mutation; Lean does not derive that translation from source bytes.
