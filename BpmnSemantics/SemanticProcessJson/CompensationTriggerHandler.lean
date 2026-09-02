import BpmnSemantics.SemanticProcess.JsonSupport
import BpmnSemantics.SemanticProcessJson.Elements

/-! # Compensation trigger and single-effect handler Program decoding -/

namespace BpmnSemantics.SemanticProcessJson

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open Lean

private def decodeHandlerInput (json : Json) : Except String CompensationHandlerInput := do
  match ← stringField json "kind" with
  | "empty" =>
      requireObjectShape json ["kind"]
      pure .empty
  | "restoredProcessBinding" =>
      requireObjectShape json ["argumentName", "kind", "sourceName"]
      pure (.restoredProcessBinding
        (← decodeNonemptyStringField json "sourceName")
        (← decodeNonemptyStringField json "argumentName"))
  | kind => throw s!"unsupported compensation handler input {kind}"

private def decodeHandlerBody (json : Json) :
    Except String SingleEffectCompensationHandlerBody := do
  requireObjectShape json
    ["descriptor", "effectElementId", "handlerElementId", "input", "kind"]
  expectStringField json "kind" "singleEffect"
  let descriptor ← decodeEffectDescriptor (← field json "descriptor")
  if descriptor.protocol != "urn:bpmn-lean:effect-protocol:activity-v1" || descriptor.operation !=
      "urn:bpmn-lean:effect-operation:compensation-single-effect-v1" then
    throw "unsupported compensation handler descriptor"
  pure
    { handlerElementId := ⟨← decodeNonemptyStringField json "handlerElementId"⟩
      effectElementId := ⟨← decodeNonemptyStringField json "effectElementId"⟩
      descriptor
      input := ← decodeHandlerInput (← field json "input") }

private def decodeSubject (json : Json) : Except String CompensationSubjectDefinition := do
  match ← stringField json "kind" with
  | "boundaryActivity" =>
      requireObjectShape json ["body", "kind", "subjectElementId"]
      pure (.boundaryActivity
        ⟨← decodeNonemptyStringField json "subjectElementId"⟩
        (← decodeHandlerBody (← field json "body")))
  | "eventSubProcess" =>
      requireObjectShape json ["body", "handlerScopeId", "kind", "parentScopeId"]
      pure (.eventSubProcess
        ⟨← decodeNonemptyStringField json "parentScopeId"⟩
        ⟨← decodeNonemptyStringField json "handlerScopeId"⟩
        (← decodeHandlerBody (← field json "body")))
  | kind => throw s!"unsupported compensation subject {kind}"

private def decodeDependency (json : Json) : Except String CompensationDependency := do
  requireObjectShape json ["predecessorElementId", "reason", "successorElementId"]
  expectStringField json "reason" "sequenceFlow"
  pure
    { predecessorElementId := ⟨← decodeNonemptyStringField json "predecessorElementId"⟩
      successorElementId := ⟨← decodeNonemptyStringField json "successorElementId"⟩ }

private def decodeLimits (json : Json) : Except String CompensationTriggerLimits := do
  requireObjectShape json ["maxCanonicalBytes", "maxHandlers", "maxTriggers"]
  let limits : CompensationTriggerLimits :=
    { maxTriggers := ← decodeSafeNat (← field json "maxTriggers")
      maxHandlers := ← decodeSafeNat (← field json "maxHandlers")
      maxCanonicalBytes := ← decodeSafeNat (← field json "maxCanonicalBytes") }
  if limits.maxTriggers = 0 || limits.maxHandlers = 0 ||
      limits.maxCanonicalBytes < 2 || limits.maxCanonicalBytes > 65536 then
    throw "compensation limits are outside their admitted bounds"
  pure limits

private def decodeDeclaration (json : Json) : Except String CompensationExecutionDeclaration := do
  requireObjectShape json
    ["definitionScopeId", "dependencies", "limits", "subjects", "triggerOperationId"]
  pure
    { definitionScopeId := ⟨← decodeNonemptyStringField json "definitionScopeId"⟩
      triggerOperationId := ⟨← decodeNonemptyStringField json "triggerOperationId"⟩
      subjects := ← decodeArray decodeSubject (← field json "subjects")
      dependencies := ← decodeArray decodeDependency (← field json "dependencies")
      limits := ← decodeLimits (← field json "limits") }

def decodeCompensationExecutionField (json : Json) :
    Except String (Option CompensationExecutionDeclaration) := do
  match ← optionalField json "compensationExecution" with
  | none => pure none
  | some declaration => some <$> decodeDeclaration declaration

end BpmnSemantics.SemanticProcessJson
