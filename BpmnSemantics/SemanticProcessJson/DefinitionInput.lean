import BpmnSemantics.SemanticProcess.CheckedProcessAdmission
import BpmnSemantics.SemanticProcess.Lowering
import BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import BpmnSemantics.SemanticProcessJson.Definitions

/-! # Cross-artifact definition-input admission

This module owns the line-oriented input boundary that decodes both definition representations, validates them independently, and requires exact canonical-lowering equality before evaluation.
-/

namespace BpmnSemantics.SemanticProcessJson

open BpmnSemantics
open BpmnSemantics.SemanticProcess
open Lean

structure DefinitionInput where
  scenarioId : ScenarioId
  checkedProcess : CheckedProcess
  semanticProcess : Program
  deriving Repr, DecidableEq

/-- Decode the exact current wrapper containing one scenario identity and both definition representations; admission remains a separate step. -/
def decodeDefinitionInput (json : Json) : Except String DefinitionInput := do
  requireObjectShape json
    ["checkedProcess", "scenarioId", "semanticProcess"]
  pure
    { scenarioId := ⟨← stringField json "scenarioId"⟩
      checkedProcess :=
        ← decodeCheckedProcess (← field json "checkedProcess")
      semanticProcess := ← decodeProgram (← field json "semanticProcess") }

/-- Independently require checked-process and Semantic Process structural validity, then require the supplied program to equal Lean's canonical lowering exactly. This boundary does not establish XML-import correctness, profile translation, or execution semantics. -/
def validateDefinitionInput (input : DefinitionInput) :
    Except String DefinitionInput := do
  if !checkedWellFormed input.checkedProcess then
    throw s!"checked Process is not well formed for {input.scenarioId.value}"
  if !programWellFormed input.semanticProcess then
    throw s!"Semantic Process is not well formed for {input.scenarioId.value}"
  if lowerCheckedProcess input.checkedProcess ≠ input.semanticProcess then
    throw s!"Semantic Process does not equal Lean lowering for {input.scenarioId.value}"
  pure input

/-- Parse one complete JSON line, decode the current definition-input shape, and apply cross-artifact admission. -/
def decodeAndValidateDefinitionInput (line : String) :
    Except String DefinitionInput := do
  validateDefinitionInput (← decodeDefinitionInput (← parseWireJson line))

end BpmnSemantics.SemanticProcessJson
