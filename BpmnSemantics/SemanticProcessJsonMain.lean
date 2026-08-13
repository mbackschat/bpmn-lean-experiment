import BpmnSemantics.SemanticProcess.Scenario
import BpmnSemantics.SemanticProcessJson
import Lean.Data.Json

/-! One-way canonical JSON-lines emitter for admitted Semantic Process scenarios.

It strictly decodes the same answer-free scenario documents supplied to the other targets, then exposes results derived by the executable Lean interpreter so the external differential harness can compare them without parsing Lean's diagnostic `Repr` output.
-/

namespace BpmnSemantics.SemanticProcessJsonMain

open BpmnSemantics
open BpmnSemantics.SemanticProcessJson
open Lean

private def jsonArray (values : List Json) : Json :=
  .arr values.toArray

private def commandOutcomeJson : CommandOutcome → Json
  | .committed => toJson "committed"
  | .rolledBack => toJson "rolledBack"
  | .rejected => toJson "rejected"
  | .semanticFailure => toJson "semanticFailure"
  | .unsupported => toJson "unsupported"

private def processStatusJson : ProcessStatus → Json
  | .notStarted => toJson "notStarted"
  | .running => toJson "running"
  | .completed => toJson "completed"
  | .cancelled => toJson "cancelled"

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

private def activeWaitJson (wait : ActiveWait) : Json :=
  Json.mkObj
    [ ("elementId", toJson wait.elementId.value)
    , ("kind", waitKindJson wait.kind)
    , ("multiplicity", toJson wait.multiplicity) ]

private def userTaskLifecycleStateJson : UserTaskLifecycleState → Json
  | .active => toJson "active"

/-- Encode one public User Task and omit metadata physically when the contract value is absent. -/
def encodeOpenUserTask (task : OpenUserTask) : Json :=
  let fields :=
    [ ("id", occurrenceIdJson task.id)
    , ("name", toJson task.name)
    , ("state", userTaskLifecycleStateJson task.state) ]
  Json.mkObj <| match task.metadata with
    | none => fields
    | some metadata => fields ++ [("metadata", encodeUserTaskMetadata metadata)]

private def messageChannelJson : MessageChannel → Json
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

private def variableBindingJson (binding : VariableBinding) : Json :=
  Json.mkObj
    [ ("name", toJson binding.name)
    , ("value", encodeVariableValue binding.value) ]

private def effectExecutionResultJson : EffectExecutionResult → Json
  | .success localPatch =>
      Json.mkObj
        [ ("kind", toJson "success")
        , ("localPatch", jsonArray (localPatch.map variableBindingJson)) ]
  | .bpmnError code message localPatch =>
      Json.mkObj
        [ ("kind", toJson "bpmnError")
        , ("code", toJson code)
        , ("message", toJson message)
        , ("localPatch", jsonArray (localPatch.map variableBindingJson)) ]

private def openEffectJson (effect : OpenEffect) : Json :=
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
  Json.mkObj
    [ ("kind", toJson "state")
    , ("instanceId", toJson state.instanceId.value)
    , ("status", processStatusJson state.status)
    , ("activeWaits", jsonArray (state.activeWaits.map activeWaitJson))
    , ("openUserTasks", jsonArray (state.openUserTasks.map encodeOpenUserTask))
    , ("openMessageSubscriptions",
        jsonArray
          (state.openMessageSubscriptions.map openMessageSubscriptionJson))
    , ("openTimers", jsonArray (state.openTimers.map openTimerJson))
    , ("openEffects", jsonArray (state.openEffects.map openEffectJson))
    , ("openIncidents",
        jsonArray (state.openIncidents.map openEffectIncidentJson))
    , ("variables", jsonArray (state.variables.map variableBindingJson))
    , ("enabledInteractions",
        jsonArray (state.enabledInteractions.map enabledInteractionJson))
    , ("logicalTimeMs", toJson state.logicalTimeMs) ]

private def canonicalObservationJson : CanonicalObservation → Json
  | .deployment outcome =>
      Json.mkObj
        [ ("kind", toJson "deployment")
        , ("outcome", commandOutcomeJson outcome) ]
  | .command commandId outcome =>
      Json.mkObj
        [ ("kind", toJson "command")
        , ("commandId", toJson commandId.value)
        , ("outcome", commandOutcomeJson outcome) ]
  | .state state =>
      stateObservationJson state

private def scenarioOutcomeJson : ScenarioOutcome → Json
  | .semantic outcome =>
      Json.mkObj
        [ ("kind", toJson "semantic")
        , ("outcome", commandOutcomeJson outcome) ]
  | .harnessFailure =>
      Json.mkObj [("kind", toJson "harnessFailure")]
  | .infrastructureFailure =>
      Json.mkObj [("kind", toJson "infrastructureFailure")]

private def scenarioResultJson (result : ScenarioResult) : Json :=
  Json.mkObj
    [ ("outcome", scenarioOutcomeJson result.outcome)
    , ("trace", jsonArray (result.trace.map canonicalObservationJson)) ]

private def scenarioKindJson : ScenarioKind → Json
  | .scenario => toJson "scenario"

def stimulusJson : Stimulus → Json
  | .startProcess commandId processId instanceId initialVariables =>
      Json.mkObj
        [ ("kind", toJson "startProcess")
        , ("commandId", toJson commandId.value)
        , ("processId", toJson processId.value)
        , ("instanceId", toJson instanceId.value)
        , ("initialVariables",
            jsonArray (initialVariables.map variableBindingJson)) ]
  | .triggerMessageStart commandId processId instanceId startEventId channel =>
      Json.mkObj
        [ ("kind", toJson "triggerMessageStart")
        , ("commandId", toJson commandId.value)
        , ("processId", toJson processId.value)
        , ("instanceId", toJson instanceId.value)
        , ("startEventId", toJson startEventId.value)
        , ("channel", messageChannelJson channel) ]
  | .triggerTimerStart commandId processId instanceId startEventId =>
      Json.mkObj
        [ ("kind", toJson "triggerTimerStart")
        , ("commandId", toJson commandId.value)
        , ("processId", toJson processId.value)
        , ("instanceId", toJson instanceId.value)
        , ("startEventId", toJson startEventId.value) ]
  | .completeUserTaskInstance commandId taskId submittedValues =>
      Json.mkObj
        [ ("kind", toJson "completeUserTaskInstance")
        , ("commandId", toJson commandId.value)
        , ("taskId", occurrenceIdJson taskId)
        , ("submittedValues",
            jsonArray (submittedValues.map variableBindingJson)) ]
  | .deliverMessage commandId subscriptionId channel =>
      Json.mkObj
        [ ("kind", toJson "deliverMessage")
        , ("commandId", toJson commandId.value)
        , ("subscriptionId", occurrenceIdJson subscriptionId)
        , ("channel", messageChannelJson channel) ]
  | .fireTimer commandId timerId logicalTimeMs =>
      Json.mkObj
        [ ("kind", toJson "fireTimer")
        , ("commandId", toJson commandId.value)
        , ("timerId", occurrenceIdJson timerId)
        , ("logicalTimeMs", toJson logicalTimeMs) ]
  | .completeEffect commandId effectId result =>
      Json.mkObj
        [ ("kind", toJson "completeEffect")
        , ("commandId", toJson commandId.value)
        , ("effectId", occurrenceIdJson effectId)
        , ("result", effectExecutionResultJson result) ]
  | .reportEffectFailure commandId effectId generation =>
      Json.mkObj
        [ ("kind", toJson "reportEffectFailure")
        , ("commandId", toJson commandId.value)
        , ("effectId", occurrenceIdJson effectId)
        , ("generation", toJson generation) ]
  | .retryIncident commandId incidentId =>
      Json.mkObj
        [ ("kind", toJson "retryIncident")
        , ("commandId", toJson commandId.value)
        , ("incidentId", effectIncidentIdJson incidentId) ]
  | .cancelIncidentProcess commandId processInstanceId incidentId =>
      Json.mkObj
        [ ("kind", toJson "cancelIncidentProcess")
        , ("commandId", toJson commandId.value)
        , ("processInstanceId", toJson processInstanceId.value)
        , ("incidentId", effectIncidentIdJson incidentId) ]

private def observationKindJson : ObservationKind → Json
  | .deployment => toJson "deployment"
  | .commandResults => toJson "commandResults"
  | .processStatus => toJson "processStatus"
  | .activeWaits => toJson "activeWaits"
  | .openUserTasks => toJson "openUserTasks"
  | .openTimers => toJson "openTimers"
  | .openEffects => toJson "openEffects"
  | .variables => toJson "variables"
  | .enabledInteractions => toJson "enabledInteractions"
  | .logicalTime => toJson "logicalTime"

private def sourceOverlayIdentityJson : Option SourceOverlayIdentity → Json
  | none => .null
  | some identity =>
      Json.mkObj
        [ ("id", toJson identity.id.value)
        , ("sha256", toJson identity.sha256) ]

private def resourceIdentityJson (resource : ResourceIdentity) : Json :=
  Json.mkObj
    [ ("id", toJson resource.id.value)
    , ("relativePath", toJson resource.relativePath)
    , ("sha256", toJson resource.sha256)
    , ("sourceOverlay",
        sourceOverlayIdentityJson resource.sourceOverlay) ]

private def scenarioProvenanceJson (provenance : ScenarioProvenance) : Json :=
  Json.mkObj
    [ ("normativeRefs", toJson provenance.normativeRefs)
    , ("cibRevision", toJson provenance.cibRevision)
    , ("cibRefs", toJson provenance.cibRefs) ]

theorem report_effect_failure_stimulus_json_is_exact
    (commandId : SemanticId) (effectId : EffectOccurrenceId) :
    stimulusJson (.reportEffectFailure commandId effectId 1) =
      Json.mkObj
        [ ("kind", toJson "reportEffectFailure")
        , ("commandId", toJson commandId.value)
        , ("effectId", occurrenceIdJson effectId)
        , ("generation", toJson 1) ] := by
  rfl

theorem cancel_incident_process_stimulus_json_is_exact
    (commandId processInstanceId : SemanticId)
    (incidentId : EffectIncidentId) :
    stimulusJson (.cancelIncidentProcess commandId processInstanceId incidentId) =
      Json.mkObj
        [ ("kind", toJson "cancelIncidentProcess")
        , ("commandId", toJson commandId.value)
        , ("processInstanceId", toJson processInstanceId.value)
        , ("incidentId", effectIncidentIdJson incidentId) ] := by
  rfl

theorem retry_interaction_json_retains_complete_incident_identity
    (incidentId : EffectIncidentId) :
    enabledInteractionJson (.retryIncident incidentId) =
      Json.mkObj
        [ ("kind", toJson "retryIncident")
        , ("incidentId", effectIncidentIdJson incidentId) ] := by
  rfl

theorem cancel_interaction_json_retains_process_and_incident_identity
    (processInstanceId : SemanticId) (incidentId : EffectIncidentId) :
    enabledInteractionJson
        (.cancelIncidentProcess processInstanceId incidentId) =
      Json.mkObj
        [ ("kind", toJson "cancelIncidentProcess")
        , ("processInstanceId", toJson processInstanceId.value)
        , ("incidentId", effectIncidentIdJson incidentId) ] := by
  rfl

theorem cancelled_state_observation_json_is_exact
    (instanceId : SemanticId) (variables : List VariableBinding)
    (logicalTimeMs : Nat) :
    stateObservationJson
        { instanceId
          status := .cancelled
          activeWaits := []
          openUserTasks := []
          openMessageSubscriptions := []
          openTimers := []
          openEffects := []
          openIncidents := []
          variables
          enabledInteractions := []
          logicalTimeMs } =
      Json.mkObj
        [ ("kind", toJson "state")
        , ("instanceId", toJson instanceId.value)
        , ("status", toJson "cancelled")
        , ("activeWaits", jsonArray [])
        , ("openUserTasks", jsonArray [])
        , ("openMessageSubscriptions", jsonArray [])
        , ("openTimers", jsonArray [])
        , ("openEffects", jsonArray [])
        , ("openIncidents", jsonArray [])
        , ("variables", jsonArray (variables.map variableBindingJson))
        , ("enabledInteractions", jsonArray [])
        , ("logicalTimeMs", toJson logicalTimeMs) ] := by
  rfl

theorem open_incident_json_retains_equal_nested_effect_identity
    (incidentId : EffectIncidentId) (descriptor : EffectDescriptor)
    (arguments : List VariableBinding) :
    openEffectIncidentJson
        { kind := .effectExecutionFailed
          id := incidentId
          effect := { id := incidentId.effectId, descriptor, arguments } } =
      Json.mkObj
        [ ("kind", toJson "effectExecutionFailed")
        , ("id", effectIncidentIdJson incidentId)
        , ("effect", openEffectJson
            { id := incidentId.effectId, descriptor, arguments }) ] := by
  rfl

/-- Echo of the exact scenario content this interpreter executed.

The differential harness compares this against the admitted scenario document. Scenario identity alone cannot establish that the compiled-in Lean scenario still matches the admitted bytes, because a canonical command observation records only the command identity and outcome rather than the submitted payload. -/
private def scenarioJson (scenario : Scenario) : Json :=
  Json.mkObj
    [ ("kind", scenarioKindJson scenario.kind)
    , ("id", toJson scenario.id.value)
    , ("profile", toJson scenario.profile.value)
    , ("bpmn", resourceIdentityJson scenario.bpmn)
    , ("stimuli", jsonArray (scenario.stimuli.map stimulusJson))
    , ("observations",
        jsonArray (scenario.observations.map observationKindJson))
    , ("provenance", scenarioProvenanceJson scenario.provenance) ]

private def definitionBindingJson (input : DefinitionInput) : Json :=
  Json.mkObj
    [ ("kind", toJson "leanDefinitionBinding")
    , ("sourceSha256",
        toJson input.checkedProcess.identity.sourceSha256)
    , ("semanticProfile",
        toJson input.checkedProcess.identity.semanticProfile.value)
    , ("programMatchesLeanLowering", toJson true) ]

private def resultRecordJson (scenario : Scenario)
    (input : DefinitionInput) : Json :=
  Json.mkObj
    [ ("scenarioId", toJson scenario.id.value)
    , ("scenario", scenarioJson scenario)
    , ("definitionBinding", definitionBindingJson input)
    , ("result", scenarioResultJson
        (BpmnSemantics.SemanticProcess.runScenario
          input.semanticProcess scenario)) ]

private def readDefinitionInputs (path : System.FilePath) :
    IO (List DefinitionInput) := do
  let contents ← IO.FS.readFile path
  let lines := (contents.splitOn "\n").filter fun line => !line.isEmpty
  lines.mapM fun line =>
    match decodeAndValidateDefinitionInput line with
    | .ok input => pure input
    | .error message => throw (IO.userError message)

private def readScenario (path : System.FilePath) : IO Scenario := do
  let contents ← IO.FS.readFile path
  match decodeScenarioDocument contents with
  | .ok scenario => pure scenario
  | .error message =>
      throw (IO.userError s!"invalid scenario {path}: {message}")

private def definitionForScenario (inputs : List DefinitionInput)
    (scenario : Scenario) : IO DefinitionInput := do
  let matchingInputs := inputs.filter fun input =>
    decide (input.scenarioId = scenario.id)
  let input ←
    match matchingInputs with
    | [input] => pure input
    | _ =>
        throw (IO.userError
          s!"expected exactly one definition for {scenario.id.value}")
  if input.checkedProcess.identity.semanticProfile ≠ scenario.profile ||
      input.checkedProcess.identity.sourceId ≠ scenario.bpmn.id ||
      input.checkedProcess.identity.sourceSha256 ≠ scenario.bpmn.sha256 ||
      input.checkedProcess.identity.sourceOverlay ≠
        scenario.bpmn.sourceOverlay ||
      input.checkedProcess.processId ≠
        match scenario.stimuli.head? with
        | some (.startProcess _ processId _ _) => ⟨processId.value⟩
        | some (.triggerMessageStart _ processId _ _ _) => ⟨processId.value⟩
        | some (.triggerTimerStart _ processId _ _) => ⟨processId.value⟩
        | _ => ⟨""⟩ then
    throw (IO.userError
      s!"definition identity does not match scenario {scenario.id.value}")
  pure input

def emit (definitionInputPath : System.FilePath)
    (scenarioPaths : List System.FilePath) : IO Unit := do
  let inputs ← readDefinitionInputs definitionInputPath
  let scenarios ← scenarioPaths.mapM readScenario
  if inputs.length ≠ scenarios.length then
    throw (IO.userError "definition input count does not match Lean scenarios")
  for scenario in scenarios do
    let input ← definitionForScenario inputs scenario
    IO.println (resultRecordJson scenario input).compress

end BpmnSemantics.SemanticProcessJsonMain

def main (arguments : List String) : IO Unit :=
  do
    match arguments with
    | definitionInputPath :: scenarioPaths =>
        if scenarioPaths.isEmpty then
          throw (IO.userError
            "at least one scenario document path is required")
        BpmnSemantics.SemanticProcessJsonMain.emit
          definitionInputPath
          (scenarioPaths.map fun path => (⟨path⟩ : System.FilePath))
    | _ =>
        throw (IO.userError
          "usage: emitSemanticProcessResults <definition-input.jsonl> <scenario.json>...")
