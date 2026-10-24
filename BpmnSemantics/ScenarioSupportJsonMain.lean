module

public import BpmnSemantics.SemanticProcess.Scenario
public import BpmnSemantics.SemanticProcess.ScenarioAdmission
public import BpmnSemantics.SemanticProcessJson.Program
public import BpmnSemantics.SemanticProcessJson.Scenario

/-! Scenario support over one `{program, scenario}` wire object per path; inputs contain no expected results.
`unsupportedResultExact` holds when a supported scenario needs no check, or an unsupported one runs to exactly the
deployment-unsupported result. -/

@[expose] public section

open BpmnSemantics BpmnSemantics.SemanticProcess BpmnSemantics.SemanticProcessJson Lean

def main (paths : List String) : IO Unit := do
  for path in paths do
    let contents ← IO.FS.readFile path
    let decoded := do
      let json ← parseWireJson contents
      requireObjectShape json ["program", "scenario"]
      let program ← decodeProgram (← field json "program")
      let scenario ← decodeScenario (← field json "scenario")
      let supported := supportsScenario program scenario
      let unsupported : BpmnSemantics.ScenarioResult :=
        { outcome := .semantic .unsupported, trace := [.deployment .unsupported] }
      let unsupportedResultExact := supported || decide (BpmnSemantics.SemanticProcess.runScenario program scenario = unsupported)
      pure (scenario.id.value, supported, unsupportedResultExact)
    match decoded with
    | .error message => throw (IO.userError message)
    | .ok (id, supported, unsupportedResultExact) => IO.println (Json.mkObj [("id", toJson id), ("supported", toJson supported),
        ("unsupportedResultExact", toJson unsupportedResultExact)]).compress
