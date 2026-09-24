import BpmnSemantics.SemanticProcess.FlowNodeOccurrenceLifecycle
import BpmnSemantics.SemanticProcess.Transition

/-! Exact operation metadata and strict replay remain independent of closure selection so
the [Internal Commutation account](../../docs/INTERNAL-COMMUTATION-PROPOSAL.md) can validate
prepared publications without importing the closure that consumes them. -/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

/-- Closed public discriminator for the existing Semantic Process operation variants. -/
inductive SemanticOperationKind where
  | initiate
  | initiateMessage
  | initiateTimer
  | enterScope
  | enterBoundedScope
  | enterMonitoredScope
  | invokeProcess
  | returnProcess
  | awaitUserTask
  | awaitDataInputUserTask
  | awaitDataInputOutputUserTask
  | awaitDataOutputUserTask
  | awaitSequentialMultiInstanceUserTask
  | awaitParallelMultiInstanceUserTask
  | completeParallelMultiInstanceUserTask
  | awaitTimer
  | awaitMessage
  | awaitPayloadMessage
  | awaitCorrelatedPayloadMessage
  | awaitEventRace
  | awaitBoundedUserTask
  | awaitMessageBoundedUserTask
  | awaitMessageMonitoredUserTask
  | awaitMonitoredUserTask
  | awaitEffect
  | duplicate
  | synchronize
  | mergeExclusive
  | choose
  | selectMany
  | synchronizeSelected
  | throwError
  | reachNoneEnd
  | terminateScope
  | completeScope
  | triggerCompensation
  deriving Repr, DecidableEq

def SemanticOperation.kind : SemanticOperation → SemanticOperationKind
  | .initiate .. => .initiate
  | .initiateMessage .. => .initiateMessage
  | .initiateTimer .. => .initiateTimer
  | .enterScope .. => .enterScope
  | .enterBoundedScope .. => .enterBoundedScope
  | .enterMonitoredScope .. => .enterMonitoredScope
  | .invokeProcess .. => .invokeProcess
  | .returnProcess .. => .returnProcess
  | .awaitUserTask .. => .awaitUserTask
  | .awaitDataInputUserTask .. => .awaitDataInputUserTask
  | .awaitDataInputOutputUserTask .. => .awaitDataInputOutputUserTask
  | .awaitDataOutputUserTask .. => .awaitDataOutputUserTask
  | .awaitSequentialMultiInstanceUserTask .. => .awaitSequentialMultiInstanceUserTask
  | .awaitParallelMultiInstanceUserTask .. => .awaitParallelMultiInstanceUserTask
  | .completeParallelMultiInstanceUserTask .. => .completeParallelMultiInstanceUserTask
  | .awaitTimer .. => .awaitTimer
  | .awaitMessage .. => .awaitMessage
  | .awaitPayloadMessage .. => .awaitPayloadMessage
  | .awaitCorrelatedPayloadMessage .. => .awaitCorrelatedPayloadMessage
  | .awaitEventRace .. => .awaitEventRace
  | .awaitBoundedUserTask .. => .awaitBoundedUserTask
  | .awaitMessageBoundedUserTask .. => .awaitMessageBoundedUserTask
  | .awaitMessageMonitoredUserTask .. => .awaitMessageMonitoredUserTask
  | .awaitMonitoredUserTask .. => .awaitMonitoredUserTask
  | .awaitEffect .. => .awaitEffect
  | .duplicate .. => .duplicate
  | .synchronize .. => .synchronize
  | .mergeExclusive .. => .mergeExclusive
  | .choose .. => .choose
  | .selectMany .. => .selectMany
  | .synchronizeSelected .. => .synchronizeSelected
  | .throwError .. => .throwError
  | .reachNoneEnd .. => .reachNoneEnd
  | .terminateScope .. => .terminateScope
  | .completeScope .. => .completeScope
  | .triggerCompensation .. => .triggerCompensation

def SemanticOperation.origin : SemanticOperation → BpmnElementOrigin
  | .initiate _ origin _
  | .initiateMessage _ origin _ _
  | .initiateTimer _ origin _ _
  | .enterScope _ origin _ _ _
  | .enterBoundedScope _ origin _ _ _ _
  | .enterMonitoredScope _ origin _ _ _ _
  | .invokeProcess _ origin _ _ _ _ _
  | .returnProcess _ origin _ _ _
  | .awaitUserTask _ origin _ _ _
  | .awaitDataInputUserTask _ origin _ _ _ _ _
  | .awaitDataInputOutputUserTask _ origin _ _ _ _ _ _
  | .awaitDataOutputUserTask _ origin _ _ _ _ _
  | .awaitSequentialMultiInstanceUserTask _ origin _ _ _ _ _ _
  | .awaitParallelMultiInstanceUserTask _ origin _ _ _ _ _ _ _ _
  | .completeParallelMultiInstanceUserTask _ origin _ _ _
  | .awaitTimer _ origin _ _ _
  | .awaitMessage _ origin _ _ _
  | .awaitPayloadMessage _ origin _ _ _ _
  | .awaitCorrelatedPayloadMessage _ origin _ _ _ _ _ _ _
  | .awaitEventRace _ origin _ _ _
  | .awaitBoundedUserTask _ origin _ _ _
  | .awaitMessageBoundedUserTask _ origin _ _ _
  | .awaitMessageMonitoredUserTask _ origin _ _ _
  | .awaitMonitoredUserTask _ origin _ _ _
  | .awaitEffect _ origin _ _ _ _
  | .duplicate _ origin _ _
  | .synchronize _ origin _ _
  | .mergeExclusive _ origin _ _
  | .choose _ origin _ _ _ _
  | .selectMany _ origin _ _ _ _
  | .synchronizeSelected _ origin _ _ _
  | .throwError _ origin _ _ _
  | .reachNoneEnd _ origin _
  | .terminateScope _ origin _ _
  | .completeScope _ origin _ _
  | .triggerCompensation _ origin _ _ _ => origin

/-- Public metadata of one actually selected internal operation. -/
structure InternalTransitionRecord where
  operationId : OperationId
  operationKind : SemanticOperationKind
  origin : BpmnElementOrigin
  owner : ScopeOccurrenceId
  /-- The complete-frontier account requires replay to retain the chosen Merge bucket.
  Publication exposes that choice through the consumed-token delta, not an extra wire field. -/
  mergeInput : Option ControlPlaceId := none
  deriving Repr, DecidableEq

/-- One revision-free committed semantic transition. -/
inductive CommittedTransition where
  | externalStimulus (stimulus : Stimulus)
  | internalOperation (record : InternalTransitionRecord)
  deriving Repr, DecidableEq

/-- Resolve the runtime occurrence selected by the same state and operation that `fire?` consumes. -/
def selectedOperationOwner? (state : RuntimeState) :
    SemanticOperation → Option ScopeOccurrenceId :=
  flowNodeSelectedOperationOwner? state

private def uniqueOperation? (program : Program) (id : OperationId) : Option SemanticOperation :=
  match program.operations.filter fun operation => decide (operation.id = id) with
  | [operation] => some operation
  | _ => none

/-- Construct one record only when the selected operation is unique in the exact Program. -/
def internalTransitionRecord? (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) : Option InternalTransitionRecord := do
  let selected ← uniqueOperation? program operation.id
  if selected ≠ operation then none
  else
    let owner ← selectedOperationOwner? state selected
    pure
      { operationId := selected.id
        operationKind := selected.kind
        origin := selected.origin
        owner }

/-- Reconstruct the record without exposing the private exact-ID selector. -/
theorem internalTransitionRecord_of_selection (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (owner : ScopeOccurrenceId)
    (selected : program.operations.filter
      (fun candidate => decide (candidate.id = operation.id)) = [operation])
    (ownerSelected : selectedOperationOwner? state operation = some owner) :
    internalTransitionRecord? program state operation = some
      { operationId := operation.id, operationKind := operation.kind,
        origin := operation.origin, owner } := by
  unfold internalTransitionRecord? uniqueOperation?
  rw [selected]
  simp [ownerSelected]

theorem internalTransitionRecords_same_id_same_operation
    (program : Program) (state : RuntimeState) (left right : SemanticOperation)
    (leftRecord rightRecord : InternalTransitionRecord)
    (leftFound : internalTransitionRecord? program state left = some leftRecord)
    (rightFound : internalTransitionRecord? program state right = some rightRecord)
    (sameId : left.id = right.id) : left = right := by
  unfold internalTransitionRecord? at leftFound rightFound
  obtain ⟨leftSelected, leftLookup, leftFound⟩ := Option.bind_eq_some_iff.mp leftFound
  obtain ⟨rightSelected, rightLookup, rightFound⟩ := Option.bind_eq_some_iff.mp rightFound
  rw [sameId, rightLookup] at leftLookup
  have sameSelected := Option.some.inj leftLookup
  by_cases leftExact : leftSelected = left
  · by_cases rightExact : rightSelected = right
    · exact leftExact.symm.trans (sameSelected.symm.trans rightExact)
    · simp [rightExact] at rightFound
  · simp [leftExact] at leftFound

/-- Exact Merge records validate their chosen owned bucket; legacy records retain the unique selector. -/
def selectedRecordedOperationOwner? (state : RuntimeState) (operation : SemanticOperation)
    (record : InternalTransitionRecord) : Option ScopeOccurrenceId :=
  match record.mergeInput, operation with
  | none, _ => selectedOperationOwner? state operation
  | some input, .mergeExclusive _ _ inputs _ =>
      if input ∈ inputs ∧ ⟨input, record.owner⟩ ∈ state.tokens then some record.owner else none
  | some _, _ => none

private def fireRecordedOperation? (program : Program) (state : RuntimeState)
    (operation : SemanticOperation) (record : InternalTransitionRecord) : Option RuntimeState :=
  match record.mergeInput, operation with
  | none, _ => fire? program operation state
  | some input, .mergeExclusive _ _ inputs output =>
      if program.compensationEventSubProcessSnapshots = none ∧ input ∈ inputs ∧
          ⟨input, record.owner⟩ ∈ state.tokens then
        some { state with tokens := addToken (removeToken state.tokens input record.owner) output record.owner }
      else none
  | some _, _ => none

private theorem fireRecordedOperation_sound (program : Program) (before after : RuntimeState)
    (operation : SemanticOperation) (record : InternalTransitionRecord)
    (fired : fireRecordedOperation? program before operation record = some after) :
    OperationStep program operation before after := by
  cases choice : record.mergeInput with
  | none => exact fire_sound program operation before after (by simpa [fireRecordedOperation?, choice] using fired)
  | some input =>
      cases operation with
      | mergeExclusive id origin inputs output =>
          simp only [fireRecordedOperation?, choice] at fired
          split at fired
          · next valid =>
              cases fired
              exact .mergeExclusive id origin inputs output _ _
                (mergeExclusiveStep_of_offered_token before inputs output ⟨input, record.owner⟩ valid.2.2 valid.2.1)
          · contradiction
      | _ => simp [fireRecordedOperation?, choice] at fired

/-- Replay one internal record after checking all metadata and its exact choice against one Program operation. -/
def replayInternalTransition? (program : Program) (state : RuntimeState)
    (record : InternalTransitionRecord) : Option RuntimeState := do
  let operation ← uniqueOperation? program record.operationId
  if operation.kind ≠ record.operationKind || operation.origin ≠ record.origin then none
  else
    let owner ← selectedRecordedOperationOwner? state operation record
    if owner ≠ record.owner then none
    else fireRecordedOperation? program state operation record

/-- An exact retained Merge input replays even when another input or another indistinguishable unit is offered. -/
theorem replayInternalTransition_merge_input (program : Program) (state : RuntimeState)
    (id : OperationId) (origin : BpmnElementOrigin) (inputs : List ControlPlaceId)
    (output input : ControlPlaceId) (owner : ScopeOccurrenceId)
    (snapshots : program.compensationEventSubProcessSnapshots = none)
    (selected : program.operations.filter (fun operation => decide (operation.id = id)) =
      [.mergeExclusive id origin inputs output])
    (offered : input ∈ inputs) (present : ⟨input, owner⟩ ∈ state.tokens) :
    replayInternalTransition? program state
      { operationId := id, operationKind := .mergeExclusive, origin, owner, mergeInput := some input } =
      some { state with tokens := addToken (removeToken state.tokens input owner) output owner } := by
  simp [replayInternalTransition?, uniqueOperation?, selected, selectedRecordedOperationOwner?,
    fireRecordedOperation?, snapshots, offered, present, SemanticOperation.kind, SemanticOperation.origin]

private theorem uniqueOperation_mem_and_matches (program : Program) (id : OperationId)
    (operation : SemanticOperation)
    (selected : uniqueOperation? program id = some operation) :
    operation ∈ program.operations ∧ operation.id = id := by
  unfold uniqueOperation? at selected
  generalize matchesEq : program.operations.filter
    (fun candidate => decide (candidate.id = id)) = filtered at selected
  cases filtered with
  | nil => simp at selected
  | cons head tail =>
      cases tail with
      | nil =>
          simp at selected
          subst head
          have member : operation ∈ program.operations.filter
              (fun candidate => decide (candidate.id = id)) := by
            rw [matchesEq]
            simp
          exact ⟨(List.mem_filter.mp member).1,
            of_decide_eq_true (List.mem_filter.mp member).2⟩
      | cons next rest => simp at selected

/-- Successful strict replay is one exact `ProgramStep` with all record metadata prevalidated. -/
theorem replayInternalTransition_sound (program : Program) (before after : RuntimeState)
    (record : InternalTransitionRecord)
    (replayed : replayInternalTransition? program before record = some after) :
    ProgramStep program before record.operationId after ∧
      ∃ operation,
        uniqueOperation? program record.operationId = some operation ∧
          operation.kind = record.operationKind ∧
          operation.origin = record.origin ∧
          selectedRecordedOperationOwner? before operation record = some record.owner := by
  unfold replayInternalTransition? at replayed
  generalize selectedEq : uniqueOperation? program record.operationId = selected at replayed
  cases selected with
  | none => simp at replayed
  | some operation =>
      by_cases kindMatches : operation.kind = record.operationKind
      · by_cases originMatches : operation.origin = record.origin
        · simp [kindMatches, originMatches] at replayed
          generalize ownerEq : selectedRecordedOperationOwner? before operation record = selectedOwner at replayed
          cases selectedOwner with
          | none => simp at replayed
          | some selectedOwner =>
              by_cases ownerMatches : selectedOwner = record.owner
              · simp [ownerMatches] at replayed
                have membership := uniqueOperation_mem_and_matches program record.operationId
                  operation selectedEq
                exact
                  ⟨⟨operation, membership.1, membership.2,
                      fireRecordedOperation_sound program before after operation record replayed⟩,
                    operation, (by simp), kindMatches, originMatches,
                    ownerEq.trans (congrArg some ownerMatches)⟩
              · simp [ownerMatches] at replayed
        · simp [kindMatches, originMatches] at replayed
      · simp [kindMatches] at replayed

private def replayInternalTransitionsWithoutCompensationSnapshots (program : Program) :
    RuntimeState → List CommittedTransition → Option RuntimeState
  | state, [] => some state
  | state, .internalOperation record :: rest => do
      let successor ← replayInternalTransition? program state record
      replayInternalTransitionsWithoutCompensationSnapshots program successor rest
  | _, .externalStimulus _ :: _ => none

/-- Legacy internal replay is mechanically restricted to declaration-free Programs. -/
def replayInternalTransitions (program : Program) (state : RuntimeState)
    (transitions : List CommittedTransition) : Option RuntimeState :=
  match program.compensationEventSubProcessSnapshots with
  | none =>
      replayInternalTransitionsWithoutCompensationSnapshots program state transitions
  | some _ => none

/-- Declaration-free strict replay requires one leading external stimulus and only internal records afterward. -/
private def replayCommittedTransitionsWithoutCompensationSnapshots
    (program : Program) (initial : RuntimeState) :
    List CommittedTransition → Option RuntimeState
  | .externalStimulus stimulus :: rest =>
      let admission := admitStimulus program initial stimulus
      if admission.outcome = .committed then replayInternalTransitions program admission.state rest
      else none
  | [] | .internalOperation _ :: _ => none

/-- Legacy committed replay is mechanically restricted to declaration-free Programs. -/
def replayCommittedTransitions (program : Program) (initial : RuntimeState)
    (transitions : List CommittedTransition) : Option RuntimeState :=
  match program.compensationEventSubProcessSnapshots with
  | none =>
      replayCommittedTransitionsWithoutCompensationSnapshots program initial transitions
  | some _ => none

theorem replayCommittedTransitions_withSnapshotDeclaration_is_disabled
    (program : Program) (initial : RuntimeState)
    (transitions : List CommittedTransition)
    (declaration : CompensationEventSubProcessSnapshotDeclaration)
    (declared : program.compensationEventSubProcessSnapshots = some declaration) :
    replayCommittedTransitions program initial transitions = none := by
  simp [replayCommittedTransitions, declared]

end BpmnSemantics.SemanticProcess
