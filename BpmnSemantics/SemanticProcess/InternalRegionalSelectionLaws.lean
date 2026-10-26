module

public import BpmnSemantics.SemanticProcess.InternalRegionalSelection
import BpmnSemantics.SemanticProcess.InternalRegionalErrorPositionValidity
public import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceProgramValidityCore
import BpmnSemantics.SemanticProcess.InternalRegionalCompletionAdmission
import BpmnSemantics.SemanticProcess.InternalRegionalContinuationAdmission
import BpmnSemantics.SemanticProcess.InternalRegionalPositionValidity
import BpmnSemantics.SemanticProcess.InternalRegionalRootTerminationValidity

/-! Regional selection preserves runtime position through the admitted completion and error transitions. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.InternalCommutation

open BpmnSemantics

/-- Checked predecessor position and structural occurrence validity suffice for every selected
declared regional operation; no intermediate position predicate is assumed. -/
theorem regionalSelection_preserves_position (program : Program) (state : RuntimeState)
    (expectedInstanceId : SemanticId) (operation : SemanticOperation) (selected : InternalRegionalSelection)
    (snapshotAbsent : program.compensationEventSubProcessSnapshots = none)
    (valid : runtimePositionValid program expectedInstanceId state = true)
    (structural : flowNodeOccurrenceStructuralProgramValidity program state = true)
    (declared : operation ∈ program.operations)
    (interruptionRooted : operationInterrupts operation = true → InvocationsInProcessRoots program)
    (found : selectInternalRegional? program state operation = some selected) :
    ∃ after, fire? program operation state = some after ∧
      runtimePositionValid program expectedInstanceId after = true := by
  obtain ⟨hosting, running⟩ := regionalSelection_running program state operation selected found
  obtain ⟨after, result⟩ := regionalSelection_refines program state operation selected snapshotAbsent found
  refine ⟨after, result, ?_⟩
  unfold fire? at result
  rw [snapshotAbsent] at result
  cases operation with
  | returnProcess id origin process definition output data =>
      cases data with
      | scalar => simp [selectInternalRegional?, runningInstance?, running] at found
      | variableMappings => simp [selectInternalRegional?, runningInstance?, running] at found
      | empty =>
          exact declaredReturn_preserves_position program state after expectedInstanceId hosting id origin process definition output
            valid structural running declared result
  | completeScope id origin definition output =>
      change completeDeclaredScope? program state definition output = some after at result
      rw [selectInternalRegional?_completeScope_fires_selected program state id origin definition output selected found]
        at result
      exact declaredSelectedComplete_preserves_position program state after expectedInstanceId hosting id origin definition output
        valid structural running declared result
  | throwError id origin input error handler =>
      haveI := interruptionRooted rfl
      haveI := CallersParentless.of_rooted program state expectedInstanceId hosting valid running
      exact declaredError_preserves_position program state after expectedInstanceId hosting id origin input error handler
        valid running declared result
  | terminateScope id origin input definition =>
      haveI := interruptionRooted rfl
      haveI := CallersParentless.of_rooted program state expectedInstanceId hosting valid running
      exact terminateScopeState_preserves_position program state after expectedInstanceId id origin input definition
        valid result
  | _ => simp [selectInternalRegional?] at found

end BpmnSemantics.SemanticProcess.InternalCommutation
