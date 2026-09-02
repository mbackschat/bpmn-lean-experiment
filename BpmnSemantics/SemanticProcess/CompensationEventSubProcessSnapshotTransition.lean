import BpmnSemantics.SemanticProcess.BoundedScopeArming
import BpmnSemantics.SemanticProcess.BoundedScope
import BpmnSemantics.SemanticProcess.InternalOperationAttempt

/-! # Compensation Event Sub-Process snapshot-aware scope transitions -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Recover the exact child occurrence created by one successful scope-entry preflight. -/
def childOccurrenceAfterEntry? (state : RuntimeState)
    (input : ControlPlaceId) (childScopeId : DefinitionScopeId)
    (entered : RuntimeState) : Option RuntimeScopeOccurrence := do
  let parent ← onlyTokenOwner? state input
  match entered.scopeOccurrences.filter fun occurrence =>
      occurrence.parent == some parent &&
        occurrence.id.definitionScopeId == childScopeId with
  | [child] => some child
  | _ => none

/-- Apply child entry only after its selected snapshot reservation has been decided. -/
def applyPreparedReservation (program : Program)
    (operation : SemanticOperation) (state : RuntimeState)
    (child : RuntimeScopeOccurrence)
    (apply : RuntimeState → Option RuntimeState) : InternalOperationAttempt :=
  match reserveCompensationParentContext program state child with
  | .refused reason _ => .refused operation reason
  | .disabled prepared | .applied prepared =>
      match apply prepared with
      | none => .disabled operation
      | some successor => applyValidSnapshotSuccessor program operation successor

theorem applyPreparedReservation_applied_stateValid
    (program : Program) (operation : SemanticOperation) (state : RuntimeState)
    (child : RuntimeScopeOccurrence) (apply : RuntimeState → Option RuntimeState)
    (step : AppliedInternalOperation)
    (applied : applyPreparedReservation program operation state child apply = .applied step) :
    compensationEventSubProcessSnapshotStateValid program step.successor = true := by
  unfold applyPreparedReservation at applied
  cases reserved : reserveCompensationParentContext program state child with
  | refused reason returned => simp [reserved] at applied
  | disabled prepared =>
      cases successor : apply prepared with
      | none => simp [reserved, successor] at applied
      | some after =>
          exact applyValidSnapshotSuccessor_applied_stateValid program operation after step
            (by simpa [reserved, successor] using applied)
  | applied prepared =>
      cases successor : apply prepared with
      | none => simp [reserved, successor] at applied
      | some after =>
          exact applyValidSnapshotSuccessor_applied_stateValid program operation after step
            (by simpa [reserved, successor] using applied)

/-- Compose ordinary child entry with its exact snapshot reservation. -/
def attemptEnterScope (program : Program) (operation : SemanticOperation)
    (state : RuntimeState) (input childEntry : ControlPlaceId)
    (childScopeId : DefinitionScopeId) : InternalOperationAttempt :=
  match enterScopeState? state input childEntry childScopeId with
  | none => .disabled operation
  | some entered =>
      match childOccurrenceAfterEntry? state input childScopeId entered with
      | none => .disabled operation
      | some child =>
          applyPreparedReservation program operation state child fun prepared =>
            enterScopeState? prepared input childEntry childScopeId

/-- Compose bounded child entry and arming with its exact snapshot reservation. -/
def attemptEnterBoundedScope (program : Program)
    (operation : SemanticOperation) (state : RuntimeState)
    (input childEntry : ControlPlaceId) (childScopeId : DefinitionScopeId)
    (boundaryTimer : BoundaryTimerArm) : InternalOperationAttempt :=
  match armBoundedScopeState? state input childEntry childScopeId boundaryTimer with
  | none => .disabled operation
  | some entered =>
      match childOccurrenceAfterEntry? state input childScopeId entered with
      | none => .disabled operation
      | some child =>
          applyPreparedReservation program operation state child fun prepared =>
            armBoundedScopeState? prepared input childEntry childScopeId boundaryTimer

/-- Resolve the sole live occurrence whose completion is being decided. -/
def selectedCompletionOccurrence? (state : RuntimeState)
    (scopeId : DefinitionScopeId) : Option RuntimeScopeOccurrence :=
  match state.scopeOccurrences.filter fun occurrence =>
      occurrence.id.definitionScopeId == scopeId with
  | [occurrence] => some occurrence
  | _ => none

/-- Apply the selected root disposition after the completion transition succeeds. -/
def finishRootCompletion (successor : RuntimeState)
    (occurrence : RuntimeScopeOccurrence)
    (disposition : CompensationParentContextRootDisposition) : RuntimeState :=
  match occurrence.parent with
  | none => purgeCompensationParentContextForRoot successor occurrence disposition
  | some _ => successor

private def scopeOccurrenceIsLive (state : RuntimeState)
    (owner : ScopeOccurrenceId) : Bool :=
  state.scopeOccurrences.any fun occurrence => occurrence.id == owner

private def keepAfterUnsuccessfulScopeRemoval (successor : RuntimeState)
    (retention : CompensationParentContextRetention) : Bool :=
  match retention with
  | .provisional parent _ =>
      scopeOccurrenceIsLive successor parent.id &&
        match parent.parent with
        | none => true
        | some root => scopeOccurrenceIsLive successor root
  | .promoted parent _ _ =>
      match parent.parent with
      | none => scopeOccurrenceIsLive successor parent.id
      | some root => scopeOccurrenceIsLive successor root

/- Regional scope cancellation already removes records owned by the occurrences it withdraws. This
fallback covers other operation families whose successful transition removes a parent or its owning
root without going through that shared cancellation primitive. -/
/-- Purge provisional parents and whole collections whose owning root disappeared unsuccessfully. -/
def purgeCompensationParentContextsAfterUnsuccessfulScopeRemoval
    (successor : RuntimeState) : RuntimeState :=
  { successor with
    compensationParentContextRetentions :=
      successor.compensationParentContextRetentions.filter
        (keepAfterUnsuccessfulScopeRemoval successor) }

/-- Promote the deciding pre-completion context before completing the selected scope. -/
def attemptCompleteScope (program : Program)
    (operation : SemanticOperation) (state : RuntimeState)
    (scopeId : DefinitionScopeId) (parentOutput : Option ControlPlaceId) :
    InternalOperationAttempt :=
  match completeBoundedScope? program state scopeId parentOutput,
      selectedCompletionOccurrence? state scopeId with
  | some _, some occurrence =>
      match promoteCompensationParentContext program state occurrence with
      | .refused reason _ => .refused operation reason
      | .disabled prepared =>
          match completeBoundedScope? program prepared scopeId parentOutput with
          | none => .disabled operation
          | some successor =>
              applyValidSnapshotSuccessor program operation
                (finishRootCompletion successor occurrence .discard)
      | .applied prepared =>
          match completeBoundedScope? program prepared scopeId parentOutput with
          | none => .disabled operation
          | some successor =>
              applyValidSnapshotSuccessor program operation
                (finishRootCompletion successor occurrence .retainPromoted)
  | _, _ => .disabled operation

end BpmnSemantics.SemanticProcess
