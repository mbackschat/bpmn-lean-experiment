module

public import BpmnSemantics.SemanticProcess.ActivityDataInput
public import BpmnSemantics.SemanticProcess.ActivityDataOutput
public import BpmnSemantics.SemanticProcess.BoundedScopeArming
public import BpmnSemantics.SemanticProcess.RuntimeStateWellFormed

/-! # Activity-counter canonical insertion witnesses

Each formerly prepending writer must retain an earlier element's high-water mark while inserting a
later element in raw storage order. Task and Activity issuance remain separate.
-/

@[expose] public section

namespace BpmnSemantics.ActivityActivationOrderConformance

open BpmnSemantics.SemanticProcess

def owner : ScopeOccurrenceId :=
  { processInstanceId := ⟨"instance"⟩, definitionScopeId := ⟨"process"⟩, activation := 1 }

def state : RuntimeState :=
  { initialState with
    control := .running owner.processInstanceId
    tokens := [{ placeId := ⟨"input"⟩, owner }]
    activations := [{ taskId := ⟨"z"⟩, count := 10 }]
    activityActivations :=
      [{ taskId := ⟨"a"⟩, count := 7 }, { taskId := ⟨"z"⟩, count := 2 }]
    variables := { process := { bindings := [{ name := "source", value := .string "value" }] }
                   activities := []
                   processInterfaces := [], scopes := [] } }

def boundary : BoundaryTimerArm :=
  { elementId := ⟨"deadline"⟩, durationMs := 1000, output := ⟨"expired"⟩,
    origin := ⟨⟨"Flow_Expired"⟩⟩ }

def expected : List TaskActivation :=
  [{ taskId := ⟨"a"⟩, count := 7 }, { taskId := ⟨"z"⟩, count := 3 }]

def boundedAfter : RuntimeState :=
  activateBoundedUserTask state owner.processInstanceId owner ⟨"input"⟩
    { id := ⟨"z"⟩, name := none, output := ⟨"output"⟩ } boundary

def scopeAfter : RuntimeState :=
  armScopeDeadline state owner ⟨⟨"z"⟩⟩
    { owner with definitionScopeId := ⟨"scope:z"⟩, activation := 4 } boundary

def inputAfter : Option RuntimeState :=
  activateDataInputUserTask? state ⟨"input"⟩ ⟨"output"⟩ ⟨"z"⟩ none
    { associationId := "association", source := .property "source",
      targetDataInputId := "input-value", targetDataInputName := none }

def outputAfter : Option RuntimeState :=
  activateDataOutputUserTask? state ⟨"input"⟩ ⟨"output"⟩ ⟨"z"⟩ none

def activity_counter_insertion_preserves_marks_and_separate_issuers : Bool := decide <|
    canonicalCollectionOrder state = true ∧
      boundedAfter.activityActivations = expected ∧
      activationCount boundedAfter ⟨"z"⟩ = 11 ∧
      scopeAfter.activityActivations = expected ∧
      scopeAfter.activations = state.activations ∧
      inputAfter.map (·.activityActivations) = some expected ∧
      inputAfter.map (fun after => activationCount after ⟨"z"⟩) = some 11 ∧
      outputAfter.map (·.activityActivations) = some expected ∧
      outputAfter.map (fun after => activationCount after ⟨"z"⟩) = some 11

/-- Every executable check of this module, named for the driver's failure report. -/
def checks : List (String × Bool) := [
  ("activity_counter_insertion_preserves_marks_and_separate_issuers", activity_counter_insertion_preserves_marks_and_separate_issuers)
]

end BpmnSemantics.ActivityActivationOrderConformance
