import BpmnSemantics.SemanticProcessJson.DefinitionInput
import BpmnSemantics.SemanticProcess.ProfileShapeCatalog

/-! Diagnostic definition admission over the existing answer-free definition-input wire.

The fixture reader exposes the checked, generic Program and profile Program gates separately so canonical-lowering equality cannot mask which independent admission boundary refused an input. It performs no evaluation.
-/

namespace BpmnSemantics.DefinitionAdmissionJsonMain

open BpmnSemantics.SemanticProcess
open BpmnSemantics.SemanticProcessJson
open Lean

private def inspect (line : String) : Except String Json := do
  let input ← decodeDefinitionInput (← parseWireJson line)
  pure <| Json.mkObj
    [ ("scenarioId", toJson input.scenarioId.value)
    , ("checkedWellFormed", toJson (checkedWellFormed input.checkedProcess))
    , ("programWellFormed", toJson (programWellFormed input.semanticProcess))
    , ("programProfileCapabilitiesValid", toJson (programProfileCapabilitiesValid input.semanticProcess)) ]

end BpmnSemantics.DefinitionAdmissionJsonMain

def main (paths : List String) : IO Unit := do
  for path in paths do
    for line in (← IO.FS.readFile path).splitOn "\n" do
      if !line.trimAscii.toString.isEmpty then
        match BpmnSemantics.DefinitionAdmissionJsonMain.inspect line with
        | .ok result => IO.println result.compress
        | .error message => throw (IO.userError message)
