module

public import BpmnSemantics.MessageStartConformanceFixtures
import all BpmnSemantics.SemanticProcess.ProgramStructuralValidation
import all BpmnSemantics.SemanticProcess.CheckedGraphValidation
import all BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import all BpmnSemantics.SemanticProcess.CallActivity

/-! # Message Start Event closure conformance

This proof slice is kept separate so independent kernel-decided Message Start obligations do not accumulate in one near-cap elaboration process.
-/

@[expose] public section

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
def admitted_prefix_enables_exactly_one_operation : Bool := decide <|
    enabledInternalOperationCount program admittedState = 1

/-- The second unstable prefix enables only the downstream User Task. -/
def initiated_prefix_enables_exactly_one_operation : Bool := decide <|
    enabledInternalOperationCount program initiatedState = 1

/-- The exact internal trace is Message initiation followed by User Task activation. -/
theorem exact_two_step_internal_trace :
    runChoices program admittedState [startOperationId, taskOperationId] =
      some waitingState := by
  decide +kernel

/-- Production closure reaches one stable resumable User Task wait in two steps. -/
def exact_trigger_reaches_stable_user_task_wait : Bool := decide <|
    scenarioClosureLimit = 8 ∧
      applyStimulus scenarioClosureLimit program initialState trigger =
        { outcome := .committed
          state := waitingState
          internalStepBoundExceeded := false
          ambiguousInternalChoice := false } ∧
      enabledInternalOperationCount program waitingState = 0 ∧
      stableStateResumable waitingState = true

/-- The production limit exceeds the exact two-step closure length. -/
def exact_closure_length_fits_production_limit : Bool := decide <|
    2 ≤ scenarioClosureLimit

/-- A one-step test limit reports the remaining enabled User Task operation. -/
def one_step_limit_reports_overflow : Bool := decide <|
    applyStimulus 1 program initialState trigger =
      { outcome := .rolledBack
        state := initialState
        internalStepBoundExceeded := true
        ambiguousInternalChoice := false }

/-- Every executable check of this module, named for the driver's failure report. -/
def messageStartClosureConformanceChecks : List (String × Bool) := [
  ("admitted_prefix_enables_exactly_one_operation", admitted_prefix_enables_exactly_one_operation),
  ("initiated_prefix_enables_exactly_one_operation", initiated_prefix_enables_exactly_one_operation),
  ("exact_trigger_reaches_stable_user_task_wait", exact_trigger_reaches_stable_user_task_wait),
  ("exact_closure_length_fits_production_limit", exact_closure_length_fits_production_limit),
  ("one_step_limit_reports_overflow", one_step_limit_reports_overflow)
]

end BpmnSemantics.MessageStartConformance
