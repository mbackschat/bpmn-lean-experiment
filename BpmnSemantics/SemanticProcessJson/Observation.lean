module

public import BpmnSemantics.SemanticProcess.JsonSupport

/-! Canonical observation JSON shared by the Semantic Process and engine-population runners.
Closed semantic variants are matched exhaustively so both evidence lanes observe the same contract. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcessJson.Observation

open BpmnSemantics
open BpmnSemantics.SemanticProcessJson
open Lean

def jsonArray (values : List Json) : Json :=
  .arr values.toArray

def commandOutcomeJson : CommandOutcome → Json
  | .committed => toJson "committed"
  | .rolledBack => toJson "rolledBack"
  | .rejected => toJson "rejected"
  | .semanticFailure => toJson "semanticFailure"
  | .unsupported => toJson "unsupported"

def processStatusJson : ProcessStatus → Json
  | .notStarted => toJson "notStarted"
  | .running => toJson "running"
  | .completed => toJson "completed"
  | .cancelled => toJson "cancelled"
  | .failed => toJson "failed"

def waitKindJson : WaitKind → Json
  | .userTask => toJson "userTask"
  | .message => toJson "message"
  | .timer => toJson "timer"
  | .effect => toJson "effect"
  | .incident => toJson "incident"

def occurrenceIdJson (occurrenceId : OccurrenceId) : Json :=
  Json.mkObj
    [ ("processInstanceId", toJson occurrenceId.processInstanceId.value)
    , ("elementId", toJson occurrenceId.elementId.value)
    , ("activation", toJson occurrenceId.activation) ]

def compensationHandlerFailureJson
    (failure : CompensationHandlerFailure) : Json :=
  Json.mkObj
    [ ("kind", toJson "compensationHandlerFailure")
    , ("triggerId", occurrenceIdJson failure.triggerId)
    , ("handlerId", occurrenceIdJson failure.handlerId)
    , ("effectId", occurrenceIdJson failure.effectId)
    , ("code", toJson failure.code)
    , ("message", toJson failure.message) ]

def activeWaitJson (wait : ActiveWait) : Json :=
  Json.mkObj
    [ ("elementId", toJson wait.elementId.value)
    , ("kind", waitKindJson wait.kind)
    , ("multiplicity", toJson wait.multiplicity) ]

def variableBindingJson (binding : VariableBinding) : Json :=
  Json.mkObj
    [ ("name", toJson binding.name)
    , ("value", encodeVariableValue binding.value) ]

def userTaskLifecycleStateJson : UserTaskLifecycleState → Json
  | .active => toJson "active"

/-- Encode one public User Task and omit metadata and selected inputs physically when the contract
values are absent, so every profile that publishes neither keeps its existing canonical bytes. -/
def encodeOpenUserTask (task : OpenUserTask) : Json :=
  let fields :=
    [ ("id", occurrenceIdJson task.id)
    , ("name", toJson task.name)
    , ("state", userTaskLifecycleStateJson task.state) ]
  let withMetadata := match task.metadata with
    | none => fields
    | some metadata => fields ++ [("metadata", encodeUserTaskMetadata metadata)]
  Json.mkObj <| match task.inputs with
    | none => withMetadata
    | some inputs =>
        withMetadata ++ [("inputs", jsonArray (inputs.map variableBindingJson))]

def messageChannelJson : MessageChannel → Json
  | .operationMessage interfaceId interfaceOperationId messageId =>
      Json.mkObj
        [ ("kind", toJson "operationMessage")
        , ("interfaceId", toJson interfaceId.value)
        , ("interfaceOperationId", toJson interfaceOperationId.value)
        , ("messageId", toJson messageId.value) ]
  | .directMessage messageId =>
      Json.mkObj
        [ ("kind", toJson "directMessage")
        , ("messageId", toJson messageId.value) ]

def sourceOverlayIdentityJson : Option SourceOverlayIdentity → Json
  | none => .null
  | some identity =>
      Json.mkObj
        [ ("id", toJson identity.id.value)
        , ("sha256", toJson identity.sha256) ]

def programIdentityJson (identity : ProgramIdentity) : Json :=
  Json.mkObj
    [ ("compiler", match identity.compiler with
        | .bpmnSourceSemanticProcess => toJson "bpmn-source-semantic-process")
    , ("semanticProfile", toJson identity.semanticProfile.value)
    , ("sourceId", toJson identity.sourceId.value)
    , ("sourceOverlay", sourceOverlayIdentityJson identity.sourceOverlay)
    , ("sourceSha256", toJson identity.sourceSha256) ]

def correlatedMessageAddressJson
    (address : CorrelatedMessageAddress) : Json :=
  Json.mkObj
    [ ("definition", programIdentityJson address.definition)
    , ("processId", toJson address.processId.value)
    , ("channel", messageChannelJson address.channel)
    , ("correlationKeyId", toJson address.correlationKeyId) ]

def openMessageSubscriptionJson
    (subscription : OpenMessageSubscription) : Json :=
  Json.mkObj
    [ ("id", occurrenceIdJson subscription.id)
    , ("channel", messageChannelJson subscription.channel) ]

def openTimerJson (timer : OpenTimer) : Json :=
  Json.mkObj
    [ ("id", occurrenceIdJson timer.id)
    , ("deadlineMs", toJson timer.deadlineMs) ]

def effectDescriptorJson (descriptor : EffectDescriptor) : Json :=
  Json.mkObj
    [ ("protocol", toJson descriptor.protocol)
    , ("operation", toJson descriptor.operation) ]

def activityOccurrenceIdJson (id : ActivityOccurrenceId) : Json :=
  Json.mkObj
    [ ("processInstanceId", toJson id.processInstanceId.value)
    , ("activityElementId", toJson id.activityElementId.value)
    , ("activation", toJson id.activation) ]

def openSequentialMultiInstanceIterationJson
    (iteration : OpenSequentialMultiInstanceIteration) : Json :=
  Json.mkObj
    [ ("loopCounter", toJson iteration.loopCounter)
    , ("taskId", occurrenceIdJson iteration.taskId)
    , ("taskInput", variableBindingJson iteration.taskInput)
    , ("completionBindingName", toJson iteration.completionBindingName) ]

def openSequentialMultiInstanceJson
    (multiInstance : OpenSequentialMultiInstance) : Json :=
  Json.mkObj
    [ ("id", activityOccurrenceIdJson multiInstance.id)
    , ("mode", toJson "sequential")
    , ("bodyKind", toJson "userTask")
    , ("plannedInstanceCount", toJson multiInstance.plannedInstanceCount)
    , ("pendingItemCount", toJson multiInstance.pendingItemCount)
    , ("numberOfInstances", toJson multiInstance.numberOfInstances)
    , ("numberOfActiveInstances", toJson multiInstance.numberOfActiveInstances)
    , ("numberOfCompletedInstances", toJson multiInstance.numberOfCompletedInstances)
    , ("numberOfTerminatedInstances", toJson multiInstance.numberOfTerminatedInstances)
    , ("activeIterations",
        jsonArray
          (multiInstance.activeIterations.map openSequentialMultiInstanceIterationJson)) ]

def openParallelMultiInstanceIterationJson
    (iteration : OpenParallelMultiInstanceIteration) : Json :=
  Json.mkObj
    [ ("loopCounter", toJson iteration.loopCounter)
    , ("taskId", occurrenceIdJson iteration.taskId)
    , ("taskInput", variableBindingJson iteration.taskInput)
    , ("completionBindingName", toJson iteration.completionBindingName) ]

def openParallelMultiInstanceJson
    (multiInstance : OpenParallelMultiInstance) : Json :=
  Json.mkObj
    [ ("id", activityOccurrenceIdJson multiInstance.id)
    , ("mode", toJson "parallel")
    , ("bodyKind", toJson "userTask")
    , ("plannedInstanceCount", toJson multiInstance.plannedInstanceCount)
    , ("pendingItemCount", toJson multiInstance.pendingItemCount)
    , ("numberOfInstances", toJson multiInstance.numberOfInstances)
    , ("numberOfActiveInstances", toJson multiInstance.numberOfActiveInstances)
    , ("numberOfCompletedInstances", toJson multiInstance.numberOfCompletedInstances)
    , ("numberOfTerminatedInstances", toJson multiInstance.numberOfTerminatedInstances)
    , ("activeIterations",
        jsonArray
          (multiInstance.activeIterations.map openParallelMultiInstanceIterationJson)) ]

def subProcessIterationJson (iteration : OpenSubProcessIteration) : Json :=
  Json.mkObj
    [ ("loopCounter", toJson iteration.loopCounter)
    , ("body", Json.mkObj
        [ ("processInstanceId", toJson iteration.body.processInstanceId.value)
        , ("definitionScopeId", toJson iteration.body.definitionScopeId.value)
        , ("activation", toJson iteration.body.activation) ])
    , ("item", variableBindingJson iteration.item)
    , ("bindings", jsonArray (iteration.bindings.map variableBindingJson))
    , ("userTaskIds", jsonArray (iteration.userTaskIds.map occurrenceIdJson))
    , ("effectIds", jsonArray (iteration.effectIds.map occurrenceIdJson)) ]

def sequentialSubProcessMultiInstanceJson
    (value : OpenSequentialSubProcessMultiInstance) : Json :=
  Json.mkObj
    [ ("id", activityOccurrenceIdJson value.id)
    , ("mode", toJson "sequential")
    , ("bodyKind", toJson "subProcess")
    , ("plannedInstanceCount", toJson value.plannedInstanceCount)
    , ("pendingItemCount", toJson value.pendingItemCount)
    , ("numberOfInstances", toJson value.numberOfInstances)
    , ("numberOfActiveInstances", toJson value.numberOfActiveInstances)
    , ("numberOfCompletedInstances", toJson value.numberOfCompletedInstances)
    , ("numberOfTerminatedInstances", toJson value.numberOfTerminatedInstances)
    , ("activeIterations", jsonArray (value.activeIterations.map subProcessIterationJson)) ]

def openMultiInstanceJson : OpenMultiInstance → Json
  | .sequentialSubProcess value => sequentialSubProcessMultiInstanceJson value
  | .sequential value => openSequentialMultiInstanceJson value
  | .parallel value => openParallelMultiInstanceJson value

def openEffectJson (effect : OpenEffect) : Json :=
  Json.mkObj
    [ ("id", occurrenceIdJson effect.id)
    , ("descriptor", effectDescriptorJson effect.descriptor)
    , ("arguments", jsonArray (effect.arguments.map variableBindingJson)) ]

def effectIncidentIdJson (incidentId : EffectIncidentId) : Json :=
  Json.mkObj
    [ ("effectId", occurrenceIdJson incidentId.effectId)
    , ("generation", toJson incidentId.generation) ]

def openEffectIncidentJson (incident : OpenEffectIncident) : Json :=
  Json.mkObj
    [ ("kind", match incident.kind with
        | .effectExecutionFailed => toJson "effectExecutionFailed")
    , ("id", effectIncidentIdJson incident.id)
    , ("effect", openEffectJson incident.effect) ]

def enabledInteractionJson : EnabledInteraction → Json
  | .completeUserTaskInstance taskId =>
      Json.mkObj
        [ ("kind", toJson "completeUserTaskInstance")
        , ("taskId", occurrenceIdJson taskId) ]
  | .deliverMessage subscriptionId channel =>
      Json.mkObj
        [ ("kind", toJson "deliverMessage")
        , ("subscriptionId", occurrenceIdJson subscriptionId)
        , ("channel", messageChannelJson channel) ]
  | .deliverPayloadMessage subscriptionId channel =>
      Json.mkObj
        [ ("kind", toJson "deliverPayloadMessage")
        , ("subscriptionId", occurrenceIdJson subscriptionId)
        , ("channel", messageChannelJson channel) ]
  | .publishCorrelatedPayloadMessage address =>
      Json.mkObj
        [ ("kind", toJson "publishCorrelatedPayloadMessage")
        , ("address", correlatedMessageAddressJson address) ]
  | .retryIncident incidentId =>
      Json.mkObj
        [ ("kind", toJson "retryIncident")
        , ("incidentId", effectIncidentIdJson incidentId) ]
  | .cancelIncidentProcess processInstanceId incidentId =>
      Json.mkObj
        [ ("kind", toJson "cancelIncidentProcess")
        , ("processInstanceId", toJson processInstanceId.value)
        , ("incidentId", effectIncidentIdJson incidentId) ]

def stateObservationJson (state : StateObservation) : Json :=
  let identityAndStatus :=
    [ ("kind", toJson "state")
    , ("instanceId", toJson state.instanceId.value)
    , ("status", processStatusJson state.status) ]
  let failure := match state.status, state.failure with
    | .failed, some failure =>
        [("failure", compensationHandlerFailureJson failure)]
    | _, _ => []
  let beforeMultiInstance := identityAndStatus ++ failure ++
    [ ("activeWaits", jsonArray (state.activeWaits.map activeWaitJson))
    , ("openUserTasks", jsonArray (state.openUserTasks.map encodeOpenUserTask))
    , ("openMessageSubscriptions",
        jsonArray
          (state.openMessageSubscriptions.map openMessageSubscriptionJson))
    , ("openTimers", jsonArray (state.openTimers.map openTimerJson))
    , ("openEffects", jsonArray (state.openEffects.map openEffectJson))
    , ("openIncidents",
        jsonArray (state.openIncidents.map openEffectIncidentJson)) ]
  let multiInstance := match state.openMultiInstances with
    | none => []
    | some openMultiInstances =>
        [("openMultiInstances",
          jsonArray (openMultiInstances.map openMultiInstanceJson))]
  Json.mkObj <| beforeMultiInstance ++ multiInstance ++
    [ ("variables", jsonArray (state.variables.map variableBindingJson))
    , ("enabledInteractions",
        jsonArray (state.enabledInteractions.map enabledInteractionJson))
    , ("logicalTimeMs", toJson state.logicalTimeMs) ]

end BpmnSemantics.SemanticProcessJson.Observation
