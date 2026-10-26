module

public import BpmnSemantics.EnginePopulationScenarioJson
public import BpmnSemantics.SemanticProcessJson.DefinitionInput
public import BpmnSemantics.SemanticProcessJson.Observation
public import BpmnSemantics.SemanticProcessJson.Publication

/-! Canonical JSON-lines emitter for admitted engine-population scenarios. -/

@[expose] public section

namespace BpmnSemantics.EnginePopulationScenarioJsonMain

open BpmnSemantics
open BpmnSemantics.EnginePopulationScenario
open BpmnSemantics.EnginePopulationScenarioJson
open BpmnSemantics.SemanticProcessJson
open Lean

open BpmnSemantics.SemanticProcessJson.Observation

def resourceIdentityJson (resource : ResourceIdentity) : Json :=
  Json.mkObj
    [ ("id", toJson resource.id.value)
    , ("relativePath", toJson resource.relativePath)
    , ("sha256", toJson resource.sha256)
    , ("sourceOverlay", sourceOverlayIdentityJson resource.sourceOverlay) ]

def initializationStimulusJson : Stimulus → Option Json
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

def instanceJson? (processInstance : EnginePopulationInstance) : Option Json := do
  let stimuli ← processInstance.stimuli.mapM initializationStimulusJson
  some <| Json.mkObj
    [ ("definitionId", toJson processInstance.definitionId.value)
    , ("stimuli", jsonArray stimuli) ]

def publicationJson (publication : EnginePopulationPublication) : Json :=
  Json.mkObj
    [ ("kind", toJson "publishCorrelatedPayloadMessage")
    , ("commandId", toJson publication.commandId.value)
    , ("address", correlatedMessageAddressJson publication.address)
    , ("payload", Json.mkObj
        [("kind", toJson "string"), ("value", toJson publication.payload.value)]) ]

def provenanceJson (provenance : ScenarioProvenance) : Json :=
  Json.mkObj
    [ ("normativeRefs", toJson provenance.normativeRefs)
    , ("cibRevision", toJson provenance.cibRevision)
    , ("cibRefs", toJson provenance.cibRefs) ]

def scenarioJson? (scenario : EnginePopulationScenario) : Option Json := do
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

def targetJson (target : EnginePopulationTarget) : Json :=
  Json.mkObj
    [ ("processInstanceId", toJson target.processInstanceId.value)
    , ("subscriptionId", occurrenceIdJson target.subscriptionId) ]

def publicationOutcomeJson : EnginePopulationPublicationOutcome → Json
  | .committed target =>
      Json.mkObj [("kind", toJson "committed"), ("target", targetJson target)]
  | .rejectedNoMatch => Json.mkObj [("kind", toJson "rejectedNoMatch")]
  | .rejectedAmbiguous => Json.mkObj [("kind", toJson "rejectedAmbiguous")]

def publicationResultJson
    (result : EnginePopulationPublicationResult) : Json :=
  Json.mkObj
    [ ("commandId", toJson result.commandId.value)
    , ("ingressOrdinal", toJson result.ingressOrdinal)
    , ("outcome", publicationOutcomeJson result.outcome) ]

def ingressOrdinalJson (ordinal : EnginePopulationIngressOrdinal) : Json :=
  Json.mkObj
    [ ("commandId", toJson ordinal.commandId.value)
    , ("ingressOrdinal", toJson ordinal.ingressOrdinal) ]

def resultJson (result : EnginePopulationResult) : Json :=
  Json.mkObj
    [ ("kind", toJson "enginePopulationResult")
    , ("scenarioId", toJson result.scenarioId.value)
    , ("publicationResults",
        jsonArray (result.publicationResults.map publicationResultJson))
    , ("processStates", jsonArray (result.processStates.map stateObservationJson))
    , ("ingressOrdinals",
        jsonArray (result.ingressOrdinals.map ingressOrdinalJson)) ]

def readDefinitionInputs (path : System.FilePath) :
    IO (List DefinitionInput) := do
  let contents ← IO.FS.readFile path
  let lines := (contents.splitOn "\n").filter fun line => !line.isEmpty
  lines.mapM fun line =>
    match decodeAndValidateDefinitionInput line with
    | .ok input => pure input
    | .error message => throw (IO.userError message)

def readScenario (path : System.FilePath) :
    IO EnginePopulationScenario := do
  let contents ← IO.FS.readFile path
  match decodeEnginePopulationScenarioDocument contents with
  | .ok scenario => pure scenario
  | .error message =>
      throw (IO.userError s!"invalid engine population scenario {path}: {message}")

def bindingsForScenario (inputs : List DefinitionInput)
    (scenario : EnginePopulationScenario) :
    List (SemanticId × BpmnSemantics.SemanticProcess.Program) :=
  (inputs.filter fun input => input.scenarioId = scenario.id).map fun input =>
    (input.checkedProcess.identity.sourceId, input.semanticProcess)

def resultRecordJson? (inputs : List DefinitionInput)
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
