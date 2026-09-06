import BpmnSemantics.SemanticProcessJson.DefinitionInput
import BpmnSemantics.SemanticProcessJson.Scenario
import BpmnSemantics.SemanticProcess.Fixtures
import BpmnSemantics.SemanticProcess.CyclicControlFlowFixtures
import BpmnSemantics.UserTaskInteractionConformance
import BpmnSemantics.ParallelForkJoinConformance

/-! Exact external-input binding for concrete conformance fixtures. Synthetic countermodels,
generic laws, and arbitrary-schedule theorems have no corresponding Scenario input here.
-/

namespace BpmnSemantics.FixtureBindingJsonMain

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open BpmnSemantics.SemanticProcessJson
open Lean

private def sequentialScenarios : List Scenario :=
  [ UserTaskInteractionConformance.successfulScenario
  , UserTaskInteractionConformance.wrongActivationScenario
  , UserTaskInteractionConformance.staleCompletionScenario ]

private def parallelScenarios : List Scenario :=
  [ ParallelForkJoinConformance.aThenBScenario
  , ParallelForkJoinConformance.bThenAScenario
  , ParallelForkJoinConformance.staleAWhileBActiveScenario ]

private def expectedScenarios : List Scenario :=
  sequentialScenarios ++ parallelScenarios

private def expectedDefinitions : List DefinitionInput :=
  (sequentialScenarios.map fun scenario =>
    { scenarioId := scenario.id
      checkedProcess := sequentialCheckedProcess
      semanticProcess := sequentialProgram }) ++
  (parallelScenarios.map fun scenario =>
    { scenarioId := scenario.id
      checkedProcess := parallelCheckedProcess
      semanticProcess := parallelProgram }) ++
  [{ scenarioId := ⟨"cyclic-control-flow"⟩
     checkedProcess := cyclicCheckedProcess
     semanticProcess := cyclicProgram }]

private def decoded (value : Except String α) : IO α :=
  match value with
  | .ok result => pure result
  | .error message => throw (IO.userError message)

private def requireIdentities (kind : String) (expected actual : List String) :
    IO Unit := do
  let mut seen : List String := []
  for id in actual do
    if seen.contains id then
      throw (IO.userError s!"duplicate {kind} identity: {id}")
    seen := id :: seen
  for id in actual do
    if !expected.contains id then
      throw (IO.userError s!"unknown {kind} identity: {id}")
  for id in expected do
    if !actual.contains id then
      throw (IO.userError s!"missing {kind} identity: {id}")

private def checkDefinition (input : DefinitionInput) : IO Unit := do
  let some expected := expectedDefinitions.find? (·.scenarioId == input.scenarioId)
    | throw (IO.userError s!"unknown definition identity: {input.scenarioId.value}")
  if input.checkedProcess ≠ expected.checkedProcess then
    throw (IO.userError s!"checked graph fixture mismatch: {input.scenarioId.value}")
  if input.semanticProcess ≠ expected.semanticProcess then
    throw (IO.userError s!"Program fixture mismatch: {input.scenarioId.value}")

private def checkScenario (scenario : Scenario) : IO Unit := do
  let some expected := expectedScenarios.find? (·.id == scenario.id)
    | throw (IO.userError s!"unknown Scenario identity: {scenario.id.value}")
  if scenario ≠ expected then
    throw (IO.userError s!"Scenario fixture mismatch: {scenario.id.value}")
  if scenario.id = UserTaskInteractionConformance.successfulScenario.id then
    if scenario ≠ contractScenario then
      throw (IO.userError "Conformance.contractScenario fixture mismatch")

def verify (definitionPath : System.FilePath)
    (scenarioPaths : List System.FilePath) : IO Unit := do
  let definitionLines := (← IO.FS.readFile definitionPath).splitOn "\n"
    |>.filter (fun line => !line.trimAscii.toString.isEmpty)
  let definitions ← definitionLines.mapM fun line => decoded (parseWireJson line)
  let scenarioContents ← scenarioPaths.mapM IO.FS.readFile
  let scenarios ← scenarioContents.mapM fun contents => decoded (parseWireJson contents)
  -- lean-fixture-bindings.integration-test.ts supplies valid and malformed duplicates in both
  -- orders: identity admission must precede fixture lookup and typed value comparison.
  requireIdentities "definition" (expectedDefinitions.map (·.scenarioId.value))
    (← definitions.mapM fun json => decoded (stringField json "scenarioId"))
  requireIdentities "Scenario" (expectedScenarios.map (·.id.value))
    (← scenarios.mapM fun json => decoded (stringField json "id"))
  for json in definitions do
    checkDefinition (← decoded (decodeDefinitionInput json))
  for contents in scenarioContents do
    checkScenario (← decoded (decodeScenarioDocument contents))
  IO.println "fixture bindings verified"

end BpmnSemantics.FixtureBindingJsonMain

def main (arguments : List String) : IO Unit := do
  match arguments with
  | definitionPath :: scenarioPaths =>
      BpmnSemantics.FixtureBindingJsonMain.verify definitionPath
        (scenarioPaths.map fun path => (⟨path⟩ : System.FilePath))
  | _ =>
      throw (IO.userError
        "usage: FixtureBindingJsonMain <definition-input.jsonl> <scenario.json>...")
