import BpmnSemantics.SemanticProcess.JsonSupport
import BpmnSemantics.SemanticProcessJson.Elements

/-! # Strict checked Transaction declaration decoding -/

namespace BpmnSemantics.SemanticProcessJson
open BpmnSemantics.SemanticProcess
open Lean

/-- The Transaction capsule selects one boundary subject and empty handler input; snapshots and dependencies have no wire slot here. -/
def decodeCheckedTransaction (json : Json) : Except String CheckedTransactionCancellation := do
  requireObjectShape json ["definitionScopeId", "triggerElementId", "subject", "retentionLimits", "executionLimits"]
  let subject ← field json "subject"
  requireObjectShape subject ["kind", "subjectElementId", "boundaryEventElementId", "body"]
  expectStringField subject "kind" "boundaryActivity"
  let body ← field subject "body"
  requireObjectShape body ["kind", "handlerElementId", "effectElementId", "descriptor", "input"]
  expectStringField body "kind" "singleEffect"
  let input ← field body "input"
  requireObjectShape input ["kind"]
  expectStringField input "kind" "empty"
  let descriptor ← decodeEffectDescriptor (← field body "descriptor")
  if descriptor.protocol ≠ "urn:bpmn-lean:effect-protocol:activity-v1" ||
      descriptor.operation ≠ "urn:bpmn-lean:effect-operation:compensation-single-effect-v1" then
    throw "Transaction requires the selected single-effect descriptor"
  let retention ← field json "retentionLimits"
  requireObjectShape retention ["maxRecords", "maxCanonicalBytes"]
  let maxRecords ← decodeSafeNat (← field retention "maxRecords")
  let retentionBytes ← decodeSafeNat (← field retention "maxCanonicalBytes")
  let execution ← field json "executionLimits"
  requireObjectShape execution ["maxTriggers", "maxHandlers", "maxCanonicalBytes"]
  let maxTriggers ← decodeSafeNat (← field execution "maxTriggers")
  let maxHandlers ← decodeSafeNat (← field execution "maxHandlers")
  let executionBytes ← decodeSafeNat (← field execution "maxCanonicalBytes")
  if maxRecords ≠ 1 || retentionBytes ≠ 4096 || maxTriggers ≠ 1 ||
      maxHandlers ≠ 1 || executionBytes ≠ 20480 then
    throw "Transaction requires the selected 1/4096 and 1/1/20480 limits"
  pure
    { definitionScopeId := ⟨← decodeNonemptyStringField json "definitionScopeId"⟩
      triggerElementId := ⟨← decodeNonemptyStringField json "triggerElementId"⟩
      subject := .boundaryActivity
        ⟨← decodeNonemptyStringField subject "subjectElementId"⟩
        ⟨← decodeNonemptyStringField subject "boundaryEventElementId"⟩
        { handlerElementId := ⟨← decodeNonemptyStringField body "handlerElementId"⟩
          effectElementId := ⟨← decodeNonemptyStringField body "effectElementId"⟩
          descriptor, input := .empty }
      retentionLimits := { maxRecords, maxCanonicalBytes := retentionBytes }
      executionLimits := { maxTriggers, maxHandlers, maxCanonicalBytes := executionBytes } }

def decodeOptionalCheckedTransactionField (json : Json) :
    Except String (Option CheckedTransactionCancellation) := do
  match ← optionalField json "transactionCancellation" with
  | none => pure none
  | some value => some <$> decodeCheckedTransaction value

end BpmnSemantics.SemanticProcessJson
