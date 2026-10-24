module

public import BpmnSemantics.SemanticProcess.ParallelScopeCheckedAdmission
public import BpmnSemantics.SemanticProcessJson.CheckedProcess

/-! Diagnostic admission over the existing checked-process wire; inputs contain no expected results. -/

@[expose] public section

def main (paths : List String) : IO UInt32 := do
  for path in paths do
    let contents ← IO.FS.readFile path
    let accepted := match BpmnSemantics.SemanticProcessJson.parseWireJson contents >>= BpmnSemantics.SemanticProcessJson.decodeCheckedProcess with
      | .ok source => BpmnSemantics.SemanticProcess.ParallelScopeChecked.admitted source
      | .error _ => false
    IO.println (toString accepted)
  return 0
