import BpmnSemantics.MessageStartConformanceFixtures

/-! # Message Start Event closure conformance

This proof slice is kept separate so independent kernel-decided Message Start obligations do not accumulate in one near-cap elaboration process.
-/

namespace BpmnSemantics.MessageStartConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

/-- The executable Message initiation evaluator is sound for the declarative relation. -/
theorem message_initiation_evaluator_is_sound
    (before after : RuntimeState) (outputs : List ControlPlaceId)
    (result : initiateMessageState? before outputs = some after) :
    MessageInitiationStep before outputs after :=
  initiateMessageState_sound before after outputs result

/-- The first unstable prefix enables only Message initiation. -/
theorem admitted_prefix_enables_exactly_one_operation :
    enabledInternalOperationCount program admittedState = 1 := by
  decide +kernel

/-- The second unstable prefix enables only the downstream User Task. -/
theorem initiated_prefix_enables_exactly_one_operation :
    enabledInternalOperationCount program initiatedState = 1 := by
  decide +kernel

/-- The exact internal trace is Message initiation followed by User Task activation. -/
theorem exact_two_step_internal_trace :
    runChoices program admittedState [startOperationId, taskOperationId] =
      some waitingState := by
  decide +kernel

/-- Production closure reaches one stable resumable User Task wait in two steps. -/
theorem exact_trigger_reaches_stable_user_task_wait :
    scenarioClosureLimit = 8 ∧
      applyStimulus scenarioClosureLimit program initialState trigger =
        { outcome := .committed
          state := waitingState
          internalStepBoundExceeded := false
          ambiguousInternalChoice := false } ∧
      enabledInternalOperationCount program waitingState = 0 ∧
      stableStateResumable waitingState = true := by
  decide +kernel

/-- The production limit exceeds the exact two-step closure length. -/
theorem exact_closure_length_fits_production_limit :
    2 ≤ scenarioClosureLimit := by
  decide +kernel

/-- A one-step test limit reports the remaining enabled User Task operation. -/
theorem one_step_limit_reports_overflow :
    applyStimulus 1 program initialState trigger =
      { outcome := .committed
        state := initiatedState
        internalStepBoundExceeded := true
        ambiguousInternalChoice := false } := by
  decide +kernel

end BpmnSemantics.MessageStartConformance
