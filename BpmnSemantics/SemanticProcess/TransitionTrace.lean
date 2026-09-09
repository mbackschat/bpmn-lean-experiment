import BpmnSemantics.SemanticProcess.TransitionRecord
import BpmnSemantics.SemanticProcess.InternalTransitionPublication
import BpmnSemantics.SemanticProcess.InternalCommutation
import BpmnSemantics.SemanticProcess.InternalPreparedArming

/-! # Committed semantic transition traces

This module owns the revision-free trace produced at the external evaluator boundary. It records the exact admitted stimulus and the metadata of each operation selected by bounded internal closure. The trace never changes `RuntimeState`, and strict replay resolves and checks an operation before firing it.
-/

namespace BpmnSemantics.SemanticProcess

open BpmnSemantics

private def enabledTransitions (program : Program) (state : RuntimeState) :
    List (SemanticOperation × RuntimeState) :=
  canonicalEnabledInternalTransitions <|
    program.operations.filterMap fun operation =>
      match fire? program operation state with
      | none => none
      | some successor => some (operation, successor)

/-- Number of enabled internal operations, exposed for targeted admission-preservation checks. -/
def enabledInternalOperationCount (program : Program) (state : RuntimeState) : Nat :=
  (enabledTransitions program state).length

/-- A stable state is resumable exactly when it is complete or exposes a semantic wait. -/
def stableStateResumable (state : RuntimeState) : Bool :=
  match state.control with
  | .notStarted => false
  | .running _ =>
      eventRaceAssociationsValid state && calledProcessAssociationsValid state &&
        effectIncidentAssociationsValid state &&
        (!state.waits.isEmpty || !state.messageWaits.isEmpty ||
          !state.timerWaits.isEmpty || !state.effectWaits.isEmpty ||
          !state.effectIncidents.isEmpty)
  | .completed _ | .cancelled _ => true
  | .failed .. => false

private structure ClosureTraceResult where
  state : RuntimeState
  hitBound : Bool
  ambiguousChoice : Bool
  records : Option (List InternalTransitionRecord)
  lifecycles : Option (List UnnumberedFlowNodeOccurrenceDelta)

private def prependRecord (head : Option InternalTransitionRecord)
    (tail : Option (List InternalTransitionRecord)) : Option (List InternalTransitionRecord) := do
  pure ((← head) :: (← tail))

private def prependLifecycle (head : Option UnnumberedFlowNodeOccurrenceDelta)
    (tail : Option (List UnnumberedFlowNodeOccurrenceDelta)) :
    Option (List UnnumberedFlowNodeOccurrenceDelta) := do
  pure ((← head) :: (← tail))

structure InternalPublicationPair where
  footprint : InternalTransitionFootprint
  record : InternalTransitionRecord
  lifecycle : UnnumberedFlowNodeOccurrenceDelta

def publicationPairBefore (left right : InternalPublicationPair) : Bool :=
  if left.footprint.operationId ≠ right.footprint.operationId then
    left.footprint.operationId.value < right.footprint.operationId.value
  else if left.footprint.kind ≠ right.footprint.kind then
    match left.footprint.kind, right.footprint.kind with
    | .userTask, _ => true
    | .message, .timer | .message, .effect => true
    | .timer, .effect => true
    | _, _ => false
  else
    let leftOccurrence := left.footprint.occurrence
    let rightOccurrence := right.footprint.occurrence
    if leftOccurrence.processInstanceId ≠ rightOccurrence.processInstanceId then
      leftOccurrence.processInstanceId.value < rightOccurrence.processInstanceId.value
    else if leftOccurrence.elementId ≠ rightOccurrence.elementId then
      leftOccurrence.elementId.value < rightOccurrence.elementId.value
    else
      leftOccurrence.activation < rightOccurrence.activation

private def canonicalPublicationPair :
    InternalPublicationPair → List InternalPublicationPair → List InternalPublicationPair
  | pair, [] => [pair]
  | pair, current :: rest =>
      if publicationPairBefore pair current then pair :: current :: rest
      else current :: canonicalPublicationPair pair rest

def canonicalPublicationPairs :
    List InternalPublicationPair → List InternalPublicationPair
  | [] => []
  | pair :: rest => canonicalPublicationPair pair (canonicalPublicationPairs rest)

private theorem canonicalPublicationPair_eq_sortInsert (pair : InternalPublicationPair)
    (values : List InternalPublicationPair) :
    canonicalPublicationPair pair values =
      InternalCommutation.sortInsertBy publicationPairBefore pair values := by
  induction values with
  | nil => rfl
  | cons current rest ih =>
      simp [canonicalPublicationPair, InternalCommutation.sortInsertBy, ih]

theorem canonicalPublicationPairs_eq_sortBy (values : List InternalPublicationPair) :
    canonicalPublicationPairs values = InternalCommutation.sortBy publicationPairBefore values := by
  induction values with
  | nil => rfl
  | cons current rest ih =>
      simp [canonicalPublicationPairs, InternalCommutation.sortBy,
        canonicalPublicationPair_eq_sortInsert, ih]

def internalPublicationPairForFootprint? (program : Program) (before after : RuntimeState)
    (operation : SemanticOperation) (commandId : SemanticId)
    (footprint : InternalTransitionFootprint) : Option InternalPublicationPair := do
  let record ← internalTransitionRecord? program before operation
  -- Supported arming lifecycles carry occurrence anchors, not transition-index anchors. Index zero
  -- therefore keeps the pair unnumbered until its canonical batch position is assigned.
  let lifecycle ← flowNodeOccurrenceDeltaForOperation? program before after operation commandId 0
  pure { footprint, record, lifecycle }

def internalPublicationPair? (program : Program) (footprintState before after : RuntimeState)
    (operation : SemanticOperation) (commandId : SemanticId) : Option InternalPublicationPair := do
  let footprint ← internalTransitionFootprint? program footprintState operation
  internalPublicationPairForFootprint? program before after operation commandId footprint

structure InternalBatchResult where
  state : RuntimeState
  publications : List InternalPublicationPair

def fireInternalBatch? (program : Program) (commandId : SemanticId) :
    RuntimeState → List InternalCommutation.PreparedInternalArming → Option InternalBatchResult
  | state, [] => some { state, publications := [] }
  | state, prepared :: rest => do
      let successor ← InternalCommutation.applyPreparedInternalArming? program state prepared
      let publication ← internalPublicationPairForFootprint? program state successor
        prepared.operation commandId prepared.footprint
      let tail ← fireInternalBatch? program commandId successor rest
      pure { state := tail.state, publications := publication :: tail.publications }

/-- A returned pair is the actual accepted record and lifecycle for the same operation step. -/
theorem internalPublicationPair_defined (program : Program)
    (footprintState before after : RuntimeState) (operation : SemanticOperation)
    (commandId : SemanticId) (pair : InternalPublicationPair)
    (defined : internalPublicationPair? program footprintState before after operation commandId =
      some pair) :
    internalTransitionFootprint? program footprintState operation = some pair.footprint ∧
      internalTransitionRecord? program before operation = some pair.record ∧
      flowNodeOccurrenceDeltaForOperation? program before after operation commandId 0 =
        some pair.lifecycle := by
  simp only [internalPublicationPair?, internalPublicationPairForFootprint?] at defined
  obtain ⟨footprint, footprintEq, defined⟩ := Option.bind_eq_some_iff.mp defined
  obtain ⟨record, recordEq, defined⟩ := Option.bind_eq_some_iff.mp defined
  obtain ⟨lifecycle, lifecycleEq, resultEq⟩ := Option.bind_eq_some_iff.mp defined
  cases resultEq
  exact ⟨footprintEq, recordEq, lifecycleEq⟩

private def prependTransitionPublications
    (heads : List InternalCommutation.InstantiatedInternalTransitionPublication)
    (records : Option (List InternalTransitionRecord))
    (lifecycles : Option (List UnnumberedFlowNodeOccurrenceDelta)) :
    Option (List InternalTransitionRecord) ×
      Option (List UnnumberedFlowNodeOccurrenceDelta) :=
  match records, lifecycles with
  | some records, some lifecycles =>
      (some (heads.map (·.record) ++ records),
        some (heads.map (·.lifecycle) ++ lifecycles))
  | _, _ => (none, none)

/-- Execute bounded closure while retaining the selected operation and dynamic owner at each step. -/
private def closeSupportedTraced :
    Nat → Program → SemanticId → Nat → RuntimeState → ClosureTraceResult
  | 0, program, _, _, state =>
      match enabledTransitions program state with
      | [] =>
          { state, hitBound := false, ambiguousChoice := false,
            records := some [], lifecycles := some [] }
      | [_] | _ :: _ :: _ =>
          { state, hitBound := true, ambiguousChoice := false,
            records := none, lifecycles := none }
  | fuel + 1, program, commandId, transitionIndex, state =>
      match enabledTransitions program state with
      | [] =>
          { state, hitBound := false, ambiguousChoice := false,
            records := some [], lifecycles := some [] }
      | [(operation, successor)] =>
          let closed := closeSupportedTraced fuel program commandId
            (transitionIndex + 1) successor
          { closed with
            records := prependRecord (internalTransitionRecord? program state operation)
              closed.records
            lifecycles := prependLifecycle
              (flowNodeOccurrenceDeltaForOperation? program state successor operation
                commandId transitionIndex) closed.lifecycles }
      | first :: second :: remaining =>
          let transitions := first :: second :: remaining
          let operations := transitions.map (·.1)
          match InternalCommutation.prepareInternalTransitionBatch? program state operations with
          | some prepared =>
            if operations.length > fuel + 1 then
              { state, hitBound := true, ambiguousChoice := false,
                records := none, lifecycles := none }
            else
              match (do
                let instanceId ← hostingInstanceId? state
                InternalCommutation.acceptedPreparedTransitionBatch? program instanceId commandId
                  transitionIndex state prepared) with
              | none =>
                  { state, hitBound := false, ambiguousChoice := true,
                    records := none, lifecycles := none }
              | some (successor, publications) =>
                  let closed := closeSupportedTraced (fuel - (remaining.length + 1))
                    program commandId (transitionIndex + operations.length) successor
                  let paired := prependTransitionPublications publications
                    closed.records closed.lifecycles
                  { closed with records := paired.1, lifecycles := paired.2 }
          | none =>
            { state, hitBound := false, ambiguousChoice := true,
              records := none, lifecycles := none }
termination_by fuel => fuel
decreasing_by
  all_goals apply Nat.lt_succ_of_le
  all_goals first | exact Nat.le_refl _ | exact Nat.sub_le _ _

/-- Semantic command outcome and candidate state, with closure failures kept separate. -/
structure StimulusResult where
  outcome : CommandOutcome
  state : RuntimeState
  internalStepBoundExceeded : Bool
  ambiguousInternalChoice : Bool
  deriving Repr, DecidableEq

/-- `CLOSURE-ATOMIC-01` restores the pre-admission state when bounded closure cannot commit. -/
def StimulusResult.ofClosure (before successor : RuntimeState)
    (hitBound ambiguous : Bool) : StimulusResult :=
  { outcome := if hitBound || ambiguous then .rolledBack else .committed
    state := if hitBound || ambiguous then before else successor
    internalStepBoundExceeded := hitBound
    ambiguousInternalChoice := ambiguous }

theorem StimulusResult.ofClosure_failure_rolls_back
    (before successor : RuntimeState) (hitBound ambiguous : Bool)
    (failed : (hitBound || ambiguous) = true) :
    (StimulusResult.ofClosure before successor hitBound ambiguous).outcome = .rolledBack ∧
      (StimulusResult.ofClosure before successor hitBound ambiguous).state = before := by
  simp [StimulusResult.ofClosure, failed]

/-- Result plus an unnumbered trace. Empty is the only representation of unpublishability. -/
structure TracedStimulusResult where
  result : StimulusResult
  committedTransitions : List CommittedTransition
  flowNodeOccurrenceLifecycles : List UnnumberedFlowNodeOccurrenceDelta
  deriving Repr, DecidableEq

private structure EvaluatedStimulus where
  result : StimulusResult
  candidateTransitions : Option (List CommittedTransition)
  candidateLifecycles : Option (List UnnumberedFlowNodeOccurrenceDelta)

private def evaluateStimulus (closureLimit : Nat) (program : Program)
    (state : RuntimeState) (stimulus : Stimulus) : EvaluatedStimulus :=
  let admission := admitStimulus program state stimulus
  match admission.outcome with
  | .committed =>
      let commandId := stimulusCommandId stimulus
      let externalLifecycle := flowNodeOccurrenceDeltaForStimulus? program state
        admission.state stimulus 0
      let closure := closeSupportedTraced closureLimit program commandId 1 admission.state
      let result := StimulusResult.ofClosure state closure.state
        closure.hitBound closure.ambiguousChoice
      if closure.hitBound || closure.ambiguousChoice then
        { result, candidateTransitions := none, candidateLifecycles := none }
      else
        { result
          candidateTransitions := do
            let records ← closure.records
            let _ ← externalLifecycle
            let _ ← closure.lifecycles
            pure (.externalStimulus stimulus :: records.map .internalOperation)
          candidateLifecycles := prependLifecycle externalLifecycle closure.lifecycles }
  | outcome =>
      { result :=
          { outcome
            state := admission.state
            internalStepBoundExceeded := false
            ambiguousInternalChoice := false }
        candidateTransitions := none
        candidateLifecycles := none }

private def replayCheckedTransitions (program : Program) (initial result : RuntimeState) :
    Option (List CommittedTransition) → List CommittedTransition
  | some candidate =>
      if replayCommittedTransitions program initial candidate = some result then candidate else []
  | none => []

private theorem replayCheckedTransitions_sound (program : Program)
    (initial result : RuntimeState) (candidate : Option (List CommittedTransition))
    (published : replayCheckedTransitions program initial result candidate ≠ []) :
    replayCommittedTransitions program initial
        (replayCheckedTransitions program initial result candidate) = some result := by
  cases candidate with
  | none => simp [replayCheckedTransitions] at published
  | some transitions =>
      by_cases replays :
          replayCommittedTransitions program initial transitions = some result
      · simp [replayCheckedTransitions, replays]
      · simp [replayCheckedTransitions, replays] at published

private def publishEvaluatedTransitions (program : Program) (initial : RuntimeState)
    (evaluated : EvaluatedStimulus) : List CommittedTransition :=
  match evaluated.result.outcome with
  | .committed => replayCheckedTransitions program initial evaluated.result.state
      evaluated.candidateTransitions
  | .rolledBack | .rejected | .semanticFailure | .unsupported => []

private def publishEvaluatedLifecycles (program : Program) (initial : RuntimeState)
    (evaluated : EvaluatedStimulus) : List UnnumberedFlowNodeOccurrenceDelta :=
  let transitions := publishEvaluatedTransitions program initial evaluated
  match evaluated.candidateLifecycles with
  | some lifecycles =>
      if transitions.length = lifecycles.length then lifecycles else []
  | none => []

/-- Pure external-command boundary with exact committed transition capture. -/
def applyStimulusTraced (closureLimit : Nat) (program : Program)
    (state : RuntimeState) (stimulus : Stimulus) : TracedStimulusResult :=
  let evaluated := evaluateStimulus closureLimit program state stimulus
  { result := evaluated.result
    committedTransitions := publishEvaluatedTransitions program state evaluated
    flowNodeOccurrenceLifecycles := publishEvaluatedLifecycles program state evaluated }

/-- Existing result-only API, defined as exact erasure of the traced evaluator. -/
def applyStimulus (closureLimit : Nat) (program : Program)
    (state : RuntimeState) (stimulus : Stimulus) : StimulusResult :=
  let admission := admitStimulus program state stimulus
  match admission.outcome with
  | .committed =>
      let closure := closeSupportedTraced closureLimit program (stimulusCommandId stimulus) 1
        admission.state
      StimulusResult.ofClosure state closure.state closure.hitBound closure.ambiguousChoice
  | outcome =>
      { outcome
        state := admission.state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false }

theorem applyStimulus_closure_failure_rolls_back
    (closureLimit : Nat) (program : Program) (state : RuntimeState) (stimulus : Stimulus)
    (failed : ((applyStimulus closureLimit program state stimulus).internalStepBoundExceeded ||
      (applyStimulus closureLimit program state stimulus).ambiguousInternalChoice) = true) :
    (applyStimulus closureLimit program state stimulus).outcome = .rolledBack ∧
      (applyStimulus closureLimit program state stimulus).state = state := by
  unfold applyStimulus at failed ⊢
  generalize admissionEq : admitStimulus program state stimulus = admission at failed ⊢
  cases outcomeEq : admission.outcome
  case committed =>
    simp only [outcomeEq] at failed ⊢
    exact StimulusResult.ofClosure_failure_rolls_back _ _ _ _ failed
  all_goals simp [outcomeEq] at failed

theorem applyStimulus_withSnapshotDeclaration_rejects
    (closureLimit : Nat) (program : Program) (state : RuntimeState)
    (stimulus : Stimulus)
    (declaration : CompensationEventSubProcessSnapshotDeclaration)
    (declared : program.compensationEventSubProcessSnapshots = some declaration) :
    applyStimulus closureLimit program state stimulus =
      { outcome := .rejected
        state
        internalStepBoundExceeded := false
        ambiguousInternalChoice := false } := by
  simp [applyStimulus, admitStimulus, declared]

theorem applyStimulusTraced_withSnapshotDeclaration_rejects
    (closureLimit : Nat) (program : Program) (state : RuntimeState)
    (stimulus : Stimulus)
    (declaration : CompensationEventSubProcessSnapshotDeclaration)
    (declared : program.compensationEventSubProcessSnapshots = some declaration) :
    (applyStimulusTraced closureLimit program state stimulus).result =
        { outcome := .rejected
          state
          internalStepBoundExceeded := false
          ambiguousInternalChoice := false } ∧
      (applyStimulusTraced closureLimit program state stimulus).committedTransitions = [] ∧
      (applyStimulusTraced closureLimit program state stimulus).flowNodeOccurrenceLifecycles =
        [] := by
  simp [applyStimulusTraced, evaluateStimulus, admitStimulus, declared,
    publishEvaluatedTransitions, publishEvaluatedLifecycles]

def scenarioClosureLimit : Nat := 8

private theorem evaluateStimulus_result_eq_applyStimulus
    (closureLimit : Nat) (program : Program) (state : RuntimeState) (stimulus : Stimulus) :
    (evaluateStimulus closureLimit program state stimulus).result =
      applyStimulus closureLimit program state stimulus := by
  unfold evaluateStimulus applyStimulus
  generalize admissionEq : admitStimulus program state stimulus = admission
  cases outcomeEq : admission.outcome
  case committed =>
    simp only [outcomeEq]
    generalize closureEq : closeSupportedTraced closureLimit program
      (stimulusCommandId stimulus) 1 admission.state = closure
    cases closure with
    | mk successor hitBound ambiguous records lifecycles =>
        cases hitBound <;> cases ambiguous <;> rfl
  all_goals simp [outcomeEq]

/-- Erasing the trace is definitionally the existing evaluator result. -/
theorem applyStimulusTraced_erases_to_applyStimulus
    (closureLimit : Nat) (program : Program) (state : RuntimeState) (stimulus : Stimulus) :
    (applyStimulusTraced closureLimit program state stimulus).result =
      applyStimulus closureLimit program state stimulus := by
  unfold applyStimulusTraced
  dsimp only
  exact evaluateStimulus_result_eq_applyStimulus closureLimit program state stimulus

/-- Every nonempty evaluator-emitted publication replays to its exact committed result state. -/
theorem applyStimulusTraced_emitted_trace_replays
    (closureLimit : Nat) (program : Program) (state : RuntimeState) (stimulus : Stimulus)
    (published :
      (applyStimulusTraced closureLimit program state stimulus).committedTransitions ≠ []) :
    replayCommittedTransitions program state
        (applyStimulusTraced closureLimit program state stimulus).committedTransitions =
      some (applyStimulus closureLimit program state stimulus).state := by
  unfold applyStimulusTraced at *
  dsimp only at *
  unfold publishEvaluatedTransitions at published ⊢
  split at *
  · calc
      replayCommittedTransitions program state
          (replayCheckedTransitions program state
            (evaluateStimulus closureLimit program state stimulus).result.state
            (evaluateStimulus closureLimit program state stimulus).candidateTransitions) =
          some (evaluateStimulus closureLimit program state stimulus).result.state :=
        replayCheckedTransitions_sound program state
          (evaluateStimulus closureLimit program state stimulus).result.state
          (evaluateStimulus closureLimit program state stimulus).candidateTransitions published
      _ = some (applyStimulus closureLimit program state stimulus).state :=
        congrArg (fun result : StimulusResult => some result.state)
          (evaluateStimulus_result_eq_applyStimulus closureLimit program state stimulus)
  all_goals simp at published

/-- Non-committed command results have no public trace. -/
theorem applyStimulusTraced_noncommitted_has_no_trace
    (closureLimit : Nat) (program : Program) (state : RuntimeState) (stimulus : Stimulus)
    (notCommitted : (applyStimulus closureLimit program state stimulus).outcome ≠ .committed) :
    (applyStimulusTraced closureLimit program state stimulus).committedTransitions = [] := by
  rw [← evaluateStimulus_result_eq_applyStimulus closureLimit program state stimulus]
    at notCommitted
  unfold applyStimulusTraced
  dsimp only at *
  unfold publishEvaluatedTransitions
  split <;> simp_all

/-- Any trace-suppression condition also suppresses its aligned lifecycle publication. -/
theorem applyStimulusTraced_no_trace_has_no_lifecycle
    (closureLimit : Nat) (program : Program) (state : RuntimeState) (stimulus : Stimulus)
    (noTrace :
      (applyStimulusTraced closureLimit program state stimulus).committedTransitions = []) :
    (applyStimulusTraced closureLimit program state stimulus).flowNodeOccurrenceLifecycles = [] := by
  unfold applyStimulusTraced at noTrace ⊢
  dsimp only at noTrace ⊢
  unfold publishEvaluatedLifecycles
  simp only [noTrace, List.length_nil]
  generalize candidateEq :
    (evaluateStimulus closureLimit program state stimulus).candidateLifecycles = candidate
  cases candidate with
  | none => rfl
  | some lifecycles => cases lifecycles <;> simp

theorem applyStimulusTraced_closure_failure_is_atomic
    (closureLimit : Nat) (program : Program) (state : RuntimeState) (stimulus : Stimulus)
    (failed : ((applyStimulusTraced closureLimit program state stimulus).result.internalStepBoundExceeded ||
      (applyStimulusTraced closureLimit program state stimulus).result.ambiguousInternalChoice) = true) :
    (applyStimulusTraced closureLimit program state stimulus).result.outcome = .rolledBack ∧
      (applyStimulusTraced closureLimit program state stimulus).result.state = state ∧
      (applyStimulusTraced closureLimit program state stimulus).committedTransitions = [] ∧
      (applyStimulusTraced closureLimit program state stimulus).flowNodeOccurrenceLifecycles = [] := by
  rw [applyStimulusTraced_erases_to_applyStimulus] at failed
  have rollback := applyStimulus_closure_failure_rolls_back closureLimit program state stimulus failed
  have noTrace := applyStimulusTraced_noncommitted_has_no_trace closureLimit program state stimulus
    (by rw [rollback.1]; decide +kernel)
  exact ⟨by simpa [applyStimulusTraced_erases_to_applyStimulus] using rollback.1,
    by simpa [applyStimulusTraced_erases_to_applyStimulus] using rollback.2,
    noTrace, applyStimulusTraced_no_trace_has_no_lifecycle _ _ _ _ noTrace⟩

end BpmnSemantics.SemanticProcess
