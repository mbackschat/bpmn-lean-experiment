import BpmnSemantics.SemanticProcess.ParallelScopeStartAdmission
import BpmnSemantics.SemanticProcessJson.CheckedProcess
import BpmnSemantics.SemanticProcessJson.Scenario
import BpmnSemantics.StrictJson

/-! Diagnostic closure bounds over existing checked-source and Start-data wire inputs; this is not command admission. -/

private def runInputs : List String → IO UInt32
  | [] => pure 0
  | sourcePath :: stimulusPath :: rest => do
      let sourceText ← IO.FS.readFile sourcePath
      let stimulusText ← IO.FS.readFile stimulusPath
      let bound := do
        let source ← (BpmnSemantics.StrictJson.parse sourceText >>= BpmnSemantics.SemanticProcessJson.decodeCheckedProcess).toOption
        let stimulus ← (BpmnSemantics.StrictJson.parse stimulusText >>= BpmnSemantics.SemanticProcessJson.decodeStimulus).toOption
        let .startProcess _ _ _ bindings := stimulus | none
        BpmnSemantics.SemanticProcess.ParallelScopeStart.checkedSourceBound source bindings
      IO.println (bound.map toString |>.getD "null")
      runInputs rest
  | _ => throw (IO.userError "expected checked-source/Start-stimulus path pairs")

def main (paths : List String) : IO UInt32 := runInputs paths
