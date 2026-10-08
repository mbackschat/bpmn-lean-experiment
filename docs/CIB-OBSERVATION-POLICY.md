# CIB observation policy

## Status

Implemented procedure. This policy owns canonical CIB observation fidelity and its complete schema-field classification; it introduces no semantic or compatibility claim. Gate selection remains in [TESTING-SPEC.md](TESTING-SPEC.md), and the CIB execution procedure is in [the semantic verification policy](SEMANTIC-VERIFICATION-POLICY.md#current-cib-gate).

## Canonical CIB observation fidelity

This table classifies every current top-level and recursively reachable field of `scenario.schema.json#/$defs/stateObservation`, whether required or optional. `engine-observed` means the raw producer value comes from pinned CIB deployment/runtime/history state; `adapter-derived` means a deterministic projection transforms retained engine facts; `adapter-decided` means project/profile policy supplies the value without a corresponding CIB semantic fact; and `not-claimed` means the field belongs to the project wire contract but the CIB lane makes no fidelity claim for it. A parent and child may differ because a composite collection or identity can mix observed, derived, decided, and unclaimed components. Incident projection consumes the retained public job plus its exact public `failedJob` incident partner; semantic occurrence, descriptor, arguments, and literal generation remain profile decisions rather than CIB semantic identity. The standards-only sequential Multi-Instance profile owns `openMultiInstances`, and the standards-only Activity data-input profile owns `openUserTasks[].inputs`, so every path below either optional field is deliberately `not-claimed` by CIB fidelity. Rule-level fidelity remains in the owning CIB-backed capsules rather than this canonical field table.

| Canonical field path | Fidelity | Exact basis |
|---|---|---|
| `kind` | `not-claimed` | Canonical wire discriminator |
| `instanceId` | `not-claimed` | Scenario-supplied semantic identity, never a generated CIB Process-instance ID |
| `status` | `adapter-derived` | `running` or `completed` comes from retained Process-instance state, while the cancellation successor requires zero live state plus one exact `EXTERNALLY_TERMINATED` historic root before projecting `cancelled` |
| `failure` | `not-claimed` | Compensation-only terminal detail; no registered CIB profile admits the trigger that could produce it |
| `failure.kind` | `not-claimed` | Project-owned closed failure discriminator |
| `failure.triggerId` | `not-claimed` | Project-owned Compensation trigger occurrence identity |
| `failure.triggerId.processInstanceId` | `not-claimed` | Scenario-supplied semantic identity |
| `failure.triggerId.elementId` | `not-claimed` | No registered CIB trigger profile supplies this semantic element identity |
| `failure.triggerId.activation` | `not-claimed` | No registered CIB trigger profile supplies this semantic ordinal |
| `failure.handlerId` | `not-claimed` | Project-owned Compensation handler occurrence identity |
| `failure.handlerId.processInstanceId` | `not-claimed` | Scenario-supplied semantic identity |
| `failure.handlerId.elementId` | `not-claimed` | No registered CIB trigger profile supplies this semantic element identity |
| `failure.handlerId.activation` | `not-claimed` | No registered CIB trigger profile supplies this semantic ordinal |
| `failure.effectId` | `not-claimed` | Project-owned Compensation handler effect occurrence identity |
| `failure.effectId.processInstanceId` | `not-claimed` | Scenario-supplied semantic identity |
| `failure.effectId.elementId` | `not-claimed` | No registered CIB trigger profile supplies this semantic element identity |
| `failure.effectId.activation` | `not-claimed` | No registered CIB trigger profile supplies this semantic ordinal |
| `failure.code` | `not-claimed` | Semantic handler-failure code returned by the future host effect boundary |
| `failure.message` | `not-claimed` | Semantic handler-failure message returned by the future host effect boundary |
| `activeWaits` | `adapter-derived` | Merge, semantic-kind rank, and Unicode element-ID sort over retained task/subscription/timer/effect facts |
| `activeWaits[].elementId` | `engine-observed` | Task definition key, Message-subscription Activity ID, or job-definition Activity ID |
| `activeWaits[].kind` | `adapter-derived` | Classification by the engine collection and admitted host relation |
| `activeWaits[].multiplicity` | `adapter-derived` | Count of retained live facts after unsupported repeated timer/effect identities are refused |
| `openUserTasks` | `adapter-derived` | Canonical projection and sort over retained public task-query rows |
| `openUserTasks[].id` | `adapter-derived` | Composite semantic occurrence identity |
| `openUserTasks[].id.processInstanceId` | `not-claimed` | Scenario-supplied semantic identity |
| `openUserTasks[].id.elementId` | `engine-observed` | Public task definition key |
| `openUserTasks[].id.activation` | `adapter-decided` | Constant singleton ordinal `1`; repeated live elements are refused |
| `openUserTasks[].name` | `engine-observed` | Public task name, including `null` |
| `openUserTasks[].metadata` | `adapter-derived` | Optional neutral projection over retained Task Service identity-link and Form Service field rows |
| `openUserTasks[].metadata.assignment` | `adapter-derived` | Exact neutral assignment structure over retained public identity-link facts |
| `openUserTasks[].metadata.assignment.candidates` | `adapter-derived` | Exact one-candidate tuple after refusing missing, extra, or non-group identity links |
| `openUserTasks[].metadata.assignment.candidates[].kind` | `adapter-derived` | Neutral `group` discriminator selected only from one raw group candidate identity link |
| `openUserTasks[].metadata.assignment.candidates[].id` | `engine-observed` | Public Task Service candidate-group identity-link `groupId` |
| `openUserTasks[].metadata.form` | `adapter-derived` | Exact neutral form structure over retained public Form Service facts |
| `openUserTasks[].metadata.form.fields` | `adapter-derived` | Exact one-field tuple after refusing missing or extra Form Service rows |
| `openUserTasks[].metadata.form.fields[].key` | `engine-observed` | Public Form Service field `id` |
| `openUserTasks[].metadata.form.fields[].type` | `adapter-derived` | Neutral `string` or `boolean` selected from the public Form Service `typeName` |
| `openUserTasks[].inputs` | `not-claimed` | Standards-only Activity data-input collection, published only for a program that fills an Activity data interface |
| `openUserTasks[].inputs[].name` | `not-claimed` | Exact standards-profile Activity DataInput identity |
| `openUserTasks[].inputs[].value` | `not-claimed` | Exact value copied from the selected Process Property at activation |
| `openUserTasks[].inputs[].value.kind` | `not-claimed` | Standards profile admits the `string` and `null` kinds |
| `openUserTasks[].inputs[].value.value` | `not-claimed` | Project-owned copied String, absent for explicit null |
| `openUserTasks[].state` | `adapter-decided` | Canonical `active` stamp for rows returned by the live-task query |
| `openMessageSubscriptions` | `adapter-derived` | Canonical singleton projection over the retained public Receive Task subscription under `CIB-OP-0005`; other retained CIB cases are empty |
| `openMessageSubscriptions[].id` | `adapter-derived` | Composite semantic subscription occurrence identity |
| `openMessageSubscriptions[].id.processInstanceId` | `not-claimed` | Scenario-supplied semantic identity |
| `openMessageSubscriptions[].id.elementId` | `engine-observed` | Public Message-subscription Activity ID |
| `openMessageSubscriptions[].id.activation` | `adapter-decided` | Constant singleton ordinal `1`; repeated or concurrent subscriptions are refused |
| `openMessageSubscriptions[].channel` | `adapter-decided` | The exact admitted Receive Task profile selects a direct source Message reference |
| `openMessageSubscriptions[].channel.kind` | `adapter-decided` | Profile-owned `directMessage` discriminant |
| `openMessageSubscriptions[].channel.interfaceId` | `not-claimed` | Structurally absent from the direct-Message arm |
| `openMessageSubscriptions[].channel.interfaceOperationId` | `not-claimed` | Structurally absent from the direct-Message arm |
| `openMessageSubscriptions[].channel.messageId` | `adapter-decided` | Deployed Receive Task Message reference; CIB's public subscription API exposes only its Message name |
| `openTimers` | `adapter-derived` | Canonical projection and sort over retained timer-job rows |
| `openTimers[].id` | `adapter-derived` | Composite semantic timer occurrence identity |
| `openTimers[].id.processInstanceId` | `not-claimed` | Scenario-supplied semantic identity |
| `openTimers[].id.elementId` | `engine-observed` | Public job-definition Activity ID |
| `openTimers[].id.activation` | `adapter-decided` | Constant singleton ordinal `1`; repeated live elements are refused |
| `openTimers[].deadlineMs` | `adapter-derived` | Retained job due date relative to the controlled engine epoch |
| `openEffects` | `adapter-decided` | A CIB async-before job is only a host-realization fact, not an engine semantic effect intent |
| `openEffects[].id` | `adapter-decided` | Profile-owned projection to a semantic effect occurrence |
| `openEffects[].id.processInstanceId` | `not-claimed` | Scenario-supplied semantic identity |
| `openEffects[].id.elementId` | `engine-observed` | Public job-definition Activity ID |
| `openEffects[].id.activation` | `adapter-decided` | Singleton host-job count projected as ordinal `1` |
| `openEffects[].descriptor` | `adapter-decided` | Profile registration maps retained raw source binding to neutral identity |
| `openEffects[].descriptor.protocol` | `adapter-decided` | Profile-registered opaque protocol identity |
| `openEffects[].descriptor.operation` | `adapter-decided` | Profile-registered opaque operation identity |
| `openEffects[].arguments` | `adapter-decided` | The only ordinary CIB effect profile stamps the approved payload-free list |
| `openEffects[].arguments[].name` | `not-claimed` | No retained ordinary CIB effect wait exposes a nonempty semantic argument |
| `openEffects[].arguments[].value` | `not-claimed` | No retained ordinary CIB effect wait exposes a nonempty semantic argument |
| `openEffects[].arguments[].value.kind` | `not-claimed` | No retained ordinary CIB effect wait exposes a nonempty semantic argument |
| `openEffects[].arguments[].value.value` | `not-claimed` | No retained ordinary CIB effect wait exposes a nonempty semantic argument |
| `openIncidents` | `adapter-derived` | Exact one configured retries-zero public job plus one exact public `failedJob` incident partner becomes one canonical incident |
| `openIncidents[].kind` | `adapter-decided` | Successor profile selects the sole `effectExecutionFailed` incident kind |
| `openIncidents[].id` | `adapter-derived` | Composite of the projected effect occurrence and profile-owned literal generation 1 |
| `openIncidents[].id.effectId` | `adapter-derived` | Reuses the canonical occurrence projected from the retained public job |
| `openIncidents[].id.effectId.processInstanceId` | `not-claimed` | Scenario-supplied semantic identity |
| `openIncidents[].id.effectId.elementId` | `engine-observed` | Public job-definition Activity ID |
| `openIncidents[].id.effectId.activation` | `adapter-decided` | Singleton host-job count projected as ordinal `1` |
| `openIncidents[].id.generation` | `adapter-decided` | Successor profile owns the only admitted literal semantic generation `1` |
| `openIncidents[].effect` | `adapter-decided` | Profile maps the failed public job back to its suspended neutral effect intent |
| `openIncidents[].effect.id` | `adapter-derived` | Same projected effect occurrence used by the incident identity |
| `openIncidents[].effect.id.processInstanceId` | `not-claimed` | Scenario-supplied semantic identity |
| `openIncidents[].effect.id.elementId` | `engine-observed` | Public job-definition Activity ID |
| `openIncidents[].effect.id.activation` | `adapter-decided` | Singleton host-job count projected as ordinal `1` |
| `openIncidents[].effect.descriptor` | `adapter-decided` | Profile registration maps retained source binding to neutral identity |
| `openIncidents[].effect.descriptor.protocol` | `adapter-decided` | Profile-registered opaque protocol identity |
| `openIncidents[].effect.descriptor.operation` | `adapter-decided` | Profile-registered opaque operation identity |
| `openIncidents[].effect.arguments` | `adapter-decided` | Successor reuses the approved payload-free effect intent |
| `openIncidents[].effect.arguments[].name` | `not-claimed` | The retained incident profile exposes no nonempty semantic argument |
| `openIncidents[].effect.arguments[].value` | `not-claimed` | The retained incident profile exposes no nonempty semantic argument |
| `openIncidents[].effect.arguments[].value.kind` | `not-claimed` | The retained incident profile exposes no nonempty semantic argument |
| `openIncidents[].effect.arguments[].value.value` | `not-claimed` | The retained incident profile exposes no nonempty semantic argument |
| `openMultiInstances` | `not-claimed` | Standards-only sequential Multi-Instance progress is absent from every selected CIB profile |
| `openMultiInstances[].id` | `not-claimed` | Project-owned outer Activity occurrence identity |
| `openMultiInstances[].id.processInstanceId` | `not-claimed` | Scenario-supplied semantic identity |
| `openMultiInstances[].id.activityElementId` | `not-claimed` | Project-owned outer Activity element identity |
| `openMultiInstances[].id.activation` | `not-claimed` | Project-owned Activity occurrence activation |
| `openMultiInstances[].bodyKind` | `not-claimed` | Selected profile distinguishes a User Task from a repeated Sub-Process body |
| `openMultiInstances[].activeIterations[].body` | `not-claimed` | Project-owned repeated-body scope occurrence; no selected CIB observation |
| `openMultiInstances[].activeIterations[].body.processInstanceId` | `not-claimed` | Project-owned repeated-body scope occurrence; no selected CIB observation |
| `openMultiInstances[].activeIterations[].body.activation` | `not-claimed` | Project-owned repeated-body scope occurrence; no selected CIB observation |
| `openMultiInstances[].activeIterations[].body.definitionScopeId` | `not-claimed` | Project-owned repeated-body scope occurrence; no selected CIB observation |
| `openMultiInstances[].activeIterations[].item` | `not-claimed` | Item captured from the private collection snapshot; no selected CIB observation |
| `openMultiInstances[].activeIterations[].item.name` | `not-claimed` | Item captured from the private collection snapshot; no selected CIB observation |
| `openMultiInstances[].activeIterations[].item.value` | `not-claimed` | Item captured from the private collection snapshot; no selected CIB observation |
| `openMultiInstances[].activeIterations[].item.value.kind` | `not-claimed` | Item captured from the private collection snapshot; no selected CIB observation |
| `openMultiInstances[].activeIterations[].item.value.value` | `not-claimed` | Item captured from the private collection snapshot; no selected CIB observation |
| `openMultiInstances[].activeIterations[].bindings` | `not-claimed` | Project-owned repeated-body local data; no selected CIB observation |
| `openMultiInstances[].activeIterations[].bindings[].name` | `not-claimed` | Project-owned repeated-body local data; no selected CIB observation |
| `openMultiInstances[].activeIterations[].bindings[].value` | `not-claimed` | Project-owned repeated-body local data; no selected CIB observation |
| `openMultiInstances[].activeIterations[].bindings[].value.kind` | `not-claimed` | Project-owned repeated-body local data; no selected CIB observation |
| `openMultiInstances[].activeIterations[].bindings[].value.value` | `not-claimed` | Project-owned repeated-body local data; no selected CIB observation |
| `openMultiInstances[].activeIterations[].userTaskIds` | `not-claimed` | Project-owned inner work occurrence identity; no selected CIB observation |
| `openMultiInstances[].activeIterations[].userTaskIds[].processInstanceId` | `not-claimed` | Project-owned inner work occurrence identity; no selected CIB observation |
| `openMultiInstances[].activeIterations[].userTaskIds[].elementId` | `not-claimed` | Project-owned inner work occurrence identity; no selected CIB observation |
| `openMultiInstances[].activeIterations[].userTaskIds[].activation` | `not-claimed` | Project-owned inner work occurrence identity; no selected CIB observation |
| `openMultiInstances[].activeIterations[].effectIds` | `not-claimed` | Project-owned inner work occurrence identity; no selected CIB observation |
| `openMultiInstances[].activeIterations[].effectIds[].processInstanceId` | `not-claimed` | Project-owned inner work occurrence identity; no selected CIB observation |
| `openMultiInstances[].activeIterations[].effectIds[].elementId` | `not-claimed` | Project-owned inner work occurrence identity; no selected CIB observation |
| `openMultiInstances[].activeIterations[].effectIds[].activation` | `not-claimed` | Project-owned inner work occurrence identity; no selected CIB observation |
| `openMultiInstances[].mode` | `not-claimed` | Standards profile selects the literal `sequential` mode |
| `openMultiInstances[].plannedInstanceCount` | `not-claimed` | Derived from the private immutable snapshot under the standards profile |
| `openMultiInstances[].pendingItemCount` | `not-claimed` | Derived from the snapshot and completed slots under the standards profile |
| `openMultiInstances[].numberOfInstances` | `not-claimed` | Standards-profile arithmetic over active, completed, and terminated counts |
| `openMultiInstances[].numberOfActiveInstances` | `not-claimed` | Derived from the project-owned Activity occurrence body |
| `openMultiInstances[].numberOfCompletedInstances` | `not-claimed` | Derived from project-owned dense output slots |
| `openMultiInstances[].numberOfTerminatedInstances` | `not-claimed` | The bounded standards profile projects zero while the controller remains open |
| `openMultiInstances[].activeIterations` | `not-claimed` | Project-owned active iteration projection |
| `openMultiInstances[].activeIterations[].loopCounter` | `not-claimed` | Zero-based project-owned snapshot position |
| `openMultiInstances[].activeIterations[].taskId` | `not-claimed` | Project-owned inner User Task occurrence identity |
| `openMultiInstances[].activeIterations[].taskId.processInstanceId` | `not-claimed` | Scenario-supplied semantic identity |
| `openMultiInstances[].activeIterations[].taskId.elementId` | `not-claimed` | Standards-profile inner User Task identity |
| `openMultiInstances[].activeIterations[].taskId.activation` | `not-claimed` | Project-owned inner task activation |
| `openMultiInstances[].activeIterations[].taskInput` | `not-claimed` | Project-owned scalar projection of one private snapshot item |
| `openMultiInstances[].activeIterations[].taskInput.name` | `not-claimed` | Exact standards-profile task DataInput identity |
| `openMultiInstances[].activeIterations[].taskInput.value` | `not-claimed` | Exact standards-profile scalar task input value |
| `openMultiInstances[].activeIterations[].taskInput.value.kind` | `not-claimed` | Standards profile selects the literal `string` kind |
| `openMultiInstances[].activeIterations[].taskInput.value.value` | `not-claimed` | Project-owned snapshot item value |
| `openMultiInstances[].activeIterations[].completionBindingName` | `not-claimed` | Exact standards-profile task DataOutput identity |
| `variables` | `adapter-derived` | Canonical type projection and Unicode name sort over retained Process-variable runtime/history rows selected only by names from already committed start or completion commands |
| `variables[].name` | `engine-observed` | Historic Process-variable name within the adapter-selected committed-name boundary |
| `variables[].value` | `adapter-derived` | Raw host `String`, `Boolean`, or `null` projected into the canonical discriminated value |
| `variables[].value.kind` | `adapter-derived` | `string`, `boolean`, or `null` selected from the raw host value without text coercion |
| `variables[].value.value` | `engine-observed` | Exact host String or Boolean when the value is non-null |
| `enabledInteractions` | `adapter-derived` | One project command interaction per retained live User Task, Receive Task Message subscription, or exact configured effect incident; the cancellation successor publishes Retry before Cancel from the same validated job/incident partner |
| `enabledInteractions[].kind` | `adapter-decided` | Project command vocabulary selects task completion, Message delivery, incident retry, or the approved successor cancellation from the retained host collection |
| `enabledInteractions[].address` | `not-claimed` | Correlated publication is outside the selected CIB compatibility surface; the standards-only semantic account owns this complete address |
| `enabledInteractions[].address.definition` | `not-claimed` | Project-owned immutable semantic-definition identity, not a CIB runtime fact |
| `enabledInteractions[].address.definition.compiler` | `not-claimed` | Project-owned compiler identity |
| `enabledInteractions[].address.definition.semanticProfile` | `not-claimed` | Project-owned semantic-profile identity |
| `enabledInteractions[].address.definition.sourceOverlay` | `not-claimed` | Project-owned optional source-overlay identity |
| `enabledInteractions[].address.definition.sourceOverlay.id` | `not-claimed` | Project-owned source-overlay identifier when present |
| `enabledInteractions[].address.definition.sourceOverlay.sha256` | `not-claimed` | Project-owned exact source-overlay digest when present |
| `enabledInteractions[].address.definition.sourceId` | `not-claimed` | Project-owned admitted source identity |
| `enabledInteractions[].address.definition.sourceSha256` | `not-claimed` | Project-owned exact BPMN source digest |
| `enabledInteractions[].address.processId` | `not-claimed` | Project-owned BPMN Process identity |
| `enabledInteractions[].address.channel` | `not-claimed` | Standards-only operation-bound Message channel, outside the selected CIB compatibility surface |
| `enabledInteractions[].address.channel.kind` | `not-claimed` | Standards-only operation-Message discriminant |
| `enabledInteractions[].address.channel.interfaceId` | `not-claimed` | BPMN Interface identity from the admitted definition |
| `enabledInteractions[].address.channel.interfaceOperationId` | `not-claimed` | BPMN Interface Operation identity from the admitted definition |
| `enabledInteractions[].address.channel.messageId` | `not-claimed` | BPMN Message identity from the admitted definition |
| `enabledInteractions[].address.correlationKeyId` | `not-claimed` | BPMN CorrelationKey identity from the admitted definition |
| `enabledInteractions[].processInstanceId` | `not-claimed` | Scenario-supplied semantic root identity for the approved cancellation interaction, never a generated CIB Process-instance ID |
| `enabledInteractions[].subscriptionId` | `adapter-derived` | Reuses the projected Message subscription occurrence |
| `enabledInteractions[].subscriptionId.processInstanceId` | `not-claimed` | Scenario-supplied semantic identity |
| `enabledInteractions[].subscriptionId.elementId` | `engine-observed` | Public Message-subscription Activity ID |
| `enabledInteractions[].subscriptionId.activation` | `adapter-decided` | Same singleton ordinal as the projected subscription |
| `enabledInteractions[].channel` | `adapter-decided` | Reuses the profile-owned direct Message channel |
| `enabledInteractions[].channel.kind` | `adapter-decided` | Profile-owned `directMessage` discriminant |
| `enabledInteractions[].channel.interfaceId` | `not-claimed` | Structurally absent from the direct-Message arm |
| `enabledInteractions[].channel.interfaceOperationId` | `not-claimed` | Structurally absent from the direct-Message arm |
| `enabledInteractions[].channel.messageId` | `adapter-decided` | Same deployed Receive Task Message reference as the projected subscription |
| `enabledInteractions[].taskId` | `adapter-derived` | Reuses the projected User Task occurrence |
| `enabledInteractions[].taskId.processInstanceId` | `not-claimed` | Scenario-supplied semantic identity |
| `enabledInteractions[].taskId.elementId` | `engine-observed` | Public task definition key |
| `enabledInteractions[].taskId.activation` | `adapter-decided` | Same unsupported singleton ordinal as the projected User Task |
| `enabledInteractions[].incidentId` | `adapter-derived` | Reuses the exact projected open-incident identity while its public failed-job partner exists |
| `enabledInteractions[].incidentId.effectId` | `adapter-derived` | Reuses the projected failed effect occurrence |
| `enabledInteractions[].incidentId.effectId.processInstanceId` | `not-claimed` | Scenario-supplied semantic identity |
| `enabledInteractions[].incidentId.effectId.elementId` | `engine-observed` | Public job-definition Activity ID |
| `enabledInteractions[].incidentId.effectId.activation` | `adapter-decided` | Same singleton ordinal as the projected incident effect |
| `enabledInteractions[].incidentId.generation` | `adapter-decided` | Same profile-owned literal generation `1` as the open incident |
| `logicalTimeMs` | `adapter-derived` | Retained controlled engine-clock reading relative to the fixed logical epoch |

Retained `stateQueries` bind canonical status, logical time, and the bounded Process-variable projection to raw public runtime/history queries and the controlled engine clock. The projector's set of eligible variable names is derived only from start or completion commands after the runner observes their committed semantic outcome; this prevents scenario look-ahead and rejected-command leakage while leaving each retained name and raw nullable value engine-observed. Task, Message-subscription, timer, and effect snapshots bind the five wait/interaction collections. `kind` remains schema-guarded, while every semantic instance component is checked against the answer-free start stimulus rather than a generated host ID. The verifier deliberately shares the Java projector's projection rules, so it establishes raw-to-canonical consistency and is not a third independent semantic producer.

Neutral projection does not increase source-binding independence. Lean independently recomputes and checks neutral checked-graph-to-program lowering. The raw Camunda binding to neutral protocol/operation translation is performed by the shared source/profile projection and rechecked by the CIB raw-binding mutation; Lean does not derive that translation from source bytes.
