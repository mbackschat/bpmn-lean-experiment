import BpmnSemantics.EnginePopulationScenarioJson
import BpmnSemantics.SemanticProcessJson.DefinitionInput

/-! Canonical JSON-lines emitter for admitted engine-population scenarios. -/

namespace BpmnSemantics.EnginePopulationScenarioJsonMain

open BpmnSemantics
open BpmnSemantics.EnginePopulationScenario
open BpmnSemantics.EnginePopulationScenarioJson
open BpmnSemantics.SemanticProcessJson
open Lean

private def jsonArray (values : List Json) : Json :=
  .arr values.toArray

private def processStatusJson : ProcessStatus → Json
  | .notStarted => toJson "notStarted"
  | .running => toJson "running"
  | .completed => toJson "completed"
  | .cancelled => toJson "cancelled"
  | .failed => toJson "failed"

private def waitKindJson : WaitKind → Json
  | .userTask => toJson "userTask"
  | .message => toJson "message"
  | .timer => toJson "timer"
  | .effect => toJson "effect"
  | .incident => toJson "incident"

private def occurrenceIdJson (occurrenceId : OccurrenceId) : Json :=
  Json.mkObj
    [ ("processInstanceId", toJson occurrenceId.processInstanceId.value)
    , ("elementId", toJson occurrenceId.elementId.value)
    , ("activation", toJson occurrenceId.activation) ]

private def compensationHandlerFailureJson
    (failure : CompensationHandlerFailure) : Json :=
  Json.mkObj
    [ ("kind", toJson "compensationHandlerFailure")
    , ("triggerId", occurrenceIdJson failure.triggerId)
    , ("handlerId", occurrenceIdJson failure.handlerId)
    , ("effectId", occurrenceIdJson failure.effectId)
    , ("code", toJson failure.code)
    , ("message", toJson failure.message) ]

private def activeWaitJson (wait : ActiveWait) : Json :=
  Json.mkObj
    [ ("elementId", toJson wait.elementId.value)
    , ("kind", waitKindJson wait.kind)
    , ("multiplicity", toJson wait.multiplicity) ]

private def variableBindingJson (binding : VariableBinding) : Json :=
  Json.mkObj
    [ ("name", toJson binding.name)
    , ("value", encodeVariableValue binding.value) ]

private def userTaskJson (task : OpenUserTask) : Json :=
  let fields :=
    [ ("id", occurrenceIdJson task.id)
    , ("name", toJson task.name)
    , ("state", toJson "active") ]
  let withMetadata := match task.metadata with
    | none => fields
    | some metadata => fields ++ [("metadata", encodeUserTaskMetadata metadata)]
  Json.mkObj <| match task.inputs with
    | none => withMetadata
    | some inputs => withMetadata ++ [("inputs", jsonArray (inputs.map variableBindingJson))]

private def messageChannelJson : MessageChannel → Json
  | .operationMessage interfaceId operationId messageId =>
      Json.mkObj
        [ ("kind", toJson "operationMessage")
        , ("interfaceId", toJson interfaceId.value)
        , ("interfaceOperationId", toJson operationId.value)
        , ("messageId", toJson messageId.value) ]
  | .directMessage messageId =>
      Json.mkObj
        [ ("kind", toJson "directMessage")
        , ("messageId", toJson messageId.value) ]

private def sourceOverlayJson : Option SourceOverlayIdentity → Json
  | none => .null
  | some overlay =>
      Json.mkObj
        [("id", toJson overlay.id.value), ("sha256", toJson overlay.sha256)]

private def programIdentityJson (identity : ProgramIdentity) : Json :=
  Json.mkObj
    [ ("compiler", toJson "bpmn-source-semantic-process")
    , ("semanticProfile", toJson identity.semanticProfile.value)
    , ("sourceId", toJson identity.sourceId.value)
    , ("sourceOverlay", sourceOverlayJson identity.sourceOverlay)
    , ("sourceSha256", toJson identity.sourceSha256) ]

private def correlatedMessageAddressJson
    (address : CorrelatedMessageAddress) : Json :=
  Json.mkObj
    [ ("definition", programIdentityJson address.definition)
    , ("processId", toJson address.processId.value)
    , ("channel", messageChannelJson address.channel)
    , ("correlationKeyId", toJson address.correlationKeyId) ]

private def openMessageSubscriptionJson
    (subscription : OpenMessageSubscription) : Json :=
  Json.mkObj
    [ ("id", occurrenceIdJson subscription.id)
    , ("channel", messageChannelJson subscription.channel) ]

private def openTimerJson (timer : OpenTimer) : Json :=
  Json.mkObj
    [ ("id", occurrenceIdJson timer.id)
    , ("deadlineMs", toJson timer.deadlineMs) ]

private def effectDescriptorJson (descriptor : EffectDescriptor) : Json :=
  Json.mkObj
    [ ("protocol", toJson descriptor.protocol)
    , ("operation", toJson descriptor.operation) ]

private def openEffectJson (effect : OpenEffect) : Json :=
  Json.mkObj
    [ ("id", occurrenceIdJson effect.id)
    , ("descriptor", effectDescriptorJson effect.descriptor)
    , ("arguments", jsonArray (effect.arguments.map variableBindingJson)) ]

private def effectIncidentIdJson (incidentId : EffectIncidentId) : Json :=
  Json.mkObj
    [ ("effectId", occurrenceIdJson incidentId.effectId)
    , ("generation", toJson incidentId.generation) ]

private def openIncidentJson (incident : OpenEffectIncident) : Json :=
  Json.mkObj
    [ ("kind", toJson "effectExecutionFailed")
    , ("id", effectIncidentIdJson incident.id)
    , ("effect", openEffectJson incident.effect) ]

private def activityOccurrenceIdJson (id : ActivityOccurrenceId) : Json :=
  Json.mkObj
    [ ("processInstanceId", toJson id.processInstanceId.value)
    , ("activityElementId", toJson id.activityElementId.value)
    , ("activation", toJson id.activation) ]

private def sequentialIterationJson
    (iteration : OpenSequentialMultiInstanceIteration) : Json :=
  Json.mkObj
    [ ("loopCounter", toJson iteration.loopCounter)
    , ("taskId", occurrenceIdJson iteration.taskId)
    , ("taskInput", variableBindingJson iteration.taskInput)
    , ("completionBindingName", toJson iteration.completionBindingName) ]

private def sequentialMultiInstanceJson
    (multiInstance : OpenSequentialMultiInstance) : Json :=
  Json.mkObj
    [ ("id", activityOccurrenceIdJson multiInstance.id)
    , ("mode", toJson "sequential")
    , ("plannedInstanceCount", toJson multiInstance.plannedInstanceCount)
    , ("pendingItemCount", toJson multiInstance.pendingItemCount)
    , ("numberOfInstances", toJson multiInstance.numberOfInstances)
    , ("numberOfActiveInstances", toJson multiInstance.numberOfActiveInstances)
    , ("numberOfCompletedInstances", toJson multiInstance.numberOfCompletedInstances)
    , ("numberOfTerminatedInstances", toJson multiInstance.numberOfTerminatedInstances)
    , ("activeIterations",
        jsonArray (multiInstance.activeIterations.map sequentialIterationJson)) ]

private def parallelIterationJson
    (iteration : OpenParallelMultiInstanceIteration) : Json :=
  Json.mkObj
    [ ("loopCounter", toJson iteration.loopCounter)
    , ("taskId", occurrenceIdJson iteration.taskId)
    , ("taskInput", variableBindingJson iteration.taskInput)
    , ("completionBindingName", toJson iteration.completionBindingName) ]

private def parallelMultiInstanceJson
    (multiInstance : OpenParallelMultiInstance) : Json :=
  Json.mkObj
    [ ("id", activityOccurrenceIdJson multiInstance.id)
    , ("mode", toJson "parallel")
    , ("plannedInstanceCount", toJson multiInstance.plannedInstanceCount)
    , ("pendingItemCount", toJson multiInstance.pendingItemCount)
    , ("numberOfInstances", toJson multiInstance.numberOfInstances)
    , ("numberOfActiveInstances", toJson multiInstance.numberOfActiveInstances)
    , ("numberOfCompletedInstances", toJson multiInstance.numberOfCompletedInstances)
    , ("numberOfTerminatedInstances", toJson multiInstance.numberOfTerminatedInstances)
    , ("activeIterations",
        jsonArray (multiInstance.activeIterations.map parallelIterationJson)) ]

private def openMultiInstanceJson : OpenMultiInstance → Json
  | .sequential value => sequentialMultiInstanceJson value
  | .parallel value => parallelMultiInstanceJson value

private def enabledInteractionJson : EnabledInteraction → Json
  | .completeUserTaskInstance taskId =>
      Json.mkObj
        [("kind", toJson "completeUserTaskInstance"),
          ("taskId", occurrenceIdJson taskId)]
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
        [("kind", toJson "retryIncident"),
          ("incidentId", effectIncidentIdJson incidentId)]
  | .cancelIncidentProcess instanceId incidentId =>
      Json.mkObj
        [ ("kind", toJson "cancelIncidentProcess")
        , ("processInstanceId", toJson instanceId.value)
        , ("incidentId", effectIncidentIdJson incidentId) ]

private def stateObservationJson (state : StateObservation) : Json :=
  let identityAndStatus :=
    [ ("kind", toJson "state")
    , ("instanceId", toJson state.instanceId.value)
    , ("status", processStatusJson state.status) ]
  let failure := match state.status, state.failure with
    | .failed, some value => [("failure", compensationHandlerFailureJson value)]
    | _, _ => []
  let beforeMultiInstance := identityAndStatus ++ failure ++
    [ ("activeWaits", jsonArray (state.activeWaits.map activeWaitJson))
    , ("openUserTasks", jsonArray (state.openUserTasks.map userTaskJson))
    , ("openMessageSubscriptions",
        jsonArray (state.openMessageSubscriptions.map openMessageSubscriptionJson))
    , ("openTimers", jsonArray (state.openTimers.map openTimerJson))
    , ("openEffects", jsonArray (state.openEffects.map openEffectJson))
    , ("openIncidents", jsonArray (state.openIncidents.map openIncidentJson)) ]
  let multiInstances := match state.openMultiInstances with
    | none => []
    | some values => [("openMultiInstances", jsonArray (values.map openMultiInstanceJson))]
  Json.mkObj <| beforeMultiInstance ++ multiInstances ++
    [ ("variables", jsonArray (state.variables.map variableBindingJson))
    , ("enabledInteractions",
        jsonArray (state.enabledInteractions.map enabledInteractionJson))
    , ("logicalTimeMs", toJson state.logicalTimeMs) ]

private def resourceIdentityJson (resource : ResourceIdentity) : Json :=
  Json.mkObj
    [ ("id", toJson resource.id.value)
    , ("relativePath", toJson resource.relativePath)
    , ("sha256", toJson resource.sha256)
    , ("sourceOverlay", sourceOverlayJson resource.sourceOverlay) ]

private def initializationStimulusJson : Stimulus → Option Json
  | .startProcess commandId processId instanceId initialVariables =>
      some <| Json.mkObj
        [ ("kind", toJson "startProcess")
        , ("commandId", toJson commandId.value)
        , ("processId", toJson processId.value)
        , ("instanceId", toJson instanceId.value)
        , ("initialVariables",
            jsonArray (initialVariables.map variableBindingJson)) ]
  | .deliverPayloadMessage commandId subscriptionId channel payload =>
      some <| Json.mkObj
        [ ("kind", toJson "deliverPayloadMessage")
        , ("commandId", toJson commandId.value)
        , ("subscriptionId", occurrenceIdJson subscriptionId)
        , ("channel", messageChannelJson channel)
        , ("payload", encodeVariableValue payload) ]
  | _ => none

private def instanceJson? (processInstance : EnginePopulationInstance) : Option Json := do
  let stimuli ← processInstance.stimuli.mapM initializationStimulusJson
  some <| Json.mkObj
    [ ("definitionId", toJson processInstance.definitionId.value)
    , ("stimuli", jsonArray stimuli) ]

private def publicationJson (publication : EnginePopulationPublication) : Json :=
  Json.mkObj
    [ ("kind", toJson "publishCorrelatedPayloadMessage")
    , ("commandId", toJson publication.commandId.value)
    , ("address", correlatedMessageAddressJson publication.address)
    , ("payload", Json.mkObj
        [("kind", toJson "string"), ("value", toJson publication.payload.value)]) ]

private def provenanceJson (provenance : ScenarioProvenance) : Json :=
  Json.mkObj
    [ ("normativeRefs", toJson provenance.normativeRefs)
    , ("cibRevision", toJson provenance.cibRevision)
    , ("cibRefs", toJson provenance.cibRefs) ]

private def scenarioJson? (scenario : EnginePopulationScenario) : Option Json := do
  let instances ← scenario.instances.mapM instanceJson?
  some <| Json.mkObj
    [ ("kind", toJson "enginePopulationScenario")
    , ("id", toJson scenario.id.value)
    , ("profile", toJson scenario.profile.value)
    , ("definitions", jsonArray (scenario.definitions.map resourceIdentityJson))
    , ("instances", jsonArray instances)
    , ("publications", jsonArray (scenario.publications.map publicationJson))
    , ("observations", toJson
        ["publicationResults", "processStates", "ingressOrdinals"])
    , ("executionTargets", Json.mkObj
        [ ("lean", toJson scenario.executionTargets.leanTarget)
        , ("typeScriptCore", toJson scenario.executionTargets.typeScriptCore)
        , ("temporal", toJson scenario.executionTargets.temporal)
        , ("cib", .null) ])
    , ("provenance", provenanceJson scenario.provenance) ]

private def targetJson (target : EnginePopulationTarget) : Json :=
  Json.mkObj
    [ ("processInstanceId", toJson target.processInstanceId.value)
    , ("subscriptionId", occurrenceIdJson target.subscriptionId) ]

private def publicationOutcomeJson : EnginePopulationPublicationOutcome → Json
  | .committed target =>
      Json.mkObj [("kind", toJson "committed"), ("target", targetJson target)]
  | .rejectedNoMatch => Json.mkObj [("kind", toJson "rejectedNoMatch")]
  | .rejectedAmbiguous => Json.mkObj [("kind", toJson "rejectedAmbiguous")]

private def publicationResultJson
    (result : EnginePopulationPublicationResult) : Json :=
  Json.mkObj
    [ ("commandId", toJson result.commandId.value)
    , ("ingressOrdinal", toJson result.ingressOrdinal)
    , ("outcome", publicationOutcomeJson result.outcome) ]

private def ingressOrdinalJson (ordinal : EnginePopulationIngressOrdinal) : Json :=
  Json.mkObj
    [ ("commandId", toJson ordinal.commandId.value)
    , ("ingressOrdinal", toJson ordinal.ingressOrdinal) ]

private def resultJson (result : EnginePopulationResult) : Json :=
  Json.mkObj
    [ ("kind", toJson "enginePopulationResult")
    , ("scenarioId", toJson result.scenarioId.value)
    , ("publicationResults",
        jsonArray (result.publicationResults.map publicationResultJson))
    , ("processStates", jsonArray (result.processStates.map stateObservationJson))
    , ("ingressOrdinals",
        jsonArray (result.ingressOrdinals.map ingressOrdinalJson)) ]

private def readDefinitionInputs (path : System.FilePath) :
    IO (List DefinitionInput) := do
  let contents ← IO.FS.readFile path
  let lines := (contents.splitOn "\n").filter fun line => !line.isEmpty
  lines.mapM fun line =>
    match decodeAndValidateDefinitionInput line with
    | .ok input => pure input
    | .error message => throw (IO.userError message)

private def readScenario (path : System.FilePath) :
    IO EnginePopulationScenario := do
  let contents ← IO.FS.readFile path
  match decodeEnginePopulationScenarioDocument contents with
  | .ok scenario => pure scenario
  | .error message =>
      throw (IO.userError s!"invalid engine population scenario {path}: {message}")

private def bindingsForScenario (inputs : List DefinitionInput)
    (scenario : EnginePopulationScenario) :
    List (SemanticId × BpmnSemantics.SemanticProcess.Program) :=
  (inputs.filter fun input => input.scenarioId = scenario.id).map fun input =>
    (input.checkedProcess.identity.sourceId, input.semanticProcess)

private def resultRecordJson? (inputs : List DefinitionInput)
    (scenario : EnginePopulationScenario) : Option Json := do
  let scenarioJson ← scenarioJson? scenario
  let result ← runEnginePopulationScenario scenario
    (bindingsForScenario inputs scenario)
  some <| Json.mkObj
    [ ("scenarioId", toJson scenario.id.value)
    , ("scenario", scenarioJson)
    , ("result", resultJson result) ]

def emit (definitionInputPath : System.FilePath)
    (scenarioPaths : List System.FilePath) : IO Unit := do
  let inputs ← readDefinitionInputs definitionInputPath
  let scenarios ← scenarioPaths.mapM readScenario
  if !(decide (scenarios.map fun scenario => scenario.id.value).Nodup) then
    throw (IO.userError "engine population scenario ids contain duplicates")
  if inputs.length != (scenarios.flatMap fun scenario => scenario.definitions).length then
    throw (IO.userError "definition input count does not match population definitions")
  for scenario in scenarios do
    match resultRecordJson? inputs scenario with
    | some record => IO.println record.compress
    | none =>
        throw (IO.userError
          s!"engine population scenario refused {scenario.id.value}")

end BpmnSemantics.EnginePopulationScenarioJsonMain

def main (arguments : List String) : IO Unit := do
  match arguments with
  | definitionInputPath :: scenarioPaths =>
      if scenarioPaths.isEmpty then
        throw (IO.userError
          "at least one engine population scenario document path is required")
      BpmnSemantics.EnginePopulationScenarioJsonMain.emit
        definitionInputPath
        (scenarioPaths.map fun path => (⟨path⟩ : System.FilePath))
  | _ =>
      throw (IO.userError
        "usage: emitEnginePopulationResults <definition-input.jsonl> <population-scenario.json>...")
