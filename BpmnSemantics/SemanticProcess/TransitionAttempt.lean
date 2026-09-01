import BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshot
import BpmnSemantics.SemanticProcess.Transition

/-! # Refusable internal transition attempt

This module stages Compensation Event Sub-Process snapshot reservation or promotion before the
ordinary operation rewrite. It is the closure-facing three-arm boundary: disabled operations do not
fire, applied operations carry one successor, and semantic-capacity refusal remains distinct from
both so the caller can roll back the complete stimulus.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

structure AppliedInternalOperation where
  operation : SemanticOperation
  successor : RuntimeState
  deriving Repr, DecidableEq

inductive InternalOperationAttempt where
  | disabled (operation : SemanticOperation)
  | applied (step : AppliedInternalOperation)
  | refused (operation : SemanticOperation)
      (reason : CompensationParentContextRefusal)
  deriving Repr, DecidableEq

def InternalOperationAttempt.operation : InternalOperationAttempt → SemanticOperation
  | .disabled operation | .refused operation _ => operation
  | .applied step => step.operation

private def childOccurrenceAfterEntry? (state : RuntimeState)
    (input : ControlPlaceId) (childScopeId : DefinitionScopeId)
    (entered : RuntimeState) : Option RuntimeScopeOccurrence := do
  let parent ← onlyTokenOwner? state input
  match entered.scopeOccurrences.filter fun occurrence =>
      occurrence.parent == some parent &&
        occurrence.id.definitionScopeId == childScopeId with
  | [child] => some child
  | _ => none

private def applyPreparedReservation (program : Program)
    (operation : SemanticOperation) (state : RuntimeState)
    (child : RuntimeScopeOccurrence)
    (apply : RuntimeState → Option RuntimeState) : InternalOperationAttempt :=
  match reserveCompensationParentContext program state child with
  | .refused reason _ => .refused operation reason
  | .disabled prepared | .applied prepared =>
      match apply prepared with
      | none => .disabled operation
      | some successor => .applied { operation, successor }

private def attemptEnterScope (program : Program) (operation : SemanticOperation)
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

private def attemptEnterBoundedScope (program : Program)
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

private def selectedCompletionOccurrence? (state : RuntimeState)
    (scopeId : DefinitionScopeId) : Option RuntimeScopeOccurrence :=
  match state.scopeOccurrences.filter fun occurrence =>
      occurrence.id.definitionScopeId == scopeId with
  | [occurrence] => some occurrence
  | _ => none

private def finishRootCompletion (successor : RuntimeState)
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

/- Base regional cancellation deliberately knows nothing about snapshots. The focused attempt applies
this filter to the same successor before exposing it, so an unsuccessful removal and its hidden-state
purge remain one atomic semantic result without increasing every legacy cancellation reduction. -/
/-- Purge provisional parents and whole collections whose owning root disappeared unsuccessfully. -/
def purgeCompensationParentContextsAfterUnsuccessfulScopeRemoval
    (successor : RuntimeState) : RuntimeState :=
  { successor with
    compensationParentContextRetentions :=
      successor.compensationParentContextRetentions.filter
        (keepAfterUnsuccessfulScopeRemoval successor) }

private def attemptCompleteScope (program : Program)
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
              .applied
                { operation
                  successor := finishRootCompletion successor occurrence .discard }
      | .applied prepared =>
          match completeBoundedScope? program prepared scopeId parentOutput with
          | none => .disabled operation
          | some successor =>
              .applied
                { operation
                  successor := finishRootCompletion successor occurrence .retainPromoted }
  | _, _ => .disabled operation

/-- Evaluate one exact Program operation through the closed snapshot-aware attempt boundary. -/
def attemptInternalOperation (program : Program) (operation : SemanticOperation)
    (state : RuntimeState) : InternalOperationAttempt :=
  match program.compensationEventSubProcessSnapshots with
  | none =>
      match fire? program operation state with
      | none => .disabled operation
      | some successor => .applied { operation, successor }
  | some _ =>
      match operation with
      | .enterScope _ _ input childEntry childScopeId =>
          attemptEnterScope program operation state input childEntry childScopeId
      | .enterBoundedScope _ _ input childEntry childScopeId boundaryTimer =>
          attemptEnterBoundedScope program operation state input childEntry childScopeId
            boundaryTimer
      | .completeScope _ _ scopeId parentOutput =>
          attemptCompleteScope program operation state scopeId parentOutput
      | _ =>
          match fire? program operation state with
          | none => .disabled operation
          | some successor =>
              .applied
                { operation
                  successor :=
                    purgeCompensationParentContextsAfterUnsuccessfulScopeRemoval successor }

/-- Snapshot-free Programs use the original two-arm evaluator without reducing snapshot validation.

The equality is semantic compatibility; avoiding the unused reduction is also a resource invariant
because kernel-decided legacy conformance modules reduce this dispatcher many times. -/
theorem attemptInternalOperation_withoutSnapshotDeclaration
    (program : Program) (operation : SemanticOperation) (state : RuntimeState)
    (absent : program.compensationEventSubProcessSnapshots = none) :
    attemptInternalOperation program operation state =
      match fire? program operation state with
      | none => .disabled operation
      | some successor => .applied { operation, successor } := by
  simp [attemptInternalOperation, absent]

/-- Program relation for the exact snapshot-aware three-arm evaluator. -/
def AttemptProgramStep (program : Program) (before : RuntimeState)
    (choice : OperationId) (after : RuntimeState) : Prop :=
  ∃ operation step,
    operation ∈ program.operations ∧
      operation.id = choice ∧
        attemptInternalOperation program operation before = .applied step ∧
          step.successor = after

theorem attemptInternalOperation_sound (program : Program)
    (operation : SemanticOperation) (before : RuntimeState)
    (step : AppliedInternalOperation)
    (result : attemptInternalOperation program operation before = .applied step)
    (present : operation ∈ program.operations) :
    AttemptProgramStep program before operation.id step.successor := by
  exact ⟨operation, step, present, rfl, result, rfl⟩

/-- A successful attempt for a declaration-free Program remains an ordinary Program step. -/
theorem attemptProgramStep_withoutSnapshotDeclaration
    (program : Program) (before : RuntimeState) (choice : OperationId)
    (after : RuntimeState)
    (absent : program.compensationEventSubProcessSnapshots = none)
    (attempted : AttemptProgramStep program before choice after) :
    ProgramStep program before choice after := by
  rcases attempted with
    ⟨operation, step, present, selected, evaluated, successor⟩
  cases fired : fire? program operation before with
  | none =>
      rw [attemptInternalOperation_withoutSnapshotDeclaration
        program operation before absent, fired] at evaluated
      contradiction
  | some firedSuccessor =>
      rw [attemptInternalOperation_withoutSnapshotDeclaration
        program operation before absent, fired] at evaluated
      have stepEq :
          { operation := operation, successor := firedSuccessor } = step :=
        InternalOperationAttempt.applied.inj evaluated
      have firedSuccessorEq : firedSuccessor = step.successor :=
        congrArg AppliedInternalOperation.successor stepEq
      exact ⟨operation, present, selected,
        fire_sound program operation before after
          (by simpa [firedSuccessorEq.trans successor] using fired)⟩

end BpmnSemantics.SemanticProcess
