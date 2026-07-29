import BpmnSemantics.SemanticProcess

/-! # BpmnSemantics.SemanticProcessConformance — executable contract checks

These checks are intentionally phrased against the generic Semantic Process language and its bounded checked-source lowering rather than a topology-specific evaluator.
-/

namespace BpmnSemantics.SemanticProcessConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

private def emptyCheckedGraph : CheckedProcess :=
  { sequentialCheckedProcess with nodes := [], sequenceFlows := [] }

private def flowlessCheckedGraph : CheckedProcess :=
  { sequentialCheckedProcess with sequenceFlows := [] }

private def danglingCheckedGraph : CheckedProcess :=
  { sequentialCheckedProcess with
    nodes := []
    sequenceFlows :=
      [{ id := ⟨"Flow_Dangling"⟩
         sourceId := ⟨"Missing_Source"⟩
         targetId := ⟨"Missing_Target"⟩ }] }

example : checkedWellFormed sequentialCheckedProcess = true := by decide
example : checkedWellFormed parallelCheckedProcess = true := by decide
example : checkedWellFormed emptyCheckedGraph = false := by decide
example : checkedWellFormed flowlessCheckedGraph = false := by decide
example : checkedWellFormed danglingCheckedGraph = false := by decide
example : programWellFormed sequentialProgram = true := by decide
example : programWellFormed parallelProgram = true := by decide
example : definitionBindingValid sequentialCheckedProcess sequentialProgram = true := by
  decide
example : definitionBindingValid parallelCheckedProcess parallelProgram = true := by
  decide

example : lowerCheckedProcess sequentialCheckedProcess = sequentialProgram := by
  decide

example : lowerCheckedProcess parallelCheckedProcess = parallelProgram := by
  decide

example :
    step parallelProgram parallelStartState parallelStartOperation =
      some parallelAfterStart := by
  decide

example :
    step parallelProgram parallelAfterStart parallelForkOperation =
      some parallelAfterFork := by
  decide

example :
    step parallelProgram duplicateLeftNoRightState parallelJoinOperation =
      none := by
  decide

example : countBasedJoinReady duplicateLeftNoRightState parallelJoinInputs = true := by
  decide

example : perIncomingJoinReady duplicateLeftNoRightState parallelJoinInputs = false := by
  decide

theorem parallelEvaluatorSound :
    Obligations.evaluator_sound ProgramStep step :=
  step_sound

end BpmnSemantics.SemanticProcessConformance
