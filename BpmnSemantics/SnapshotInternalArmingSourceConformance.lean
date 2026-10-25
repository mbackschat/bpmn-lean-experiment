import BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshotTransitionTrace
import BpmnSemantics.CompensationSourceLoweringFixtures

/-! The reviewed Compensation source model's Start across the dormant snapshot declaration, as executable
checks that [`ConformanceChecksMain`](ConformanceChecksMain.lean) runs natively. They are apart from the
six-family arming witnesses because those import proof owners an executable root may not reach. -/

namespace BpmnSemantics.SnapshotInternalArmingSourceConformance

open BpmnSemantics.SemanticProcess

def sourceStart : Stimulus :=
  .startProcess ⟨"s"⟩ ⟨CompensationSourceLoweringConformance.expectedProgram.processId.value⟩ ⟨"i"⟩
    [{ name := "Property_TravelDetails", value := .string "trip" }]

def sourceTrace : TracedStimulusResult :=
  applyStimulusTracedWithCompensationSnapshots 4 CompensationSourceLoweringConformance.expectedProgram
    initialState sourceStart

def reviewed_source_start_commits_both_tasks_and_complete_publication : Bool := decide <|
    sourceTrace.result.outcome = .committed ∧
      sourceTrace.result.state.waits.length = 2 ∧
      sourceTrace.committedTransitions.length = 5 ∧
      sourceTrace.flowNodeOccurrenceLifecycles.length = 5

def reviewed_source_insufficient_fuel_rolls_back_without_publication : Bool := decide <|
    let traced := applyStimulusTracedWithCompensationSnapshots 3
      CompensationSourceLoweringConformance.expectedProgram initialState sourceStart
    traced.result =
      { outcome := .rolledBack, state := initialState,
        internalStepBoundExceeded := true, ambiguousInternalChoice := false } ∧
      traced.committedTransitions = [] ∧ traced.flowNodeOccurrenceLifecycles = []

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("reviewed_source_start_commits_both_tasks_and_complete_publication", reviewed_source_start_commits_both_tasks_and_complete_publication),
  ("reviewed_source_insufficient_fuel_rolls_back_without_publication", reviewed_source_insufficient_fuel_rolls_back_without_publication)
]

end BpmnSemantics.SnapshotInternalArmingSourceConformance
