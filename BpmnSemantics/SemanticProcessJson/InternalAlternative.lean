module

public import BpmnSemantics.SemanticProcess.JsonSupport
public import BpmnSemantics.SemanticProcess.InternalTransitionAlternative

/-! Exact private choice identities are decoded separately from execution and publication. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcessJson

open Lean SemanticProcess.InternalCommutation

def decodeInternalAlternative (json : Json) : Except String InternalAlternative := do
  match ← stringField json "kind" with
  | "operation" =>
      requireObjectShape json ["kind", "operationId"]
      pure (.operation ⟨← stringField json "operationId"⟩)
  | "operationOccurrence" =>
      requireObjectShape json ["kind", "operationId", "owner"]
      let owner ← field json "owner"
      requireObjectShape owner ["processInstanceId", "definitionScopeId", "activation"]
      let activation ← decodeSafeNat (← field owner "activation")
      if activation = 0 then throw "scope occurrence activation must be positive"
      pure (.operationOccurrence ⟨← decodeNonemptyStringField json "operationId"⟩
        { processInstanceId := ⟨← decodeNonemptyStringField owner "processInstanceId"⟩
          definitionScopeId := ⟨← decodeNonemptyStringField owner "definitionScopeId"⟩
          activation })
  | "mergeInput" =>
      requireObjectShape json ["kind", "operationId", "owner", "inputControlPlace"]
      let owner ← field json "owner"
      requireObjectShape owner ["processInstanceId", "definitionScopeId", "activation"]
      pure (.mergeInput ⟨← stringField json "operationId"⟩
        { processInstanceId := ⟨← stringField owner "processInstanceId"⟩
          definitionScopeId := ⟨← stringField owner "definitionScopeId"⟩
          activation := ← decodeSafeNat (← field owner "activation") }
        ⟨← stringField json "inputControlPlace"⟩)
  | kind => throw s!"unknown alternative {kind}"

end BpmnSemantics.SemanticProcessJson
