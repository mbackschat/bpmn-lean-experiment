import BpmnSemantics.SemanticProcess.TransitionTrace
import BpmnSemantics.SemanticProcess.CompensationTriggerHandlerFlowNodeOccurrence

/-! Retained ordinary preparations connect snapshot-aware attempts to the focused closure without widening the declaration-free evaluator. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

namespace InternalCommutation

def snapshotArmingAnchorFresh (program : Program) (state : RuntimeState)
    (patch : InternalArmingPatch) : Bool :=
  match projectOpenCompensationFlowNodeOccurrences? program state with
  | none => false
  | some compensation =>
      !(compensation.map (·.anchor)).contains (.wait patch.write.occurrence)

def prepareSnapshotArming? (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) : Option PreparedInternalArming := do
  let patch ← prepareInternalArm? program state operation
  if snapshotArmingAnchorFresh program state patch then some (.ordinary operation patch) else none

def prepareSnapshotArmingBatch? (program : Program) (state : RuntimeState)
    (operations : List SemanticOperation) : Option (List PreparedInternalArming) := do
  if operations.length < 2 then none else pure ()
  if !(projectOpenFlowNodeOccurrencesWithCompensation? program state).isSome then none else pure ()
  let prepared ← operations.mapM (prepareSnapshotArming? program state)
  if prepared.Pairwise PreparedInternalArming.Independent then some prepared else none

def applyPreparedSnapshotArming? (program : Program) (state : RuntimeState)
    (prepared : PreparedInternalArming) : Option RuntimeState := do
  if prepareSnapshotArming? program state prepared.operation != some prepared then none else pure ()
  match attemptInternalOperation program prepared.operation state with
  | .applied step => some step.successor
  | .disabled _ | .refused _ _ => none

end InternalCommutation

def snapshotArmingPublicationForFootprint? (program : Program) (before after : RuntimeState)
    (operation : SemanticOperation) (commandId : SemanticId)
    (footprint : InternalTransitionFootprint) : Option InternalPublicationPair := do
  let record ← internalTransitionRecord? program before operation
  let lifecycle ← flowNodeOccurrenceDeltaForOperationWithCompensation? program before after operation
    commandId 0
  pure { footprint, record, lifecycle }

private def internalOperationAttemptBefore
    (left right : InternalOperationAttempt) : Bool :=
  left.operation.id.value < right.operation.id.value

/-- Select the private refusal detail from the lowest canonical operation ID. -/
def canonicalInternalOperationRefusal?
    (attempts : List InternalOperationAttempt) :
    Option InternalOperationRefusal :=
  (InternalCommutation.sortBy internalOperationAttemptBefore attempts).findSome? fun
    | .refused _ reason => some reason
    | .disabled _ | .applied _ => none

structure SnapshotInternalTransitionFrontier where
  transitions : List (SemanticOperation × RuntimeState)
  refusal : Option InternalOperationRefusal

def snapshotInternalTransitionFrontier (program : Program)
    (state : RuntimeState) : SnapshotInternalTransitionFrontier :=
  let attempts := program.operations.map fun operation =>
    attemptInternalOperation program operation state
  let refusal := canonicalInternalOperationRefusal? attempts
  let transitions := canonicalEnabledInternalTransitions <|
    (InternalCommutation.sortBy internalOperationAttemptBefore attempts).filterMap fun
      | .applied step => some (step.operation, step.successor)
      | .disabled _ | .refused _ _ => none
  { transitions, refusal }

structure SnapshotInternalBatchResult where
  state : RuntimeState
  publications : List InternalPublicationPair

inductive SnapshotInternalBatchAttempt where
  | disabled
  | applied (result : SnapshotInternalBatchResult)
  | refused (reason : InternalOperationRefusal)

def fireSnapshotInternalBatch (program : Program) (commandId : SemanticId) :
    RuntimeState → List InternalCommutation.PreparedInternalArming → SnapshotInternalBatchAttempt
  | state, [] => .applied { state, publications := [] }
  | state, prepared :: rest =>
      let frontier := snapshotInternalTransitionFrontier program state
      match frontier.refusal with
      | some reason => .refused reason
      | none =>
          match InternalCommutation.applyPreparedSnapshotArming? program state prepared with
          | none => .disabled
          | some successor =>
              match snapshotArmingPublicationForFootprint? program state successor prepared.operation
                  commandId prepared.footprint with
              | none => .disabled
              | some publication =>
                  match fireSnapshotInternalBatch program commandId successor rest with
                  | .disabled => .disabled
                  | .refused reason => .refused reason
                  | .applied tail =>
                      .applied
                        { state := tail.state
                          publications := publication :: tail.publications }

end BpmnSemantics.SemanticProcess
