import BpmnSemantics.SemanticProcess.JsonSupport
import BpmnSemantics.SemanticProcessJson.Elements

/-! # Strict checked Compensation source decoding -/

namespace BpmnSemantics.SemanticProcessJson

open BpmnSemantics.SemanticProcess
open Lean

private def decodeInput (json : Json) : Except String CheckedCompensationInput := do
  match ← stringField json "kind" with
  | "empty" =>
      requireObjectShape json ["kind"]
      pure .empty
  | "directRestoredProcessBinding" =>
      requireObjectShape json ["kind", "sourcePropertyId", "targetDataInputId"]
      pure (.directRestoredProcessBinding
        (← decodeNonemptyStringField json "sourcePropertyId")
        (← decodeNonemptyStringField json "targetDataInputId"))
  | kind => throw s!"unsupported checked Compensation input {kind}"

private def decodeBody (json : Json) : Except String CheckedCompensationBody := do
  requireObjectShape json
    ["descriptor", "effectElementId", "handlerElementId", "input", "kind"]
  expectStringField json "kind" "singleEffect"
  let descriptor ← decodeEffectDescriptor (← field json "descriptor")
  if descriptor.protocol ≠ "urn:bpmn-lean:effect-protocol:activity-v1" ||
      descriptor.operation ≠
        "urn:bpmn-lean:effect-operation:compensation-single-effect-v1" then
    throw "checked Compensation body requires the exact single-effect descriptor"
  pure
    { handlerElementId := ⟨← decodeNonemptyStringField json "handlerElementId"⟩
      effectElementId := ⟨← decodeNonemptyStringField json "effectElementId"⟩
      descriptor
      input := ← decodeInput (← field json "input") }

private def decodeSubject (json : Json) : Except String CheckedCompensationSubject := do
  match ← stringField json "kind" with
  | "boundaryActivity" =>
      requireObjectShape json
        ["body", "boundaryEventElementId", "kind", "subjectElementId"]
      pure (.boundaryActivity
        ⟨← decodeNonemptyStringField json "subjectElementId"⟩
        ⟨← decodeNonemptyStringField json "boundaryEventElementId"⟩
        (← decodeBody (← field json "body")))
  | "eventSubProcess" =>
      requireObjectShape json
        ["body", "handlerScopeId", "kind", "parentElementId", "parentScopeId"]
      pure (.eventSubProcess
        ⟨← decodeNonemptyStringField json "parentElementId"⟩
        ⟨← decodeNonemptyStringField json "parentScopeId"⟩
        ⟨← decodeNonemptyStringField json "handlerScopeId"⟩
        (← decodeBody (← field json "body")))
  | kind => throw s!"unsupported checked Compensation subject {kind}"

private def decodeDependency (json : Json) :
    Except String CheckedCompensationDependency := do
  requireObjectShape json
    ["predecessorElementId", "reason", "successorElementId"]
  expectStringField json "reason" "sequenceFlow"
  pure
    { predecessorElementId := ⟨← decodeNonemptyStringField json "predecessorElementId"⟩
      successorElementId := ⟨← decodeNonemptyStringField json "successorElementId"⟩
      reason := .sequenceFlow }

private def decodeRetentionLimits (json : Json) :
    Except String CheckedCompensationRetentionLimits := do
  requireObjectShape json ["maxCanonicalBytes", "maxRecords"]
  let maxRecords ← decodeSafeNat (← field json "maxRecords")
  let maxCanonicalBytes ← decodeSafeNat (← field json "maxCanonicalBytes")
  if maxRecords ≠ 2 || maxCanonicalBytes ≠ 4096 then
    throw "checked Compensation retention limits must be exactly 2/4096"
  pure { maxRecords, maxCanonicalBytes }

private def decodeSnapshotLimits (json : Json) :
    Except String CheckedCompensationSnapshotLimits := do
  requireObjectShape json ["maxCanonicalBytes", "maxRecords"]
  let maxRecords ← decodeSafeNat (← field json "maxRecords")
  let maxCanonicalBytes ← decodeSafeNat (← field json "maxCanonicalBytes")
  if maxRecords ≠ 1 || maxCanonicalBytes ≠ 8192 then
    throw "checked Compensation snapshot limits must be exactly 1/8192"
  pure { maxRecords, maxCanonicalBytes }

private def decodeExecutionLimits (json : Json) :
    Except String CheckedCompensationExecutionLimits := do
  requireObjectShape json ["maxCanonicalBytes", "maxHandlers", "maxTriggers"]
  let maxTriggers ← decodeSafeNat (← field json "maxTriggers")
  let maxHandlers ← decodeSafeNat (← field json "maxHandlers")
  let maxCanonicalBytes ← decodeSafeNat (← field json "maxCanonicalBytes")
  if maxTriggers ≠ 1 || maxHandlers ≠ 3 || maxCanonicalBytes ≠ 20480 then
    throw "checked Compensation execution limits must be exactly 1/3/20480"
  pure { maxTriggers, maxHandlers, maxCanonicalBytes }

/-- Decode one closed checked Compensation declaration without admitting its graph relationships. -/
def decodeCheckedCompensation (json : Json) : Except String CheckedCompensation := do
  requireObjectShape json
    ["dependencies", "executionLimits", "retentionLimits", "snapshotLimits", "subjects",
      "triggerElementId"]
  pure
    { triggerElementId := ⟨← decodeNonemptyStringField json "triggerElementId"⟩
      subjects := ← decodeArray decodeSubject (← field json "subjects")
      dependencies := ← decodeArray decodeDependency (← field json "dependencies")
      retentionLimits := ← decodeRetentionLimits (← field json "retentionLimits")
      snapshotLimits := ← decodeSnapshotLimits (← field json "snapshotLimits")
      executionLimits := ← decodeExecutionLimits (← field json "executionLimits") }

/-- Preserve physical omission and reject a present `null` or malformed declaration. -/
def decodeOptionalCheckedCompensationField (json : Json) :
    Except String (Option CheckedCompensation) := do
  match ← optionalField json "compensation" with
  | none => pure none
  | some value => some <$> decodeCheckedCompensation value

end BpmnSemantics.SemanticProcessJson
