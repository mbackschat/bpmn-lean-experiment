import BpmnSemantics.SemanticProcess.TransitionTrace
import BpmnSemantics.SemanticProcess.ControlPositionProjection

/-! # Public committed control positions

This module binds the independent public-position projection and delta fold to strict committed-transition replay. Its accepted delta trace must reconstruct the independently projected head from revision zero.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private structure DeltaTraceAccumulator where
  state : RuntimeState
  deltas : List PublicControlPositionDelta

private def replayOneTransition? (program : Program) (state : RuntimeState) :
    CommittedTransition → Option RuntimeState
  | .externalStimulus stimulus =>
      let admission := admitStimulus program state stimulus
      if admission.outcome = .committed then some admission.state else none
  | .internalOperation record => replayInternalTransition? program state record

private def buildPositionDeltas? (program : Program) (expectedInstanceId : SemanticId) :
    RuntimeState → List CommittedTransition → Option DeltaTraceAccumulator
  | state, [] => some { state, deltas := [] }
  | state, transition :: rest => do
      let successor ← replayOneTransition? program state transition
      let delta ← controlPositionDelta? program expectedInstanceId state successor
      let tail ← buildPositionDeltas? program expectedInstanceId successor rest
      pure { state := tail.state, deltas := delta :: tail.deltas }

private def foldCheckedDeltas (current : PublicControlPosition) :
    List PublicControlPositionDelta → Option (List PublicControlPositionDelta)
  | deltas =>
      if foldControlPositionDeltas emptyPublicControlPosition deltas = some current then
        some deltas
      else none

/-- Replay a trace only to prove each exact before/after delta and its independent head projection. -/
def traceControlPositionDeltas? (program : Program) (expectedInstanceId : SemanticId)
    (initial : RuntimeState) (transitions : List CommittedTransition) :
    Option (List PublicControlPositionDelta × PublicControlPosition) := do
  let initialPosition ← projectControlPosition? program expectedInstanceId initial
  if initialPosition ≠ emptyPublicControlPosition then none
  else
    let traced ← buildPositionDeltas? program expectedInstanceId initial transitions
    let current ← projectControlPosition? program expectedInstanceId traced.state
    let deltas ← foldCheckedDeltas current traced.deltas
    pure (deltas, current)

/-- Every accepted delta list folds from revision zero to the independently projected head. -/
theorem foldCheckedDeltas_reconstructs_current (current : PublicControlPosition)
    (candidate accepted : List PublicControlPositionDelta)
    (result : foldCheckedDeltas current candidate = some accepted) :
    foldControlPositionDeltas emptyPublicControlPosition accepted = some current := by
  unfold foldCheckedDeltas at result
  dsimp only at result
  split at result <;> simp_all

/-- Every successfully emitted delta trace folds to the same independently projected head it returns. -/
theorem traceControlPositionDeltas_reconstructs_head (program : Program)
    (expectedInstanceId : SemanticId) (initial : RuntimeState)
    (transitions : List CommittedTransition)
    (deltas : List PublicControlPositionDelta) (current : PublicControlPosition)
    (result : traceControlPositionDeltas? program expectedInstanceId initial transitions =
      some (deltas, current)) :
    foldControlPositionDeltas emptyPublicControlPosition deltas = some current := by
  unfold traceControlPositionDeltas? at result
  generalize initialProjectionEq :
    projectControlPosition? program expectedInstanceId initial = initialProjection at result
  cases initialProjection with
  | none => simp at result
  | some initialPosition =>
      by_cases nonempty : initialPosition ≠ emptyPublicControlPosition
      · simp [nonempty] at result
      · simp at result
        rcases result with ⟨_initialEmpty, result⟩
        generalize tracedEq :
          buildPositionDeltas? program expectedInstanceId initial transitions = traced at result
        cases traced with
        | none => simp at result
        | some traced =>
            generalize currentEq :
              projectControlPosition? program expectedInstanceId traced.state = projected at result
            cases projected with
            | none => simp [currentEq] at result
            | some projected =>
                simp [currentEq] at result
                generalize deltasEq : foldCheckedDeltas projected traced.deltas = accepted at result
                cases accepted with
                | none => simp at result
                | some accepted =>
                    simp at result
                    rcases result with ⟨rfl, rfl⟩
                    exact foldCheckedDeltas_reconstructs_current projected traced.deltas accepted deltasEq

end BpmnSemantics.SemanticProcess
