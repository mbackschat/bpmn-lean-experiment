import BpmnSemantics.SemanticProcess.ParallelScopeStartAdmission
import BpmnSemantics.SemanticProcessJson.CheckedProcess
import BpmnSemantics.SemanticProcessJson.Scenario
import BpmnSemantics.StrictJson

/-! Diagnostic closure bounds over existing checked-source and Start-data wire inputs; this is not command admission. -/

private def runInputs (frontier : Bool) : List String → IO UInt32
  | [] => pure 0
  | sourcePath :: stimulusPath :: rest => do
      let sourceText ← IO.FS.readFile sourcePath
      let stimulusText ← IO.FS.readFile stimulusPath
      let bound := do
        let source ← (BpmnSemantics.StrictJson.parse sourceText >>= BpmnSemantics.SemanticProcessJson.decodeCheckedProcess).toOption
        let stimulus ← (BpmnSemantics.StrictJson.parse stimulusText >>= BpmnSemantics.SemanticProcessJson.decodeStimulus).toOption
        let .startProcess _ _ _ bindings := stimulus | none
        if frontier then do
          let capacity ← BpmnSemantics.SemanticProcess.ParallelScopeStart.checkedSourceFrontier source bindings
          some (Lean.Json.mkObj [("waits", Lean.toJson capacity.waits), ("effects", Lean.toJson capacity.effects)] |>.compress)
        else (BpmnSemantics.SemanticProcess.ParallelScopeStart.checkedSourceBound source bindings).map toString
      IO.println (bound.getD "null")
      runInputs frontier rest
  | _ => throw (IO.userError "expected checked-source/Start-stimulus path pairs")

def main (paths : List String) : IO UInt32 :=
  match paths with
  | "--frontier" :: rest => runInputs true rest
  | _ => runInputs false paths
