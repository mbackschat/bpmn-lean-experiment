module

public import BpmnSemantics.ActivityBoundaryTimerFixtures

/-! AA-18 separates committed storage admission from the raw evaluator's token and frame laws. -/

@[expose] public section

namespace BpmnSemantics.SemanticProcess.RuntimeStateCollectionStorageConformance

open BpmnSemantics
open BpmnSemantics.SemanticProcess

def program : Program := ActivityBoundaryTimerConformance.program
def start : Stimulus :=
  .startProcess ⟨"start-process"⟩ ⟨"Process_ActivityBoundaryTimer"⟩ ⟨"Instance_1"⟩ []
def completion : Stimulus :=
  .completeUserTaskInstance ⟨"complete-bounded-task"⟩ ActivityBoundaryTimerConformance.taskId []

def duplicateStartCounters : RuntimeState :=
  { initialState with activations :=
    [{ taskId := ⟨"BoundedTask"⟩, count := 5 }, { taskId := ⟨"BoundedTask"⟩, count := 9 }] }

def duplicateCompletionCounters : RuntimeState :=
  { ActivityBoundaryTimerConformance.armedState with activations :=
    [{ taskId := ⟨"BoundedTask"⟩, count := 1 },
      { taskId := ⟨"NormalTask"⟩, count := 5 }, { taskId := ⟨"NormalTask"⟩, count := 9 }] }

theorem valid_start_and_completion_are_committed :
    (applyStimulus scenarioClosureLimit program initialState start).outcome = .committed ∧
      (applyStimulus scenarioClosureLimit program ActivityBoundaryTimerConformance.armedState
        completion).outcome = .committed := by
  decide +kernel

theorem duplicate_counter_start_is_rejected_without_mutation :
    (applyStimulus scenarioClosureLimit program duplicateStartCounters start).outcome = .rejected ∧
      (applyStimulus scenarioClosureLimit program duplicateStartCounters start).state =
        duplicateStartCounters := by
  decide +kernel

theorem duplicate_counter_completion_is_rejected_without_mutation :
    (applyStimulus scenarioClosureLimit program duplicateCompletionCounters completion).outcome = .rejected ∧
      (applyStimulus scenarioClosureLimit program duplicateCompletionCounters completion).state =
        duplicateCompletionCounters := by
  decide +kernel

def repeatedTokenUnits : RuntimeState :=
  { initialState with tokens :=
    [⟨⟨"place:Probe"⟩, ⟨⟨"Instance_1"⟩, ⟨"scope:Probe"⟩, 1⟩⟩,
      ⟨⟨"place:Probe"⟩, ⟨⟨"Instance_1"⟩, ⟨"scope:Probe"⟩, 1⟩⟩] }

theorem positive_token_multiplicity_is_retained_as_unit_bag :
    committedStateCollectionAdmitted repeatedTokenUnits = true ∧
      repeatedTokenUnits.tokens.length = 2 := by
  decide +kernel

end BpmnSemantics.SemanticProcess.RuntimeStateCollectionStorageConformance
