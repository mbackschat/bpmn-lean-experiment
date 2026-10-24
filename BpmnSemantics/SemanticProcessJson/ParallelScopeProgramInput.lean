module

public import BpmnSemantics.SemanticProcess.ParallelScopeProgramCapacity
public import BpmnSemantics.SemanticProcessJson.Program

/-! PMIS-ADMIT-01 preserves declaration presence at private ingress because the syntax-only Program decoder merges omission and empty List declarations. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcessJson

open BpmnSemantics.SemanticProcess Lean

/-- PMIS-ADMIT-01 retains physical declaration presence before List decoding makes omission and an empty declaration indistinguishable. Syntax validity remains owned by `decodeProgram`. -/
def decodeParallelScopeProgramInput (wire : Json) : Except String (Option Program) := do
  let messageHandlers ← optionalField wire "interruptingMessageEventSubProcesses"
  let program ← decodeProgram wire
  if ParallelScopeStart.programSelected program && messageHandlers.isSome then pure none
  else pure (some program)

end BpmnSemantics.SemanticProcessJson
