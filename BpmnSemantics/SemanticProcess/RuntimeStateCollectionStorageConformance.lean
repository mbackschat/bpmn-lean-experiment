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

def valid_start_and_completion_are_committed : Bool := decide <|
    (applyStimulus scenarioClosureLimit program initialState start).outcome = .committed ∧
      (applyStimulus scenarioClosureLimit program ActivityBoundaryTimerConformance.armedState
        completion).outcome = .committed

def duplicate_counter_start_is_rejected_without_mutation : Bool := decide <|
    (applyStimulus scenarioClosureLimit program duplicateStartCounters start).outcome = .rejected ∧
      (applyStimulus scenarioClosureLimit program duplicateStartCounters start).state =
        duplicateStartCounters

def duplicate_counter_completion_is_rejected_without_mutation : Bool := decide <|
    (applyStimulus scenarioClosureLimit program duplicateCompletionCounters completion).outcome = .rejected ∧
      (applyStimulus scenarioClosureLimit program duplicateCompletionCounters completion).state =
        duplicateCompletionCounters

def repeatedTokenUnits : RuntimeState :=
  { initialState with tokens :=
    [⟨⟨"place:Probe"⟩, ⟨⟨"Instance_1"⟩, ⟨"scope:Probe"⟩, 1⟩⟩,
      ⟨⟨"place:Probe"⟩, ⟨⟨"Instance_1"⟩, ⟨"scope:Probe"⟩, 1⟩⟩] }

def positive_token_multiplicity_is_retained_as_unit_bag : Bool := decide <|
    committedStateCollectionAdmitted repeatedTokenUnits = true ∧
      repeatedTokenUnits.tokens.length = 2

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("valid_start_and_completion_are_committed", valid_start_and_completion_are_committed),
  ("duplicate_counter_start_is_rejected_without_mutation", duplicate_counter_start_is_rejected_without_mutation),
  ("duplicate_counter_completion_is_rejected_without_mutation", duplicate_counter_completion_is_rejected_without_mutation),
  ("positive_token_multiplicity_is_retained_as_unit_bag", positive_token_multiplicity_is_retained_as_unit_bag)
]

end BpmnSemantics.SemanticProcess.RuntimeStateCollectionStorageConformance
