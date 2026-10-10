import BpmnSemantics.SemanticProcess.Scenario
import BpmnSemantics.SemanticProcessJson
import BpmnSemantics.SemanticProcessJson.Publication
import BpmnSemantics.SemanticProcessJson.Observation
import Lean.Data.Json

/-! One-way canonical JSON-lines emitter for admitted Semantic Process scenarios.

It strictly decodes the same answer-free scenario documents supplied to the other targets, then exposes results derived by the executable Lean interpreter so the external differential harness can compare them without parsing Lean's diagnostic `Repr` output.
-/

namespace BpmnSemantics.SemanticProcessJsonMain

open BpmnSemantics
open BpmnSemantics.SemanticProcessJson
open Lean

export BpmnSemantics.SemanticProcessJson.Observation
  (commandOutcomeJson correlatedMessageAddressJson effectIncidentIdJson enabledInteractionJson encodeOpenUserTask jsonArray messageChannelJson occurrenceIdJson openEffectIncidentJson openEffectJson programIdentityJson sourceOverlayIdentityJson stateObservationJson variableBindingJson)

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
  | .deliverPayloadMessage commandId subscriptionId channel payload =>
      Json.mkObj
        [ ("kind", toJson "deliverPayloadMessage")
        , ("commandId", toJson commandId.value)
        , ("subscriptionId", occurrenceIdJson subscriptionId)
        , ("channel", messageChannelJson channel)
        , ("payload", encodeVariableValue payload) ]
  | .deliverCorrelatedPayloadMessage delivery =>
      Json.mkObj
        [ ("kind", toJson "deliverCorrelatedPayloadMessage")
        , ("commandId", toJson delivery.commandId.value)
        , ("address", correlatedMessageAddressJson delivery.address)
        , ("ingressOrdinal", toJson delivery.ingressOrdinal)
        , ("subscriptionId", occurrenceIdJson delivery.subscriptionId)
        , ("correlationPropertyId", toJson delivery.correlationPropertyId)
        , ("processPropertyId", toJson delivery.processPropertyId)
        , ("payload",
            Json.mkObj
              [ ("kind", toJson "string")
              , ("value", toJson delivery.payload.value) ]) ]
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
  | .openMultiInstances => toJson "openMultiInstances"
  | .variables => toJson "variables"
  | .enabledInteractions => toJson "enabledInteractions"
  | .logicalTime => toJson "logicalTime"

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

theorem payload_message_stimulus_json_is_exact
    (commandId : SemanticId) (subscriptionId : MessageSubscriptionId)
    (channel : MessageChannel) (payload : VariableValue) :
    stimulusJson
        (.deliverPayloadMessage commandId subscriptionId channel payload) =
      Json.mkObj
        [ ("kind", toJson "deliverPayloadMessage")
        , ("commandId", toJson commandId.value)
        , ("subscriptionId", occurrenceIdJson subscriptionId)
        , ("channel", messageChannelJson channel)
        , ("payload", encodeVariableValue payload) ] := by
  rfl

theorem payload_message_interaction_json_is_exact
    (subscriptionId : MessageSubscriptionId) (channel : MessageChannel) :
    enabledInteractionJson (.deliverPayloadMessage subscriptionId channel) =
      Json.mkObj
        [ ("kind", toJson "deliverPayloadMessage")
        , ("subscriptionId", occurrenceIdJson subscriptionId)
        , ("channel", messageChannelJson channel) ] := by
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

private def commandPublicationsJson (program : SemanticProcess.Program)
    (instanceId : SemanticId) : SemanticProcess.RuntimeState → List Stimulus → List Json
  | _, [] => []
  | initial, stimulus :: rest =>
      let traced := SemanticProcess.applyStimulusTracedWithCompensationSnapshots
        SemanticProcess.scenarioClosureLimit program initial stimulus
      let publication := Publication.tracedExecutionPublicationJson? program instanceId initial
        traced (some ∘ stimulusJson)
      let replays := SemanticProcess.replayCommittedTransitionsWithCompensationSnapshots program initial
        traced.committedTransitions = some traced.result.state
      let openOccurrences :=
        if program.identity.semanticProfile = SemanticProcess.interruptingMessageEventSubProcessProfileId then
          SemanticProcess.projectOpenFlowNodeOccurrencesWithMessageHandler? program traced.result.state
        else SemanticProcess.projectOpenFlowNodeOccurrencesWithCompensation? program traced.result.state
      let record := Json.mkObj
        [ ("commandId", toJson (SemanticProcess.stimulusCommandId stimulus).value)
        , ("outcome", commandOutcomeJson traced.result.outcome)
        , ("stateUnchanged", toJson (decide (traced.result.state = initial)))
        , ("stateWellFormed", toJson (SemanticProcess.runtimeStateWellFormed program instanceId traced.result.state))
        , ("traceReplays", toJson (decide replays))
        , ("publication", publication.getD .null)
        , ("lifecycles", jsonArray (traced.flowNodeOccurrenceLifecycles.map Publication.occurrenceDeltaJson))
        , ("openOccurrences", (openOccurrences.map fun starts =>
            jsonArray (starts.map Publication.occurrenceStartJson)).getD .null) ]
      let tail := match traced.result.outcome with
        | .committed | .rejected =>
            if traced.result.internalStepBoundExceeded || traced.result.ambiguousInternalChoice ||
                (SemanticProcess.observeStableState program traced.result.state).isNone then []
            else commandPublicationsJson program instanceId traced.result.state rest
        | .rolledBack | .semanticFailure | .unsupported => []
      record :: tail

private def scenarioPublicationsJson (scenario : Scenario) (input : DefinitionInput) : Json :=
  let instanceId := match scenario.stimuli.head? with
    | some (.startProcess _ _ instanceId _) | some (.triggerMessageStart _ _ instanceId _ _)
    | some (.triggerTimerStart _ _ instanceId _) => instanceId
    | _ => ⟨""⟩
  jsonArray <| if SemanticProcess.supportsScenario input.semanticProcess scenario then
    commandPublicationsJson input.semanticProcess instanceId SemanticProcess.initialState scenario.stimuli
  else []

private def resultRecordJson (scenario : Scenario)
    (input : DefinitionInput) (includePublications : Bool) : Json :=
  Json.mkObj <|
    [ ("scenarioId", toJson scenario.id.value)
    , ("scenario", scenarioJson scenario)
    , ("definitionBinding", definitionBindingJson input)
    , ("result", scenarioResultJson
        (BpmnSemantics.SemanticProcess.runScenario
          input.semanticProcess scenario)) ] ++
    if includePublications then [("commandPublications", scenarioPublicationsJson scenario input)] else []

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
    (scenarioPaths : List System.FilePath) (includePublications : Bool := false) : IO Unit := do
  let inputs ← readDefinitionInputs definitionInputPath
  let scenarios ← scenarioPaths.mapM readScenario
  if inputs.length ≠ scenarios.length then
    throw (IO.userError "definition input count does not match Lean scenarios")
  for scenario in scenarios do
    let input ← definitionForScenario inputs scenario
    IO.println (resultRecordJson scenario input includePublications).compress

end BpmnSemantics.SemanticProcessJsonMain

def main (arguments : List String) : IO Unit :=
  do
    let (includePublications, arguments) := match arguments with
      | "--publications" :: rest => (true, rest)
      | _ => (false, arguments)
    match arguments with
    | definitionInputPath :: scenarioPaths =>
        if scenarioPaths.isEmpty then
          throw (IO.userError
            "at least one scenario document path is required")
        BpmnSemantics.SemanticProcessJsonMain.emit
          definitionInputPath
          (scenarioPaths.map fun path => (⟨path⟩ : System.FilePath))
          includePublications
    | _ =>
        throw (IO.userError
          "usage: emitSemanticProcessResults [--publications] <definition-input.jsonl> <scenario.json>...")
