import BpmnSemantics.SemanticProcess.MessageStart

/-! # Timer Start Event transition

This module owns the profile-independent Timer Start initiation relation and executable state transformation. External resolved-occurrence admission and profile cardinality remain separate owners.
-/

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

/-- Declarative Timer Start initiation, separated from the executable dispatcher. -/
inductive TimerInitiationStep :
    RuntimeState → List ControlPlaceId → RuntimeState → Prop where
  | apply (before after : RuntimeState) (outputs : List ControlPlaceId)
      (transition : initiateTimerState? before outputs = some after) :
      TimerInitiationStep before outputs after

/-- Every executable Timer Start initiation belongs to the declarative relation. -/
theorem initiateTimerState_sound (before after : RuntimeState)
    (outputs : List ControlPlaceId)
    (result : initiateTimerState? before outputs = some after) :
    TimerInitiationStep before outputs after := by
  exact .apply before after outputs result

/-- From a fresh root control state, Timer initiation produces exactly one root-owned token for every output. -/
theorem timer_initiation_from_fresh_root_produces_each_output
    (state : RuntimeState) (owner : ScopeOccurrenceId)
    (outputs : List ControlPlaceId)
    (root : rootScopeOccurrence? state = some owner)
    (pending : state.initiationPending = true)
    (empty : state.tokens = []) :
    initiateTimerState? state outputs =
      some
        { state with
          initiationPending := false
          tokens := outputs.map fun output => { placeId := output, owner } } := by
  exact message_initiation_from_fresh_root_produces_each_output
    state owner outputs root pending empty

end BpmnSemantics.SemanticProcess
