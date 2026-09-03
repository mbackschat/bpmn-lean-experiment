import BpmnSemantics.EnginePopulationScenario
import BpmnSemantics.SemanticProcessJson

/-! # Engine-population scenario JSON admission

This module strictly decodes the answer-free multi-instance correlation scenario. It deliberately
reuses the ordinary stimulus, resource-identity, and provenance decoders so those shared wire values
have one admission meaning.
-/

namespace BpmnSemantics.EnginePopulationScenarioJson

open BpmnSemantics
open BpmnSemantics.EnginePopulationScenario
open BpmnSemantics.SemanticProcess
open BpmnSemantics.SemanticProcessJson
open Lean

private def decodeInitializationStimuli (json : Json) :
    Except String (List Stimulus) := do
  let stimuli ← decodeArray decodeStimulus json
  match stimuli with
  | [start@(.startProcess _ _ instanceId _),
      openingDelivery@(.deliverPayloadMessage _ subscriptionId _ _)] =>
      if subscriptionId.processInstanceId = instanceId then pure [start, openingDelivery]
      else throw "initial payload subscription does not belong to the started instance"
  | _ =>
      throw "engine population instance requires startProcess then deliverPayloadMessage"

private def decodeInstance (json : Json) :
    Except String EnginePopulationInstance := do
  requireObjectShape json ["definitionId", "stimuli"]
  pure
    { definitionId := ← decodeSemanticIdentityField json "definitionId"
      stimuli := ← decodeInitializationStimuli (← field json "stimuli") }

private def decodePublication (json : Json) :
    Except String EnginePopulationPublication := do
  requireObjectShape json ["address", "commandId", "kind", "payload"]
  expectStringField json "kind" "publishCorrelatedPayloadMessage"
  let payload ← field json "payload"
  requireObjectShape payload ["kind", "value"]
  expectStringField payload "kind" "string"
  pure
    { kind := .publishCorrelatedPayloadMessage
      commandId := ← decodeSemanticIdentityField json "commandId"
      address := ← decodeCorrelatedMessageAddress (← field json "address")
      payload := { value := ← decodeNonemptyStringField payload "value" } }

private def decodeDefinitions (json : Json) :
    Except String (List ResourceIdentity) := do
  let definitions ← decodeArray (fun value => do
    let resource ← decodeResourceIdentity value
    if !resource.id.value.isEmpty && !resource.relativePath.isEmpty &&
        lowercaseHexSha256 resource.sha256 then pure resource
    else throw "invalid engine population definition identity") json
  if definitions.length = 1 || definitions.length = 2 then pure definitions
  else throw "engine population scenario requires one or two definitions"

private def decodeInstances (json : Json) :
    Except String (List EnginePopulationInstance) := do
  let instances ← decodeArray decodeInstance json
  if instances.length = 2 then pure instances
  else throw "engine population scenario requires exactly two instances"

private def decodePublications (json : Json) :
    Except String (List EnginePopulationPublication) := do
  let publications ← decodeArray decodePublication json
  if publications.length = 1 then pure publications
  else throw "engine population scenario requires exactly one publication"

private def decodeObservations (json : Json) :
    Except String (List EnginePopulationObservationKind) := do
  let observations ← decodeStringArray json
  if observations = ["publicationResults", "processStates", "ingressOrdinals"] then
    pure [.publicationResults, .processStates, .ingressOrdinals]
  else throw "engine population observations do not match the closed contract"

private def decodeExecutionTargets (json : Json) :
    Except String EnginePopulationExecutionTargets := do
  requireObjectShape json ["cib", "lean", "temporal", "typeScriptCore"]
  let leanTarget ← (← field json "lean").getBool?
  let typeScriptCore ← (← field json "typeScriptCore").getBool?
  let temporal ← (← field json "temporal").getBool?
  match ← field json "cib" with
  | .null =>
      if leanTarget && typeScriptCore && temporal then
        pure { leanTarget, typeScriptCore, temporal, cib := none }
      else throw "engine population execution targets must all be enabled"
  | _ => throw "engine population CIB target must be null"

private def decodeProvenance (json : Json) : Except String ScenarioProvenance := do
  let provenance ← decodeScenarioProvenance json
  if !provenance.normativeRefs.isEmpty &&
      provenance.normativeRefs.all (fun reference => !reference.isEmpty) &&
      !provenance.cibRevision.isEmpty &&
      provenance.cibRefs.all (fun reference => !reference.isEmpty) then
    pure provenance
  else throw "engine population provenance contains an empty required reference"

/-- Decode only the exact registered multi-instance Message-correlation scenario shape. -/
def decodeEnginePopulationScenario (json : Json) :
    Except String EnginePopulationScenario := do
  requireObjectShape json
    ["definitions", "executionTargets", "id", "instances", "kind",
      "observations", "profile", "provenance", "publications"]
  expectStringField json "kind" "enginePopulationScenario"
  expectStringField json "profile" "bpmn-2.0.2-message-key-correlation-draft"
  pure
    { kind := .enginePopulationScenario
      id := ⟨← decodeNonemptyStringField json "id"⟩
      profile := messageKeyCorrelationProfileId
      definitions := ← decodeDefinitions (← field json "definitions")
      instances := ← decodeInstances (← field json "instances")
      publications := ← decodePublications (← field json "publications")
      observations := ← decodeObservations (← field json "observations")
      executionTargets :=
        ← decodeExecutionTargets (← field json "executionTargets")
      provenance := ← decodeProvenance (← field json "provenance") }

def decodeEnginePopulationScenarioDocument (contents : String) :
    Except String EnginePopulationScenario := do
  decodeEnginePopulationScenario (← parseWireJson contents)

end BpmnSemantics.EnginePopulationScenarioJson
