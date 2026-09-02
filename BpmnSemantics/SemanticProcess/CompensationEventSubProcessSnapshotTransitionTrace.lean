import BpmnSemantics.SemanticProcess.TransitionTrace
import BpmnSemantics.SemanticProcess.TransitionAttempt
import BpmnSemantics.SemanticProcess.CompensationEventSubProcessSnapshotCommandAdmission

/-! # Compensation Event Sub-Process snapshot transition trace

This module is the focused three-arm closure lane for Programs that declare Compensation Event
Sub-Process snapshots. The base trace module remains the exact declaration-free evaluator so legacy
kernel fixtures do not import the snapshot runtime or pay its reduction cost.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private def snapshotUniqueOperation? (program : Program) (id : OperationId) :
    Option SemanticOperation :=
  match program.operations.filter fun operation => decide (operation.id = id) with
  | [operation] => some operation
  | _ => none

def replayInternalTransitionWithCompensationSnapshots? (program : Program)
    (state : RuntimeState) (record : InternalTransitionRecord) : Option RuntimeState := do
  let operation ← snapshotUniqueOperation? program record.operationId
  if operation.kind ≠ record.operationKind then none
  else if operation.origin ≠ record.origin then none
  else
    let owner ← selectedOperationOwner? state operation
    if owner ≠ record.owner then none
    else
      match attemptInternalOperation program operation state with
      | .applied step => some step.successor
      | .disabled _ | .refused _ _ => none

def replayInternalTransitionsWithCompensationSnapshots (program : Program) :
    RuntimeState → List CommittedTransition → Option RuntimeState
  | state, [] => some state
  | state, .internalOperation record :: rest => do
      let successor ← replayInternalTransitionWithCompensationSnapshots? program state record
      replayInternalTransitionsWithCompensationSnapshots program successor rest
  | _, .externalStimulus _ :: _ => none

private def replayCommittedTransitionsForDeclaredCompensationSnapshots (program : Program)
    (initial : RuntimeState) : List CommittedTransition → Option RuntimeState
  | .externalStimulus stimulus :: rest =>
      let admission := admitStimulusWithCompensationSnapshots program initial stimulus
      if admission.outcome = .committed then
        replayInternalTransitionsWithCompensationSnapshots program admission.state rest
      else none
  | [] | .internalOperation _ :: _ => none

/-- Replay uses the base mechanism exactly unless the Program declares the focused snapshot family. -/
def replayCommittedTransitionsWithCompensationSnapshots (program : Program)
    (initial : RuntimeState) (transitions : List CommittedTransition) : Option RuntimeState :=
  match program.compensationEventSubProcessSnapshots with
  | none => replayCommittedTransitions program initial transitions
  | some _ =>
      replayCommittedTransitionsForDeclaredCompensationSnapshots program initial transitions

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

private structure SnapshotInternalTransitionFrontier where
  transitions : List (SemanticOperation × RuntimeState)
  refusal : Option InternalOperationRefusal

private def snapshotInternalTransitionFrontier (program : Program)
    (state : RuntimeState) : SnapshotInternalTransitionFrontier :=
  let attempts := program.operations.map fun operation =>
    attemptInternalOperation program operation state
  let refusal := canonicalInternalOperationRefusal? attempts
  let transitions := canonicalEnabledInternalTransitions <|
    (InternalCommutation.sortBy internalOperationAttemptBefore attempts).filterMap fun
      | .applied step => some (step.operation, step.successor)
      | .disabled _ | .refused _ _ => none
  { transitions, refusal }

def enabledInternalOperationCountWithCompensationSnapshots
    (program : Program) (state : RuntimeState) : Nat :=
  (snapshotInternalTransitionFrontier program state).transitions.length

private structure SnapshotClosureTraceResult where
  state : RuntimeState
  hitBound : Bool
  ambiguousChoice : Bool
  records : Option (List InternalTransitionRecord)
  lifecycles : Option (List UnnumberedFlowNodeOccurrenceDelta)
  refusal : Option InternalOperationRefusal

private def prependSnapshotRecord (head : Option InternalTransitionRecord)
    (tail : Option (List InternalTransitionRecord)) : Option (List InternalTransitionRecord) := do
  pure ((← head) :: (← tail))

private def prependSnapshotLifecycle (head : Option UnnumberedFlowNodeOccurrenceDelta)
    (tail : Option (List UnnumberedFlowNodeOccurrenceDelta)) :
    Option (List UnnumberedFlowNodeOccurrenceDelta) := do
  pure ((← head) :: (← tail))

private structure SnapshotInternalBatchResult where
  state : RuntimeState
  publications : List InternalPublicationPair

private inductive SnapshotInternalBatchAttempt where
  | disabled
  | applied (result : SnapshotInternalBatchResult)
  | refused (reason : InternalOperationRefusal)

private def fireSnapshotInternalBatch (program : Program) (footprintState : RuntimeState)
    (commandId : SemanticId) :
    RuntimeState → List SemanticOperation → SnapshotInternalBatchAttempt
  | state, [] => .applied { state, publications := [] }
  | state, operation :: rest =>
      let frontier := snapshotInternalTransitionFrontier program state
      match frontier.refusal with
      | some reason => .refused reason
      | none =>
          match frontier.transitions.filter fun candidate =>
              candidate.1.id == operation.id with
          | [(selected, successor)] =>
              match internalPublicationPair? program footprintState state successor
                  selected commandId with
              | none => .disabled
              | some publication =>
                  match fireSnapshotInternalBatch program footprintState commandId successor
                      rest with
                  | .disabled => .disabled
                  | .refused reason => .refused reason
                  | .applied tail =>
                      .applied
                        { state := tail.state
                          publications := publication :: tail.publications }
          | _ => .disabled

private def prependSnapshotPublicationPairs
    (heads : Option (List InternalPublicationPair))
    (records : Option (List InternalTransitionRecord))
    (lifecycles : Option (List UnnumberedFlowNodeOccurrenceDelta)) :
    Option (List InternalTransitionRecord) ×
      Option (List UnnumberedFlowNodeOccurrenceDelta) :=
  match heads, records, lifecycles with
  | some pairs, some records, some lifecycles =>
      let ordered := canonicalPublicationPairs pairs
      (some (ordered.map (·.record) ++ records),
        some (ordered.map (·.lifecycle) ++ lifecycles))
  | _, _, _ => (none, none)

private def closeSupportedTracedWithCompensationSnapshots :
    Nat → Program → SemanticId → Nat → RuntimeState → SnapshotClosureTraceResult
  | 0, program, _, _, state =>
      let frontier := snapshotInternalTransitionFrontier program state
      match frontier.refusal with
      | some reason =>
          { state, hitBound := false, ambiguousChoice := false,
            records := none, lifecycles := none, refusal := some reason }
      | none =>
          match frontier.transitions with
          | [] =>
              { state, hitBound := false, ambiguousChoice := false,
                records := some [], lifecycles := some [], refusal := none }
          | [_] | _ :: _ :: _ =>
              { state, hitBound := true, ambiguousChoice := false,
                records := none, lifecycles := none, refusal := none }
  | fuel + 1, program, commandId, transitionIndex, state =>
      let frontier := snapshotInternalTransitionFrontier program state
      match frontier.refusal with
      | some reason =>
          { state, hitBound := false, ambiguousChoice := false,
            records := none, lifecycles := none, refusal := some reason }
      | none =>
          match frontier.transitions with
          | [] =>
              { state, hitBound := false, ambiguousChoice := false,
                records := some [], lifecycles := some [], refusal := none }
          | [(operation, successor)] =>
              let closed := closeSupportedTracedWithCompensationSnapshots fuel program commandId
                (transitionIndex + 1) successor
              { closed with
                records := prependSnapshotRecord
                  (internalTransitionRecord? program state operation) closed.records
                lifecycles := prependSnapshotLifecycle
                  (flowNodeOccurrenceDeltaForOperation? program state successor operation
                    commandId transitionIndex) closed.lifecycles }
          | first :: second :: remaining =>
              let transitions := first :: second :: remaining
              let operations := transitions.map (·.1)
              if internalOperationFrontierPairwiseIndependent? program state operations then
                if operations.length > fuel + 1 then
                  { state, hitBound := true, ambiguousChoice := false,
                    records := none, lifecycles := none, refusal := none }
                else
                  match fireSnapshotInternalBatch program state commandId state operations with
                  | .refused reason =>
                      { state, hitBound := false, ambiguousChoice := false,
                        records := none, lifecycles := none, refusal := some reason }
                  | .disabled =>
                      { state, hitBound := false, ambiguousChoice := true,
                        records := none, lifecycles := none, refusal := none }
                  | .applied batch =>
                      let closed := closeSupportedTracedWithCompensationSnapshots
                        (fuel - (remaining.length + 1)) program commandId
                        (transitionIndex + operations.length) batch.state
                      let paired := prependSnapshotPublicationPairs (some batch.publications)
                        closed.records closed.lifecycles
                      { closed with records := paired.1, lifecycles := paired.2 }
              else
                { state, hitBound := false, ambiguousChoice := true,
                  records := none, lifecycles := none, refusal := none }
termination_by fuel => fuel
decreasing_by
  all_goals apply Nat.lt_succ_of_le
  all_goals first | exact Nat.le_refl _ | exact Nat.sub_le _ _

private structure SnapshotEvaluatedStimulus where
  result : StimulusResult
  candidateTransitions : Option (List CommittedTransition)
  candidateLifecycles : Option (List UnnumberedFlowNodeOccurrenceDelta)

private def evaluateStimulusWithCompensationSnapshots (closureLimit : Nat)
    (program : Program) (state : RuntimeState) (stimulus : Stimulus) :
    SnapshotEvaluatedStimulus :=
  let admission := admitStimulusWithCompensationSnapshots program state stimulus
  match admission.outcome with
  | .committed =>
      let commandId := stimulusCommandId stimulus
      let externalLifecycle := flowNodeOccurrenceDeltaForStimulus? program state
        admission.state stimulus 0
      let closure := closeSupportedTracedWithCompensationSnapshots closureLimit program
        commandId 1 admission.state
      match closure.refusal with
      | some _ =>
          { result :=
              { outcome := .rejected
                state
                internalStepBoundExceeded := false
                ambiguousInternalChoice := false }
            candidateTransitions := none
            candidateLifecycles := none }
      | none =>
          let result : StimulusResult :=
            { outcome := .committed
              state := closure.state
              internalStepBoundExceeded := closure.hitBound
              ambiguousInternalChoice := closure.ambiguousChoice }
          if closure.hitBound || closure.ambiguousChoice then
            { result, candidateTransitions := none, candidateLifecycles := none }
          else
            { result
              candidateTransitions := do
                let records ← closure.records
                let _ ← externalLifecycle
                let _ ← closure.lifecycles
                pure (.externalStimulus stimulus :: records.map .internalOperation)
              candidateLifecycles :=
                prependSnapshotLifecycle externalLifecycle closure.lifecycles }
  | outcome =>
      { result :=
          { outcome
            state := admission.state
            internalStepBoundExceeded := false
            ambiguousInternalChoice := false }
        candidateTransitions := none
        candidateLifecycles := none }

private def replayCheckedSnapshotTransitions (program : Program)
    (initial result : RuntimeState) :
    Option (List CommittedTransition) → List CommittedTransition
  | some candidate =>
      if replayCommittedTransitionsWithCompensationSnapshots program initial candidate =
          some result then candidate else []
  | none => []

private theorem replayCheckedSnapshotTransitions_sound (program : Program)
    (initial result : RuntimeState) (candidate : Option (List CommittedTransition))
    (published : replayCheckedSnapshotTransitions program initial result candidate ≠ []) :
    replayCommittedTransitionsWithCompensationSnapshots program initial
        (replayCheckedSnapshotTransitions program initial result candidate) = some result := by
  cases candidate with
  | none => simp [replayCheckedSnapshotTransitions] at published
  | some transitions =>
      by_cases replays :
          replayCommittedTransitionsWithCompensationSnapshots program initial transitions =
            some result
      · simp [replayCheckedSnapshotTransitions, replays]
      · simp [replayCheckedSnapshotTransitions, replays] at published

private def publishSnapshotTransitions (program : Program) (initial : RuntimeState)
    (evaluated : SnapshotEvaluatedStimulus) : List CommittedTransition :=
  match evaluated.result.outcome with
  | .committed => replayCheckedSnapshotTransitions program initial evaluated.result.state
      evaluated.candidateTransitions
  | .rolledBack | .rejected | .semanticFailure | .unsupported => []

private def publishSnapshotLifecycles (program : Program) (initial : RuntimeState)
    (evaluated : SnapshotEvaluatedStimulus) : List UnnumberedFlowNodeOccurrenceDelta :=
  let transitions := publishSnapshotTransitions program initial evaluated
  match evaluated.candidateLifecycles with
  | some lifecycles => if transitions.length = lifecycles.length then lifecycles else []
  | none => []

/-- Snapshot-aware command evaluation with exact declaration-free delegation. -/
def applyStimulusWithCompensationSnapshots (closureLimit : Nat) (program : Program)
    (state : RuntimeState) (stimulus : Stimulus) : StimulusResult :=
  match program.compensationEventSubProcessSnapshots with
  | none => applyStimulus closureLimit program state stimulus
  | some _ =>
      (evaluateStimulusWithCompensationSnapshots closureLimit program state stimulus).result

/-- Snapshot-aware trace evaluation with empty publication on semantic refusal. -/
def applyStimulusTracedWithCompensationSnapshots (closureLimit : Nat)
    (program : Program) (state : RuntimeState) (stimulus : Stimulus) : TracedStimulusResult :=
  match program.compensationEventSubProcessSnapshots with
  | none => applyStimulusTraced closureLimit program state stimulus
  | some _ =>
      let evaluated := evaluateStimulusWithCompensationSnapshots closureLimit program state stimulus
      { result := evaluated.result
        committedTransitions := publishSnapshotTransitions program state evaluated
        flowNodeOccurrenceLifecycles := publishSnapshotLifecycles program state evaluated }

/-- Declaration-free Programs preserve the exact base evaluator. -/
theorem applyStimulusWithCompensationSnapshots_withoutDeclaration
    (closureLimit : Nat) (program : Program) (state : RuntimeState) (stimulus : Stimulus)
    (absent : program.compensationEventSubProcessSnapshots = none) :
    applyStimulusWithCompensationSnapshots closureLimit program state stimulus =
      applyStimulus closureLimit program state stimulus := by
  simp [applyStimulusWithCompensationSnapshots, absent]

/-- Erasing focused trace publication yields the exact focused result-only evaluation. -/
theorem applyStimulusTracedWithCompensationSnapshots_erases_to_result
    (closureLimit : Nat) (program : Program) (state : RuntimeState) (stimulus : Stimulus) :
    (applyStimulusTracedWithCompensationSnapshots closureLimit program state stimulus).result =
      applyStimulusWithCompensationSnapshots closureLimit program state stimulus := by
  cases declared : program.compensationEventSubProcessSnapshots with
  | none =>
      simpa [applyStimulusTracedWithCompensationSnapshots,
        applyStimulusWithCompensationSnapshots, declared] using
        applyStimulusTraced_erases_to_applyStimulus closureLimit program state stimulus
  | some _ =>
      simp [applyStimulusTracedWithCompensationSnapshots,
        applyStimulusWithCompensationSnapshots, declared]

/-- Every nonempty focused publication replays to the exact focused committed result state. -/
theorem applyStimulusTracedWithCompensationSnapshots_emitted_trace_replays
    (closureLimit : Nat) (program : Program) (state : RuntimeState) (stimulus : Stimulus)
    (published :
      (applyStimulusTracedWithCompensationSnapshots closureLimit program state
        stimulus).committedTransitions ≠ []) :
    replayCommittedTransitionsWithCompensationSnapshots program state
        (applyStimulusTracedWithCompensationSnapshots closureLimit program state
          stimulus).committedTransitions =
      some (applyStimulusWithCompensationSnapshots closureLimit program state stimulus).state := by
  cases declared : program.compensationEventSubProcessSnapshots with
  | none =>
      simpa [applyStimulusTracedWithCompensationSnapshots,
        applyStimulusWithCompensationSnapshots,
        replayCommittedTransitionsWithCompensationSnapshots, declared] using
        applyStimulusTraced_emitted_trace_replays closureLimit program state stimulus
          (by simpa [applyStimulusTracedWithCompensationSnapshots, declared] using published)
  | some _ =>
      simp only [applyStimulusTracedWithCompensationSnapshots,
        applyStimulusWithCompensationSnapshots, declared] at published ⊢
      unfold publishSnapshotTransitions at published ⊢
      split at *
      · exact replayCheckedSnapshotTransitions_sound program state
          (evaluateStimulusWithCompensationSnapshots closureLimit program state stimulus).result.state
          (evaluateStimulusWithCompensationSnapshots closureLimit program state
            stimulus).candidateTransitions
          published
      all_goals simp at published

/-- Every non-committed focused outcome has no public transition trace. -/
theorem applyStimulusTracedWithCompensationSnapshots_noncommitted_has_no_trace
    (closureLimit : Nat) (program : Program) (state : RuntimeState) (stimulus : Stimulus)
    (notCommitted :
      (applyStimulusWithCompensationSnapshots closureLimit program state stimulus).outcome ≠
        .committed) :
    (applyStimulusTracedWithCompensationSnapshots closureLimit program state
      stimulus).committedTransitions = [] := by
  cases declared : program.compensationEventSubProcessSnapshots with
  | none =>
      simpa [applyStimulusTracedWithCompensationSnapshots, declared] using
        applyStimulusTraced_noncommitted_has_no_trace closureLimit program state stimulus
          (by simpa [applyStimulusWithCompensationSnapshots, declared] using notCommitted)
  | some _ =>
      simp only [applyStimulusTracedWithCompensationSnapshots,
        applyStimulusWithCompensationSnapshots, declared] at notCommitted ⊢
      unfold publishSnapshotTransitions
      split <;> simp_all

/-- Focused lifecycle publication is empty whenever its aligned transition trace is empty. -/
theorem applyStimulusTracedWithCompensationSnapshots_no_trace_has_no_lifecycle
    (closureLimit : Nat) (program : Program) (state : RuntimeState) (stimulus : Stimulus)
    (noTrace :
      (applyStimulusTracedWithCompensationSnapshots closureLimit program state
        stimulus).committedTransitions = []) :
    (applyStimulusTracedWithCompensationSnapshots closureLimit program state
      stimulus).flowNodeOccurrenceLifecycles = [] := by
  cases declared : program.compensationEventSubProcessSnapshots with
  | none =>
      simpa [applyStimulusTracedWithCompensationSnapshots, declared] using
        applyStimulusTraced_no_trace_has_no_lifecycle closureLimit program state stimulus
          (by simpa [applyStimulusTracedWithCompensationSnapshots, declared] using noTrace)
  | some _ =>
      simp only [applyStimulusTracedWithCompensationSnapshots, declared] at noTrace ⊢
      unfold publishSnapshotLifecycles
      simp only [noTrace, List.length_nil]
      generalize candidateEq :
        (evaluateStimulusWithCompensationSnapshots closureLimit program state
          stimulus).candidateLifecycles = candidate
      cases candidate with
      | none => rfl
      | some lifecycles => cases lifecycles <;> simp

/-- Any snapshot closure refusal rejects the complete command against its submitted pre-state. -/
theorem applyStimulusWithCompensationSnapshots_closure_refusal_rejects_atomically
    (closureLimit : Nat) (program : Program) (state admittedState : RuntimeState)
    (stimulus : Stimulus) (reason : InternalOperationRefusal)
    (declaration : CompensationEventSubProcessSnapshotDeclaration)
    (declared : program.compensationEventSubProcessSnapshots = some declaration)
    (admitted : admitStimulusWithCompensationSnapshots program state stimulus =
      { outcome := .committed, state := admittedState })
    (refused : (closeSupportedTracedWithCompensationSnapshots closureLimit program
      (stimulusCommandId stimulus) 1 admittedState).refusal = some reason) :
    applyStimulusWithCompensationSnapshots closureLimit program state stimulus =
      { outcome := .rejected
        state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  simp only [applyStimulusWithCompensationSnapshots, declared]
  unfold evaluateStimulusWithCompensationSnapshots
  rw [admitted]
  simp only
  rw [refused]

end BpmnSemantics.SemanticProcess
