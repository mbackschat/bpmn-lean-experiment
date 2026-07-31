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
example : checkedWellFormed timerUserTaskCompositionCheckedProcess = true := by
  decide
example : checkedWellFormed reverseTimerUserTaskCompositionCheckedProcess = true := by
  decide
example : checkedWellFormed emptyCheckedGraph = false := by decide
example : checkedWellFormed flowlessCheckedGraph = false := by decide
example : checkedWellFormed danglingCheckedGraph = false := by decide
example : programWellFormed sequentialProgram = true := by decide
example : programWellFormed parallelProgram = true := by decide
example : programWellFormed timerUserTaskCompositionProgram = true := by decide
example :
    programProfileCapabilitiesValid timerUserTaskCompositionProgram = true := by
  decide
example :
    programProfileCapabilitiesValid
      { timerUserTaskCompositionProgram with
        identity :=
          { timerUserTaskCompositionProgram.identity with
            semanticProfile :=
              ⟨"cibseven-2.2.0-intermediate-catch-timer-draft"⟩ } } =
      false := by
  decide
example : definitionBindingValid sequentialCheckedProcess sequentialProgram = true := by
  decide
example : definitionBindingValid parallelCheckedProcess parallelProgram = true := by
  decide

example : lowerCheckedProcess sequentialCheckedProcess = sequentialProgram := by
  decide

example : lowerCheckedProcess parallelCheckedProcess = parallelProgram := by
  decide

example :
    lowerCheckedProcess timerUserTaskCompositionCheckedProcess =
      timerUserTaskCompositionProgram := by
  decide

example :
    (applyStimulus 1 timerUserTaskCompositionProgram initialState
      timerUserTaskCompositionStart).internalStepBoundExceeded = true := by
  decide

example :
    timerUserTaskCompositionTimerWait.internalStepBoundExceeded = false := by
  decide

example :
    enabledInternalOperationCount timerUserTaskCompositionProgram
      timerUserTaskCompositionTimerWait.state = 0 := by
  decide

example :
    stableStateResumable timerUserTaskCompositionTimerWait.state = true := by
  decide

example :
    enabledInternalOperationCount timerUserTaskCompositionProgram
      timerUserTaskCompositionTaskWait.state = 0 := by
  decide

example :
    stableStateResumable timerUserTaskCompositionTaskWait.state = true := by
  decide

example :
    timerUserTaskCompositionCompleted.state.control =
      .completed ⟨"CompositionInstance_1"⟩ := by
  decide

private def timerUserTaskCompositionStrandedState : RuntimeState :=
  { timerUserTaskCompositionTaskWait.state with
    tokens := [⟨"place:stranded"⟩]
    waits := [] }

example :
    enabledInternalOperationCount timerUserTaskCompositionProgram
      timerUserTaskCompositionStrandedState = 0 := by
  decide

example :
    stableStateResumable timerUserTaskCompositionStrandedState = false := by
  decide

example :
    reverseTimerUserTaskCompositionTaskWait.internalStepBoundExceeded =
      false := by
  decide

example :
    enabledInternalOperationCount reverseTimerUserTaskCompositionProgram
      reverseTimerUserTaskCompositionTaskWait.state = 0 := by
  decide

example :
    stableStateResumable reverseTimerUserTaskCompositionTaskWait.state =
      true := by
  decide

example :
    enabledInternalOperationCount reverseTimerUserTaskCompositionProgram
      reverseTimerUserTaskCompositionTimerWait.state = 0 := by
  decide

example :
    stableStateResumable reverseTimerUserTaskCompositionTimerWait.state =
      true := by
  decide

example :
    reverseTimerUserTaskCompositionCompleted.state.control =
      .completed ⟨"CompositionInstance_1"⟩ := by
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
