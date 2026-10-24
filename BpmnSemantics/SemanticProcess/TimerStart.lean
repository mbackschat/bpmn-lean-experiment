module

public import BpmnSemantics.SemanticProcess.MessageStart

/-! # Timer Start Event transition

This module owns the profile-independent Timer Start initiation relation and executable state transformation. External resolved-occurrence admission and profile cardinality remain separate owners.
-/

@[expose] public section

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Profile-independent structural contract for the exact normalized duration and canonical nonempty Timer-start fan-out. -/
def timerInitiationOperationWellFormed (places : List ControlPlace)
    (id : OperationId) (origin : BpmnElementOrigin)
    (durationMs : Nat) (outputs : List ControlPlaceId) : Bool :=
  nonempty id.value &&
    nonempty origin.elementId.value &&
    durationMs = 1000 &&
    !outputs.isEmpty &&
    strictlySortedStrings (outputs.map fun output => output.value) &&
    outputs.all fun output => places.any fun place => decide (place.id = output)

/-- Timer Start uses the shared root-token transition after exact timer-specific external admission. -/
def initiateTimerState? (state : RuntimeState)
    (outputs : List ControlPlaceId) : Option RuntimeState :=
  initiateTriggeredStartState? state outputs

/-- Declarative Timer Start initiation, separated from the executable dispatcher.

The single constructor takes the executable result as its premise, so this relation is the graph
of `initiateTimerState?` rather than an independent account of what Timer Start initiation
means. Separation buys a named relation for the dispatcher to select, not a second opinion. -/
inductive TimerInitiationStep :
    RuntimeState → List ControlPlaceId → RuntimeState → Prop where
  | apply (before after : RuntimeState) (outputs : List ControlPlaceId)
      (transition : initiateTimerState? before outputs = some after) :
      TimerInitiationStep before outputs after

/-- Constructor-selection check for the Timer Start arm. Its proof is one `exact`, because the
relation's only premise is the equation it is handed; it cannot fail apart from the evaluator and
is not a semantic evidence lane. -/
theorem initiateTimerState_sound (before after : RuntimeState)
    (outputs : List ControlPlaceId)
    (result : initiateTimerState? before outputs = some after) :
    TimerInitiationStep before outputs after := by
  exact .apply before after outputs result


end BpmnSemantics.SemanticProcess
